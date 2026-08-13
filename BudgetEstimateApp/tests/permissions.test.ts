import { describe, it, expect } from 'vitest';
import { canAccessRoute, firstAccessiblePath, canSeeMenu, hasPermission } from '../src/utils/permissions';

describe('canAccessRoute 路由访问判定（满足其一即可）', () => {
  it('精确路由', () => {
    expect(canAccessRoute(['仪表盘查看'], '/')).toBe(true);
    expect(canAccessRoute(['全部查看权限'], '/analysis')).toBe(true);
    expect(canAccessRoute(['销售分析'], '/analysis')).toBe(true);
    expect(canAccessRoute([], '/analysis')).toBe(false);
  });
  it('前缀匹配（/quotations/xxx → /quotations）', () => {
    expect(canAccessRoute(['报价编制'], '/quotations/abc')).toBe(true);
    expect(canAccessRoute(['物料管理'], '/quotations/abc')).toBe(false);
  });
  it('空权限列表恒 false（防 B30 死循环的入口守卫）', () => {
    expect(canAccessRoute(undefined, '/')).toBe(false);
    expect(canAccessRoute([], '/')).toBe(false);
  });
  it('未知路径默认放行（兜底）', () => {
    expect(canAccessRoute(['任意'], '/unknown/xyz')).toBe(true);
  });
});

describe('firstAccessiblePath 无权限重定向目标（防 guard 死循环）', () => {
  it('按优先级返回第一个可访问路由', () => {
    expect(firstAccessiblePath(['仪表盘查看'])).toBe('/');
    expect(firstAccessiblePath(['物料管理'])).toBe('/materials');
    expect(firstAccessiblePath(['报价编制'])).toBe('/quotations');
  });
  it('全部无权 / 空权限 → null（调用方展示无权限提示而非继续重定向）', () => {
    expect(firstAccessiblePath([])).toBeNull();
    expect(firstAccessiblePath(undefined)).toBeNull();
    expect(firstAccessiblePath(['不存在的权限'])).toBeNull();
  });
});

describe('canSeeMenu 菜单可见性', () => {
  it('持有菜单权限 → 可见', () => {
    expect(canSeeMenu(['交付管理'], '/delivery')).toBe(true);
    expect(canSeeMenu(['全部查看权限'], '/materials')).toBe(true);
  });
  it('未定义菜单项 → 放行（权限非空才走到兜底分支）', () => {
    expect(canSeeMenu(['仪表盘查看'], '/no-such-menu')).toBe(true);
  });
});

describe('hasPermission 写权限 UX 门控（与后端 writeGuard 同源）', () => {
  it('任一写权限命中即可', () => {
    expect(hasPermission(['新增物料'], ['新增物料', '全部查看权限'])).toBe(true);
    expect(hasPermission(['报价编制'], ['报价编制', '新增物料'])).toBe(true);
  });
  it('纯查看权不含写动作 → false（防越权写入口暴露）', () => {
    expect(hasPermission(['物料管理'], ['新增物料', '全部查看权限'])).toBe(false);
    expect(hasPermission([], ['报价编制'])).toBe(false);
  });
});
