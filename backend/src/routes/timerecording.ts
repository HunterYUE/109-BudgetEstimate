import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query, getClient } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { signToken } from '../middleware/auth.js';
import { AppError } from '../middleware/index.js';
import { logAudit } from './helpers.js';

const router = Router();

/** 是否为工时系统管理员（director/admin，JWT role） */
const isTrAdmin = (u: { role?: string } | undefined): boolean => !!u && (u.role === 'director' || u.role === 'admin');

/** 财年标识（与预算应用一致：每年7月1日起）。FY2526 → 前缀 'A2526' */
const fiscalYearLabel = (d: Date = new Date()): string => {
  const m = d.getMonth();
  const y1 = m >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  const y2 = m >= 6 ? d.getFullYear() + 1 : d.getFullYear();
  return `FY${String(y1 % 100).padStart(2, '0')}${String(y2 % 100).padStart(2, '0')}`;
};
/** 财年 → 成本中心前缀（FY2627 → 'A2627'） */
const fyPrefixOf = (fy?: string): string =>
  (fy && /^FY\d{4}$/.test(fy)) ? 'A' + fy.slice(2) : 'A' + fiscalYearLabel().slice(2);

/**
 * 工时角色（派生自预算用户 role + permissions）：
 *   director 总监（全部权限） / manager 方案·交付经理（可分配任务、查看综合分析） / employee 员工（仅本人填报/统计）
 */
const trRoleOf = (u: { role?: string; permissions?: string[] } | undefined): 'director' | 'manager' | 'employee' => {
  if (u?.role === 'director') return 'director';
  const perms: string[] = u?.permissions || [];
  if (perms.includes('报价编制') || perms.includes('交付管理')) return 'manager';
  return 'employee';
};
/** 是否能分配任务 / 查看全员数据（总监 + 方案·交付经理） */
const isManager = (u: { role?: string; permissions?: string[] } | undefined): boolean => trRoleOf(u) !== 'employee';

// ⚠️ M4 修复：工时登录端点同样加限速（此前只有主 /auth/login 限速，此处可被暴力破解）
const trLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: '登录尝试过于频繁，请 15 分钟后再试',
});

// ─── 认证 ────────────────────────────────────────────

/** POST /api/v1/timerecording/auth/login */
router.post('/auth/login', trLoginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError(400, '请输入账号和密码');

    const result = await query(
      `SELECT u.id, u.email, u.display_name, u.password_hash, u.role, u.permissions,
              p.employee_id, p.name, p.role as tr_role
       FROM public.users u
       LEFT JOIN timerecording.profiles p ON p.id = u.id
       WHERE u.email = $1 AND u.is_active = true`,
      [email]
    );

    const user = result.rows[0];
    if (!user) throw new AppError(401, '账号或密码错误');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError(401, '账号或密码错误');

    // 如果没有 profile 则创建
    if (!user.tr_role) {
      const empId = user.email.split('@')[0];
      await query(
        `INSERT INTO timerecording.profiles (id, employee_id, name, email, role)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [user.id, empId, user.display_name, user.email,
         user.role === 'director' || user.role === 'admin' ? 'admin' : 'employee']
      );
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        employeeId: user.employee_id || user.email.split('@')[0],
        name: user.name || user.display_name,
        role: user.tr_role || (user.role === 'director' || user.role === 'admin' ? 'admin' : 'employee'),
        // ⚠️ 工时角色：director(总监)/manager(方案·交付经理)/employee(普通员工)
        trRole: trRoleOf({ role: user.role, permissions: user.permissions }),
      },
    });
  } catch (err) { next(err); }
});

/** GET /api/v1/timerecording/auth/me */
router.get('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const u = req.user!;
    const result = await query(
      `SELECT u.id, u.email, u.display_name,
              p.employee_id, p.name, p.role, p.is_active
       FROM public.users u
       LEFT JOIN timerecording.profiles p ON p.id = u.id
       WHERE u.id = $1`,
      [u.userId]
    );
    if (result.rows.length === 0) throw new AppError(404, '用户不存在');
    const r = result.rows[0];
    res.json({
      id: r.id, email: r.email,
      displayName: r.display_name,
      employeeId: r.employee_id || r.email.split('@')[0],
      name: r.name || r.display_name,
      role: r.role || 'employee',
      // ⚠️ 工时角色：req.user 含 JWT role 与每请求加载的 permissions
      trRole: trRoleOf({ role: req.user!.role, permissions: req.user!.permissions }),
    });
  } catch (err) { next(err); }
});

// ─── 用户档案 ──────────────────────────────────────

// ⚠️ 全员档案列表：管理员看全字段；非管理员仅返回 id/employee_id/name/is_active（供任务规划/我的账户展示，
//   不泄漏邮箱/角色——平衡隐私与任务规划需要全员名单）
router.get('/profiles', requireAuth, async (req, res, next) => {
  try {
    const admin = isTrAdmin(req.user);
    const select = admin ? 'id, employee_id, name, email, role, is_active' : 'id, employee_id, name, is_active';
    const rows = (await query(`SELECT ${select} FROM timerecording.profiles ORDER BY name`)).rows;
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/profiles/:id', requireAuth, async (req, res, next) => {
  try {
    const rows = (await query('SELECT id, employee_id, name, email, role, is_active FROM timerecording.profiles WHERE id = $1', [req.params.id])).rows;
    if (!rows[0]) throw new AppError(404, '档案未找到');
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/profiles/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const admin = isTrAdmin(user);
    // ⚠️ F6 修复：只能改自己的档案；role/is_active 等管理字段仅管理员可改（此前任意用户可改任意档案含角色）
    if (req.params.id !== user.userId && !admin) throw new AppError(403, '无权修改他人档案');
    if (['role', 'is_active'].some(f => f in req.body) && !admin) throw new AppError(403, '仅管理员可修改角色/启用状态');
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const f of ['name', 'email', 'role', 'is_active']) {
      if (req.body[f] !== undefined) { fields.push(`${f} = $${idx++}`); values.push(req.body[f]); }
    }
    if (!fields.length) throw new AppError(400, '没有要更新的字段');
    values.push(req.params.id);
    const r = (await query(
      `UPDATE timerecording.profiles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, employee_id, name, email, role, is_active`,
      values
    )).rows[0];
    if (!r) throw new AppError(404, '未找到');
    res.json(r);
  } catch (err) { next(err); }
});

// ─── 成本中心 ─────────────────────────────────────

/** 可用成本中心清单（按类型分组）。sales/project/warranty 来自预算库实时数据；department/personal 按财年生成 */
router.get('/cost-centers', requireAuth, async (req, res, next) => {
  try {
    const { fy } = req.query as Record<string, string>;
    const fyLabel = (fy && /^FY\d{4}$/.test(fy)) ? fy : fiscalYearLabel();
    const prefix = fyPrefixOf(fyLabel);

    const [salesRows, projectRows, warrantyRows] = await Promise.all([
      query(`SELECT sales_no, project_name, client_name FROM sales_opportunities WHERE sales_no LIKE 'A%-S' ORDER BY sales_no`),
      query(`SELECT sales_no, project_name, client_name FROM delivery_projects WHERE sales_no LIKE 'A%-E' ORDER BY sales_no`),
      query(`SELECT sales_no, project_name, client_name FROM delivery_projects WHERE status = '已完成' AND sales_no LIKE 'A%-E' ORDER BY sales_no`),
    ]);

    res.json({
      fy: fyLabel,
      types: {
        sales: salesRows.rows.map(r => ({ code: r.sales_no, name: r.project_name, clientName: r.client_name })),
        project: projectRows.rows.map(r => ({ code: r.sales_no, name: r.project_name, clientName: r.client_name })),
        warranty: warrantyRows.rows.map(r => ({ code: r.sales_no.replace(/-E$/, '-W'), name: r.project_name, clientName: r.client_name })),
        department: [{ code: `${prefix}-De-000`, name: '部门成本中心' }],
        personal: [{ code: `${prefix}-00-000`, name: '个人成本中心' }],
      },
    });
  } catch (err) { next(err); }
});

// ─── 工时记录 ──────────────────────────────────────

/** 列表（支持按用户/日期/周筛选） */
router.get('/time-records', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // ⚠️ 总监 + 方案/交付经理可读全员（综合分析需要）；普通员工仅本人
    const manager = isManager(user);
    const { user_id, date_from, date_to, year, week_number, status, cost_center } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (manager) {
      if (user_id) { conditions.push(`user_id = $${idx++}`); params.push(user_id); }
    } else {
      conditions.push(`user_id = $${idx++}`); params.push(user.userId);
    }
    if (date_from) { conditions.push(`date >= $${idx++}`); params.push(date_from); }
    if (date_to) { conditions.push(`date <= $${idx++}`); params.push(date_to); }
    if (year) { conditions.push(`year = $${idx++}`); params.push(parseInt(year as string)); }
    if (week_number) { conditions.push(`week_number = $${idx++}`); params.push(parseInt(week_number as string)); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (cost_center) { conditions.push(`cost_center = $${idx++}`); params.push(cost_center); }

    const sql = `SELECT * FROM timerecording.time_records${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''} ORDER BY date DESC, created_at DESC`;
    const rows = (await query(sql, params)).rows;
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/time-records', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // ⚠️ 总监/管理员也可填报工时（2026-08-06 需求调整，此前按"总监不填报"做了 403 限制）
    const { user_id, date, week_number, year, start_time, end_time, hours, hour_type, cost_center, cost_center_type, task_description } = req.body;
    // 所有用户只能为自己建记录（此前可传任意 user_id 代建）
    const targetUserId = user.userId;
    if (!targetUserId || !date || hours == null) throw new AppError(400, '缺少必填字段');

    const r = (await query(
      `INSERT INTO timerecording.time_records (user_id, date, week_number, year, start_time, end_time, hours, hour_type, cost_center, cost_center_type, task_description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [targetUserId, date, week_number, year, start_time, end_time, hours, hour_type || 'normal', cost_center || null, cost_center_type || null, task_description]
    )).rows[0];
    res.status(201).json(r);
  } catch (err) { next(err); }
});

router.put('/time-records/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const admin = isTrAdmin(user);
    // ⚠️ F6 修复：status 不能直接改（须走 /submit 与 /review 审批流程），移除出可更新字段
    const fields = ['date', 'week_number', 'year', 'start_time', 'end_time', 'hours', 'hour_type', 'cost_center', 'cost_center_type', 'task_description'];
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); values.push(req.body[f]); }
    }
    if (!updates.length) throw new AppError(400, '没有要更新的字段');
    // ⚠️ 工作流优化：驳回记录允许编辑修正，编辑后自动回到 draft（可重新提交）
    updates.push(`status = CASE WHEN status = 'rejected' THEN 'draft' ELSE status END`);
    values.push(req.params.id);
    // 归属校验：非管理员只能改自己的记录
    if (!admin) values.push(user.userId);
    // 已审核通过/已锁定记录不可直改（须走审批流程）
    const r = (await query(
      `UPDATE timerecording.time_records SET ${updates.join(', ')} WHERE id = $${idx}${admin ? '' : ` AND user_id = $${idx + 1}`} AND status NOT IN ('approved', 'locked') RETURNING *`,
      values
    )).rows[0];
    if (!r) throw new AppError(400, admin ? '记录不存在、已通过或已锁定' : '记录不存在、无权修改、已通过或已锁定');
    res.json(r);
  } catch (err) { next(err); }
});

/** 撤回提交（submitted → draft，仅本人；须在审核前撤回） */
router.put('/time-records/:id/withdraw', requireAuth, async (req, res, next) => {
  try {
    const r = (await query(
      `UPDATE timerecording.time_records SET status = 'draft' WHERE id = $1 AND status = 'submitted' AND user_id = $2 RETURNING *`,
      [req.params.id, req.user!.userId]
    )).rows[0];
    if (!r) throw new AppError(400, '只能撤回自己已提交、尚未审核的记录');
    res.json(r);
  } catch (err) { next(err); }
});

router.delete('/time-records/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const admin = isTrAdmin(user);
    // ⚠️ F6 修复：归属校验，非管理员只能删自己的记录
    // ⚠️ M2 修复：状态守卫——仅 draft 可删；已提交/已审核/已锁定记录禁止删除，防破坏工时审计链
    const r = (await query(
      `DELETE FROM timerecording.time_records WHERE id = $1${admin ? '' : ' AND user_id = $2'} AND status = 'draft' RETURNING id`,
      admin ? [req.params.id] : [req.params.id, user.userId]
    )).rows[0];
    if (!r) throw new AppError(404, admin ? '记录不存在或已提交/已审核，不可删除' : '记录不存在、无权删除或已提交/已审核，不可删除');
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── 审批 ──────────────────────────────────────────

/** 提交审核（⚠️ F6 补漏：只能提交自己的草稿记录） */
router.put('/time-records/:id/submit', requireAuth, async (req, res, next) => {
  try {
    const r = (await query(
      `UPDATE timerecording.time_records SET status = 'submitted' WHERE id = $1 AND status = 'draft' AND user_id = $2 RETURNING *`,
      [req.params.id, req.user!.userId]
    )).rows[0];
    if (!r) throw new AppError(400, '只能提交自己的草稿记录');
    res.json(r);
  } catch (err) { next(err); }
});

/** 批量提交（⚠️ F6 补漏：只能提交自己的草稿记录） */
router.post('/time-records/submit-batch', requireAuth, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) throw new AppError(400, 'ids 必填');
    const rows = (await query(
      `UPDATE timerecording.time_records SET status = 'submitted' WHERE id = ANY($1::uuid[]) AND status = 'draft' AND user_id = $2 RETURNING *`,
      [ids, req.user!.userId]
    )).rows;
    // ⚠️ 工作流优化：提交成功后自动通知所有管理员（移除前端轮询全员列表找 admin 的依赖）
    if (rows.length > 0) {
      try {
        const admins = (await query(`SELECT id FROM timerecording.profiles WHERE role = 'admin' AND is_active = true`)).rows;
        if (admins.length > 0) {
          const weekLabel = `${rows[0].year}W${rows[0].week_number}`;
          const totalHours = rows.reduce((s: number, r: any) => s + parseFloat(r.hours || 0), 0);
          const submitter = (await query('SELECT name FROM timerecording.profiles WHERE id = $1', [req.user!.userId])).rows[0]?.name || '员工';
          for (const a of admins) {
            await query(
              `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url)
               VALUES ($1, $2, $3, 'submission', '/admin/approval')`,
              [a.id, `${submitter} 提交了工时`, `第 ${weekLabel} 周 · 共 ${totalHours}h`]
            );
          }
        }
      } catch (_) { /* 通知失败不影响提交主流程 */ }
    }
    res.json(rows);
  } catch (err) { next(err); }
});

/** 给被审记录所属员工发一条审核结果通知 */
async function notifyReview(r: any, action: string, review_notes?: string) {
  try {
    const weekLabel = `${r.year}W${r.week_number}`;
    await query(
      `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url)
       VALUES ($1, $2, $3, $4, '/time-record')`,
      [r.user_id, action === 'approved' ? '工时已通过' : '工时已驳回',
       `第 ${weekLabel} 周${review_notes ? ' · 备注: ' + review_notes : ''}`,
       action === 'approved' ? 'approval' : 'rejection']
    );
  } catch (_) { /* 通知失败不影响审批主流程 */ }
}

/** 审批通过/驳回（⚠️ F6 补漏：审批是管理员操作，防止任意用户代审/自审） */
router.put('/time-records/:id/review', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  try {
    const { action, review_notes } = req.body;
    if (!['approved', 'rejected'].includes(action)) throw new AppError(400, '操作必须是 approved 或 rejected');
    const reviewer = req.user!;
    const r = (await query(
      `UPDATE timerecording.time_records SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $4 AND status = 'submitted' RETURNING *`,
      [action, review_notes || '', reviewer.userId, req.params.id]
    )).rows[0];
    if (!r) throw new AppError(400, '只能审核已提交的记录');
    await notifyReview(r, action, review_notes);
    res.json(r);
  } catch (err) { next(err); }
});

/** 批量审批（管理员）：一次审批一组记录（如同一员工同一周），原子完成，只发一条通知 */
router.post('/time-records/review-batch', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  let client: any;
  try {
    const { ids, action, review_notes } = req.body;
    if (!Array.isArray(ids) || !ids.length) throw new AppError(400, 'ids 必填');
    if (!['approved', 'rejected'].includes(action)) throw new AppError(400, '操作必须是 approved 或 rejected');
    const reviewer = req.user!;
    client = await getClient();
    await client.query('BEGIN');
    const rows = (await client.query(
      `UPDATE timerecording.time_records SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = now()
       WHERE id = ANY($4::uuid[]) AND status = 'submitted' RETURNING *`,
      [action, review_notes || '', reviewer.userId, ids]
    )).rows;
    await client.query('COMMIT');
    if (rows.length > 0) {
      const totalHours = rows.reduce((s: number, r: any) => s + parseFloat(r.hours || 0), 0);
      await notifyReview({ ...rows[0], user_id: rows[0].user_id }, action, `${review_notes || ''}${rows.length > 1 ? `（共 ${rows.length} 条，${totalHours}h）` : ''}`);
    }
    res.json(rows);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

// ─── 任务分配 ──────────────────────────────────────

router.get('/task-assignments', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // ⚠️ 总监 + 方案/交付经理可看全员任务（规划甘特）；普通员工仅自己
    const manager = isManager(user);
    const { user_id, status } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (manager) {
      if (user_id) { conditions.push(`user_id = $${idx++}`); params.push(user_id); }
    } else {
      conditions.push(`user_id = $${idx++}`); params.push(user.userId);
    }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    const sql = `SELECT * FROM timerecording.task_assignments${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''} ORDER BY start_datetime`;
    res.json((await query(sql, params)).rows);
  } catch (err) { next(err); }
});

router.post('/task-assignments', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // ⚠️ 给他人派任务是 总监/方案经理/交付经理 权限；普通员工只能给自己建任务
    const manager = isManager(user);
    const { user_id, task_name, color, start_datetime, end_datetime, status, note } = req.body;
    const targetUserId = (manager && user_id) ? user_id : user.userId;
    const r = (await query(
      `INSERT INTO timerecording.task_assignments (user_id, task_name, color, start_datetime, end_datetime, status, created_by, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [targetUserId, task_name, color, start_datetime, end_datetime, status || 'in_progress', user.userId, note || '']
    )).rows[0];
    // ⚠️ 任务推送：管理员派给他人的任务，自动通知该员工
    if (r && targetUserId !== user.userId) {
      try {
        const assigner = (await query('SELECT name FROM timerecording.profiles WHERE id = $1', [user.userId])).rows[0]?.name || '管理员';
        await query(
          `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url)
           VALUES ($1, $2, $3, 'task', '/task-planning')`,
          [targetUserId, '您有新任务', `${assigner} 分配了任务「${r.task_name}」`]
        );
      } catch (_) { /* 通知失败不影响派任务 */ }
    }
    res.status(201).json(r);
  } catch (err) { next(err); }
});

router.put('/task-assignments/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // ⚠️ 总监 + 方案/交付经理可编辑他人任务；普通员工只能改自己的
    const manager = isManager(user);
    const fields = ['task_name', 'color', 'start_datetime', 'end_datetime', 'status', 'note'];
    // ⚠️ 先取旧状态，用于通知判定（对比状态是否变化）
    const old = (await query(
      `SELECT * FROM timerecording.task_assignments WHERE id = $1${manager ? '' : ' AND user_id = $2'}`,
      manager ? [req.params.id] : [req.params.id, user.userId]
    )).rows[0];
    if (!old) throw new AppError(404, manager ? '任务不存在' : '任务不存在或无权修改');

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); values.push(req.body[f]); }
    }
    if (!updates.length) throw new AppError(400, '没有要更新的字段');
    values.push(req.params.id);
    if (!manager) values.push(user.userId);
    const r = (await query(
      `UPDATE timerecording.task_assignments SET ${updates.join(', ')} WHERE id = $${idx}${manager ? '' : ` AND user_id = $${idx + 1}`} RETURNING *`,
      values
    )).rows[0];
    if (!r) throw new AppError(404, manager ? '未找到' : '任务不存在或无权修改');

    // ⚠️ 任务工作流通知（完整规划）：
    //  1) 管理员改派/编辑他人任务 → 推送「任务更新」给被分配员工
    //  2) 状态变更为反馈态（已完成/已取消/已推迟/已延误）→ 反馈给派发人（自身除外）
    const FEEDBACK_STATES = ['completed', 'cancelled', 'postponed', 'delayed'];
    const empName = (await query('SELECT name FROM timerecording.profiles WHERE id = $1', [r.user_id])).rows[0]?.name || '员工';
    if (r.user_id !== user.userId) {
      try {
        const assigner = (await query('SELECT name FROM timerecording.profiles WHERE id = $1', [user.userId])).rows[0]?.name || '管理员';
        await query(
          `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url)
           VALUES ($1, $2, $3, 'task', '/task-planning')`,
          [r.user_id, '任务更新', `${assigner} 更新了任务「${r.task_name}」${req.body.note ? '：' + req.body.note : ''}`]
        );
      } catch (_) { /* 通知失败不影响更新 */ }
    }
    if (req.body.status && req.body.status !== old.status && FEEDBACK_STATES.includes(req.body.status) && r.created_by !== user.userId) {
      try {
        const statusLabel: Record<string, string> = { completed: '已完成', cancelled: '已取消', postponed: '已推迟', delayed: '已延误' };
        const label = statusLabel[req.body.status as string];
        await query(
          `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url)
           VALUES ($1, $2, $3, 'task_feedback', '/task-planning')`,
          [r.created_by, `任务${label}`, `${empName} 将「${r.task_name}」标记为${label}${req.body.note ? '：' + req.body.note : ''}`]
        );
      } catch (_) { /* 通知失败不影响状态更新 */ }
    }
    res.json(r);
  } catch (err) { next(err); }
});

router.delete('/task-assignments/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // ⚠️ 总监 + 方案/交付经理可删除他人任务；普通员工只能删自己的
    const manager = isManager(user);
    const r = (await query(
      `DELETE FROM timerecording.task_assignments WHERE id = $1${manager ? '' : ' AND user_id = $2'} RETURNING id`,
      manager ? [req.params.id] : [req.params.id, user.userId]
    )).rows[0];
    if (!r) throw new AppError(404, manager ? '记录不存在' : '任务不存在或无权删除');
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── 通知 ──────────────────────────────────────────

router.get('/notifications', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const rows = (await query(
      'SELECT * FROM timerecording.notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [user.userId]
    )).rows;
    res.json(rows);
  } catch (err) { next(err); }
});

router.put('/notifications/:id/read', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // ⚠️ F6 修复：只能标记自己的通知为已读
    const r = (await query(
      'UPDATE timerecording.notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, user.userId]
    )).rows[0];
    if (!r) throw new AppError(404, '通知不存在');
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── 通知写入（替代 RPC） ──────────────────────────

router.post('/notifications', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const admin = isTrAdmin(user);
    const { user_id, title, message: msg, type, link_url } = req.body;
    // ⚠️ F6 修复：给他人发通知是管理/系统操作；非管理员只能给自己建
    const targetUserId = (admin && user_id) ? user_id : user.userId;
    const r = (await query(
      `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [targetUserId, title, msg || '', type || 'submission', link_url]
    )).rows[0];
    res.status(201).json(r);
  } catch (err) { next(err); }
});

// ─── 管理员功能 ──────────────────────────────────

/** 管理员创建用户（补 profile + users 表） */
router.post('/admin/users', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  let client: any;
  try {
    const { email, name, password, employee_id, role = 'employee' } = req.body;
    if (!email || !name || !password) throw new AppError(400, '缺少必填字段');
    // ⚠️ L4 修复：重复邮箱预检，避免撞唯一约束返回笼统错误（与 users.ts 口径一致）
    const dup = (await query('SELECT id FROM public.users WHERE email = $1', [email])).rows[0];
    if (dup) throw new AppError(409, '该邮箱已被注册');

    const passwordHash = await bcrypt.hash(password, 10);
    const empId = employee_id || email.split('@')[0];
    // ⚠️ F14 修复：users + profiles 两步写放入同一事务，避免中途失败留下"有 users 无 profile"半成品
    client = await getClient();
    await client.query('BEGIN');
    const user = (await client.query(
      `INSERT INTO public.users (email, display_name, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [email, name, passwordHash, 'user']
    )).rows[0];
    await client.query(
      `INSERT INTO timerecording.profiles (id, employee_id, name, email, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, empId, name, email, role]
    );
    await client.query('COMMIT');

    res.status(201).json({ id: user.id, email, name, employee_id: empId, role });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

/** 管理员重置密码 */
router.post('/admin/users/:id/reset-password', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    // ⚠️ L7 修复：密码策略与主用户管理统一为至少 8 位（此前此处 6 位、users.ts 8 位，口径不一致）
    if (!password || password.length < 8) throw new AppError(400, '密码至少8个字符');
    const passwordHash = await bcrypt.hash(password, 10);
    await query('UPDATE public.users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
    logAudit(req, '重置密码', 'admin', '用户 ' + id.slice(0,8) + ' 密码已重置');
    res.json({ success: true });
  } catch (err) { next(err); }
});

/** 管理员删除用户 */
router.delete('/admin/users/:id', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  let client: any;
  try {
    const { id } = req.params;
    // ⚠️ F14 修复：profiles + users 两步删除放入同一事务，避免中途失败留下"有 profile 无 users"半成品
    // ⚠️ M5 修复：先清空以该用户为 reviewer/创建者的引用（无 ON DELETE 动作会 FK 阻塞删除），再删 profile
    client = await getClient();
    await client.query('BEGIN');
    await client.query('UPDATE timerecording.time_records SET reviewed_by = NULL WHERE reviewed_by = $1', [id]);
    await client.query('UPDATE timerecording.task_assignments SET created_by = NULL WHERE created_by = $1', [id]);
    await client.query('DELETE FROM timerecording.profiles WHERE id = $1', [id]);
    await client.query('DELETE FROM public.users WHERE id = $1', [id]);
    await client.query('COMMIT');
    logAudit(req, '删除用户', 'admin', '用户 ' + id.slice(0,8) + ' 已删除');
    res.json({ success: true });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

/** 管理员锁定/解锁周（⚠️ 工作流优化：lock 保存原状态到 prev_status，unlock 恢复，不丢失 submitted） */
router.post('/admin/lock-week', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  try {
    const { year, week_number, action } = req.body;
    if (!['lock', 'unlock'].includes(action)) throw new AppError(400, '操作必须是 lock 或 unlock');
    if (action === 'lock') {
      await query(
        `UPDATE timerecording.time_records SET prev_status = status, status = 'locked'
         WHERE year = $1 AND week_number = $2 AND status IN ('draft', 'submitted')`,
        [year, week_number]
      );
    } else {
      await query(
        `UPDATE timerecording.time_records SET status = COALESCE(prev_status, 'draft'), prev_status = NULL
         WHERE year = $1 AND week_number = $2 AND status = 'locked'`,
        [year, week_number]
      );
    }
    logAudit(req, action === 'lock' ? '锁定周' : '解锁周', 'admin', year + 'W周 ' + week_number);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
