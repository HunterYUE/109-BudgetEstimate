import { Router } from 'express';
import { crudRoutes, logAudit, objKeysToSnake, buildSearchWhere, parsePagination } from './helpers.js';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';

const fields = [
  'id', 'project_id', 'sales_no', 'client_name', 'project_name', 'version_no',
  'status', 'amount', 'total_cost', 'profit_rate', 'opportunity_id',
  'locked', 'created_at', 'updated_at',
];

/** 报价 sync 可写状态白名单（H2 修复：只能写 draft/pending，禁止直接置 approved/rejected——须走审批状态机）；
 *  undefined 视为合法（路由层 status 有默认 'draft'，仅显式传非法值才拦截） */
export const QUOTATION_SYNC_STATUSES = ['draft', 'pending'];
export function isValidSyncStatus(status: unknown): boolean {
  return !status || (QUOTATION_SYNC_STATUSES as string[]).includes(status as string);
}

/** 审批中（status='pending'）禁改的字段：财务口径 + 行归属。
 *  归属字段（project_id/version_no）此前可改，会让审批结果回写到未送审版本或其它项目。 */
export const QUOTATION_FINANCIAL = [
  'amount', 'total_cost', 'profit_rate', 'sales_no', 'opportunity_id',
  'project_id', 'version_no', 'client_name', 'project_name',
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

// 单条读取：附带「是否存在真实待审批请求」——前端据此区分「审批中」与「提交中断残留 pending」
customRouter.get('/:id', async (req, res, next) => {
  try {
    const row = (await query(
      `SELECT q.*,
        EXISTS(SELECT 1 FROM approval_requests ar WHERE ar.quotation_id = q.id AND ar.status = 'pending') AS has_pending_approval
       FROM quotations q WHERE q.id = $1`,
      [req.params.id]
    )).rows[0];
    if (!row) throw new AppError(404, '记录不存在');
    res.json(row);
  } catch (err) { next(err); }
});

// 同步报价摘要：根据 project_id + version_no upsert
customRouter.put('/sync', async (req, res, next) => {
  try {
    const body = objKeysToSnake(req.body);
    const { project_id, version_no, status } = body;

    if (!project_id || !version_no) {
      throw new AppError(400, '缺少必填字段：project_id, version_no');
    }

    // ⚠️ H2 修复：sync 只能写入 draft/pending，禁止直接置 approved/rejected（须走审批状态机）
    if (!isValidSyncStatus(status)) {
      throw new AppError(400, `报价状态只能为 draft 或 pending，不允许直接设为 ${status}`);
    }

    // ⚠️ F18 修复：待审批（status='pending'）的报价不允许被 sync 覆盖。
    //    此前检查 locked 字段但全库无任何路径置 true（死守卫），改为检查真实信号 status='pending'
    const existing = (await query(
      'SELECT * FROM quotations WHERE project_id = $1 AND version_no = $2',
      [project_id, version_no]
    )).rows[0];
    if (existing?.status === 'pending') {
      // ⚠️ 审计修复：status='pending' 须结合是否存在关联审批请求判定——提交审批链路为
      //   保存版本(pending) → sync 报价(pending) → 创建审批请求；若审批创建失败（无权限/网络/参数错），
      //   报价会残留 status='pending' 但无审批请求，此前的 409 会永久锁死该报价无法再保存。
      //   仅当存在真实「待审批」请求时拦截（历史 approved/rejected 记录不应阻断恢复）。
      const hasApproval = (await query(
        "SELECT 1 FROM approval_requests WHERE quotation_id = $1 AND status = 'pending'", [existing.id]
      )).rows[0];
      if (hasApproval) {
        throw new AppError(409, '该报价待审批中，无法同步保存');
      }
    }
    // ⚠️ A112 修复：sync 改为「只更新请求体显式出现的列」。
    //   原实现给缺失字段填默认值 0/null 并全量覆盖，提交失败补偿回滚（只传状态）会把
    //   amount/total_cost/profit_rate 清零、opportunity_id 置 NULL，财务数据被静默破坏。
    const SYNC_COLS = ['sales_no', 'client_name', 'project_name', 'status', 'amount', 'total_cost', 'profit_rate', 'opportunity_id'];
    let result;
    if (existing) {
      const cols = SYNC_COLS.filter(c => body[c] !== undefined);
      if (cols.length === 0) {
        res.json(existing);
        return;
      }
      const setClause = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
      result = await query(
        `UPDATE quotations SET ${setClause}, updated_at = now()
         WHERE project_id = $${cols.length + 1} AND version_no = $${cols.length + 2}
         RETURNING *`,
        [...cols.map(c => body[c]), project_id, version_no]
      );
    } else {
      result = await query(
        `INSERT INTO quotations (project_id, version_no, sales_no, client_name,
          project_name, status, amount, total_cost, profit_rate, opportunity_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [project_id, version_no, body.sales_no ?? '', body.client_name ?? '',
         body.project_name ?? '', status ?? 'draft', body.amount ?? 0,
         body.total_cost ?? 0, body.profit_rate ?? 0, body.opportunity_id ?? null]
      );
    }

    const saved = result.rows[0];
    logAudit(req, '保存报价', 'quotation',
      `${body.sales_no ?? saved.sales_no} ${version_no} ¥${saved.amount} ${saved.status}`);

    res.json(saved);
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
  beforeUpdate: async (_req, id, snakeBody) => {
    if (!QUOTATION_FINANCIAL.some(f => snakeBody[f] !== undefined)) return;
    const existing = (await query('SELECT status FROM quotations WHERE id = $1', [id])).rows[0];
    if (existing?.status === 'pending') {
      throw new AppError(409, '该报价待审批中，审批完成前不可修改金额/成本/毛利率/编号/归属/关联机会');
    }
  },
  // ⚠️ A113：存在待审批请求时禁止删除——FK 为 ON DELETE SET NULL，删除后审批成为孤儿，
  //   审批通过时级联分支静默空操作，审批历史与业务对象断链。
  beforeDelete: async (id) => {
    const pending = (await query(
      "SELECT 1 FROM approval_requests WHERE quotation_id = $1 AND status = 'pending'", [id]
    )).rows[0];
    if (pending) throw new AppError(409, '该报价存在待审批请求，请先取消审批');
  },
});

// 合并：自定义路由优先
const router = Router();
router.use(customRouter);
router.use(crudRouter);

export default router;
