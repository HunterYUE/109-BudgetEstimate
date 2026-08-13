import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  hasPermission,
  signToken,
  setAuthCookie,
  COOKIE_NAME_TR,
} from '../src/middleware/auth.js';

describe('hasPermission 权限判定（F02：OR 语义——任一命中即放行）', () => {
  it('任一命中即放行（与前端 canAccessRoute 同口径）', () => {
    expect(hasPermission(['报价编制'], '报价编制')).toBe(true);
    expect(hasPermission(['新增物料', '全部查看权限'], '新增物料')).toBe(true);
    expect(hasPermission(['物料管理', '客户管理'], '新增物料', '全部查看权限')).toBe(false);
  });
  it('A1 回归：writeGuard 剔除只读页面权限——仅页面查看权不得越权写', () => {
    // writeGuard('/components', '新增物料','全部查看权限') 等写守卫的判定核心：
    // 「物料管理」是只读页面权限，不能放行写操作
    expect(hasPermission(['物料管理'], '新增物料', '全部查看权限')).toBe(false);
    expect(hasPermission(['客户管理'], '新建客户', '全部查看权限')).toBe(false);
    expect(hasPermission(['销售机会管理'], '新建销售机会', '全部查看权限')).toBe(false);
  });
  it('「全部查看权限」为万能权限——须调用方显式列入 required 才生效（writeGuard 约定）', () => {
    expect(hasPermission(['全部查看权限'], '任意权限A', '全部查看权限')).toBe(true);
    // 未显式列出时不自动万能（防误放行）
    expect(hasPermission(['全部查看权限'], '任意权限A')).toBe(false);
  });
  it('undefined / 空数组 / null → false（不误放行）', () => {
    expect(hasPermission(undefined, '报价编制')).toBe(false);
    expect(hasPermission([], '报价编制')).toBe(false);
    expect(hasPermission(null as unknown as string[], '报价编制')).toBe(false);
  });
});

describe('signToken / jwt 验签往返（F07：HttpOnly cookie 认证 token，HS256）', () => {
  it('签发后可验签，payload 字段一致', () => {
    const token = signToken({ userId: 'u1', email: 'a@x.com', role: 'manager' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; email: string; role: string };
    expect(decoded).toMatchObject({ userId: 'u1', email: 'a@x.com', role: 'manager' });
    expect(typeof token).toBe('string');
  });
});

describe('setAuthCookie HttpOnly 会话 cookie（F07：XSS 不可读、SameSite=Lax 挡跨站 CSRF）', () => {
  it('写 tr_token：httpOnly + sameSite=lax + path=/api + 24h maxAge', () => {
    const cookies: { name: string; val: string; opts: Record<string, unknown> }[] = [];
    const res = {
      cookie: (name: string, val: string, opts: Record<string, unknown>) => cookies.push({ name, val, opts }),
      clearCookie: () => {},
    } as never;
    setAuthCookie(res as never, COOKIE_NAME_TR, 'tok');
    expect(cookies).toHaveLength(1);
    const c = cookies[0];
    expect(c.name).toBe('tr_token');
    expect(c.val).toBe('tok');
    expect(c.opts.httpOnly).toBe(true);
    expect(c.opts.sameSite).toBe('lax');
    expect(c.opts.path).toBe('/api');
    expect(c.opts.maxAge).toBe(24 * 60 * 60 * 1000);
  });
});
