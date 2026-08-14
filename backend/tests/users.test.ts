import { describe, it, expect } from 'vitest';
import { AppError } from '../src/middleware/index.js';
import {
  validateNewUserInput,
  validatePermissionsGrant,
  VALID_ROLES,
  ALL_PERMISSIONS,
} from '../src/routes/users.js';

describe('VALID_ROLES / ALL_PERMISSIONS 用户管理安全常量', () => {
  it('四类合法角色', () => {
    expect(VALID_ROLES).toEqual(['admin', 'director', 'manager', 'user']);
  });
  it('权限白名单含关键权限，拒绝任意字符串漂移', () => {
    for (const p of ['用户管理', '系统配置', '全部查看权限', '报价编制', '交付管理']) {
      expect(ALL_PERMISSIONS).toContain(p);
    }
    expect(ALL_PERMISSIONS).not.toContain('任意权限A');
  });
});

describe('validateNewUserInput 新用户输入校验（保序：必填→类型→角色→越级→密码→邮箱）', () => {
  const valid = { display_name: '张三', email: '  A@X.COM ', password: '12345678', role: 'user' };
  it('合法输入返回归一化邮箱（trim+小写）', () => {
    expect(validateNewUserInput(valid, 'admin')).toBe('a@x.com');
  });
  it('缺必填 → 400', () => {
    expect(() => validateNewUserInput({ email: '', display_name: 'x', password: '12345678' }, 'admin')).toThrow(AppError);
    expect(() => validateNewUserInput({ display_name: 'x', password: '12345678' }, 'admin')).toThrow(/必填/);
  });
  it('类型错误 → 400（防对象/数组入参触发 PG 类型错误 500）', () => {
    expect(() => validateNewUserInput({ display_name: {}, email: 'a@x.com', password: '12345678' }, 'admin')).toThrow(/字符串/);
  });
  it('非法角色 → 400', () => {
    expect(() => validateNewUserInput({ ...valid, role: 'superadmin' }, 'admin')).toThrow(/无效角色/);
  });
  it('越级保护：非 admin/director 创建 admin → 403', () => {
    expect(() => validateNewUserInput({ ...valid, role: 'admin' }, 'manager')).toThrow(/无权/);
    expect(() => validateNewUserInput({ ...valid, role: 'director' }, 'user')).toThrow(/无权/);
  });
  it('同级创建放行（manager 建 manager）', () => {
    expect(() => validateNewUserInput({ ...valid, role: 'manager' }, 'manager')).not.toThrow();
  });
  it('弱口令（<8 位）→ 400', () => {
    expect(() => validateNewUserInput({ ...valid, password: '123' }, 'admin')).toThrow(/至少8位/);
  });
  it('邮箱格式非法 → 400', () => {
    expect(() => validateNewUserInput({ ...valid, email: 'not-an-email' }, 'admin')).toThrow(/邮箱格式无效/);
  });
});

describe('validatePermissionsGrant 权限授予校验（白名单 + 委托限制）', () => {
  // ⚠️ 路由层调用点以 `if (permissions !== undefined)` 守卫，undefined 不会进入本函数；
  //   函数本身对 undefined 防御性抛 400（非数组即白名单外），与"非数组 → 400"同一条路径
  it('undefined → 400（防御性拒绝；路由层已提前守卫不调用）', () => {
    expect(() => validatePermissionsGrant(undefined, ['用户管理'])).toThrow(/无效值/);
  });
  it('白名单外/非字符串/非数组 → 400', () => {
    expect(() => validatePermissionsGrant(['任意权限A'], ['用户管理'])).toThrow(/无效值/);
    expect(() => validatePermissionsGrant([123], ['用户管理'])).toThrow(/无效值/);
    expect(() => validatePermissionsGrant('报价编制', ['用户管理'])).toThrow(/无效值/);
  });
  it('委托限制：授予自己未持有的权限 → 403（防赋「全部查看权限」给傀儡账号）', () => {
    expect(() => validatePermissionsGrant(['全部查看权限'], ['用户管理'])).toThrow(/无权授予/);
    expect(() => validatePermissionsGrant(['报价编制'], ['用户管理'])).toThrow(/无权授予/);
  });
  it('全部自己持有 → 放行', () => {
    expect(() => validatePermissionsGrant(['用户管理', '系统配置'], ['用户管理', '系统配置'])).not.toThrow();
    expect(() => validatePermissionsGrant(['全部查看权限'], ['全部查看权限', '用户管理'])).not.toThrow();
  });
});
