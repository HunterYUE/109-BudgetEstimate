import { Router } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { hasPermission } from '../middleware/auth.js';
import { crudRoutes, logAudit, objKeysToSnake, buildSearchWhere, parsePagination, withTransaction } from './helpers.js';

const fields = [
  'id', 'sales_no', 'client_name', 'project_name', 'amount',
  'stage', 'win_rate', 'status', 'salesman', 'competitor', 'winner',
  'expected_close_date', 'notes', 'reasons', 'quotation_id',
  'terminated', 'promote_locked', 'won_at', 'lost_at',
  'lead_at', 'opportunity_at', 'bid_at', 'negotiation_at', 'created_at', 'updated_at',
];

// 标准 CRUD（不含 GET / 和 extra 中的自定义端点）
const crudRouter = crudRoutes('sales_opportunities', fields, {
  searchFields: ['sales_no', 'client_name', 'project_name', 'salesman'],
  orderBy: 'updated_at DESC',
  // ⚠️ A19 修复：列表（自定义 GET /）与更新（自定义 PUT /:id 含 promote_locked/lost_at/阶段规则）均已由顶层路由覆盖，
  //   skipList/skipUpdate 跳过 crudRoutes 中会被遮蔽的死处理器，避免两套逻辑并存
  skipList: true,
  skipUpdate: true,
  // ⚠️ A108 修复：创建禁直设生命周期字段——won_at/lost_at 由 PUT 状态机采集、promote_locked 需特权（PUT 有
  //   全部查看权限 校验、POST 此前无）、terminated 仅转交付流程置位。POST 直设可伪造赢单时间/绕过转交付标记。
  excludeOnCreate: ['id', 'created_at', 'updated_at', 'won_at', 'lost_at', 'promote_locked', 'terminated'],
  // ⚠️ F3 修复：机会已转交付时删除会撞 NO ACTION 外键（delivery_projects.opportunity_id），明确提示
  beforeDelete: async (id) => {
    const delivery = (await query('SELECT id FROM delivery_projects WHERE opportunity_id = $1', [id])).rows[0];
    if (delivery) throw new AppError(409, '该机会已转交付，无法删除。请先删除对应交付项目。');
  },
});

// 顶层路由 — 自定义 LIST 优先于 crudRouter 的默认 LIST
const router = Router();

// 自定义列表查询，LEFT JOIN 蓝表（含角色）以便前端直接显示赢率
router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    const params: any[] = [];
    let where = buildSearchWhere(search, ['sales_no', 'client_name', 'project_name', 'salesman'], params, 'so');
    const { limit, offset } = parsePagination(req.query);

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
        --   （保留 EXISTS：口径是"机会名下任一报价"，与下方 JOIN 的"关联报价"语义不同；opportunity_id 有索引，逐行开销可接受）
        EXISTS(SELECT 1 FROM quotations WHERE opportunity_id = so.id) as has_quote,
        -- ⚠️ A109 修复：quotation_amount/tax_rate 由逐行标量子查询改为 LEFT JOIN 链（q.id = so.quotation_id
        --   精确匹配关联报价，pv 按 project+version 取税率；无关联报价时两列 NULL，与原子查询结果一致）
        q.amount AS quotation_amount,
        pv.tax_rate AS tax_rate
       FROM sales_opportunities so
       LEFT JOIN blue_tables bt ON bt.opportunity_id = so.id
       LEFT JOIN quotations q ON q.id = so.quotation_id
       LEFT JOIN project_versions pv ON pv.project_id = q.project_id AND pv.version_no = q.version_no
       ${where}
       -- ⚠️ 按销售编号升序固定排列，不可改回 updated_at DESC（否则列表随编辑刷新不停跳动）
       ORDER BY so.sales_no ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// 带蓝表的完整机会信息（详情）
router.get('/:id/detail', async (req, res, next) => {
  try {
    const { id } = req.params;
    const opp = (await query('SELECT * FROM sales_opportunities WHERE id = $1', [id])).rows[0];
    if (!opp) throw new AppError(404, '机会未找到');

    const blueTable = (await query('SELECT * FROM blue_tables WHERE opportunity_id = $1', [id])).rows[0] || null;

    let roles: any[] = [];
    if (blueTable) {
      roles = (await query('SELECT * FROM blue_table_roles WHERE blue_table_id = $1 ORDER BY influence_weight DESC', [blueTable.id])).rows;
    }

    res.json({ ...opp, blue_table: blueTable ? { ...blueTable, roles } : null });
  } catch (err) { next(err); }
});

// 蓝表保存（upsert 蓝表 + 角色，同一事务）
router.put('/:id/blue-table', async (req, res, next) => {
  try {
    const { id } = req.params;
    // ⚠️ A9 修复：同机会一次查询取回 id+sales_no，复用存在性检查与审计（此前对同一 id 连查两次）
    const oppRow = (await query('SELECT id, sales_no FROM sales_opportunities WHERE id = $1', [id])).rows[0];
    if (!oppRow) throw new AppError(404, '机会未找到');
    const body = objKeysToSnake({ ...req.body });
    const { veto_budget, budget_amount, timeline_plan, timeline_option,
            pricing, positioning, reaction_mode, strategy, targets, roles } = body;

    // ⚠️ A15：事务样板收敛为 withTransaction（BEGIN/COMMIT/ROLLBACK/release 统一封装）
    const bt = await withTransaction(async (client) => {
      // Upsert blue table
      const blueTable = (await client.query(
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

      // Replace roles: delete old, insert new（与蓝表同一事务）
      if (roles !== undefined) {
        await client.query('DELETE FROM blue_table_roles WHERE blue_table_id = $1', [blueTable.id]);
        for (const role of roles) {
          const rs = objKeysToSnake(role);
          const r = {
            role_type: rs.role_type || '',
            name: rs.name || '',
            influence: rs.influence || 'medium',
            influence_weight: rs.influence_weight || 3,
            support: rs.support || 0,
            demand_fit: rs.demand_fit || 3,
            relationship: rs.relationship || 3,
          };
          await client.query(
            `INSERT INTO blue_table_roles (blue_table_id, role_type, name, influence,
              influence_weight, support, demand_fit, relationship)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [blueTable.id, r.role_type, r.name, r.influence,
             r.influence_weight, r.support, r.demand_fit, r.relationship]
          );
        }
      }
      return blueTable;
    });

    // 提交后重新查询（事务外的连接才能看到已提交的数据）
    const savedBt = (await query('SELECT * FROM blue_tables WHERE id = $1', [bt.id])).rows[0];
    const savedRoles = roles
      ? (await query('SELECT * FROM blue_table_roles WHERE blue_table_id = $1 ORDER BY influence_weight DESC', [bt.id])).rows
      : [];

    logAudit(req, '保存蓝表', 'opportunity', `机会 ${oppRow?.sales_no || id.slice(0,8)} 蓝表已更新`);

    res.json({ ...savedBt, roles: savedRoles });
  } catch (e) {
    next(e);
  }
});

// 自定义 PUT：更新前检查 promote_locked（允许更新 promote_locked 字段本身以支持锁定/解锁）
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = objKeysToSnake({ ...req.body });
    // ⚠️ promote_locked 是特权字段：只要 body 含它（无论是否伴随其他字段）都需『全部查看权限』，
    //    否则 { promote_locked:true, notes:'x' } 会落入 else 分支绕过检查（F1 修复）
    if ('promote_locked' in body) {
      if (!hasPermission(req.user?.permissions, '全部查看权限')) {
        throw new AppError(403, '仅部门总监和管理员可锁定/解锁机会');
      }
    } else {
      const existing = (await query('SELECT promote_locked FROM sales_opportunities WHERE id = $1', [id])).rows[0];
      if (existing?.promote_locked) {
        throw new AppError(403, '该机会已提交转机会审批，审批完成前不可修改');
      }
    }
    // 通过检查后交给标准 CRUD PUT 处理（复用上面的 body 转换结果）
    // ⚠️ 修复：阶段时间戳（lead_at/opportunity_at/bid_at/negotiation_at）禁直设——由下方阶段规则
    //   COALESCE 服务端采集（首次写入不覆盖），客户端直写可伪造“进入某阶段的时间”污染财年归集口径
    const updateCols = fields.filter(f =>
      !['id', 'created_at', 'updated_at', 'won_at', 'lost_at',
        'lead_at', 'opportunity_at', 'bid_at', 'negotiation_at'].includes(f) && body[f] !== undefined
    );
    if (updateCols.length === 0) throw new AppError(400, '没有要更新的字段');
    let setClause = updateCols.map((f, i) => `"${f}" = $${i + 1}`).join(', ');
    const rawValues = updateCols.map(f => body[f]);
    // ⚠️ won_at 仅在转交付（terminated）时采集（69d3de6 语义，勿回归）：
    // 手动标赢未转交付不算赢单，won_at 保持 NULL；转交付时由下方 terminated 块 COALESCE 写入
    // 状态变"输"：lost_at 记录当次输单时间（每次输单都更新，不留存旧值）
    if (body.status === '输') {
      setClause += `, lost_at = now()`;
    }
    // 状态离开"输"（恢复过程中/转赢/冻结）：清除 lost_at，避免陈旧输单时间残留导致财年归集失真
    if (body.status && body.status !== '输') {
      setClause += `, lost_at = NULL`;
    }
    // 记录进入各阶段时间（首次写入后不覆盖）：线索/机会/投标/议价；信息=创建时间、中标=won_at
    if (body.stage && ['线索', '机会', '投标', '议价', '中标'].includes(body.stage)) {
      setClause += `, lead_at = COALESCE(lead_at, now())`;
    }
    if (body.stage && ['机会', '投标', '议价', '中标'].includes(body.stage)) {
      setClause += `, opportunity_at = COALESCE(opportunity_at, now())`;
    }
    if (body.stage && ['投标', '议价', '中标'].includes(body.stage)) {
      setClause += `, bid_at = COALESCE(bid_at, now())`;
    }
    if (body.stage && ['议价', '中标'].includes(body.stage)) {
      setClause += `, negotiation_at = COALESCE(negotiation_at, now())`;
    }
    // 转交付 = 赢单的终极确认：转交付时强制置为"赢/中标"并记录 won_at（转交付时间）
    if (body.terminated) {
      // ⚠️ A105 修复：转交付须真实存在交付项目——防仅持写权限者伪造 terminated 直接把机会标成赢单
      //   （无交付的"赢"是假赢单，会污染赢率/财年归集口径）
      const delivery = (await query('SELECT 1 FROM delivery_projects WHERE opportunity_id = $1', [id])).rows[0];
      const cur = (await query('SELECT status FROM sales_opportunities WHERE id = $1', [id])).rows[0];
      if (delivery) {
        if (cur?.status === '赢') {
          setClause += `, won_at = COALESCE(won_at, now())`;
        } else if (cur?.status === '输') {
          // ⚠️ 最终审计修正：转交付 = 赢单终极确认——已标输的机会转入交付同样算赢单（置赢/中标 + won_at，清 lost_at）；
          //   此前该分支只写 lost_at，不改 status/stage、won_at 恒 NULL，赢单财年归集永远丢失
          setClause += `, status = '赢', stage = '中标', won_at = COALESCE(won_at, now()), lost_at = NULL`;
        } else {
          // 过程中/冻结转交付 → 100% 确认为赢单
          setClause += `, status = '赢', stage = '中标', won_at = COALESCE(won_at, now())`;
        }
      } else if (cur?.status === '输') {
        // ⚠️ 审计修复：无交付项目的"输"机会归档终止（前端终止按钮对 status='输' 的归档流）——
        //   仅置 terminated，不改状态/阶段/won_at（输单归档=确认战败，不产生赢单）；无交付的非输机会仍 400（A105 防伪赢单回归）
      } else {
        throw new AppError(400, '转交付须先创建交付项目');
      }
    }
    rawValues.push(id);
    const result = await query(
      `UPDATE sales_opportunities SET ${setClause}, updated_at = now() WHERE id = $${rawValues.length} RETURNING *`,
      rawValues
    );
    if (result.rows.length === 0) throw new AppError(404, '记录不存在');
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// 获取下个销售编号（必须在 crudRouter 之前，否则 /:id 会拦截）
router.get('/next-sales-no', async (req, res, next) => {
  try {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const prefix = `A${y}-${m}-`;
    // ⚠️ A107 修复：MAX+1 取号并发竞态——两用户同时点「新增」会拿到同一序号，后建者撞唯一约束。
    //   pg_advisory_xact_lock 在事务内串行化取号（同名 key 的并发调用排队），消除同刻取重号
    const nextSeq = await withTransaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('opportunity_sales_no_gen'))`);
      const r = (await client.query(
        `SELECT COALESCE(MAX(SUBSTRING(sales_no FROM 'A\\d+-\\d+-(\\d+)')::int), 0) + 1 AS next_seq
         FROM sales_opportunities WHERE sales_no LIKE $1`,
        [prefix + '%']
      )).rows[0];
      return r.next_seq;
    });
    const seq = String(nextSeq).padStart(3, '0');
    res.json({ sales_no: `${prefix}${seq}-S` });
  } catch (err) { next(err); }
});

// 挂载标准 CRUD 路由
router.use(crudRouter);

export default router;
