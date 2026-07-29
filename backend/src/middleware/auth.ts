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
      user?: JwtPayload;
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
  try {
    const decoded = jwt.verify(token, JWT_SECRET!, { algorithms: ['HS256'] }) as JwtPayload;
    // 校验用户是否仍为活跃状态（管理员停用后立即失效）
    const userRow = await pool.query('SELECT is_active FROM users WHERE id = $1', [decoded.userId]);
    if (!userRow.rows[0]?.is_active) {
      res.status(401).json({ error: '账户已被停用' });
      return;
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' });
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
