import { api } from '../utils/api';
import type { SalesOpportunity, BlueTable, BlueTableRole } from '../types';

export const opportunityService = {
  list: (params?: Record<string, string>) =>
    api.get<SalesOpportunity[]>('/opportunities' + (params ? '?' + new URLSearchParams(params).toString() : '')),

  get: (id: string) =>
    api.get<SalesOpportunity>(`/opportunities/${id}`),

  create: (data: Partial<SalesOpportunity>) =>
    api.post<SalesOpportunity>('/opportunities', data),

  update: (id: string, data: Partial<SalesOpportunity>) =>
    api.put<SalesOpportunity>(`/opportunities/${id}`, data),

  /** 保存蓝表：winRate 一并提交，后端与蓝表同事务写入（避免两次请求导致赢率与蓝表分叉） */
  saveBlueTable: (id: string, data: BlueTable, winRate?: number) =>
    api.put<BlueTable & { roles: BlueTableRole[]; winRate?: number }>(
      `/opportunities/${id}/blue-table`, { ...data, winRate }),
};
