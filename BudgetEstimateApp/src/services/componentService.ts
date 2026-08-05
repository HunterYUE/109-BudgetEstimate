import { api } from '../utils/api';
import type { Component } from '../types';

export const componentService = {
  list: (params?: Record<string, string>) =>
    api.get<Component[]>('/components' + (params ? '?' + new URLSearchParams(params).toString() : '')),

  create: (data: Partial<Component>) => api.post<Component>('/components', data),

  update: (id: string, data: Partial<Component>) => api.put<Component>(`/components/${id}`, data),

  delete: (id: string) => api.delete(`/components/${id}`),
};
