import { Router } from 'express';
import { query, getClient } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { crudRoutes, logAudit, objKeysToSnake } from './helpers.js';

const fields = [
  'id', 'sales_no', 'client_name', 'project_name', 'amount',
  'stage', 'win_rate', 'status', 'salesman', 'competitor', 'winner',
  'expected_close_date', 'notes', 'reasons', 'quotation_id',
  'terminated', 'promote_locked', 'created_at', 'updated_at',
];

// 标准 CRUD（不含 GET / 和 extra 中的自定义端点）
const crudRouter = crudRoutes('sales_opportunities', fields, {
  searchFields: ['sales_no', 'client_name', 'project_name', 'salesman'],
  orderBy: 'updated_at DESC',
});

// 顶层路由 — 自定义 LIST 优先于 crudRouter 的默认 LIST
const router = Router();

// 自定义列表查询，LEFT JOIN 蓝表（含角色）以便前端直接显示赢率
router.get('/', async (req, res, next) => {
  try {
    const { search, limit = '100', offset = '0' } = req.query as Record<string, string>;
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 100));
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    const params: any[] = [];
    let where = '';
    if (search) {
      where = ` WHERE (so.sales_no::text ILIKE $1 OR so.client_name::text ILIKE $1 OR so.project_name::text ILIKE $1 OR so.salesman::text ILIKE $1)`;
      params.push(`%${search}%`);
    }

    const result = await query(
      `SELECT so.*,
        CASE WHEN bt.id IS NOT NULL THEN
          jsonb_build_object(
            'id', bt.id,
            'opportunity_id', bt.opportunity_id,
            'veto_budget', bt.veto_budget,
            'budget_amount', bt.budget_amount,
            'timeline_plan', bt.timeline_plan,
            'timeline_option', bt.timeline_option,
            'pricing', bt.pricing,
            'positioning', bt.positioning,
            'reaction_mode', bt.reaction_mode,
            'strategy', bt.strategy,
            'targets', bt.targets,
            'updated_at', bt.updated_at,
            'roles', COALESCE(
              (SELECT jsonb_agg(jsonb_build_object(
                'id', btr.id,
                'blue_table_id', btr.blue_table_id,
                'role_type', btr.role_type,
                'name', btr.name,
                'influence', btr.influence,
                'influence_weight', btr.influence_weight,
                'support', btr.support,
                'demand_fit', btr.demand_fit,
                'relationship', btr.relationship
              ) ORDER BY btr.influence_weight DESC)
              FROM blue_table_roles btr WHERE btr.blue_table_id = bt.id),
              '[]'::jsonb
            )
          )
        ELSE NULL END as blue_table,
        -- ⚠️ has_quote 检查任何报价（不限 status='approved'），删除此条件会导致 draft 状态的报价不被视为"有报价"
        EXISTS(SELECT 1 FROM quotations WHERE opportunity_id = so.id) as has_quote,
        -- ⚠️ quotation_amount 取机会关联的报价金额（已含税），不可用最新报价（否则机会切换报价后金额错误）
        (SELECT q.amount FROM quotations q WHERE q.id = so.quotation_id) as quotation_amount,
        -- 报价编制表对应的税率，用于 Dashboard 等页面含税→未税转换
        (SELECT pv.tax_rate FROM quotations q JOIN project_versions pv ON pv.project_id = q.project_id AND pv.version_no = q.version_no WHERE q.id = so.quotation_id LIMIT 1) as tax_rate
       FROM sales_opportunities so
       LEFT JOIN blue_tables bt ON bt.opportunity_id = so.id
       ${where}
       -- ⚠️ 按销售编号升序固定排列，不可改回 updated_at DESC（否则列表随编辑刷新不停跳动）
       ORDER BY so.sales_no ASC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// 带蓝表的完整机会信息（详情）
router.get('/:id/detail', async (req, res, next) => {
  try {
    const { id } = req.params;
    const opp = (await query('SELECT * FROM sales_opportunities WHERE id = $1', [id])).rows[0];
    if (!opp) throw new AppError(404, 'Opportunity not found');

    const blueTable = (await query('SELECT * FROM blue_tables WHERE opportunity_id = $1', [id])).rows[0] || null;

    let roles: any[] = [];
    if (blueTable) {
      roles = (await query('SELECT * FROM blue_table_roles WHERE blue_table_id = $1 ORDER BY influence_weight DESC', [blueTable.id])).rows;
    }

    res.json({ ...opp, blueTable: blueTable ? { ...blueTable, roles } : null });
  } catch (err) { next(err); }
});

// 蓝表保存（upsert 蓝表 + 角色）
router.put('/:id/blue-table', async (req, res, next) => {
  try {
    const { id } = req.params;
    logAudit(req, '保存蓝表', 'opportunity', `机会 ${id.slice(0,8)} 蓝表已更新`);
    // 统一转换键名（前端发 camelCase 或 snake_case 均可）
    const body = objKeysToSnake({ ...req.body });
    const { veto_budget, budget_amount, timeline_plan, timeline_option,
            pricing, positioning, reaction_mode, strategy, targets, roles } = body;

    const opp = (await query('SELECT id FROM sales_opportunities WHERE id = $1', [id])).rows[0];
    if (!opp) throw new AppError(404, 'Opportunity not found');

    // Upsert blue table
    const bt = (await query(
      `INSERT INTO blue_tables (opportunity_id, veto_budget, budget_amount, timeline_plan,
        timeline_option, pricing, positioning, reaction_mode, strategy, targets)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (opportunity_id) DO UPDATE SET
        veto_budget = EXCLUDED.veto_budget,
        budget_amount = EXCLUDED.budget_amount,
        timeline_plan = EXCLUDED.timeline_plan,
        timeline_option = EXCLUDED.timeline_option,
        pricing = EXCLUDED.pricing,
        positioning = EXCLUDED.positioning,
        reaction_mode = EXCLUDED.reaction_mode,
        strategy = EXCLUDED.strategy,
        targets = EXCLUDED.targets,
        updated_at = now()
       RETURNING *`,
      [id, veto_budget, budget_amount, timeline_plan, timeline_option,
       pricing, positioning, reaction_mode, strategy, JSON.stringify(targets || [])]
    )).rows[0];

    // Replace roles: delete old, insert new（事务保护）
    if (roles !== undefined) {
      const tx = await getClient();
      try {
        await tx.query('BEGIN');
        await tx.query('DELETE FROM blue_table_roles WHERE blue_table_id = $1', [bt.id]);
        for (const role of roles) {
          const r = {
            role_type: role.role_type ?? role.roleType ?? '',
            name: role.name ?? '',
            influence: role.influence ?? 'medium',
            influence_weight: role.influence_weight ?? role.influenceWeight ?? 3,
            support: role.support ?? 0,
            demand_fit: role.demand_fit ?? role.demandFit ?? 3,
            relationship: role.relationship ?? 3,
          };
          await tx.query(
            `INSERT INTO blue_table_roles (blue_table_id, role_type, name, influence,
              influence_weight, support, demand_fit, relationship)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [bt.id, r.role_type, r.name, r.influence,
             r.influence_weight, r.support, r.demand_fit, r.relationship]
          );
        }
        await tx.query('COMMIT');
      } catch (e) {
        await tx.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        tx.release();
      }
    }

    const newRoles = roles
      ? (await query('SELECT * FROM blue_table_roles WHERE blue_table_id = $1 ORDER BY influence_weight DESC', [bt.id])).rows
      : [];

    res.json({ ...bt, roles: newRoles });
  } catch (err) { next(err); }
});

// 自定义 PUT：更新前检查 promote_locked（允许更新 promote_locked 字段本身以支持锁定/解锁）
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = objKeysToSnake({ ...req.body });
    // 如果只改 promote_locked（锁定/解锁），跳过检查
    const isOnlyLockToggle = Object.keys(body).length === 1 && 'promote_locked' in body;
    if (!isOnlyLockToggle) {
      const existing = (await query('SELECT promote_locked FROM sales_opportunities WHERE id = $1', [id])).rows[0];
      if (existing?.promote_locked) {
        throw new AppError(403, '该机会已提交转机会审批，审批完成前不可修改');
      }
    }
    // 通过检查后交给标准 CRUD PUT 处理
    const snakeBody = objKeysToSnake({ ...req.body });
    const updateCols = fields.filter(f =>
      !['id', 'created_at', 'updated_at'].includes(f) && snakeBody[f] !== undefined
    );
    if (updateCols.length === 0) throw new AppError(400, '没有要更新的字段');
    const setClause = updateCols.map((f, i) => `"${f}" = $${i + 1}`).join(', ');
    const rawValues = updateCols.map(f => snakeBody[f]);
    rawValues.push(id);
    const result = await query(
      `UPDATE sales_opportunities SET ${setClause}, updated_at = now() WHERE id = $${rawValues.length} RETURNING *`,
      rawValues
    );
    if (result.rows.length === 0) throw new AppError(404, '记录不存在');
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// 挂载标准 CRUD 路由
router.use(crudRouter);

export default router;
