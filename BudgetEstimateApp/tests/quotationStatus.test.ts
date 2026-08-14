import { describe, it, expect } from 'vitest';
import type { ReviewStatus } from '../src/types';
import { reviewStatusForSave } from '../src/utils/quotationStatus';

// 报价保存状态降级契约（B61+B4）：终态 approved/rejected 被再次编辑保存须降级为 draft，
// 防绕过审批状态机；pending/draft 保持不动。提取纯函数锁定，防内联漂移（F08/F12）。

describe('reviewStatusForSave 报价保存状态降级', () => {
  it('approved → draft（已通过被改，防绕过审批状态机）', () => {
    expect(reviewStatusForSave('approved')).toBe('draft');
  });
  it('rejected → draft（已驳回被改，重新走审批）', () => {
    expect(reviewStatusForSave('rejected')).toBe('draft');
  });
  it('pending 保持不动（审批中，单据仍待审）', () => {
    expect(reviewStatusForSave('pending')).toBe('pending');
  });
  it('draft 保持不动', () => {
    expect(reviewStatusForSave('draft')).toBe('draft');
  });
  it('undefined 原样透传（脏 API 数据不误判降级；类型上非合法 ReviewStatus，运行时防御）', () => {
    expect(reviewStatusForSave(undefined as unknown as ReviewStatus)).toBeUndefined();
  });
  it('降级判定可用于提示（返回值 !== 原状态即降级，B4 UX 缺口）', () => {
    expect(reviewStatusForSave('approved') !== 'approved').toBe(true);
    expect(reviewStatusForSave('rejected') !== 'rejected').toBe(true);
    expect(reviewStatusForSave('pending') !== 'pending').toBe(false);
    expect(reviewStatusForSave('draft') !== 'draft').toBe(false);
  });
});
