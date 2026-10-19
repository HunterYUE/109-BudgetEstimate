import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/index.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET 必须设置且长度不少于 32 位字符！');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';

// HttpOnly cookie 认证，token 不再落 localStorage（XSS 无法读取），浏览器请求时自动携带
// 两应用工时 tr_token / 预算 budget_token，共用同一 JWT_SECRET/用户表，token 互通，requireAuth 认任一即可
// 各应用登录/登出只写/清自己的 cookie，互不影响，Bearer header 已下线，login 不再回传 token
export const COOKIE_NAME_TR = 'tr_token';
export const COOKIE_NAME_BUDGET = 'budget_token';
const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 对齐 JWT exp（24h）
// 生产当前为纯 HTTP，118.89.92.58，Secure 必须为 false 否则浏览器拒收 cookie，上 HTTPS 后在 .env 设 COOKIE_SECURE=1
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';

/** 手写 cookie 解析，不引入 cookie-parser 依赖，取指定 name 的值，无则 undefined。
 * 畸形百分号编码不抛错（decode 失败回退原始串）：cookieValue 在 async 中间件中同步抛出会变成
 * 未处理的 Promise rejection（Express 4 不会转交 errorHandler），请求将永久挂起 */
function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      const raw = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
}

/** 登录成功后写认证 cookie，Path=/api，只随 API 请求发送、不随静态资源，SameSite=Lax 挡跨站 CSRF */
export function setAuthCookie(res: Response, name: string, token: string): void {
  res.cookie(name, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    path: '/api',
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

/** 登出/凭证失效时清认证 cookie，选项须与 set 一致，否则清除无效 */
export function clearAuthCookie(res: Response, name: string): void {
  res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, path: '/api' });
}

// 扩展 Express Request 类型，使 req.user 有正确类型
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { permissions?: string[]; title?: string; display_name?: string };
    }
  }
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  /** jsonwebtoken 自动写入的签发时刻（Unix 秒），改密吊销比对用，旧 token 无 iat → 0，仅影响手工伪造 token */
  iat?: number;
  exp?: number;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // 从 HttpOnly cookie 取 token，按「本应用优先」排序：预算请求优先 budget_token，工时请求优先 tr_token
  // 两个 cookie 都验签：① 过期 token 不遮蔽另一个有效 token；② 若两个都有效但属于不同账号，
  // 说明浏览器残留了他人会话（共用工作站），直接拒绝，避免以另一账号身份操作
  const trToken = cookieValue(req.headers.cookie, COOKIE_NAME_TR);
  const budgetToken = cookieValue(req.headers.cookie, COOKIE_NAME_BUDGET);
  const isTrRequest = (req.originalUrl || '').includes('/timerecording') || (req.baseUrl || '').includes('timerecording');
  const candidates = (isTrRequest ? [trToken, budgetToken] : [budgetToken, trToken])
    .filter((t): t is string => !!t);
  if (candidates.length === 0) {
    res.status(401).json({ error: '未登录，请先登录' });
    return;
  }
  const validTokens: JwtPayload[] = [];
  for (const token of candidates) {
    try {
      validTokens.push(jwt.verify(token, JWT_SECRET!, { algorithms: ['HS256'] }) as JwtPayload);
    } catch { /* 尝试下一个 cookie */ }
  }
  if (validTokens.length === 0) {
    res.status(401).json({ error: '登录已过期，请重新登录' });
    return;
  }
  if (validTokens.length > 1 && validTokens[0].userId !== validTokens[1].userId) {
    res.status(401).json({ error: '检测到多个账号的登录凭证，请退出后重新登录' });
    return;
  }
  const decoded = validTokens[0];
  // 每次请求从库取最新角色/权限，管理员调整即时生效，无需重新登录
  // DB 故障返回 500 而非误判为凭证失效
  try {
    const userRow = await pool.query(
      `SELECT u.is_active, u.email, u.permissions, u.role, u.title, u.display_name, u.password_changed_at,
              EXISTS(SELECT 1 FROM timerecording.profiles p WHERE p.id = u.id AND NOT p.is_active) AS tr_disabled
       FROM users u WHERE u.id = $1`,
      [decoded.userId],
    );
    const row = userRow.rows[0];
    // 停用判定，users.is_active=false，预算应用，或存在且为 false 的工时档案，timerecording.profiles.is_active=false
    // 预算应用用户无工时档案 → EXISTS=false，不受影响
    if (!row?.is_active || row.tr_disabled) {
      res.status(401).json({ error: '账户已被停用' });
      return;
    }
    // 密码变更吊销——token 签发时刻（iat，Unix 秒）早于最近一次改密 → 凭证失效，须重新登录
    // 改密时间按秒取整（floor，与 iat 同粒度），同一秒内的新登录（改密后立即登录）不被误杀（iat ≥ 改密秒）
    // 改密后旧 token 至多存活不足 1 秒即失效，iat 与 DB now() 同服务器时钟，无跨机时钟偏移问题
    if (row.password_changed_at) {
      const changedSec = Math.floor(new Date(row.password_changed_at).getTime() / 1000);
      if ((decoded.iat || 0) < changedSec) {
        res.status(401).json({ error: '密码已修改，请重新登录' });
        return;
      }
    }
    // 角色/邮箱同样从库刷新，JWT 中的旧值不参与鉴权与审计归因（改邮箱后审计仍记旧邮箱的问题在此消除）
    // title 一并加载，工时应用跨应用登录限制——销售经理禁用工时 API——须在路由层依据 title 判定
    // display_name 一并加载，审批提交人服务端派生，防客户端伪造提交人
    req.user = {
      ...decoded,
      email: row.email || decoded.email,
      role: row.role,
      permissions: row.permissions || [],
      title: row.title,
      display_name: row.display_name,
    };
    next();
  } catch {
    res.status(500).json({ error: '服务器内部错误' });
  }
}

/** 跨应用登录限制判定：普通员工仅限任务规划和报工应用，禁止访问销售·交付 API（admin/director 例外）。
 * 与 routes/timerecording.ts 的 trAppGuard（销售经理禁用工时 API）对称：登录与 /me 的检查只是入口，
 * 真正的防线必须覆盖持有旧 token 直调 API 的路径 */
export function isRestrictedCrossAppUser(title: unknown, role: unknown): boolean {
  return String(title ?? '').trim() === '普通员工' && role !== 'admin' && role !== 'director';
}

/** 预算应用鉴权组合：requireAuth 加载用户 → 拦截工时专属账号。
 * 业务路由一律使用本组合（替代裸 requireAuth），防 tr_token 直调销售/报价/交付接口 */
export async function requireBudgetAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (isRestrictedCrossAppUser(req.user?.title, req.user?.role)) {
      res.status(403).json({ error: '该账号仅限登录任务规划和报工应用，无权使用销售和交付管理' });
      return;
    }
    next();
  });
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: '权限不足' });
      return;
    }
    next();
  };
}

/** 判断权限数组是否满足任一权限，与前端 permissions.ts canAccessRoute 同口径，'全部查看权限' 为万能权限，需调用方按需传入 */
export function hasPermission(permissions: string[] | undefined, ...required: string[]): boolean {
  return !!permissions && required.some(p => permissions.includes(p));
}

/** 权限守卫中间件，满足任一权限则放行，后端鉴权改用 permissions 数组，与职务模型对齐 */
export function requirePermission(...required: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!hasPermission(req.user?.permissions, ...required)) {
      res.status(403).json({ error: '权限不足' });
      return;
    }
    next();
  };
}
