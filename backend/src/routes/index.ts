import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireBudgetAuth, requirePermission } from '../middleware/auth.js';
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
import { WRITE_GUARD, READ_GUARD, selectApprovalPerms, selectDeliveryPerms, selectOpportunityPerms, selectComponentPerms } from '../permissions.js';
import { DEFAULT_EUR_RATE, DEFAULT_TAX_RATE, DEFAULT_WARRANTY_RATE, DEFAULT_RISK_RATE } from '../constants.js';

const router = Router();

// 报价组/明细枚举白名单（DB 枚举预校验，避免非法值触发 PG 错误 500）
const GROUP_TYPES = ['EQUIPMENT', 'INTEGRATION', 'PACKAGING_TRANSPORT', 'PROJECT_DELIVERY', 'IMPLEMENTATION_EXPENSE', 'OTHER'] as const;
const ITEM_TYPES = ['COMPLETE_SET', 'COMPONENT', 'SOFTWARE', 'SERVICE', 'PART'] as const;
const SOURCING_TYPES = ['SELF_MANUFACTURED', 'PURCHASED'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 认证路由（无需登录）
router.use('/auth', auth);

// 用户管理（内部含角色校验）；先经预算应用守卫，防工时受限账号自助修改 title
router.use('/users', requireBudgetAuth, users);

// 工时系统（自身含登录+鉴权）
router.use('/timerecording', timerecording);

// 业务路由（需要登录）
// ── 方案A：后端鉴权改用 permissions 数组（与前端 permissions.ts 职务权限模型对齐） ──
// 读改写分离：非 GET 需指定权限，敏感资源 GET 也需对应读取权限
const writeGuard = (perms: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!['GET', 'HEAD'].includes(req.method)) return requirePermission(...perms)(req, res, next);
  next();
};
// 财务/销售敏感资源的 GET 读取不再全放开。权限集 = 各页面前端路由所需权限 ∪ 跨页读取方
// （仪表盘/销售分析/交付分析/审批列表会跨资源读取）+ 万能权限。零权限用户/纯工时用户将 403
const readGuard = (perms: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD'].includes(req.method)) return requirePermission(...perms)(req, res, next);
  next();
};
// 读取/写入守卫权限集已收敛至 ../permissions.js（WRITE_GUARD/READ_GUARD/APPROVAL_WRITE/DELIVERY_*），
// 单测 tests/permissions.test.ts 锁定配置漂移
// writeGuard 列表只含「写动作」权限——剔除纯只读页面权限（物料管理/销售机会管理/客户管理），
// 否则 hasPermission 的任一命中（OR）会让仅持页面查看权的用户也能增删改（越权写）。读权限集 readGuard 不变
// 审核决策（POST /:id/review）走「审批管理」，与新增物料的写权分离
router.use('/components', requireBudgetAuth, (req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD'].includes(req.method)) return next();
  return requirePermission(...selectComponentPerms(req.method, req.path))(req, res, next);
}, readGuard(READ_GUARD.components), components);
router.use('/projects', requireBudgetAuth, writeGuard(WRITE_GUARD.projects), readGuard(READ_GUARD.projects), projects);
router.use('/opportunities', requireBudgetAuth,
  (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD'].includes(req.method)) return next();
    return requirePermission(...selectOpportunityPerms(req.method, req.path))(req, res, next);
  },
  readGuard(READ_GUARD.opportunities), opportunities);
router.use('/quotations', requireBudgetAuth, writeGuard(WRITE_GUARD.quotations), readGuard(READ_GUARD.quotations), quotations);
// 审批：创建（各业务模块提交）与处理（审批管理）均需对应权限；列表读取仅审批管理/万能权限
// 审批写守卫按 approval_type 拆分
// （如仅"报价编制"）也能创建 plan/cost/promote 审批、仅持"交付管理"者也能创建 quotation 审批
// 创建方须持对应模块写权限：quotation→报价编制、plan/cost→交付管理（cost 兼容成本录入）、promote→转线索/转机会；
// 无 approval_type 的请求（审批处理 POST /:id/records、通用 PUT/DELETE）→ 审批管理兜底（与 approvals.ts 内部守卫口径一致）
router.use('/approvals', requireBudgetAuth,
  (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD'].includes(req.method)) return next(); // 交给 readGuard
    // 守卫必须与处理器使用同一次键名归一化
    // approval_type || approvalType——同时传两个键时 objKeysToSnake 的后者覆盖前者，
    // 守卫按 quotation 放行、处理器按 promote 落库，可越权创建他人机会的晋升审批
    const type = objKeysToSnake({ ...(req.body || {}) }).approval_type as string | undefined;
    return requirePermission(...selectApprovalPerms(type))(req, res, next);
  },
  readGuard(READ_GUARD.approvals), approvals);
// 交付写权限按方法拆分——「销售机会管理」仅限转交付创建/初始化节点（POST /deliveries、PUT /:id/nodes），
// 修改实际成本/删除交付/附件管理等其余写操作须「交付管理」
// 「销售机会管理」的用户可对任意交付改 total_actual_cost、DELETE 整条交付（还会清磁盘附件）
// 读取权限 readGuard(DELIVERY_READ) 不变
router.use('/deliveries', requireBudgetAuth,
  (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD'].includes(req.method)) return next(); // 交给 readGuard
    return requirePermission(...selectDeliveryPerms(req.method, req.path))(req, res, next);
  },
  readGuard(READ_GUARD.deliveries), deliveries);
// /clients 列表读取与 /clients/:id/detail 同权限集
router.use('/clients', requireBudgetAuth, writeGuard(WRITE_GUARD.clients), readGuard(READ_GUARD.clients), clients);
// 标签写操作需新建标签（读取开放给物料打标）
router.use('/tags', requireBudgetAuth, writeGuard(WRITE_GUARD.tags), tags);
// 审计日志：与前端 /settings 同口径（用户管理/系统配置）
router.use('/audit-logs', requireBudgetAuth, requirePermission(...READ_GUARD['audit-logs']), auditLogs);

// 个人设置按用户隔离，任意登录用户可读写自己的设置（含工时应用用户）；
// 输入边界（键/值长度、条数）在 settings.ts 内限制
router.use('/settings', requireAuth, settings);

// ── 项目版本保存（报价编制写操作） ──
router.post('/project-versions', requireBudgetAuth, writeGuard(WRITE_GUARD['project-versions']), async (req, res, next) => {
  try {
    const snakeBody = objKeysToSnake(req.body ?? {});
    const { project_id, version_no, eur_rate = DEFAULT_EUR_RATE, tax_rate = DEFAULT_TAX_RATE,
      rounding_digits = 0, warranty_rate = DEFAULT_WARRANTY_RATE, risk_rate = DEFAULT_RISK_RATE,
      commercial_cost = 0, total_direct_cost = 0, total_accounting_price = 0,
      discounted_price = 0, discount_rate = 0,
      gp3_profit_rate = 0, gp3_amount = 0,
      total_cost = 0, warranty_cost = 0, risk_cost = 0,
      material_cost = 0, labor_cost = 0, project_expense = 0 } = snakeBody;

    if (!project_id || !version_no) {
      throw new AppError(400, '缺少必填字段：project_id, version_no');
    }
    // review_status 终态只能经审批流程（POST /approvals/:id/records）流转；
    // 本端点只接受 draft/pending，前端保存前会把 approved/rejected 降级为 draft
    if (snakeBody.review_status !== undefined && !['draft', 'pending'].includes(snakeBody.review_status)) {
      throw new AppError(400, `无效审核状态: ${snakeBody.review_status}（审核终态只能由审批流程流转）`);
    }

    const saved = await withTransaction(async (client) => {
      // 行锁：与审批创建/更新串行化，防检查通过后审批把版本置 pending 又被本次覆写
      const existingRow = (await client.query(
        'SELECT * FROM project_versions WHERE project_id = $1 AND version_no = $2 FOR UPDATE',
        [project_id, version_no]
      )).rows[0];
      if (existingRow?.review_status === 'pending') {
        const pendingReq = (await client.query(
          `SELECT 1 FROM approval_requests ar
           JOIN quotations q ON q.id = ar.quotation_id
           WHERE q.project_id = $1 AND q.version_no = $2 AND ar.status = 'pending'`,
          [project_id, version_no]
        )).rows[0];
        if (pendingReq) throw new AppError(409, '该版本待审批中，审批完成前不可修改');
      }
      // 部分更新：未提供的字段沿用库中现值，避免把金额/成本/税率清零
      const val = (key: string, fallback: any) =>
        snakeBody[key] !== undefined ? snakeBody[key] : (existingRow?.[key] ?? fallback);
      const reviewStatus = snakeBody.review_status !== undefined
        ? snakeBody.review_status
        : (existingRow?.review_status ?? 'draft');

      return (await client.query(
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
        [project_id, version_no,
         val('eur_rate', DEFAULT_EUR_RATE), val('tax_rate', DEFAULT_TAX_RATE),
         val('rounding_digits', 0), val('warranty_rate', DEFAULT_WARRANTY_RATE),
         val('risk_rate', DEFAULT_RISK_RATE), val('commercial_cost', 0),
         val('total_direct_cost', 0), val('total_accounting_price', 0),
         val('discounted_price', 0), val('discount_rate', 0),
         val('gp3_profit_rate', 0), val('gp3_amount', 0), reviewStatus,
         val('total_cost', 0), val('warranty_cost', 0), val('risk_cost', 0),
         val('material_cost', 0), val('labor_cost', 0), val('project_expense', 0)]
      )).rows[0];
    });

    logAudit(req, '版本迭代', 'project', `项目版本 ${version_no} 已保存`);
    res.status(201).json(saved);
  } catch (err) { next(err); }
});

// ── 项目组和明细整版本批量保存（单事务，保证幂等与原子性） ──
// 报价页每次保存都提交当前版本的完整组集合：事务内删除该版本全部组后重建
// 这样删除组、重排组号、失败重试都不会产生唯一键冲突或重复数据；明细 id 由客户端提供时保留，
// 保证交付成本对比的逐项实际成本键（group_items.id）跨保存稳定
router.post('/project-groups/batch', requireBudgetAuth, writeGuard(WRITE_GUARD['project-groups']), async (req, res, next) => {
  try {
    const body = objKeysToSnake(req.body ?? {});
    const { project_id, version_id, groups } = body;
    if (!project_id || !version_id || !Array.isArray(groups)) {
      throw new AppError(400, '缺少必填字段：project_id、version_id、groups');
    }
    if (groups.length > 500) throw new AppError(400, '设备组数量过多（最多 500 组）');

    const versionInfo = (await query(
      'SELECT version_no FROM project_versions WHERE id = $1 AND project_id = $2',
      [version_id, project_id]
    )).rows[0];
    if (!versionInfo) throw new AppError(400, '版本不属于该项目');

    // 审批中的版本冻结：审批人审阅的必须是提交时的 BOM
    const pending = (await query(
      `SELECT 1 FROM approval_requests ar
       JOIN quotations q ON q.id = ar.quotation_id
       WHERE q.project_id = $1 AND q.version_no = $2 AND ar.status = 'pending' LIMIT 1`,
      [project_id, versionInfo.version_no]
    )).rows[0];
    if (pending) throw new AppError(409, '该版本报价待审批中，不可修改项目组');

    // 预校验结构，避免执行到一半才失败
    let totalItems = 0;
    const seenGroupNos = new Set<number>();
    const normalized: any[] = groups.map((raw: any, gi: number) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError(400, `第 ${gi + 1} 个设备组格式非法`);
      // 组与明细的键名需各自转换（objKeysToSnake 只处理顶层）
      const g = objKeysToSnake(raw);
      const groupNo = Number(g.group_no);
      if (!Number.isInteger(groupNo) || groupNo < 1) throw new AppError(400, `第 ${gi + 1} 个设备组编号非法`);
      if (seenGroupNos.has(groupNo)) throw new AppError(400, '设备组编号重复');
      seenGroupNos.add(groupNo);
      if (!(GROUP_TYPES as readonly string[]).includes(g.group_type)) {
        throw new AppError(400, `设备组类型非法：${g.group_type}`);
      }
      const rawItems = g.items ?? [];
      if (!Array.isArray(rawItems)) throw new AppError(400, `设备组 ${groupNo} 的明细必须为数组`);
      const items = rawItems.map((it: any) => {
        if (!it || typeof it !== 'object' || Array.isArray(it)) {
          throw new AppError(400, `设备组 ${groupNo} 包含非法明细`);
        }
        return objKeysToSnake(it);
      });
      totalItems += items.length;
      return { ...g, group_no: groupNo, items };
    });
    if (totalItems > 5000) throw new AppError(400, '明细数量过多（最多 5000 条）');

    const itemIdSet = new Set<string>();
    for (const g of normalized) {
      for (const item of g.items) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new AppError(400, `设备组 ${g.group_no} 包含非法明细`);
        }
        if (item.item_type && !(ITEM_TYPES as readonly string[]).includes(item.item_type)) {
          throw new AppError(400, `明细类型非法：${item.item_type}`);
        }
        if (item.sourcing_type && !(SOURCING_TYPES as readonly string[]).includes(item.sourcing_type)) {
          throw new AppError(400, `采购方式非法：${item.sourcing_type}`);
        }
        if (typeof item.id === 'string' && UUID_RE.test(item.id)) {
          if (itemIdSet.has(item.id)) throw new AppError(400, `明细 id 重复：${item.id}`);
          itemIdSet.add(item.id);
        }
      }
    }

    // 已属于其它版本的明细 id 不可复用（PK 冲突），此类 id 改为生成新 id
    const conflictIds = new Set<string>();
    if (itemIdSet.size > 0) {
      const rows = (await query(
        `SELECT gi.id FROM group_items gi
         WHERE gi.id = ANY($1::uuid[])
           AND gi.group_id NOT IN (
             SELECT id FROM project_groups WHERE project_id = $2 AND version_id = $3
           )`,
        [Array.from(itemIdSet), project_id, version_id]
      )).rows;
      for (const row of rows) conflictIds.add(row.id);
    }

    await withTransaction(async (client) => {
      await client.query('DELETE FROM project_groups WHERE project_id = $1 AND version_id = $2', [project_id, version_id]);
      for (const g of normalized) {
        const group = (await client.query(
          `INSERT INTO project_groups (project_id, version_id, group_no, group_type, name, is_fixed, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [project_id, version_id, g.group_no, g.group_type, g.name || '', g.is_fixed === true, g.group_no]
        )).rows[0];
        for (let i = 0; i < g.items.length; i++) {
          const item = g.items[i];
          const keepId = typeof item.id === 'string' && UUID_RE.test(item.id) && !conflictIds.has(item.id);
          await client.query(
            `INSERT INTO group_items (id, group_id, item_no, item_type, component_id, code, description,
              qty_total, unit, sourcing_type, unit_cost, design_hours, assembly_hours,
              design_hour_rate, assembly_hour_rate, direct_cost, margin_rate,
              basic_price, accounting_price, has_warranty, note)
             VALUES (COALESCE($1::uuid, gen_random_uuid()), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
            [keepId ? item.id : null, group.id, i + 1, item.item_type || 'COMPONENT', item.component_id || null,
             item.code || '', item.description || '', item.qty_total ?? 1, item.unit || '个',
             item.sourcing_type || 'SELF_MANUFACTURED', item.unit_cost ?? 0,
             item.design_hours ?? 0, item.assembly_hours ?? 0,
             item.design_hour_rate ?? 0, item.assembly_hour_rate ?? 0,
             item.direct_cost ?? 0, item.margin_rate ?? 0,
             item.basic_price ?? 0, item.accounting_price ?? 0,
             item.has_warranty === true, item.note || '']
          );
        }
      }
    });

    const savedGroups = (await query(
      'SELECT * FROM project_groups WHERE project_id = $1 AND version_id = $2 ORDER BY group_no',
      [project_id, version_id]
    )).rows;
    if (savedGroups.length > 0) {
      const savedItems = (await query(
        'SELECT * FROM group_items WHERE group_id = ANY($1::uuid[]) ORDER BY item_no',
        [savedGroups.map((g: any) => g.id)]
      )).rows;
      const byGroup: Record<string, any[]> = {};
      for (const item of savedItems) (byGroup[item.group_id] ||= []).push(item);
      for (const g of savedGroups) g.items = byGroup[g.id] || [];
    }

    logAudit(req, '保存项目组', 'project', `版本 ${version_id.slice(0, 8)} 保存 ${savedGroups.length} 组 / ${totalItems} 条明细`);
    res.status(201).json(savedGroups);
  } catch (err) { next(err); }
});

// ── 项目组和明细保存（事务保护，报价编制写操作） ──
router.post('/project-groups', requireBudgetAuth, writeGuard(WRITE_GUARD['project-groups']), async (req, res, next) => {
  try {
    const body = objKeysToSnake(req.body ?? {});
    const { project_id, version_id, group_no, group_type, name,
        is_fixed = false, items: rawItems = [] } = body;
    if (!Array.isArray(rawItems) || rawItems.some((it: unknown) => !it || typeof it !== 'object' || Array.isArray(it))) {
      throw new AppError(400, '明细必须为对象数组');
    }
    const items = rawItems as any[];

    if (!project_id || !version_id || group_no === undefined || !group_type || !name) {
      throw new AppError(400, '缺少必填字段：project_id、version_id、group_no、group_type、name');
    }

    // 事务样板收敛为 withTransaction
    const group = await withTransaction(async (client) => {
      // 版本必须属于本项目——project_groups 的 project_id/version_id 是两个独立外键，
      // 不校验时可将 A 项目的组挂到 B 项目的版本，形成读取不到的孤儿组（还会污染版本隔离判断）
      const versionRow = (await client.query(
        'SELECT 1 FROM project_versions WHERE id = $1 AND project_id = $2',
        [version_id, project_id]
      )).rows[0];
      if (!versionRow) throw new AppError(400, '版本不属于该项目');
      const groupId = req.body.id || undefined;
      const existing = groupId
        ? (await client.query('SELECT id, version_id, project_id FROM project_groups WHERE id = $1', [groupId])).rows[0]
        : null;

      // 组归属校验——只允许操作自己项目名下的组
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
router.delete('/project-groups/by-version/:versionId', requireBudgetAuth, writeGuard(WRITE_GUARD['project-groups']), async (req, res, next) => {
  try {
    const { versionId } = req.params;
    // 按版本删除必须带项目归属，防凭版本 UUID 删除其他项目的全部组
    const projectId = String(req.query.project_id || '');
    if (!projectId) throw new AppError(400, '缺少 project_id');
    const versionRow = (await query(
      'SELECT 1 FROM project_versions WHERE id = $1 AND project_id = $2', [versionId, projectId]
    )).rows[0];
    if (!versionRow) throw new AppError(404, '版本不属于该项目');
    // group_items 通过外键 ON DELETE CASCADE 自动删除
    // 检查实际删除行数，删除不存在版本返回 404
    const result = await query('DELETE FROM project_groups WHERE version_id = $1 AND project_id = $2 RETURNING id', [versionId, projectId]);
    // 版本存在但无组时保持幂等（并发/多标签页重复清理不应中断保存链路）
    logAudit(req, '删除组', 'project', '版本 ' + versionId.slice(0,8) + ' 的所有组已删除');
    res.json({ deleted: true, count: result.rows.length });
  } catch (err) { next(err); }
});

// 删除单个项目组
router.delete('/project-groups/:id', requireBudgetAuth, writeGuard(WRITE_GUARD['project-groups']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const projectId = String(req.query.project_id || '');
    if (!projectId) throw new AppError(400, '缺少 project_id');
    // 检查实际删除行数，删除不存在的组返回 404
    const result = await query('DELETE FROM project_groups WHERE id = $1 AND project_id = $2 RETURNING id', [id, projectId]);
    if (result.rows.length === 0) throw new AppError(404, '未找到该项目组');
    logAudit(req, '删除组', 'project', '组ID ' + id.slice(0,8) + ' 已删除');
    res.json({ deleted: true, id });
  } catch (err) { next(err); }
});

export default router;
