import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeInsertCols } from '../src/routes/helpers.js';
import { selectApprovalPerms, selectDeliveryPerms, PERM_ALL } from '../src/permissions.js';
import { isValidApprovalAction, isFinalApprovalStatus } from '../src/routes/approvals.js';

// ── 路由行为层守卫测试（纯函数直测真实生产路径，无 mock）──
// 覆盖目标：A2/A3 excludeOnCreate 字段剥除、A1/A101 守卫选择映射、审批状态机、守卫接线结构。

describe('computeInsertCols（A2/A3 排除字段剥除契约）', () => {
  const fields = ['id', 'sales_no', 'amount', 'total_cost', 'status', 'locked', 'plan_status', 'cost_status', 'plan_approval', 'cost_approval', 'unit_cost'];

  it('excludeOnCreate 中的字段即便请求体传入也被剥除（A2：POST /quotations 直设 status）', () => {
    const cols = computeInsertCols(fields, ['id', 'status', 'locked'], { status: 'approved', locked: true, amount: 100, total_cost: 80 });
    expect(cols).not.toContain('status');
    expect(cols).not.toContain('locked');
    expect(cols).not.toContain('id');
    expect(cols).toContain('amount');
    expect(cols).toContain('total_cost');
  });

  it('excludeOnCreate 剥除审批状态与 JSONB（A3：POST /deliveries 伪造 plan_status/plan_approval）', () => {
    const cols = computeInsertCols(
      fields,
      ['id', 'plan_status', 'cost_status', 'plan_approval', 'cost_approval'],
      { plan_status: 'approved', cost_status: 'approved', plan_approval: { fake: 1 }, cost_approval: { fake: 1 }, sales_no: 'S001' }
    );
    expect(cols).not.toContain('plan_status');
    expect(cols).not.toContain('cost_status');
    expect(cols).not.toContain('plan_approval');
    expect(cols).not.toContain('cost_approval');
    expect(cols).toEqual(['sales_no']);
  });

  it('只保留 body 有值的列（undefined 字段不插入）', () => {
    const cols = computeInsertCols(fields, ['id'], { amount: 100, total_cost: undefined, sales_no: 'S2' });
    expect(cols).toEqual(['sales_no', 'amount']);
  });

  it('值为 0/空串/false 的字段仍可插入（!== undefined 判定，勿误判为缺省）', () => {
    const cols = computeInsertCols(fields, [], { amount: 0, status: '', locked: false, unit_cost: 0 });
    expect(cols).toEqual(['amount', 'status', 'locked', 'unit_cost']);
  });

  it('body 中不在 fields 白名单的未知键被忽略（列名以字段表为准）', () => {
    const cols = computeInsertCols(fields, [], { amount: 5, evil: 'x', role: 'admin' });
    expect(cols).toEqual(['amount']);
  });

  it('excludeOnUpdate 与 create 独立（更新侧不剥 quotation_id 之类只读 create 键）', () => {
    const create = computeInsertCols(fields, ['id', 'plan_status'], { plan_status: 'pending', sales_no: 'S' });
    expect(create).toEqual(['sales_no']);
    const update = computeInsertCols(fields, ['id', 'plan_approval'], { plan_status: 'pending', sales_no: 'S' });
    expect(update).toEqual(['sales_no', 'plan_status']);
  });
});

describe('selectApprovalPerms（A1 审批写守卫按 approval_type 映射）', () => {
  it('已知类型命中对应模块写权限', () => {
    expect(selectApprovalPerms('quotation')).toEqual(['报价编制', PERM_ALL]);
    expect(selectApprovalPerms('plan')).toEqual(['交付管理', PERM_ALL]);
    expect(selectApprovalPerms('cost')).toEqual(['交付管理', '成本录入', PERM_ALL]);
    expect(selectApprovalPerms('promote')).toEqual(['转线索/转机会', PERM_ALL]);
  });

  it('未知类型/无类型走审批管理兜底（防未知类型空放行或 500）', () => {
    const fallback = ['审批管理', PERM_ALL];
    expect(selectApprovalPerms('weird')).toEqual(fallback);
    expect(selectApprovalPerms(undefined)).toEqual(fallback);
    expect(selectApprovalPerms('')).toEqual(fallback);
  });
});

describe('selectDeliveryPerms（A101 交付写守卫按方法/路径拆分）', () => {
  it('转交付创建 POST /deliveries 允许销售机会管理', () => {
    expect(selectDeliveryPerms('POST', '/')).toEqual(['交付管理', '销售机会管理', PERM_ALL]);
  });

  it('节点保存 PUT /:id/nodes 允许销售机会管理（转交付链路合法写路径）', () => {
    expect(selectDeliveryPerms('PUT', '/abc-123/nodes')).toEqual(['交付管理', '销售机会管理', PERM_ALL]);
  });

  it('其余写操作须交付管理：改成本 PUT /:id、删除 DELETE /:id、附件管理等', () => {
    const other = ['交付管理', PERM_ALL];
    expect(selectDeliveryPerms('PUT', '/abc-123')).toEqual(other);
    expect(selectDeliveryPerms('DELETE', '/abc-123')).toEqual(other);
    expect(selectDeliveryPerms('PATCH', '/abc-123')).toEqual(other);
  });

  it('路径含 /nodes 但不在末尾（如 /nodes/xyz）不算节点保存', () => {
    expect(selectDeliveryPerms('PUT', '/abc-123/nodes/xyz')).toEqual(['交付管理', PERM_ALL]);
  });
});

describe('审批状态机（approvals.ts 纯函数）', () => {
  it('isValidApprovalAction 只认 approved/rejected', () => {
    expect(isValidApprovalAction('approved')).toBe(true);
    expect(isValidApprovalAction('rejected')).toBe(true);
    expect(isValidApprovalAction('pending')).toBe(false);
    expect(isValidApprovalAction('draft')).toBe(false);
    expect(isValidApprovalAction('')).toBe(false);
    expect(isValidApprovalAction(undefined)).toBe(false);
  });

  it('isFinalApprovalStatus 认 approved/rejected 为终审', () => {
    expect(isFinalApprovalStatus('approved')).toBe(true);
    expect(isFinalApprovalStatus('rejected')).toBe(true);
    expect(isFinalApprovalStatus('pending')).toBe(false);
    expect(isFinalApprovalStatus('draft')).toBe(false);
    expect(isFinalApprovalStatus(undefined)).toBe(false);
  });
});

describe('守卫接线结构（routes/index.ts 静态断言）', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/routes/index.ts', import.meta.url)), 'utf8');

  it('禁止内联权限数组直接进守卫（须引用 permissions.ts 常量）', () => {
    // writeGuard/readGuard/requirePermission 后紧跟 `[` = 内联字面量（A1 漂移温床）
    const inline = src.match(/(?:writeGuard|readGuard|requirePermission)\(\s*\[/g) || [];
    expect(inline).toEqual([]);
  });

  it('approvals/deliveries 特殊守卫已收敛为选择器函数', () => {
    expect(src).toContain('selectApprovalPerms(type)');
    expect(src).toContain('selectDeliveryPerms(req.method, req.path)');
    // 旧的内联映射不得残留
    expect(src).not.toContain('APPROVAL_WRITE[type]');
    expect(src).not.toContain('DELIVERY_CREATE_WRITE');
    expect(src).not.toContain('DELIVERY_OTHER_WRITE');
    expect(src).not.toContain('APPROVAL_WRITE_FALLBACK');
  });

  it('每个业务资源路由都挂了守卫（writeGuard/readGuard/requirePermission 至少其一）', () => {
    const guarded = ['components', 'projects', 'opportunities', 'quotations', 'approvals', 'deliveries', 'clients', 'tags', 'audit-logs'];
    for (const res of guarded) {
      // 该资源挂载行内必须出现守卫（含后续 readGuard 行）
      const idx = src.indexOf(`'/${res}'`);
      const line = src.slice(idx, idx + 200);
      expect(line).toMatch(/writeGuard|readGuard|requirePermission|selectApprovalPerms|selectDeliveryPerms/,
        `资源 /${res} 挂载未发现守卫`);
    }
  });
});
