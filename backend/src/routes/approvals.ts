import { Router } from 'express';
import { query, getClient } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { requirePermission, hasPermission } from '../middleware/auth.js';
import { crudRoutes, logAudit, objKeysToSnake } from './helpers.js';

const fields = [
  'id', 'approval_type', 'quotation_id', 'opportunity_id', 'delivery_id',
  'sales_no', 'client_name', 'project_name', 'amount', 'total_cost',
  'profit_rate', 'gp3', 'tax_rate', 'submitter', 'submit_time', 'status',
  'version_no', 'total_accounting_price', 'discounted_price',
  'discount_rate', 'gp3_amount',
  'created_at', 'updated_at',
];

// 标准 CRUD（不含 GET /，因为我们会自定义列表查询）
const crudRouter = crudRoutes('approval_requests', fields, {
  searchFields: ['sales_no', 'client_name', 'project_name', 'submitter'],
  orderBy: 'updated_at DESC',
  excludeOnCreate: ['id', 'created_at', 'updated_at'],
});

// 顶层路由 — 自定义 LIST 优先于 crudRouter 的默认 LIST（否则默认 LIST 永远拦截请求）
const router = Router();

// 自定义 POST：创建审批时自动级联更新相关状态（事务保护）
router.post('/', async (req, res, next) => {
  const body = objKeysToSnake({ ...req.body });
  let client;
  try {
    const { approval_type, opportunity_id, delivery_id } = body;
    client = await getClient();
    await client.query('BEGIN');

    if (approval_type === 'plan' && delivery_id) {
      await client.query('UPDATE delivery_projects SET plan_status = $1, updated_at = now() WHERE id = $2', ['pending', delivery_id]);
    }
    if (approval_type === 'cost' && delivery_id) {
      await client.query('UPDATE delivery_projects SET cost_status = $1, updated_at = now() WHERE id = $2', ['pending', delivery_id]);
    }

    if (approval_type === 'promote' && opportunity_id) {
      await client.query('UPDATE sales_opportunities SET promote_locked = true, updated_at = now() WHERE id = $1', [opportunity_id]);
      if (!body.version_no && !body.total_accounting_price) {
        try {
          const oppRow = (await client.query('SELECT quotation_id FROM sales_opportunities WHERE id = $1', [opportunity_id])).rows[0];
          if (oppRow?.quotation_id) {
            const qtRow = (await client.query('SELECT project_id, version_no FROM quotations WHERE id = $1', [oppRow.quotation_id])).rows[0];
            if (qtRow?.project_id) {
              const pv = (await client.query('SELECT * FROM project_versions WHERE project_id = $1 AND version_no = $2', [qtRow.project_id, qtRow.version_no])).rows[0];
              if (pv) {
                body.version_no ??= qtRow.version_no;
                body.total_accounting_price ??= parseFloat(pv.total_accounting_price) || 0;
                body.discounted_price ??= parseFloat(pv.discounted_price) || 0;
                body.discount_rate ??= parseFloat(pv.discount_rate) || 0;
                body.gp3 ??= parseFloat(pv.gp3_profit_rate) || 0;
                body.total_cost ??= parseFloat(pv.total_cost) || 0;
                body.tax_rate ??= parseFloat(pv.tax_rate) || 0.13;
                body.amount ??= parseFloat(pv.discounted_price) || 0;
                body.gp3_amount ??= parseFloat(pv.gp3_amount) || 0;
              }
            }
          }
        } catch (e) { console.warn('[Approvals] 自动填充失败:', (e as Error).message); }
      }
    }

    const insertCols = fields.filter(f => !['id', 'created_at', 'updated_at'].includes(f) && body[f] !== undefined);
    if (insertCols.length === 0) throw new AppError(400, '没有要插入的字段');
    const result = await client.query(
      `INSERT INTO approval_requests (${insertCols.map(f => `"${f}"`).join(', ')}) VALUES (${insertCols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      insertCols.map(f => body[f])
    );
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (err instanceof AppError) return next(err);
    return next(new AppError(500, `创建审批失败: ${(err as Error).message}`));
  } finally {
    if (client) client.release();
  }
});

// 自定义列表查询，包含最新审批记录（latest_record）
router.get('/', async (req, res, next) => {
  try {
    const { search, limit = '100', offset = '0' } = req.query as Record<string, string>;
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 100));
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    const params = [];
    let where = '';
    if (search) {
      where = ` WHERE (ar.sales_no::text ILIKE $1 OR ar.client_name::text ILIKE $1 OR ar.project_name::text ILIKE $1 OR ar.submitter::text ILIKE $1)`;
      params.push(`%${search}%`);
    }
    const result = await query(
      `SELECT ar.*,
        (SELECT row_to_json(ar2.*) FROM approval_records ar2 WHERE ar2.approval_request_id = ar.id ORDER BY ar2.created_at DESC LIMIT 1) as latest_record
       FROM approval_requests ar${where} ORDER BY ar.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offsetNum]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// 获取含审批记录的详情
router.get('/:id/detail', async (req, res, next) => {
  try {
    const { id } = req.params;
    const ar = (await query('SELECT * FROM approval_requests WHERE id = $1', [id])).rows[0];
    if (!ar) throw new AppError(404, '审批请求未找到');

    const records = (await query(
      'SELECT * FROM approval_records WHERE approval_request_id = $1 ORDER BY created_at ASC',
      [id]
    )).rows;

    res.json({ ...ar, records });
  } catch (err) { next(err); }
});

// 添加审批记录（审批/驳回，事务保护）
router.post('/:id/records', async (req, res, next) => {
  let client;
  try {
    const { id } = req.params;
    const { reviewer, action, comment } = req.body;
    if (!reviewer || !action) throw new AppError(400, '缺少必填字段：reviewer, action');
    if (!['approved', 'rejected'].includes(action)) throw new AppError(400, `无效操作: ${action}`);
    const ar = (await query('SELECT * FROM approval_requests WHERE id = $1', [id])).rows[0];
    if (!ar) throw new AppError(404, '审批请求未找到');
    if (!hasPermission(req.user?.permissions, '审批管理', '全部查看权限')) throw new AppError(403, '无审批权限');
    client = await getClient();
    await client.query('BEGIN');
    const record = (await client.query('INSERT INTO approval_records (approval_request_id, reviewer, action, comment) VALUES ($1,$2,$3,$4) RETURNING *', [id, reviewer, action, comment || ''])).rows[0];
    const newStatus = action === 'approved' ? 'approved' : 'rejected';
    await client.query('UPDATE approval_requests SET status = $1, updated_at = now() WHERE id = $2', [newStatus, id]);
    if (ar.approval_type === 'promote' && ar.opportunity_id) {
      await client.query('UPDATE sales_opportunities SET promote_locked = false, updated_at = now() WHERE id = $1', [ar.opportunity_id]);
      if (newStatus === 'approved') await client.query("UPDATE sales_opportunities SET stage = '机会', updated_at = now() WHERE id = $1", [ar.opportunity_id]);
    }
    if (ar.approval_type === 'plan' && ar.delivery_id) {
      await client.query('UPDATE delivery_projects SET plan_status = $1, updated_at = now() WHERE id = $2', [newStatus, ar.delivery_id]);
      if (newStatus === 'approved') await client.query('UPDATE delivery_nodes SET baseline_planned_end_date = planned_end_date WHERE delivery_project_id = $1 AND baseline_planned_end_date IS NULL', [ar.delivery_id]);
    }
    if (ar.approval_type === 'cost' && ar.delivery_id) {
      await client.query('UPDATE delivery_projects SET cost_status = $1, updated_at = now() WHERE id = $2', [newStatus, ar.delivery_id]);
    }
    if (ar.approval_type === 'quotation' && ar.quotation_id) {
      await client.query('UPDATE quotations SET locked = false, status = $1, updated_at = now() WHERE id = $2', [newStatus, ar.quotation_id]);
      if (ar.version_no) {
        const qi = (await client.query('SELECT project_id FROM quotations WHERE id = $1', [ar.quotation_id])).rows[0];
        if (qi?.project_id) await client.query('UPDATE project_versions SET review_status = $1, updated_at = now() WHERE project_id = $2 AND version_no = $3', [newStatus, qi.project_id, ar.version_no]);
      }
      if (newStatus === 'approved') {
        const qt = (await client.query('SELECT opportunity_id, amount FROM quotations WHERE id = $1', [ar.quotation_id])).rows[0];
        if (qt?.opportunity_id && qt?.amount > 0) await client.query('UPDATE sales_opportunities SET amount = $1, updated_at = now() WHERE id = $2', [Math.round(parseFloat(qt.amount) || 0), qt.opportunity_id]);
      }
    }
    await client.query('COMMIT');
    logAudit(req, action === 'approved' ? '审批通过' : '审批驳回', 'approval', '审批 ID:' + id + ' 类型:' + (ar.approval_type || '') + ' ' + (action === 'approved' ? '已通过' : '已驳回'));
    res.status(201).json(record);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

// 标准 CRUD 更新/删除需角色验证
router.use((req, res, next) => {
  if (req.method === 'PUT' || req.method === 'DELETE') {
    return requirePermission('审批管理', '全部查看权限')(req, res, next);
  }
  next();
});

// 挂载标准 CRUD 路由（创建、读取单条、更新、删除）
router.use(crudRouter);

export default router;
