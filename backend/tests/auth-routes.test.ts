import { describe, it, expect } from 'vitest';
import {
  shapeAuthUser,
  isRestrictedCrossAppUser,
} from '../src/routes/auth.js';

describe('isRestrictedCrossAppUser 跨应用登录限制（login 与 /me 两处同规则共用）', () => {
  it('普通员工 + 非 admin/director → 受限（仅限任务规划和报工应用）', () => {
    expect(isRestrictedCrossAppUser('普通员工', 'user')).toBe(true);
    expect(isRestrictedCrossAppUser('普通员工', 'manager')).toBe(true);
  });
  it('普通员工 + admin/director → 例外放行', () => {
    expect(isRestrictedCrossAppUser('普通员工', 'admin')).toBe(false);
    expect(isRestrictedCrossAppUser('普通员工', 'director')).toBe(false);
  });
  it('非普通员工职务 → 不受限', () => {
    expect(isRestrictedCrossAppUser('销售经理', 'user')).toBe(false);
    expect(isRestrictedCrossAppUser('技术总监', 'director')).toBe(false);
    expect(isRestrictedCrossAppUser('', 'user')).toBe(false);
  });
});

describe('shapeAuthUser 认证用户响应归一化（DB 行 → 前端 camelCase；login 无 createdAt，/me 含）', () => {
  const row = {
    id: 'u1', email: 'a@x.com', display_name: '张三', title: '销售经理',
    role: 'manager', permissions: ['报价编制', '销售机会管理'], created_at: '2026-08-01T00:00:00Z',
  };
  it('login 形状：无 createdAt', () => {
    expect(shapeAuthUser(row)).toEqual({
      id: 'u1', email: 'a@x.com', displayName: '张三', title: '销售经理',
      role: 'manager', permissions: ['报价编制', '销售机会管理'],
    });
    expect('createdAt' in shapeAuthUser(row)).toBe(false);
  });
  it('/me 形状：含 createdAt', () => {
    expect(shapeAuthUser(row, true)).toEqual({
      id: 'u1', email: 'a@x.com', displayName: '张三', title: '销售经理',
      role: 'manager', permissions: ['报价编制', '销售机会管理'], createdAt: '2026-08-01T00:00:00Z',
    });
  });
  it('缺省字段兜底：title "" / permissions []', () => {
    expect(shapeAuthUser({ id: 'u2', email: 'b@x.com', display_name: '李四', role: 'user' }))
      .toMatchObject({ title: '', permissions: [] });
  });
});
