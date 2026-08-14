import { describe, it, expect } from 'vitest';
import {
  isValidSyncStatus,
  QUOTATION_SYNC_STATUSES,
  QUOTATION_FINANCIAL,
} from '../src/routes/quotations.js';

describe('QUOTATION_SYNC_STATUSES / isValidSyncStatus 报价 sync 状态白名单（H2：禁直置 approved/rejected）', () => {
  it('白名单两态', () => {
    expect(QUOTATION_SYNC_STATUSES).toEqual(['draft', 'pending']);
  });
  it('合法态（含 undefined/空串——路由层 status 有默认 draft）通过', () => {
    expect(isValidSyncStatus('draft')).toBe(true);
    expect(isValidSyncStatus('pending')).toBe(true);
    expect(isValidSyncStatus(undefined)).toBe(true);
    expect(isValidSyncStatus('')).toBe(true);
  });
  it('终态/未知态拒绝', () => {
    expect(isValidSyncStatus('approved')).toBe(false);
    expect(isValidSyncStatus('rejected')).toBe(false);
    expect(isValidSyncStatus('foo')).toBe(false);
  });
});

describe('QUOTATION_FINANCIAL 财务字段（beforeUpdate：审批中禁改——审批人基于提交时快照决策）', () => {
  it('金额/成本/毛利率/编号/关联机会全锁定', () => {
    expect(QUOTATION_FINANCIAL).toEqual(['amount', 'total_cost', 'profit_rate', 'sales_no', 'opportunity_id']);
  });
});
