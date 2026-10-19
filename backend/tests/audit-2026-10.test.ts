import { describe, it, expect } from 'vitest';
import {
  selectOpportunityPerms, OPP_CREATE_WRITE, OPP_EDIT_WRITE,
  OPP_DELETE_WRITE, OPP_BLUE_TABLE_WRITE,
  selectComponentPerms, COMPONENT_REVIEW_WRITE, WRITE_GUARD,
  selectDeliveryPerms, DELIVERY_CREATE_WRITE,
} from '../src/permissions.js';
import { objKeysToSnake } from '../src/routes/helpers.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isRestrictedCrossAppUser } from '../src/middleware/auth.js';
import { applyOppCreateLifecycle } from '../src/routes/opportunities.js';
import { costCenterTypeOf, resolveCostCenterType } from '../src/routes/timerecording.js';

// 2026-10 全量审计回归：权限拆分、跨应用守卫、机会创建时间戳服务端采集、工时成本中心类型派生
// 全部为纯函数直测（真实形状，无 DB / 无 mock）

describe('selectOpportunityPerms：销售机会写权限按动作拆分（A110）', () => {
  it('创建 / 删除 / 蓝表 / 编辑各自使用独立权限集', () => {
    expect(selectOpportunityPerms('POST', '/')).toEqual(OPP_CREATE_WRITE);
    expect(selectOpportunityPerms('DELETE', '/abc')).toEqual(OPP_DELETE_WRITE);
    expect(selectOpportunityPerms('PUT', '/abc/blue-table')).toEqual(OPP_BLUE_TABLE_WRITE);
    expect(selectOpportunityPerms('PUT', '/abc')).toEqual(OPP_EDIT_WRITE);
  });

  it('仅持「销售蓝表编辑」不能通过编辑/删除守卫（原 OR 集合可越权删机会）', () => {
    expect(OPP_EDIT_WRITE).not.toContain('销售蓝表编辑');
    expect(OPP_DELETE_WRITE).not.toContain('销售蓝表编辑');
    expect(OPP_CREATE_WRITE).not.toContain('编辑销售机会');
  });
});

describe('selectComponentPerms：物料审核权限与新增物料分离（A143）', () => {
  it('POST /:id/review 走审批管理；其余写动作仍走新增物料', () => {
    expect(selectComponentPerms('POST', '/abc/review')).toEqual(COMPONENT_REVIEW_WRITE);
    expect(selectComponentPerms('POST', '/')).toEqual(WRITE_GUARD.components);
    expect(selectComponentPerms('PUT', '/abc')).toEqual(WRITE_GUARD.components);
    expect(selectComponentPerms('DELETE', '/abc')).toEqual(WRITE_GUARD.components);
  });
});

describe('跨应用登录限制：title 归一化比较（A106 变体绕过修复）', () => {
  it('普通员工（含尾随空格）+ 非 admin/director → 受限', () => {
    expect(isRestrictedCrossAppUser('普通员工', 'user')).toBe(true);
    expect(isRestrictedCrossAppUser(' 普通员工 ', 'manager')).toBe(true);
    expect(isRestrictedCrossAppUser('普通员工', 'director')).toBe(false);
    expect(isRestrictedCrossAppUser('销售经理', 'user')).toBe(false);
  });
});

describe('applyOppCreateLifecycle：创建时阶段时间戳服务端采集（A118）', () => {
  const NOW = '2026-10-19T00:00:00.000Z';

  it('议价阶段：四个阶段时间均由服务端写入，客户端值被覆盖', () => {
    const body: Record<string, any> = {
      stage: '议价', status: '过程中',
      lead_at: '2000-01-01', opportunity_at: '2000-01-01',
      bid_at: '2000-01-01', negotiation_at: '2000-01-01',
    };
    applyOppCreateLifecycle(body, NOW);
    expect(body).toMatchObject({
      lead_at: NOW, opportunity_at: NOW, bid_at: NOW, negotiation_at: NOW,
    });
    expect(body.lost_at).toBeUndefined();
  });

  it('信息阶段：信息=创建时间（created_at），四个阶段列都不写；客户端直写被清除', () => {
    const body: Record<string, any> = {
      stage: '信息', lead_at: '2000-01-01', opportunity_at: '2000-01-01',
      bid_at: '2000-01-01', negotiation_at: '2000-01-01', lost_at: '2000-01-01',
    };
    applyOppCreateLifecycle(body, NOW);
    expect(body.lead_at).toBeUndefined();
    expect(body.opportunity_at).toBeUndefined();
    expect(body.bid_at).toBeUndefined();
    expect(body.negotiation_at).toBeUndefined();
    expect(body.lost_at).toBeUndefined();
  });

  it('输单状态：lost_at 由服务端采集；非输单清除陈旧值', () => {
    const lost: Record<string, any> = { status: '输' };
    applyOppCreateLifecycle(lost, NOW);
    expect(lost.lost_at).toBe(NOW);

    const active: Record<string, any> = { status: '过程中', lost_at: '2000-01-01' };
    applyOppCreateLifecycle(active, NOW);
    expect(active.lost_at).toBeUndefined();
  });

  it('非法阶段/状态 → 400（应用层预校验，防 PG 枚举 500）', () => {
    expect(() => applyOppCreateLifecycle({ stage: '不存在' }, NOW)).toThrow(/无效阶段/);
    expect(() => applyOppCreateLifecycle({ status: '不存在' }, NOW)).toThrow(/无效状态/);
  });
});

describe('工时成本中心类型派生（A124：服务端权威，防类型伪造）', () => {
  it('编码 → 类型一一对应', () => {
    expect(costCenterTypeOf('A2026-07-001-S')).toBe('sales');
    expect(costCenterTypeOf('A2026-07-001-E')).toBe('project');
    expect(costCenterTypeOf('A2026-07-001-W')).toBe('warranty');
    expect(costCenterTypeOf('A2627-DE-000')).toBe('department');
    expect(costCenterTypeOf('A2627-00-000')).toBe('personal');
    expect(costCenterTypeOf('A2627-LE-000')).toBe('leave');
    expect(costCenterTypeOf('')).toBeNull();
    expect(costCenterTypeOf('BAD')).toBeNull();
  });

  it('客户端类型与编码不一致 → 400；缺省时用派生值', () => {
    expect(resolveCostCenterType('A2627-LE-000', 'leave')).toBe('leave');
    expect(resolveCostCenterType('A2627-LE-000', undefined)).toBe('leave');
    expect(() => resolveCostCenterType('A2026-07-001-E', 'personal')).toThrow(/类型与编码不匹配/);
  });
});


describe('路径选择器大小写/尾斜杠归一（Express 路由不区分大小写）', () => {
  it('蓝表路径大写/尾斜杠仍走蓝表权限', () => {
    expect(selectOpportunityPerms('PUT', '/abc/BLUE-TABLE/')).toEqual(OPP_BLUE_TABLE_WRITE);
  });
  it('交付节点路径尾斜杠仍走转交付写权限', () => {
    expect(selectDeliveryPerms('PUT', '/abc/nodes/')).toEqual(DELIVERY_CREATE_WRITE);
  });
});

describe('objKeysToSnake 原型污染防护', () => {
  it('__proto__ / constructor / prototype 键 → 400', () => {
    expect(() => objKeysToSnake(JSON.parse('{"__proto__":{"lead_at":"2000-01-01"}}'))).toThrow(/非法键名/);
    expect(() => objKeysToSnake({ constructor: 'x' })).toThrow(/非法键名/);
    expect(() => objKeysToSnake({ prototype: 'x' })).toThrow(/非法键名/);
  });
  it('正常键正常转换', () => {
    expect(objKeysToSnake({ salesNo: 'A1', groupType: 'EQUIPMENT' }))
      .toEqual({ sales_no: 'A1', group_type: 'EQUIPMENT' });
  });
});

describe('组保存批量端点接线（静态断言）', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/routes/index.ts', import.meta.url)), 'utf8');
  it('存在 /project-groups/batch 且使用事务与版本归属校验', () => {
    expect(src).toContain("router.post('/project-groups/batch'");
    expect(src).toContain('版本不属于该项目');
    expect(src).toContain('明细 id 由客户端提供时保留');
  });
});
