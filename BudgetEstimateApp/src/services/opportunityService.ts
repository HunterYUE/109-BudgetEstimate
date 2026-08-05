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

  saveBlueTable: (id: string, data: BlueTable) =>
    api.put<BlueTable & { roles: BlueTableRole[] }>(`/opportunities/${id}/blue-table`, data),
};
