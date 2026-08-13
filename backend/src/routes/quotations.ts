import { Router } from 'express';
import { crudRoutes, logAudit, objKeysToSnake, buildSearchWhere, parsePagination } from './helpers.js';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';

const fields = [
  'id', 'project_id', 'sales_no', 'client_name', 'project_name', 'version_no',
  'status', 'amount', 'total_cost', 'profit_rate', 'opportunity_id',
  'locked', 'created_at', 'updated_at',
];

// 自定义路由（先注册，避免被 /:id 拦截）
const customRouter = Router();

// 自定义列表：JOIN project_versions 返回 gp3_amount、discounted_price、tax_rate
customRouter.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    const params: any[] = [];
    let sql = `SELECT q.*, pv.gp3_amount, pv.discounted_price, pv.tax_rate
      FROM quotations q
      LEFT JOIN project_versions pv ON pv.project_id = q.project_id AND pv.version_no = q.version_no`;
    sql += buildSearchWhere(search, ['sales_no', 'client_name', 'project_name'], params, 'q');
    const { limit, offset } = parsePagination(req.query);
    sql += ` ORDER BY q.sales_no DESC, q.version_no DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const result = await query(sql, [...params, limit, offset]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// 同步报价摘要：根据 project_id + version_no upsert
customRouter.put('/sync', async (req, res, next) => {
  try {
    const body = objKeysToSnake(req.body);
    const { project_id, version_no, sales_no, client_name, project_name,
      status = 'draft', amount = 0, total_cost = 0, profit_rate = 0,
      opportunity_id = null } = body;

    if (!project_id || !version_no) {
      throw new AppError(400, '缺少必填字段：project_id, version_no');
    }

    // ⚠️ H2 修复：sync 只能写入 draft/pending，禁止直接置 approved/rejected（须走审批状态机）
    if (status && !['draft', 'pending'].includes(status)) {
      throw new AppError(400, `报价状态只能为 draft 或 pending，不允许直接设为 ${status}`);
    }

    // ⚠️ F18 修复：待审批（status='pending'）的报价不允许被 sync 覆盖。
    //    此前检查 locked 字段但全库无任何路径置 true（死守卫），改为检查真实信号 status='pending'
    const existing = (await query(
      'SELECT id, status FROM quotations WHERE project_id = $1 AND version_no = $2',
      [project_id, version_no]
    )).rows[0];
    if (existing?.status === 'pending') {
      // ⚠️ 审计修复：status='pending' 须结合是否存在关联审批请求判定——提交审批链路为
      //   保存版本(pending) → sync 报价(pending) → 创建审批请求；若审批创建失败（无权限/网络/参数错），
      //   报价会残留 status='pending' 但无审批请求，此前的 409 会永久锁死该报价无法再保存。
      //   仅当存在真实审批请求时拦截（审批中不可改财务字段）。
      const hasApproval = (await query(
        'SELECT 1 FROM approval_requests WHERE quotation_id = $1', [existing.id]
      )).rows[0];
      if (hasApproval) {
        throw new AppError(409, '该报价待审批中，无法同步保存');
      }
    }
    // ⚠️ 终审复核：approved 报价不做 sync 拦截——已审批报价在未签单（未中标/赢）时本就可编辑（QuotationPage
    //   shouldLock=false），编辑保存经 B61 重置为 draft 再重新走审批；若在此拦截 sync 会 409 阻断该正常变更流程。
    //   真实锁定信号是「已签单」（中标+赢 → quotationLocked=true），由前端只读守卫 + 机会锁定共同承担。
    const result = await query(
      `INSERT INTO quotations (project_id, version_no, sales_no, client_name,
        project_name, status, amount, total_cost, profit_rate, opportunity_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (project_id, version_no) DO UPDATE SET
        sales_no = EXCLUDED.sales_no,
        client_name = EXCLUDED.client_name,
        project_name = EXCLUDED.project_name,
        status = EXCLUDED.status,
        amount = EXCLUDED.amount,
        total_cost = EXCLUDED.total_cost,
        profit_rate = EXCLUDED.profit_rate,
        opportunity_id = EXCLUDED.opportunity_id,
        updated_at = now()
       RETURNING *`,
      [project_id, version_no, sales_no, client_name, project_name,
       status, amount, total_cost, profit_rate, opportunity_id]
    );

    logAudit(req, '保存报价', 'quotation',
      `${sales_no} ${version_no} ¥${amount} ${status}`);

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// CRUD 路由（含通用 /:id）
const crudRouter = crudRoutes('quotations', fields, {
  searchFields: ['sales_no', 'client_name', 'project_name'],
  orderBy: 'sales_no DESC, version_no DESC',
  // ⚠️ A2 修复：status 与 locked 均只能经审批流程（POST /approvals/:id/records）流转，创建/更新均禁直设
  //   （此前 excludeOnCreate 漏 status，POST /quotations 可传 status:'approved' 绕过审批状态机）
  excludeOnCreate: ['id', 'created_at', 'updated_at', 'status', 'locked'],
  excludeOnUpdate: ['id', 'created_at', 'updated_at', 'status', 'locked'],
  // ⚠️ A103 修复：报价审批中（status='pending'）禁改财务字段——审批人基于提交时快照做决策，
  //   期间被改金额会让审批与机会回写口径失真（sync 端点有 409 守卫，通用 PUT 此前无）。
  beforeUpdate: async (id, snakeBody) => {
    const FINANCIAL = ['amount', 'total_cost', 'profit_rate', 'sales_no', 'opportunity_id'];
    if (!FINANCIAL.some(f => snakeBody[f] !== undefined)) return;
    const existing = (await query('SELECT status FROM quotations WHERE id = $1', [id])).rows[0];
    if (existing?.status === 'pending') {
      throw new AppError(409, '该报价待审批中，审批完成前不可修改金额/成本/毛利率/编号/关联机会');
    }
  },
});

// 合并：自定义路由优先
const router = Router();
router.use(customRouter);
router.use(crudRouter);

export default router;
