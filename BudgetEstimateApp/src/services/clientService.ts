import { api } from '../utils/api';
import type { Client, Contact, ClientHistoryRecord } from '../types';

export const clientService = {
  list: (params?: Record<string, string>) =>
    api.get<Client[]>('/clients' + (params ? '?' + new URLSearchParams(params).toString() : '')),

  getDetail: (id: string) =>
    api.get<Client & { contacts: Contact[]; history: ClientHistoryRecord[] }>(`/clients/${id}/detail`),

  create: (data: Partial<Client>) => api.post<Client>('/clients', data),

  /** 保存客户 + 联系人（事务保护） */
  saveWithContacts: (id: string, data: Partial<Client> & { contacts?: Contact[] }) =>
    api.put<Client>(`/clients/${id}/save`, data),

  delete: (id: string) => api.delete(`/clients/${id}`),


  getContactCounts: () =>
    api.get<Record<string, number>>('/clients/stats/contacts'),

};
