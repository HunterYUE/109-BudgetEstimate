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
  // ⚠️ L1 修复：status 只能经 POST /:id/records 走审批状态机（写记录+级联），禁止通用 PUT 直改（会绕过级联/审计断链）
  excludeOnUpdate: ['id', 'created_at', 'updated_at', 'status', 'submit_time'],
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

    // ⚠️ M1 修复：status/submit_time 只能经审批流程（POST /:id/records）流转，创建时禁止直设（此前可创建即 approved）
    const insertCols = fields.filter(f => !['id', 'created_at', 'updated_at', 'status', 'submit_time'].includes(f) && body[f] !== undefined);
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
    // 不向客户端泄漏内部错误详情（此前拼接 err.message 暴露 SQL/表结构）
    console.error('[Approvals] 创建审批失败:', (err as Error).message);
    return next(new AppError(500, '创建审批失败'));
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
    const { action, comment } = req.body;
    if (!action) throw new AppError(400, '缺少必填字段：action');
    if (!['approved', 'rejected'].includes(action)) throw new AppError(400, `无效操作: ${action}`);
    // ⚠️ 权限检查前置：先鉴权再读数据（此前先 SELECT 审批再鉴权，未授权也能探测审批详情）
    if (!hasPermission(req.user?.permissions, '审批管理', '全部查看权限')) throw new AppError(403, '无审批权限');
    // ⚠️ M3 修复：reviewer 强制取自登录用户（防伪造审批人），不再接受 body 传入的 reviewer
    const approver = (await query('SELECT display_name, email FROM users WHERE id = $1', [req.user?.userId])).rows[0];
    const reviewer = approver?.display_name || req.user?.email || '未知用户';
    const ar = (await query('SELECT * FROM approval_requests WHERE id = $1', [id])).rows[0];
    if (!ar) throw new AppError(404, '审批请求未找到');
    // ⚠️ F11 修复：已终审的审批不允许再次写入记录（防双击重复/状态翻转；驳回后重提会新建审批，不在此流转）
    if (ar.status === 'approved' || ar.status === 'rejected') {
      throw new AppError(409, '该审批已处理完毕，不可重复审批');
    }
    client = await getClient();
    await client.query('BEGIN');
    const record = (await client.query('INSERT INTO approval_records (approval_request_id, reviewer, action, comment) VALUES ($1,$2,$3,$4) RETURNING *', [id, reviewer, action, comment || ''])).rows[0];
    const newStatus = action === 'approved' ? 'approved' : 'rejected';
    await client.query('UPDATE approval_requests SET status = $1, updated_at = now() WHERE id = $2', [newStatus, id]);
    // ⚠️ 审批结果 JSONB：写入交付项目的 plan_approval/cost_approval（与审批记录一致），
    //    使后端 /records 事务内完成全部级联，前端无需重复更新（避免双重应用与状态不一致）
    const appraisal = JSON.stringify({ reviewer, action, comment: comment || '', createdAt: new Date().toISOString() });
    if (ar.approval_type === 'promote' && ar.opportunity_id) {
      await client.query('UPDATE sales_opportunities SET promote_locked = false, updated_at = now() WHERE id = $1', [ar.opportunity_id]);
      // ⚠️ L3 修复：晋升到"机会"须写 lead_at/opportunity_at（COALESCE 首次写入不覆盖，与 opportunities.ts 阶段规则一致），否则财年归集丢失
      if (newStatus === 'approved') await client.query(
        "UPDATE sales_opportunities SET stage = '机会', lead_at = COALESCE(lead_at, now()), opportunity_at = COALESCE(opportunity_at, now()), updated_at = now() WHERE id = $1",
        [ar.opportunity_id]
      );
    }
    if (ar.approval_type === 'plan' && ar.delivery_id) {
      await client.query('UPDATE delivery_projects SET plan_status = $1, plan_approval = $2, updated_at = now() WHERE id = $3', [newStatus, appraisal, ar.delivery_id]);
      if (newStatus === 'approved') await client.query('UPDATE delivery_nodes SET baseline_planned_end_date = planned_end_date WHERE delivery_project_id = $1 AND baseline_planned_end_date IS NULL', [ar.delivery_id]);
    }
    if (ar.approval_type === 'cost' && ar.delivery_id) {
      await client.query('UPDATE delivery_projects SET cost_status = $1, cost_approval = $2, updated_at = now() WHERE id = $3', [newStatus, appraisal, ar.delivery_id]);
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

// ⚠️ F5 修复：删除审批须回滚其创建时设置的级联状态（promote_locked / plan_status / cost_status），
//    否则机会被永久锁定、交付状态永久停在 pending（此前通用 DELETE 只删审批行，级联残留）
router.delete('/:id', async (req, res, next) => {
  let client: any;
  try {
    const { id } = req.params;
    client = await getClient();
    await client.query('BEGIN');
    const row = (await client.query(
      'SELECT approval_type, opportunity_id, delivery_id, quotation_id FROM approval_requests WHERE id = $1', [id]
    )).rows[0];
    if (!row) throw new AppError(404, '审批请求不存在');
    // 回滚级联（仅当关联记录仍处于该审批设置的 pending/locked 状态时复位，避免覆盖后续新审批）
    if (row.approval_type === 'plan' && row.delivery_id) {
      await client.query(`UPDATE delivery_projects SET plan_status = 'draft', updated_at = now() WHERE id = $1 AND plan_status = 'pending'`, [row.delivery_id]);
    }
    if (row.approval_type === 'cost' && row.delivery_id) {
      await client.query(`UPDATE delivery_projects SET cost_status = 'draft', updated_at = now() WHERE id = $1 AND cost_status = 'pending'`, [row.delivery_id]);
    }
    if (row.approval_type === 'promote' && row.opportunity_id) {
      await client.query(`UPDATE sales_opportunities SET promote_locked = false, updated_at = now() WHERE id = $1 AND promote_locked = true`, [row.opportunity_id]);
    }
    // ⚠️ 报价审批：删除后回滚前端提交时写入的 pending 状态（报价与版本），避免永久卡在 pending
    if (row.approval_type === 'quotation' && row.quotation_id) {
      await client.query(`UPDATE quotations SET status = 'draft', updated_at = now() WHERE id = $1 AND status = 'pending'`, [row.quotation_id]);
      const qi = (await client.query('SELECT project_id, version_no FROM quotations WHERE id = $1', [row.quotation_id])).rows[0];
      if (qi?.project_id && qi.version_no) {
        await client.query(`UPDATE project_versions SET review_status = 'draft', updated_at = now() WHERE project_id = $1 AND version_no = $2 AND review_status = 'pending'`, [qi.project_id, qi.version_no]);
      }
    }
    await client.query('DELETE FROM approval_requests WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ deleted: true, id });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

// 挂载标准 CRUD 路由（创建、读取单条、更新、删除）
router.use(crudRouter);

export default router;
