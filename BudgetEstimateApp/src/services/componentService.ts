import { api } from '../utils/api';
import type { Component } from '../types';

export const componentService = {
  list: (params?: Record<string, string>) =>
    api.get<Component[]>('/components' + (params ? '?' + new URLSearchParams(params).toString() : '')),

  create: (data: Partial<Component>) => api.post<Component>('/components', data),

  update: (id: string, data: Partial<Component>) => api.put<Component>(`/components/${id}`, data),

  delete: (id: string) => api.delete(`/components/${id}`),

  /** 物料审核决策（需审批管理/全部查看权限）：通过删除申请时后端在同事务内删除物料 */
  review: (id: string, action: 'approved' | 'rejected') =>
    api.post<{ deleted: boolean; component?: Component }>(`/components/${id}/review`, { action }),
};
