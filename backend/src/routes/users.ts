import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/index.js';
import { logAudit } from './helpers.js';

const router = Router();

// 所有用户管理接口需要登录 + director/admin 角色
router.use(requireAuth);
router.use(requireRole('director', 'admin'));

const USER_FIELDS = 'id, email, display_name as "displayName", title, phone, role, is_active as "isActive", created_at as "createdAt", permissions';

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
    const { email, displayName, password, title = '', phone = '', role = 'user' } = req.body;
    if (!email || !displayName || !password) {
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
      [email, displayName, title, phone, passwordHash, role]
    );

    logAudit(req, '创建用户', 'user', `创建用户 ${email} (${displayName}) 角色:${role}`);

    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

/** PUT /api/users/:id - 更新用户信息 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { displayName, email, title, phone, isActive } = req.body;

    const existing = await query('SELECT id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError(404, '用户不存在');

    if (email) {
      const conflict = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
      if (conflict.rows.length > 0) throw new AppError(409, '该邮箱已被其他用户使用');
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (displayName !== undefined) { fields.push(`display_name = $${idx++}`); values.push(displayName); }
    if (email !== undefined) { fields.push(`email = $${idx++}`); values.push(email); }
    if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
    if (phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(phone); }
    if (isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(isActive); }

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

    if (!password || password.length < 6) {
      throw new AppError(400, '密码至少6位');
    }

    const existing = await query('SELECT id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError(404, '用户不存在');

    const passwordHash = await bcrypt.hash(password, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);

    logAudit(req, '重置密码', 'user', `用户 ${id.slice(0,8)} 密码已重置`);

    res.json({ success: true });
  } catch (err) { next(err); }
});

/** PUT /api/users/:id/role - 修改角色（auth 角色 + title） */
router.put('/:id/role', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, title } = req.body;

    const validRoles = ['admin', 'director', 'manager', 'user'];
    if (role && !validRoles.includes(role)) {
      throw new AppError(400, `无效角色，允许值：${validRoles.join(', ')}`);
    }

    const existing = await query('SELECT id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError(404, '用户不存在');

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (role) { fields.push(`role = $${idx++}`); values.push(role); }
    if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
    if (req.body.permissions !== undefined) { fields.push(`permissions = $${idx++}`); values.push(req.body.permissions); }

    if (fields.length === 0) throw new AppError(400, '没有要更新的字段');

    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING ${USER_FIELDS}`,
      values
    );

    logAudit(req, '变更角色', 'user', `用户 ${id.slice(0,8)} 角色/权限已更新`);

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/** DELETE /api/users/:id - 删除用户 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUser = req.user!;

    if (currentUser.userId === id) {
      throw new AppError(400, '不能删除自己的账号');
    }

    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id, email', [id]);
    if (result.rows.length === 0) throw new AppError(404, '用户不存在');

    logAudit(req, '删除用户', 'user', `删除用户 ${result.rows[0].email} (${id.slice(0,8)})`);

    res.json({ success: true, id });
  } catch (err) { next(err); }
});

export default router;
