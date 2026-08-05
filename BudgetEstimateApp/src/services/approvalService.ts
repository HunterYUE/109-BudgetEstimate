import { api } from '../utils/api';
import type { ApprovalRequest } from '../types';

export const approvalService = {
  list: (params?: Record<string, string>) =>
    api.get<ApprovalRequest[]>('/approvals' + (params ? '?' + new URLSearchParams(params).toString() : '')),

  create: (data: Partial<ApprovalRequest>) => api.post<ApprovalRequest>('/approvals', data),

  /** 添加审批记录并级联更新相关状态 */
  createRecord: (id: string, data: { reviewer: string; action: string; comment?: string }) =>
    api.post<{ id: string }>(`/approvals/${id}/records`, data),
};
