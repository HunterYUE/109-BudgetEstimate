import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { signToken, requireAuth, setAuthCookie, clearAuthCookie, COOKIE_NAME_BUDGET } from '../middleware/auth.js';
import { AppError } from '../middleware/index.js';
import { logAudit } from './helpers.js';

const router = Router();

// 用户不存在时也执行一次 bcrypt.compare（假比较抹平时耗，防批量探测已注册邮箱；启动时生成一次）
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equalizer-dummy', 10);

/** POST /api/auth/login */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new AppError(400, '请输入邮箱和密码');
    }
    // 类型校验（防对象/数组入参触发 PG 类型错误 500）
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new AppError(400, '邮箱/密码必须为字符串');
    }
    // 邮箱归一化：trim + 小写（与 users 路由创建/更新的归一化口径一致；LOWER 比较兼容历史大小写存储）
    const emailNorm = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      throw new AppError(400, '邮箱格式无效');
    }

    const result = await query(
      'SELECT id, email, display_name, title, password_hash, role, permissions FROM users WHERE LOWER(email) = $1 AND is_active = true',
      [emailNorm]
    );

    const user = result.rows[0];
    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH); // 假比较：耗时与真实比较一致，防邮箱枚举
      throw new AppError(401, '邮箱或密码错误');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new AppError(401, '邮箱或密码错误');
    }

    // ⚠️ 跨应用登录权限：普通员工仅限任务规划和报工应用，禁止登录销售·交付应用
    if (user.title === '普通员工' && user.role !== 'admin' && user.role !== 'director') {
      throw new AppError(403, '该账号仅限登录任务规划和报工应用，无权使用销售和交付管理');
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    // ⚠️ L6 修复：token 只写 HttpOnly cookie（JS 读不到），不再回传 body
    setAuthCookie(res, COOKIE_NAME_BUDGET, token);

    // 审计日志：登录（非阻塞 fire-and-forget——审计表/DB 异常不应让用户登录失败；失败仅记录日志）
    query(
      `INSERT INTO audit_logs (time, user_name, action, module, detail)
       VALUES (now(), $1, '登录', 'auth', $2)`,
      [email, `用户 ${user.display_name || email} 登录系统，角色: ${user.role}`]
    ).catch(err => console.error('[Audit] 登录审计写入失败:', (err as Error).message));

    res.json({
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
    // ⚠️ 跨应用登录权限：普通员工仅限任务规划和报工应用（已持有旧 token 也在此拦截并登出）
    if (u.title === '普通员工' && u.role !== 'admin' && u.role !== 'director') {
      throw new AppError(403, '该账号仅限登录任务规划和报工应用，无权使用销售和交付管理');
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

/** POST /api/auth/logout - 清除认证 cookie（幂等；无需鉴权，HttpOnly cookie 只有服务端能清） */
router.post('/logout', (_req, res) => {
  clearAuthCookie(res, COOKIE_NAME_BUDGET);
  res.json({ ok: true });
});

export default router;
