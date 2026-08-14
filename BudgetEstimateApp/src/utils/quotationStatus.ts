/**
 * 报价状态机契约 —— QuotationPage 保存报价时应用，提取为纯函数锁定（2026-08-14 P1 B4 落位）。
 * B61：已通过/已驳回的报价被再次编辑保存时状态重置为草稿——否则内容已修改却仍保持
 * approved/rejected，绕过审批状态机（改过数据不经重审即显示"已通过"）。
 * B4（UX 补）：降级发生由调用方提示（reviewStatusForSave 返回值 !== 原状态即降级）。
 * pending（审批中）与 draft 保持不动。
 */
import type { ReviewStatus } from '../types';

export function reviewStatusForSave(reviewStatus: ReviewStatus): ReviewStatus {
  return reviewStatus === 'approved' || reviewStatus === 'rejected' ? 'draft' : reviewStatus;
}
