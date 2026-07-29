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
  excludeOnCreate: ['locked'],
});

// 合并：自定义路由优先
const router = Router();
router.use(customRouter);
router.use(crudRouter);

export default router;
