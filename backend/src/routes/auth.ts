import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { signToken, requireAuth, setAuthCookie, clearAuthCookie, COOKIE_NAME_BUDGET } from '../middleware/auth.js';
import { AppError } from '../middleware/index.js';
import { logAudit, normalizeEmail, EMAIL_RE, DUMMY_PASSWORD_HASH } from './helpers.js';

const router = Router();

/** 跨应用登录限制判定：普通员工仅限任务规划和报工应用，禁止登录销售·交付应用
 *  （login 与 /me 两处同规则共用；admin/director 例外可跨应用） */
export function isRestrictedCrossAppUser(title: unknown, role: unknown): boolean {
  return title === '普通员工' && role !== 'admin' && role !== 'director';
}

/** 认证用户响应归一化（DB 行 → 前端 camelCase 形状；login 默认不含 createdAt，/me 传 true 包含） */
export function shapeAuthUser(u: Record<string, any>, includeCreatedAt = false): Record<string, any> {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    title: u.title || '',
    role: u.role,
    permissions: u.permissions || [],
    ...(includeCreatedAt ? { createdAt: u.created_at } : {}),
  };
}

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
    // 邮箱归一化：trim + 小写（与 users/timerecording 登录归一化共用 normalizeEmail；LOWER 比较兼容历史大小写存储）
    const emailNorm = normalizeEmail(email);
    if (!EMAIL_RE.test(emailNorm)) {
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
    if (isRestrictedCrossAppUser(user.title, user.role)) {
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
      user: shapeAuthUser(user),
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
    if (isRestrictedCrossAppUser(u.title, u.role)) {
      throw new AppError(403, '该账号仅限登录任务规划和报工应用，无权使用销售和交付管理');
    }
    res.json(shapeAuthUser(u, true));
  } catch (err) { next(err); }
});

/** POST /api/auth/logout - 清除认证 cookie（幂等；无需鉴权，HttpOnly cookie 只有服务端能清） */
router.post('/logout', (_req, res) => {
  clearAuthCookie(res, COOKIE_NAME_BUDGET);
  res.json({ ok: true });
});

export default router;
