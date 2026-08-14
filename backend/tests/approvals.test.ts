import { describe, it, expect } from 'vitest';
import {
  APPROVAL_TYPES,
  APPROVAL_INSERT_EXCLUDE,
  approvalTypeToDupColumn,
  approvalTypeToParentTable,
  applyPromoteDefaults,
  buildAppraisalJson,
  isValidApprovalAction,
  isFinalApprovalStatus,
} from '../src/routes/approvals.js';

describe('APPROVAL_TYPES 审批类型白名单（C2 预校验，防 PG 枚举错误被 500 吞）', () => {
  it('四类合法类型', () => {
    expect(APPROVAL_TYPES).toEqual(['quotation', 'plan', 'cost', 'promote']);
  });
});

describe('APPROVAL_INSERT_EXCLUDE 创建禁直设列（BE-7：submitter 服务端派生不可直写）', () => {
  it('status/submit_time/submitter 均在排除列', () => {
    for (const f of ['status', 'submit_time', 'submitter']) {
      expect(APPROVAL_INSERT_EXCLUDE).toContain(f);
    }
  });
});

describe('approvalTypeToDupColumn 同实体去重列（防同实体同类型重复 pending）', () => {
  it('quotation→quotation_id / promote→opportunity_id / plan·cost→delivery_id', () => {
    expect(approvalTypeToDupColumn('quotation')).toBe('quotation_id');
    expect(approvalTypeToDupColumn('promote')).toBe('opportunity_id');
    expect(approvalTypeToDupColumn('plan')).toBe('delivery_id');
    expect(approvalTypeToDupColumn('cost')).toBe('delivery_id');
  });
});

describe('approvalTypeToParentTable 父实体表名（BE-4 查重 FOR UPDATE 锁父行）', () => {
  it('quotation→quotations / promote→sales_opportunities / plan·cost→delivery_projects', () => {
    expect(approvalTypeToParentTable('quotation')).toBe('quotations');
    expect(approvalTypeToParentTable('promote')).toBe('sales_opportunities');
    expect(approvalTypeToParentTable('plan')).toBe('delivery_projects');
    expect(approvalTypeToParentTable('cost')).toBe('delivery_projects');
  });
});

describe('applyPromoteDefaults 晋升审批自动回填（??= 语义：body 已有值不覆盖；tax_rate 兜底 0.13）', () => {
  const pv = {
    total_accounting_price: '100000', discounted_price: '95000', discount_rate: '0.95',
    gp3_profit_rate: '0.21', total_cost: '60000', tax_rate: '0.13', gp3_amount: '19950',
  };
  it('空 body → 全部从 pv 回填', () => {
    expect(applyPromoteDefaults({}, 'v3', pv)).toEqual({
      version_no: 'v3', total_accounting_price: 100000, discounted_price: 95000, discount_rate: 0.95,
      gp3: 0.21, total_cost: 60000, tax_rate: 0.13, amount: 95000, gp3_amount: 19950,
    });
  });
  it('body 已有值不覆盖（??= 语义）', () => {
    expect(applyPromoteDefaults({ amount: 88000, version_no: 'custom' }, 'v3', pv)).toMatchObject({
      version_no: 'custom', amount: 88000,
    });
  });
  it('pv 字段缺值/非法 → parseFloat||0，tax_rate 兜底 0.13', () => {
    const sparse = applyPromoteDefaults({}, 'v1', {});
    expect(sparse.tax_rate).toBe(0.13);
    expect(sparse.total_accounting_price).toBe(0);
    expect(sparse.gp3_amount).toBe(0);
  });
  it('不 mutate 入参 body', () => {
    const body = { amount: 100 };
    applyPromoteDefaults(body, 'v1', pv);
    expect(body).toEqual({ amount: 100 });
  });
});

describe('buildAppraisalJson 审批结果 JSONB 构造（与审批记录一致，写入交付 plan_approval/cost_approval）', () => {
  it('精确 JSON 串（键序固定）', () => {
    expect(buildAppraisalJson('张三', 'approved', '同意', '2026-08-14T09:00:00Z'))
      .toBe('{"reviewer":"张三","action":"approved","comment":"同意","createdAt":"2026-08-14T09:00:00Z"}');
  });
});

describe('isValidApprovalAction / isFinalApprovalStatus 审批状态机守卫', () => {
  it('动作白名单：approved/rejected 合法，其余（含 undefined）非法', () => {
    expect(isValidApprovalAction('approved')).toBe(true);
    expect(isValidApprovalAction('rejected')).toBe(true);
    expect(isValidApprovalAction('pending')).toBe(false);
    expect(isValidApprovalAction(undefined)).toBe(false);
  });
  it('终审状态：approved/rejected 终态，pending/undefined 非终态', () => {
    expect(isFinalApprovalStatus('approved')).toBe(true);
    expect(isFinalApprovalStatus('rejected')).toBe(true);
    expect(isFinalApprovalStatus('pending')).toBe(false);
    expect(isFinalApprovalStatus(undefined)).toBe(false);
  });
});
