import { api } from '../utils/api';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  title: string;
  phone: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  permissions?: string[];
}

export const userService = {
  list: () => api.get<UserRecord[]>('/users'),

  create: (data: { email: string; displayName: string; title?: string; phone?: string; password: string; role?: string }) =>
    api.post<UserRecord>('/users', data),

  update: (id: string, data: { displayName?: string; email?: string; title?: string; phone?: string; isActive?: boolean }) =>
    api.put<UserRecord>(`/users/${id}`, data),

  resetPassword: (id: string, password: string) =>
    api.put<{ success: boolean }>(`/users/${id}/password`, { password }),

  updateRole: (id: string, role: string, title?: string, permissions?: string[]) =>
    api.put<UserRecord>(`/users/${id}/role`, { role, title, permissions }),

  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/users/${id}`),
};
