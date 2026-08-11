import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/index.js';
import { logAudit } from './helpers.js';

const router = Router();

/** POST /api/auth/login */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new AppError(400, '请输入邮箱和密码');
    }

    const result = await query(
      'SELECT id, email, display_name, title, password_hash, role, permissions FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    const user = result.rows[0];
    if (!user) {
      throw new AppError(401, '邮箱或密码错误');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new AppError(401, '邮箱或密码错误');
    }

    // ⚠️ 跨应用登录权限：普通员工仅限工时填报和统计应用，禁止登录报价·交付应用
    if (user.title === '普通员工' && user.role !== 'admin' && user.role !== 'director') {
      throw new AppError(403, '该账号仅限登录工时填报和统计应用，无权使用报价和交付管理');
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // 审计日志：登录
    await query(
      `INSERT INTO audit_logs (time, user_name, action, module, detail)
       VALUES (now(), $1, '登录', 'auth', $2)`,
      [email, `用户 ${user.display_name || email} 登录系统，角色: ${user.role}`]
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        title: user.title || '',
        role: user.role,
        permissions: user.permissions || [],
      },
    });
  } catch (err) { next(err); }
});

/** GET /api/auth/me - 获取当前登录用户信息 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const result = await query(
      'SELECT id, email, display_name, title, role, permissions, created_at FROM users WHERE id = $1',
      [user.userId]
    );
    if (result.rows.length === 0) {
      throw new AppError(404, '用户不存在');
    }
    const u = result.rows[0];
    // ⚠️ 跨应用登录权限：普通员工仅限工时填报和统计应用（已持有旧 token 也在此拦截并登出）
    if (u.title === '普通员工' && u.role !== 'admin' && u.role !== 'director') {
      throw new AppError(403, '该账号仅限登录工时填报和统计应用，无权使用报价和交付管理');
    }
    res.json({
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      title: u.title || '',
      role: u.role,
      permissions: u.permissions || [],
      createdAt: u.created_at,
    });
  } catch (err) { next(err); }
});

export default router;
