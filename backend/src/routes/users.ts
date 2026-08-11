import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, getClient } from '../db/index.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../middleware/index.js';
import { logAudit, objKeysToSnake } from './helpers.js';

const router = Router();

// 所有用户管理接口需要登录 + 用户管理/系统配置权限（与前端 /settings 同口径）
router.use(requireAuth);
router.use(requirePermission('用户管理', '系统配置', '全部查看权限'));

const USER_FIELDS = 'id, email, display_name, title, phone, role, is_active, created_at, permissions';

/** GET /api/users - 获取用户列表 */
router.get('/', async (_req, res, next) => {
  try {
    const result = await query(`SELECT ${USER_FIELDS} FROM users ORDER BY created_at ASC`);
    res.json(result.rows);
  } catch (err) { next(err); }
});

/** POST /api/users - 创建新用户 */
router.post('/', async (req, res, next) => {
  try {
    // 统一转换为 snake_case（兼容前端 api.ts toSnake 或直接调用）
    const { display_name, email, password, title = '', phone = '', role = 'user' } = objKeysToSnake({ ...req.body });
    if (!email || !display_name || !password) {
      throw new AppError(400, '缺少必填字段：email, displayName, password');
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new AppError(409, '该邮箱已被注册');
    }

    const validRoles = ['admin', 'director', 'manager', 'user'];
    if (!validRoles.includes(role)) {
      throw new AppError(400, `无效角色，允许值：${validRoles.join(', ')}`);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (email, display_name, title, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${USER_FIELDS}`,
      [email, display_name, title, phone, passwordHash, role]
    );

    logAudit(req, '创建用户', 'user', `创建用户 ${email} (${display_name}) 角色:${role}`);

    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

/** PUT /api/users/:id - 更新用户信息 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { display_name, email, title, phone, is_active } = objKeysToSnake({ ...req.body });

    const existing = await query('SELECT id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError(404, '用户不存在');

    if (email) {
      const conflict = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
      if (conflict.rows.length > 0) throw new AppError(409, '该邮箱已被其他用户使用');
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (display_name !== undefined) { fields.push(`display_name = $${idx++}`); values.push(display_name); }
    if (email !== undefined) { fields.push(`email = $${idx++}`); values.push(email); }
    if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
    if (phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(phone); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }

    if (fields.length === 0) throw new AppError(400, '没有要更新的字段');

    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING ${USER_FIELDS}`,
      values
    );

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/** PUT /api/users/:id/password - 重置密码 */
router.put('/:id/password', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      throw new AppError(400, '密码至少8位');
    }

    const existing = await query('SELECT id, email, display_name FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError(404, '用户不存在');

    const passwordHash = await bcrypt.hash(password, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);

    logAudit(req, '重置密码', 'user', `用户 ${existing.rows[0].display_name || existing.rows[0].email} 密码已重置`);

    res.json({ success: true });
  } catch (err) { next(err); }
});

/** PUT /api/users/:id/role - 修改角色（auth 角色 + title） */
router.put('/:id/role', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, title, permissions } = objKeysToSnake({ ...req.body });

    // ⚠️ 自保护：不能修改自己的角色/权限（防持有"用户管理"权限者自提权为 admin/director）
    if (id === req.user!.userId) throw new AppError(400, '不能修改自己的角色/权限');

    const validRoles = ['admin', 'director', 'manager', 'user'];
    if (role && !validRoles.includes(role)) {
      throw new AppError(400, `无效角色，允许值：${validRoles.join(', ')}`);
    }

    const userRow = (await query('SELECT email, display_name FROM users WHERE id = $1', [id])).rows[0];
    if (!userRow) throw new AppError(404, '用户不存在');

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (role) { fields.push(`role = $${idx++}`); values.push(role); }
    if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
    if (permissions !== undefined) { fields.push(`permissions = $${idx++}`); values.push(permissions); }

    if (fields.length === 0) throw new AppError(400, '没有要更新的字段');

    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING ${USER_FIELDS}`,
      values
    );

    logAudit(req, '变更角色', 'user', `用户 ${userRow.display_name || userRow.email} 角色/权限已更新`);

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/** DELETE /api/users/:id - 删除用户 */
router.delete('/:id', async (req, res, next) => {
  let client: any;
  try {
    const { id } = req.params;
    const currentUser = req.user!;

    if (currentUser.userId === id) {
      throw new AppError(400, '不能删除自己的账号');
    }

    // ⚠️ F13 修复：先删 timerecording.profiles（引用 users.id），再删 users，同一事务避免孤儿/外键冲突
    // ⚠️ M5 修复：① timerecording schema 可能未部署，用 to_regclass 探测，避免 .catch 吞错导致事务 abort；
    //            ② 先清空以该用户为 reviewer/created_by 的引用（无 ON DELETE 动作），否则 FK 阻塞删除
    client = await getClient();
    await client.query('BEGIN');
    const sc = (await client.query(
      `SELECT to_regclass('timerecording.profiles') AS p,
              to_regclass('timerecording.time_records') AS tr,
              to_regclass('timerecording.task_assignments') AS ta`
    )).rows[0];
    if (sc?.p) {
      const hasProfile = (await client.query('SELECT id FROM timerecording.profiles WHERE id = $1', [id])).rows.length > 0;
      if (hasProfile) {
        if (sc.tr) await client.query('UPDATE timerecording.time_records SET reviewed_by = NULL WHERE reviewed_by = $1', [id]);
        if (sc.ta) await client.query('UPDATE timerecording.task_assignments SET created_by = NULL WHERE created_by = $1', [id]);
        await client.query('DELETE FROM timerecording.profiles WHERE id = $1', [id]);
      }
    }
    const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING id, email', [id]);
    if (result.rows.length === 0) throw new AppError(404, '用户不存在');
    await client.query('COMMIT');

    logAudit(req, '删除用户', 'user', `删除用户 ${result.rows[0].email}`);

    res.json({ success: true, id });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

export default router;
