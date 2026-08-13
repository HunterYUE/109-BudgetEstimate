import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import auth from './auth.js';
import users from './users.js';
import components from './components.js';
import projects from './projects.js';
import opportunities from './opportunities.js';
import quotations from './quotations.js';
import approvals from './approvals.js';
import deliveries from './deliveries.js';
import clients from './clients.js';
import tags from './tags.js';
import auditLogs from './auditLogs.js';
import timerecording from './timerecording.js';
import settings from './settings.js';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { logAudit, objKeysToSnake, withTransaction } from './helpers.js';
import { DEFAULT_EUR_RATE, DEFAULT_TAX_RATE, DEFAULT_WARRANTY_RATE, DEFAULT_RISK_RATE } from '../constants.js';

const router = Router();

// 认证路由（无需登录）
router.use('/auth', auth);

// 用户管理（内部含角色校验）
router.use('/users', users);

// 工时系统（自身含登录+鉴权）
router.use('/timerecording', timerecording);

// 业务路由（需要登录）
// ── 方案A：后端鉴权改用 permissions 数组（与前端 permissions.ts 职务权限模型对齐）──
// 读改写分离：非 GET 需指定权限（F2 修复），敏感资源 GET 也需对应读取权限（H1 修复）
const writeGuard = (perms: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET') return requirePermission(...perms)(req, res, next);
  next();
};
// ⚠️ H1 修复：财务/销售敏感资源的 GET 读取不再全放开。权限集 = 各页面前端路由所需权限 ∪ 跨页读取方
//   （仪表盘/销售分析/交付分析/审批列表会跨资源读取）+ 万能权限。零权限用户/纯工时用户将 403。
const readGuard = (perms: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET') return requirePermission(...perms)(req, res, next);
  next();
};
// 读取方并集：QuotationPage/报价编制 与 DeliveryDetail/交付管理 会跨读机会与报价，必须纳入
const QUOTE_READ = ['报价列表查看', '报价编制', '交付管理', '销售机会管理', '仪表盘查看', '销售分析', '交付分析', '审批管理', '全部查看权限'];
const OPP_READ = ['销售机会管理', '编辑销售机会', '报价编制', '仪表盘查看', '销售分析', '全部查看权限'];
const DELIVERY_READ = ['交付管理', '销售机会管理', '仪表盘查看', '销售分析', '交付分析', '审批管理', '全部查看权限'];
const APPROVAL_READ = ['审批管理', '全部查看权限'];
const PROJECT_READ = ['报价编制', '交付管理', '销售机会管理', '全部查看权限'];
// 组件读取方：物料管理 / 报价编制(ItemTable) / 交付管理(DeliveryDetail 服务项)
const COMPONENT_READ = ['物料管理', '报价编制', '交付管理', '全部查看权限'];
// ⚠️ A1 修复：writeGuard 列表只含「写动作」权限——剔除纯只读页面权限（物料管理/销售机会管理/客户管理），
//   否则 hasPermission 的任一命中（OR）会让仅持页面查看权的用户也能增删改（越权写）。读权限集 readGuard 不变。
router.use('/components', requireAuth, writeGuard(['新增物料', '全部查看权限']), readGuard(COMPONENT_READ), components);
router.use('/projects', requireAuth, writeGuard(['报价编制', '全部查看权限']), readGuard(PROJECT_READ), projects);
router.use('/opportunities', requireAuth, writeGuard(['编辑销售机会', '新建信息/线索/机会', '转线索/转机会', '销售蓝表编辑', '全部查看权限']), readGuard(OPP_READ), opportunities);
router.use('/quotations', requireAuth, writeGuard(['报价编制', '全部查看权限']), readGuard(QUOTE_READ), quotations);
// 审批：创建（各业务模块提交）与处理（审批管理）均需对应权限；列表读取仅审批管理/万能权限
// ⚠️ 审计修复：审批写守卫按 approval_type 拆分——此前 blanket writeGuard OR-set 让仅持单一模块权限者
//   （如仅"报价编制"）也能创建 plan/cost/promote 审批、仅持"交付管理"者也能创建 quotation 审批。
//   创建方须持对应模块写权限：quotation→报价编制、plan/cost→交付管理（cost 兼容成本录入）、promote→转线索/转机会；
//   无 approval_type 的请求（审批处理 POST /:id/records、通用 PUT/DELETE）→ 审批管理兜底（与 approvals.ts 内部守卫口径一致）。
router.use('/approvals', requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET') return next(); // 交给 readGuard
    const type = (req.body?.approval_type as string | undefined) || (req.body?.approvalType as string | undefined);
    const permsForType: Record<string, string[]> = {
      quotation: ['报价编制', '全部查看权限'],
      plan: ['交付管理', '全部查看权限'],
      cost: ['交付管理', '成本录入', '全部查看权限'],
      promote: ['转线索/转机会', '全部查看权限'],
    };
    const perms = type ? permsForType[type] : undefined;
    if (perms) return requirePermission(...perms)(req, res, next);
    return requirePermission('审批管理', '全部查看权限')(req, res, next);
  },
  readGuard(APPROVAL_READ), approvals);
// ⚠️ A101 修复：交付写权限按方法拆分——「销售机会管理」仅限转交付创建/初始化节点（POST /deliveries、PUT /:id/nodes），
//   修改实际成本/删除交付/附件管理等其余写操作须「交付管理」。此前 blanket writeGuard OR 让仅持
//   「销售机会管理」的用户可对任意交付改 total_actual_cost、DELETE 整条交付（还会清磁盘附件）。
//   读取权限 readGuard(DELIVERY_READ) 不变。
router.use('/deliveries', requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET') return next(); // 交给 readGuard
    // 转交付链路：创建 + 节点保存（销售机会管理 合法写路径）
    if (req.method === 'POST' || (req.method === 'PUT' && req.path.endsWith('/nodes'))) {
      return requirePermission('交付管理', '销售机会管理', '全部查看权限')(req, res, next);
    }
    // 其余写操作（改成本/删交付/附件管理/改状态等）需交付管理
    return requirePermission('交付管理', '全部查看权限')(req, res, next);
  },
  readGuard(DELIVERY_READ), deliveries);
// ⚠️ H1 修复：/clients 列表读取与 /clients/:id/detail 同权限集（此前列表 GET 未加 readGuard，任意登录用户可读全部客户）
router.use('/clients', requireAuth, writeGuard(['新建客户', '全部查看权限']), readGuard(['客户管理', '报价编制', '销售机会管理', '全部查看权限']), clients);
// 标签写操作需 新建标签（读取开放给物料打标）
router.use('/tags', requireAuth, writeGuard(['新建标签', '全部查看权限']), tags);
// 审计日志：与前端 /settings 同口径（用户管理/系统配置）
router.use('/audit-logs', requireAuth, requirePermission('用户管理', '系统配置', '全部查看权限'), auditLogs);

// 用户设置
router.use('/settings', requireAuth, settings);

// ── 项目版本保存（报价编制写操作）──
router.post('/project-versions', requireAuth, writeGuard(['报价编制', '全部查看权限']), async (req, res, next) => {
  try {
    const snakeBody = objKeysToSnake(req.body);
    const { project_id, version_no, eur_rate = DEFAULT_EUR_RATE, tax_rate = DEFAULT_TAX_RATE,
      rounding_digits = 0, warranty_rate = DEFAULT_WARRANTY_RATE, risk_rate = DEFAULT_RISK_RATE,
      commercial_cost = 0, total_direct_cost = 0, total_accounting_price = 0,
      discounted_price = 0, discount_rate = 0,
      gp3_profit_rate = 0, gp3_amount = 0, review_status = 'draft',
      total_cost = 0, warranty_cost = 0, risk_cost = 0,
      material_cost = 0, labor_cost = 0, project_expense = 0 } = snakeBody;

    if (!project_id || !version_no) {
      throw new AppError(400, '缺少必填字段：project_id, version_no');
    }
    // ⚠️ A4/A113 复核：review_status 应用层枚举校验（此前直写 DB CHECK 撞 500）。白名单放开
    //   approved/rejected 是为「已有版本」保存时回显真实审核状态（审批流写库）；但**全新版本**不得以
    //   approved/rejected 落库——那等于绕过审批状态机直造已审核版本。补存在性校验：新版本仅允许 draft/pending。
    if (!['draft', 'pending', 'approved', 'rejected'].includes(review_status)) {
      throw new AppError(400, `无效审核状态: ${review_status}`);
    }
    const existingVer = (await query(
      'SELECT review_status FROM project_versions WHERE project_id = $1 AND version_no = $2', [project_id, version_no]
    )).rows[0];
    if (!existingVer && ['approved', 'rejected'].includes(review_status)) {
      throw new AppError(400, '新版本须从草稿开始，审核状态由审批流程流转');
    }
    // ⚠️ 审计修复：待审批（review_status='pending'）版本禁覆写——审批人基于提交时快照做决策，
    //   期间被改财务数据会让审批与机会回写口径失真（与 quotations beforeUpdate pending 守卫同口径）。
    //   但仅当存在关联审批请求时才拦截：提交链路为保存版本(pending)→sync报价(pending)→创建审批，
    //   若审批创建失败会残留 pending 无请求，此时应允许覆盖重提（与 quotations sync pending 判定同口径），否则报价永久锁死。
    if (existingVer?.review_status === 'pending') {
      const pendingReq = (await query(
        `SELECT 1 FROM approval_requests ar
         JOIN quotations q ON q.id = ar.quotation_id
         WHERE q.project_id = $1 AND q.version_no = $2`,
        [project_id, version_no]
      )).rows[0];
      if (pendingReq) {
        throw new AppError(409, '该版本待审批中，审批完成前不可修改');
      }
    }

    const result = await query(
      `INSERT INTO project_versions (project_id, version_no, eur_rate, tax_rate,
        rounding_digits, warranty_rate, risk_rate, commercial_cost,
        total_direct_cost, total_accounting_price, discounted_price, discount_rate,
        gp3_profit_rate, gp3_amount, review_status,
        total_cost, warranty_cost, risk_cost, material_cost, labor_cost, project_expense)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (project_id, version_no) DO UPDATE SET
        eur_rate = EXCLUDED.eur_rate,
        tax_rate = EXCLUDED.tax_rate,
        rounding_digits = EXCLUDED.rounding_digits,
        warranty_rate = EXCLUDED.warranty_rate,
        risk_rate = EXCLUDED.risk_rate,
        commercial_cost = EXCLUDED.commercial_cost,
        total_direct_cost = EXCLUDED.total_direct_cost,
        total_accounting_price = EXCLUDED.total_accounting_price,
        discounted_price = EXCLUDED.discounted_price,
        discount_rate = EXCLUDED.discount_rate,
        gp3_profit_rate = EXCLUDED.gp3_profit_rate,
        gp3_amount = EXCLUDED.gp3_amount,
        review_status = EXCLUDED.review_status,
        total_cost = EXCLUDED.total_cost,
        warranty_cost = EXCLUDED.warranty_cost,
        risk_cost = EXCLUDED.risk_cost,
        material_cost = EXCLUDED.material_cost,
        labor_cost = EXCLUDED.labor_cost,
        project_expense = EXCLUDED.project_expense,
        updated_at = now()
       RETURNING *`,
      [project_id, version_no, eur_rate, tax_rate, rounding_digits,
       warranty_rate, risk_rate, commercial_cost, total_direct_cost,
       total_accounting_price, discounted_price, discount_rate,
       gp3_profit_rate, gp3_amount, review_status,
       total_cost, warranty_cost, risk_cost, material_cost, labor_cost, project_expense]
    );

    logAudit(req, '版本迭代', 'project', `项目版本 ${version_no} 已保存`);

    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── 项目组和明细保存（事务保护，报价编制写操作）──
router.post('/project-groups', requireAuth, writeGuard(['报价编制', '全部查看权限']), async (req, res, next) => {
  try {
    const body = objKeysToSnake(req.body);
    const { project_id, version_id, group_no, group_type, name,
        is_fixed = false, items = [] } = body;

    if (!project_id || !version_id || group_no === undefined || !group_type || !name) {
      throw new AppError(400, '缺少必填字段：project_id、version_id、group_no、group_type、name');
    }

    // ⚠️ A15：事务样板收敛为 withTransaction
    const group = await withTransaction(async (client) => {
      const groupId = req.body.id || undefined;
      const existing = groupId
        ? (await client.query('SELECT id, version_id, project_id FROM project_groups WHERE id = $1', [groupId])).rows[0]
        : null;

      // ⚠️ K5 修复：组归属校验——只允许操作自己项目名下的组（此前 UPDATE 无 project_id 校验，可覆写他人项目组）
      if (existing && existing.project_id !== project_id) {
        throw new AppError(400, '无权修改该项目组');
      }
      let groupResult;
      if (existing) {
        // 检查版本号：版本不同则 INSERT 新记录（版本隔离），同版本则 UPDATE（version_id 已在上面一次查询取回）
        const currentVerId = existing.version_id;
        if (currentVerId && currentVerId !== version_id) {
          // 版本迭代，创建新组
          groupResult = (await client.query(
            `INSERT INTO project_groups (project_id, version_id, group_no, group_type, name, is_fixed, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [project_id, version_id, group_no, group_type, name, is_fixed, group_no]
          )).rows[0];
        } else {
          groupResult = (await client.query(
            `UPDATE project_groups SET group_no=$1, group_type=$2, name=$3, is_fixed=$4, updated_at=now()
             WHERE id=$5 AND project_id=$6 RETURNING *`,
            [group_no, group_type, name, is_fixed, groupId, project_id]
          )).rows[0];
          await client.query('DELETE FROM group_items WHERE group_id = $1', [groupId]);
        }
      } else {
        groupResult = (await client.query(
          `INSERT INTO project_groups (project_id, version_id, group_no, group_type, name, is_fixed, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [project_id, version_id, group_no, group_type, name, is_fixed, group_no]
        )).rows[0];
      }

      // 插入新明细（items 中每个对象的 key 需转蛇形）
      for (let i = 0; i < items.length; i++) {
        const item = objKeysToSnake(items[i]);
        await client.query(
          `INSERT INTO group_items (group_id, item_no, item_type, component_id, code, description,
            qty_total, unit, sourcing_type, unit_cost, design_hours, assembly_hours,
            design_hour_rate, assembly_hour_rate, direct_cost, margin_rate,
            basic_price, accounting_price, has_warranty, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
          [groupResult.id, i + 1, item.item_type || 'COMPONENT', item.component_id || null,
           item.code || '', item.description || '', item.qty_total ?? 1, item.unit || '个',
           item.sourcing_type || 'SELF_MANUFACTURED', item.unit_cost || 0,
           item.design_hours || 0, item.assembly_hours || 0,
           item.design_hour_rate || 0, item.assembly_hour_rate || 0,
           item.direct_cost || 0, item.margin_rate || 0,
           item.basic_price || 0, item.accounting_price || 0,
           item.has_warranty || false, item.note || '']
        );
      }

      return groupResult;
    });

    logAudit(req, '保存项目组', 'project', '项目组 ' + name + ' 已保存');

    // 返回完整组（含明细）
    const savedGroup = (await query('SELECT * FROM project_groups WHERE id = $1', [group.id])).rows[0];
    const savedItems = (await query(
      'SELECT * FROM group_items WHERE group_id = $1 ORDER BY item_no', [group.id]
    )).rows;
    savedGroup.items = savedItems;

    res.status(201).json(savedGroup);
  } catch (err) {
    next(err);
  }
});

// 删除指定版本的所有组和明细（必须在 /:id 之前注册，否则 by-version 被 :id 捕获）
router.delete('/project-groups/by-version/:versionId', requireAuth, writeGuard(['报价编制', '全部查看权限']), async (req, res, next) => {
  try {
    const { versionId } = req.params;
    // group_items 通过外键 ON DELETE CASCADE 自动删除
    // ⚠️ L1 修复：检查实际删除行数，删除不存在版本返回 404（此前无行检查恒返 deleted:true）
    const result = await query('DELETE FROM project_groups WHERE version_id = $1 RETURNING id', [versionId]);
    if (result.rows.length === 0) throw new AppError(404, '未找到该版本的项目组');
    logAudit(req, '删除组', 'project', '版本 ' + versionId.slice(0,8) + ' 的所有组已删除');
    res.json({ deleted: true, count: result.rows.length });
  } catch (err) { next(err); }
});

// 删除单个项目组
router.delete('/project-groups/:id', requireAuth, writeGuard(['报价编制', '全部查看权限']), async (req, res, next) => {
  try {
    const { id } = req.params;
    // ⚠️ L1 修复：检查实际删除行数，删除不存在的组返回 404
    const result = await query('DELETE FROM project_groups WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) throw new AppError(404, '未找到该项目组');
    logAudit(req, '删除组', 'project', '组ID ' + id.slice(0,8) + ' 已删除');
    res.json({ deleted: true, id });
  } catch (err) { next(err); }
});

export default router;
