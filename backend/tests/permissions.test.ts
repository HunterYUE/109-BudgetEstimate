import { describe, it, expect } from 'vitest';
import {
  WRITE_GUARD,
  READ_GUARD,
  APPROVAL_WRITE,
  APPROVAL_WRITE_FALLBACK,
  DELIVERY_CREATE_WRITE,
  DELIVERY_OTHER_WRITE,
  PAGE_VIEW_ONLY_PERMS,
  findPageViewLeaks,
} from '../src/permissions.js';
import { hasPermission } from '../src/middleware/auth.js';

describe('F02 权限配置级回归（A1：只读页面权限不得越权写）', () => {
  const allWriteLists: Array<[string, string[]]> = [
    ...Object.entries(WRITE_GUARD),
    ...Object.entries(APPROVAL_WRITE).map(([k, v]) => [`approval:${k}`, v]),
    ['approval-fallback', APPROVAL_WRITE_FALLBACK],
    ['delivery-create', DELIVERY_CREATE_WRITE],
    ['delivery-other', DELIVERY_OTHER_WRITE],
  ];

  it('所有写守卫列表不含纯只读页面权限（配置漂移回归）', () => {
    for (const [name, perms] of allWriteLists) {
      const leaks = findPageViewLeaks(perms);
      expect(leaks, `${name} 写守卫混入只读权限: ${leaks.join(', ')}`).toEqual([]);
    }
  });

  it('仅持任一纯只读页面权限的用户无法通过任一写守卫（hasPermission OR 语义回归）', () => {
    for (const pageViewPerm of PAGE_VIEW_ONLY_PERMS) {
      for (const [name, perms] of allWriteLists) {
        expect(
          hasPermission([pageViewPerm], ...perms),
          `仅持 ${pageViewPerm} 竟通过写守卫 ${name}`
        ).toBe(false);
      }
    }
  });

  it('持写动作权限的用户能通过对应写守卫（正向不误伤）', () => {
    expect(hasPermission(['新增物料'], ...WRITE_GUARD.components)).toBe(true);
    expect(hasPermission(['新建客户'], ...WRITE_GUARD.clients)).toBe(true);
    expect(hasPermission(['报价编制'], ...WRITE_GUARD.quotations)).toBe(true);
    expect(hasPermission(['编辑销售机会'], ...WRITE_GUARD.opportunities)).toBe(true);
    expect(hasPermission(['新建标签'], ...WRITE_GUARD.tags)).toBe(true);
    expect(hasPermission(['交付管理'], ...DELIVERY_OTHER_WRITE)).toBe(true);
    expect(hasPermission(['销售机会管理'], ...DELIVERY_CREATE_WRITE)).toBe(true);
    expect(hasPermission(['成本录入'], ...APPROVAL_WRITE.cost)).toBe(true);
    expect(hasPermission(['审批管理'], ...APPROVAL_WRITE_FALLBACK)).toBe(true);
  });

  it('读守卫全部包含万能权限兜底（H1：敏感资源 GET 不裸放）', () => {
    for (const [resource, perms] of Object.entries(READ_GUARD)) {
      expect(perms, `${resource} 读守卫缺万能权限`).toContain('全部查看权限');
    }
  });
});
