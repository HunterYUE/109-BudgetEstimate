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

// 同步报价摘要：根据 project_id + version_no upsert
customRouter.put('/sync', async (req, res, next) => {
  try {
    const body = objKeysToSnake(req.body);
    const { project_id, version_no, sales_no, client_name, project_name,
      status = 'draft', amount = 0, total_cost = 0, profit_rate = 0,
      opportunity_id = null } = body;

    if (!project_id || !version_no) {
      throw new AppError(400, 'Missing required: project_id, version_no');
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
