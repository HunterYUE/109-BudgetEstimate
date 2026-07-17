import { api } from '../utils/api';
import type { ApprovalRequest } from '../types';

export const approvalService = {
  list: (params?: Record<string, string>) =>
    api.get<ApprovalRequest[]>('/approvals' + (params ? '?' + new URLSearchParams(params).toString() : '')),

  create: (data: Partial<ApprovalRequest>) => api.post<ApprovalRequest>('/approvals', data),

  update: (id: string, data: Partial<ApprovalRequest>) => api.put<ApprovalRequest>(`/approvals/${id}`, data),

  delete: (id: string) => api.delete(`/approvals/${id}`),
};
