import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { signToken } from '../middleware/auth.js';
import { AppError } from '../middleware/index.js';

const router = Router();

// ─── 认证 ────────────────────────────────────────────

/** POST /api/v1/timerecording/auth/login */
router.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError(400, '请输入账号和密码');

    const result = await query(
      `SELECT u.id, u.email, u.display_name, u.password_hash, u.role,
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
    });
  } catch (err) { next(err); }
});

// ─── 用户档案 ──────────────────────────────────────

router.get('/profiles', requireAuth, async (_req, res, next) => {
  try {
    const rows = (await query('SELECT id, employee_id, name, email, role, is_active FROM timerecording.profiles ORDER BY name')).rows;
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

// ─── 工时记录 ──────────────────────────────────────

/** 列表（支持按用户/日期/周筛选） */
router.get('/time-records', requireAuth, async (req, res, next) => {
  try {
    const { user_id, date_from, date_to, year, week_number, status, cost_center } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (user_id) { conditions.push(`user_id = $${idx++}`); params.push(user_id); }
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
    const { user_id, date, week_number, year, start_time, end_time, hours, hour_type, cost_center, task_description } = req.body;
    if (!user_id || !date || hours == null) throw new AppError(400, '缺少必填字段');

    const r = (await query(
      `INSERT INTO timerecording.time_records (user_id, date, week_number, year, start_time, end_time, hours, hour_type, cost_center, task_description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [user_id, date, week_number, year, start_time, end_time, hours, hour_type || 'normal', cost_center, task_description]
    )).rows[0];
    res.status(201).json(r);
  } catch (err) { next(err); }
});

router.put('/time-records/:id', requireAuth, async (req, res, next) => {
  try {
    const fields = ['date', 'week_number', 'year', 'start_time', 'end_time', 'hours', 'hour_type', 'cost_center', 'task_description', 'status'];
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); values.push(req.body[f]); }
    }
    if (!updates.length) throw new AppError(400, '没有要更新的字段');
    values.push(req.params.id);
    const r = (await query(
      `UPDATE timerecording.time_records SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )).rows[0];
    if (!r) throw new AppError(404, '未找到');
    res.json(r);
  } catch (err) { next(err); }
});

router.delete('/time-records/:id', requireAuth, async (req, res, next) => {
  try {
    await query('DELETE FROM timerecording.time_records WHERE id = $1', [req.params.id]);
    logAudit(req, action === 'lock' ? '锁定周' : '解锁周', 'admin', year + 'W周 ' + week_number + ' ' + newStatus);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── 审批 ──────────────────────────────────────────

/** 提交审核 */
router.put('/time-records/:id/submit', requireAuth, async (req, res, next) => {
  try {
    const r = (await query(
      `UPDATE timerecording.time_records SET status = 'submitted' WHERE id = $1 AND status = 'draft' RETURNING *`,
      [req.params.id]
    )).rows[0];
    if (!r) throw new AppError(400, '只能提交草稿状态的记录');
    res.json(r);
  } catch (err) { next(err); }
});

/** 批量提交 */
router.post('/time-records/submit-batch', requireAuth, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) throw new AppError(400, 'ids 必填');
    const rows = (await query(
      `UPDATE timerecording.time_records SET status = 'submitted' WHERE id = ANY($1::uuid[]) AND status = 'draft' RETURNING *`,
      [ids]
    )).rows;
    res.json(rows);
  } catch (err) { next(err); }
});

/** 审批通过/驳回 */
router.put('/time-records/:id/review', requireAuth, async (req, res, next) => {
  try {
    const { action, review_notes } = req.body;
    if (!['approved', 'rejected'].includes(action)) throw new AppError(400, '操作必须是 approved 或 rejected');
    const reviewer = req.user!;
    const r = (await query(
      `UPDATE timerecording.time_records SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $4 AND status = 'submitted' RETURNING *`,
      [action, review_notes || '', reviewer.userId, req.params.id]
    )).rows[0];
    if (!r) throw new AppError(400, '只能审核已提交的记录');
    res.json(r);
  } catch (err) { next(err); }
});

// ─── 任务分配 ──────────────────────────────────────

router.get('/task-assignments', requireAuth, async (req, res, next) => {
  try {
    const { user_id, status } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (user_id) { conditions.push(`user_id = $${idx++}`); params.push(user_id); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    const sql = `SELECT * FROM timerecording.task_assignments${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''} ORDER BY start_datetime`;
    res.json((await query(sql, params)).rows);
  } catch (err) { next(err); }
});

router.post('/task-assignments', requireAuth, async (req, res, next) => {
  try {
    const { user_id, task_name, color, start_datetime, end_datetime, status, note } = req.body;
    const creator = req.user!;
    const r = (await query(
      `INSERT INTO timerecording.task_assignments (user_id, task_name, color, start_datetime, end_datetime, status, created_by, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [user_id, task_name, color, start_datetime, end_datetime, status || 'in_progress', creator.userId, note || '']
    )).rows[0];
    res.status(201).json(r);
  } catch (err) { next(err); }
});

router.put('/task-assignments/:id', requireAuth, async (req, res, next) => {
  try {
    const fields = ['task_name', 'color', 'start_datetime', 'end_datetime', 'status', 'note'];
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); values.push(req.body[f]); }
    }
    if (!updates.length) throw new AppError(400, '没有要更新的字段');
    values.push(req.params.id);
    const r = (await query(
      `UPDATE timerecording.task_assignments SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )).rows[0];
    if (!r) throw new AppError(404, '未找到');
    res.json(r);
  } catch (err) { next(err); }
});

router.delete('/task-assignments/:id', requireAuth, async (req, res, next) => {
  try {
    await query('DELETE FROM timerecording.task_assignments WHERE id = $1', [req.params.id]);
    logAudit(req, action === 'lock' ? '锁定周' : '解锁周', 'admin', year + 'W周 ' + week_number + ' ' + newStatus);
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
    await query("UPDATE timerecording.notifications SET is_read = true WHERE id = $1", [req.params.id]);
    logAudit(req, action === 'lock' ? '锁定周' : '解锁周', 'admin', year + 'W周 ' + week_number + ' ' + newStatus);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── 通知写入（替代 RPC） ──────────────────────────

router.post('/notifications', requireAuth, async (req, res, next) => {
  try {
    const { user_id, title, message: msg, type, link_url } = req.body;
    const r = (await query(
      `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [user_id, title, msg || '', type || 'submission', link_url]
    )).rows[0];
    res.status(201).json(r);
  } catch (err) { next(err); }
});

// ─── 管理员功能 ──────────────────────────────────

/** 管理员创建用户（补 profile + users 表） */
router.post('/admin/users', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  try {
    const { email, name, password, employee_id, role = 'employee' } = req.body;
    if (!email || !name || !password) throw new AppError(400, '缺少必填字段');

    // 创建系统用户
    const passwordHash = await bcrypt.hash(password, 10);
    const empId = employee_id || email.split('@')[0];
    const user = (await query(
      `INSERT INTO public.users (email, display_name, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [email, name, passwordHash, 'user']
    )).rows[0];

    // 创建 profile
    await query(
      `INSERT INTO timerecording.profiles (id, employee_id, name, email, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, empId, name, email, role]
    );

    res.status(201).json({ id: user.id, email, name, employee_id: empId, role });
  } catch (err) { next(err); }
});

/** 管理员重置密码 */
router.post('/admin/users/:id/reset-password', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) throw new AppError(400, '密码至少6个字符');
    const passwordHash = await bcrypt.hash(password, 10);
    await query('UPDATE public.users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
    logAudit(req, '重置密码', 'admin', '用户 ' + id.slice(0,8) + ' 密码已重置');
    logAudit(req, action === 'lock' ? '锁定周' : '解锁周', 'admin', year + 'W周 ' + week_number + ' ' + newStatus);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/** 管理员删除用户 */
router.delete('/admin/users/:id', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM timerecording.profiles WHERE id = $1', [id]);
    await query('DELETE FROM public.users WHERE id = $1', [id]);
    logAudit(req, '删除用户', 'admin', '用户 ' + id.slice(0,8) + ' 已删除');
    logAudit(req, action === 'lock' ? '锁定周' : '解锁周', 'admin', year + 'W周 ' + week_number + ' ' + newStatus);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/** 管理员锁定/解锁周 */
router.post('/admin/lock-week', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  try {
    const { year, week_number, action } = req.body;
    const newStatus = action === 'lock' ? 'locked' : (action === 'unlock' ? 'draft' : null);
    if (!newStatus) throw new AppError(400, '操作必须是 lock 或 unlock');
    await query(
      `UPDATE timerecording.time_records SET status = $1 WHERE year = $2 AND week_number = $3 AND status IN ('draft', 'submitted', 'locked')`,
      [newStatus, year, week_number]
    );
    logAudit(req, action === 'lock' ? '锁定周' : '解锁周', 'admin', year + 'W周 ' + week_number + ' ' + newStatus);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
