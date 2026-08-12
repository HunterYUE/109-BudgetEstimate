import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/index.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET 必须设置且长度不少于 32 位字符！');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';

// ⚠️ L6 修复：HttpOnly cookie 认证。token 不再落 localStorage（XSS 无法读取），浏览器请求时自动携带。
//   两应用（工时 tr_token / 预算 budget_token）共用同一 JWT_SECRET/用户表，token 互通，requireAuth 认任一即可；
//   各应用登录/登出只写/清自己的 cookie，互不影响。Bearer header 已下线（login 不再回传 token）。
export const COOKIE_NAME_TR = 'tr_token';
export const COOKIE_NAME_BUDGET = 'budget_token';
const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 对齐 JWT exp（24h）
// 生产当前为纯 HTTP（118.89.92.58），Secure 必须为 false 否则浏览器拒收 cookie；上 HTTPS 后在 .env 设 COOKIE_SECURE=1
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';

/** 手写 cookie 解析（不引入 cookie-parser 依赖）：取指定 name 的值，无则 undefined */
function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/** 登录成功后写认证 cookie（Path=/api：只随 API 请求发送、不随静态资源；SameSite=Lax 挡跨站 CSRF） */
export function setAuthCookie(res: Response, name: string, token: string): void {
  res.cookie(name, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    path: '/api',
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

/** 登出/凭证失效时清认证 cookie（选项须与 set 一致，否则清除无效） */
export function clearAuthCookie(res: Response, name: string): void {
  res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, path: '/api' });
}

// 扩展 Express Request 类型，使 req.user 有正确类型
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { permissions?: string[] };
    }
  }
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  /** jsonwebtoken 自动写入的签发时刻（Unix 秒）；L3 改密吊销比对用（旧 token 无 iat → 0，仅影响手工伪造 token） */
  iat?: number;
  exp?: number;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // ⚠️ L6 修复：从 HttpOnly cookie 取 token（工时/预算任一，token 互通）；Bearer header 已下线（login 不再回传 token）
  const token = cookieValue(req.headers.cookie, COOKIE_NAME_TR) || cookieValue(req.headers.cookie, COOKIE_NAME_BUDGET);
  if (!token) {
    res.status(401).json({ error: '未登录，请先登录' });
    return;
  }
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET!, { algorithms: ['HS256'] }) as JwtPayload;
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' });
    return;
  }
  // 每次请求从库取最新角色/权限（管理员调整即时生效，无需重新登录）
  // DB 故障返回 500 而非误判为凭证失效（此前 catch 兜底会吞掉查询错误）
  try {
    const userRow = await pool.query(
      `SELECT u.is_active, u.permissions, u.role, u.password_changed_at,
              EXISTS(SELECT 1 FROM timerecording.profiles p WHERE p.id = u.id AND NOT p.is_active) AS tr_disabled
       FROM users u WHERE u.id = $1`,
      [decoded.userId],
    );
    const row = userRow.rows[0];
    // 停用判定：users.is_active=false（预算应用），或存在且为 false 的工时档案（timerecording.profiles.is_active=false）。
    // 预算应用用户无工时档案 → EXISTS=false，不受影响。
    if (!row?.is_active || row.tr_disabled) {
      res.status(401).json({ error: '账户已被停用' });
      return;
    }
    // ⚠️ L3 修复：密码变更吊销——token 签发时刻（iat，Unix 秒）早于最近一次改密 → 凭证失效，须重新登录。
    //    改密时间按秒取整（floor，与 iat 同粒度）：同一秒内的新登录（改密后立即登录）不被误杀（iat ≥ 改密秒），
    //    改密后旧 token 至多存活不足 1 秒即失效。iat 与 DB now() 同服务器时钟，无跨机时钟偏移问题。
    if (row.password_changed_at) {
      const changedSec = Math.floor(new Date(row.password_changed_at).getTime() / 1000);
      if ((decoded.iat || 0) < changedSec) {
        res.status(401).json({ error: '密码已修改，请重新登录' });
        return;
      }
    }
    // 角色同样从库刷新（JWT 中的 role 可能已过期），保证 role 变更即时生效
    req.user = { ...decoded, role: row.role, permissions: row.permissions || [] };
    next();
  } catch {
    res.status(500).json({ error: '服务器内部错误' });
  }
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

/** 判断权限数组是否满足任一权限（与前端 permissions.ts canAccessRoute 同口径；'全部查看权限' 为万能权限，需调用方按需传入） */
export function hasPermission(permissions: string[] | undefined, ...required: string[]): boolean {
  return !!permissions && required.some(p => permissions.includes(p));
}

/** 权限守卫中间件：满足任一权限则放行（方案A：后端鉴权改用 permissions 数组，与职务模型对齐） */
export function requirePermission(...required: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!hasPermission(req.user?.permissions, ...required)) {
      res.status(403).json({ error: '权限不足' });
      return;
    }
    next();
  };
}
