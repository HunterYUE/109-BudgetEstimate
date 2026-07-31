import { api } from '../utils/api';
import type { DeliveryProject, DeliveryNode } from '../types';

export const deliveryService = {
  list: (params?: Record<string, string>, opts?: { noCache?: boolean }) =>
    api.get<DeliveryProject[]>('/deliveries' + (params ? '?' + new URLSearchParams(params).toString() : ''), opts),

  getFull: (id: string) =>
    api.get<DeliveryProject & { nodes: DeliveryNode[] }>(`/deliveries/${id}/full`),

  create: (data: Partial<DeliveryProject>) => api.post<DeliveryProject>('/deliveries', data),

  update: (id: string, data: Partial<DeliveryProject>) => api.put<DeliveryProject>(`/deliveries/${id}`, data),

  delete: (id: string) => api.delete(`/deliveries/${id}`),

  saveNodes: (id: string, nodes: Partial<DeliveryNode>[]) =>
    api.put<DeliveryNode[]>(`/deliveries/${id}/nodes`, { nodes }),
};
