import { Router } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { crudRoutes, objKeysToSnake } from './helpers.js';

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

// 自定义 POST：创建审批时自动级联更新相关状态
router.post('/', async (req, res, next) => {
  const body = objKeysToSnake({ ...req.body });
  try {
    const { approval_type, opportunity_id, delivery_id } = body;

    // 创建实施计划审批时，锁定交付项目
    if (approval_type === 'plan' && delivery_id) {
      await query(
        'UPDATE delivery_projects SET plan_status = $1, updated_at = now() WHERE id = $2',
        ['pending', delivery_id]
      );
    }

    // 创建成本对比审批时，锁定交付项目成本状态
    if (approval_type === 'cost' && delivery_id) {
      await query(
        'UPDATE delivery_projects SET cost_status = $1, updated_at = now() WHERE id = $2',
        ['pending', delivery_id]
      );
    }

    if (approval_type === 'promote' && opportunity_id) {
      // 锁定机会
      await query(
        'UPDATE sales_opportunities SET promote_locked = true, updated_at = now() WHERE id = $1',
        [opportunity_id]
      );

      // 从关联报价自动填充财务数据（如前端未提供）
      if (!body.version_no && !body.total_accounting_price) {
        try {
          const oppRows = await query(
            'SELECT quotation_id FROM sales_opportunities WHERE id = $1',
            [opportunity_id]
          );
          const oppRow = oppRows.rows[0];
          if (oppRow?.quotation_id) {
            const qtRows = await query(
              'SELECT project_id, version_no FROM quotations WHERE id = $1',
              [oppRow.quotation_id]
            );
            const qtRow = qtRows.rows[0];
            if (qtRow?.project_id) {
              const pvRows = await query(
                `SELECT * FROM project_versions WHERE project_id = $1 AND version_no = $2`,
                [qtRow.project_id, qtRow.version_no]
              );
              const pv = pvRows.rows[0];
              if (pv) {
                // 自动填充转机会财务数据（使用 snake_case 键名）
                if (!body.version_no) body.version_no = qtRow.version_no;
                if (!body.total_accounting_price) body.total_accounting_price = parseFloat(pv.total_accounting_price) || 0;
                if (!body.discounted_price) body.discounted_price = parseFloat(pv.discounted_price) || 0;
                if (!body.discount_rate) body.discount_rate = parseFloat(pv.discount_rate) || 0;
                if (!body.gp3) body.gp3 = parseFloat(pv.gp3_profit_rate) || 0;
                if (!body.total_cost) body.total_cost = parseFloat(pv.total_cost) || 0;
                if (!body.tax_rate) body.tax_rate = parseFloat(pv.tax_rate) || 0.13;
                if (!body.amount) body.amount = parseFloat(pv.discounted_price) || 0;
                if (!body.gp3_amount) body.gp3_amount = parseFloat(pv.gp3_amount) || 0;
              }
            }
          }
        } catch (e) {
          console.warn('[Approvals] 自动填充转机会数据失败:', (e as Error).message);
        }
      }
    }
  } catch (err) {
    console.warn('[Approvals] 锁定机会/交付状态失败:', (err as Error).message);
  }
  // 将可能被自动填充逻辑修改过的 body 写回 req.body
  req.body = body;
  next();
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
       FROM approval_requests ar${where} ORDER BY ar.updated_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// 获取含审批记录的详情
router.get('/:id/detail', async (req, res, next) => {
  try {
    const { id } = req.params;
    const ar = (await query('SELECT * FROM approval_requests WHERE id = $1', [id])).rows[0];
    if (!ar) throw new AppError(404, 'Approval request not found');

    const records = (await query(
      'SELECT * FROM approval_records WHERE approval_request_id = $1 ORDER BY created_at ASC',
      [id]
    )).rows;

    res.json({ ...ar, records });
  } catch (err) { next(err); }
});

// 添加审批记录（审批/驳回）
router.post('/:id/records', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reviewer, action, comment } = req.body;
    if (!reviewer || !action) {
      throw new AppError(400, 'Missing required fields: reviewer, action');
    }
    if (!['approved', 'rejected'].includes(action)) {
      throw new AppError(400, `Invalid action: ${action}. Must be 'approved' or 'rejected'`);
    }

    const ar = (await query('SELECT * FROM approval_requests WHERE id = $1', [id])).rows[0];
    if (!ar) throw new AppError(404, 'Approval request not found');

    const record = (await query(
      `INSERT INTO approval_records (approval_request_id, reviewer, action, comment)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, reviewer, action, comment || '']
    )).rows[0];

    // 更新审批状态
    const newStatus = action === 'approved' ? 'approved' : 'rejected';
    await query(
      'UPDATE approval_requests SET status = $1, updated_at = now() WHERE id = $2',
      [newStatus, id]
    );

    // 如为转机会审批，审批完成后解锁机会
    if (ar.approval_type === 'promote' && ar.opportunity_id) {
      await query(
        'UPDATE sales_opportunities SET promote_locked = false, updated_at = now() WHERE id = $1',
        [ar.opportunity_id]
      );
      // 审批通过时，同时晋升阶段为"机会"
      if (newStatus === 'approved') {
        await query(
          "UPDATE sales_opportunities SET stage = '机会', updated_at = now() WHERE id = $1",
          [ar.opportunity_id]
        );
      }
    }

    // 实施计划审批完成时，同步交付项目状态 + 保存基准计划时间
    if (ar.approval_type === 'plan' && ar.delivery_id) {
      await query(
        'UPDATE delivery_projects SET plan_status = $1, updated_at = now() WHERE id = $2',
        [newStatus, ar.delivery_id]
      );
      // 审批通过时，将当前计划结束日期写入 baseline_planned_end_date（仅首次写入）
      if (newStatus === 'approved') {
        await query(
          `UPDATE delivery_nodes SET baseline_planned_end_date = planned_end_date
           WHERE delivery_project_id = $1 AND baseline_planned_end_date IS NULL`,
          [ar.delivery_id]
        );
      }
    }

    // 成本对比审批完成时，同步交付项目成本状态
    if (ar.approval_type === 'cost' && ar.delivery_id) {
      await query(
        'UPDATE delivery_projects SET cost_status = $1, updated_at = now() WHERE id = $2',
        [newStatus, ar.delivery_id]
      );
    }

    // 报价审批完成时，同步项目版本状态 + 关联机会金额
    if (ar.approval_type === 'quotation' && ar.quotation_id) {
      // 解锁报价 + 同步审批状态（无论通过还是驳回）
      await query(
        'UPDATE quotations SET locked = false, status = $1, updated_at = now() WHERE id = $2',
        [newStatus, ar.quotation_id]
      );
      // 更新项目版本的审核状态
      if (ar.version_no) {
        const qtInfo = (await query(
          'SELECT project_id FROM quotations WHERE id = $1',
          [ar.quotation_id]
        )).rows[0];
        if (qtInfo?.project_id) {
          await query(
            'UPDATE project_versions SET review_status = $1, updated_at = now() WHERE project_id = $2 AND version_no = $3',
            [newStatus, qtInfo.project_id, ar.version_no]
          );
        }
      }
      // ⚠️ 报价审批通过时，同步更新机会金额为报价折后价（已含税，不再 ×(1+税率) 重复计税）
      if (newStatus === 'approved') {
        const qt = (await query(
          'SELECT opportunity_id, amount FROM quotations WHERE id = $1',
          [ar.quotation_id]
        )).rows[0];
        if (qt?.opportunity_id && qt?.amount > 0) {
          await query(
            'UPDATE sales_opportunities SET amount = $1, updated_at = now() WHERE id = $2',
            [Math.round(parseFloat(qt.amount)), qt.opportunity_id]
          );
        }
      }
    }

    res.status(201).json(record);
  } catch (err) { next(err); }
});

// 挂载标准 CRUD 路由（创建、读取单条、更新、删除）
router.use(crudRouter);

export default router;
