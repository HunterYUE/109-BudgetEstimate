import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/index.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET 必须设置且长度不少于 32 位字符！');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';

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
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  let token: string;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  } else {
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
      `SELECT u.is_active, u.permissions, u.role,
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
