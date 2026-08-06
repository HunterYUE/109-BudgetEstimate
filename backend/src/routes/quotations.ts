import { Router } from 'express';
import { crudRoutes, logAudit, objKeysToSnake } from './helpers.js';
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
    const { search, limit = '100', offset = '0' } = req.query as Record<string, string>;
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 100));
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    const params: any[] = [];
    let where = '';
    if (search) {
      where = ' WHERE (q.sales_no::text ILIKE $1 OR q.client_name::text ILIKE $1 OR q.project_name::text ILIKE $1)';
      params.push(`%${search}%`);
    }
    const sql = `SELECT q.*, pv.gp3_amount, pv.discounted_price, pv.tax_rate
      FROM quotations q
      LEFT JOIN project_versions pv ON pv.project_id = q.project_id AND pv.version_no = q.version_no
      ${where}
      ORDER BY q.sales_no DESC, q.version_no DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const result = await query(sql, [...params, limitNum, offsetNum]);
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
      throw new AppError(409, '该报价待审批中，无法同步保存');
    }

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
  // 显式传 excludeOnCreate/excludeOnUpdate 会覆盖默认的 id/created_at/updated_at，必须一并保留
  excludeOnCreate: ['id', 'created_at', 'updated_at', 'locked'],
  // ⚠️ H2 修复：status 只能经审批流程（POST /approvals/:id/records）流转，禁止通用 PUT 直改绕过审批；
  //   locked 由审批级联维护，禁止直改。前端无 PUT /:id 直写 status 的合法路径。
  excludeOnUpdate: ['id', 'created_at', 'updated_at', 'status', 'locked'],
});

// 合并：自定义路由优先
const router = Router();
router.use(customRouter);
router.use(crudRouter);

export default router;
