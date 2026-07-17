import { api } from '../utils/api';

export interface AuditLog {
  id: string;
  time: string;
  userName: string;
  action: string;
  module: string;
  detail: string;
  createdAt: string;
}

export const auditLogService = {
  /** 获取操作日志列表 */
  list: (params?: Record<string, string>) =>
    api.get<AuditLog[]>('/audit-logs' + (params ? '?' + new URLSearchParams(params).toString() : '')),

  /** 创建操作日志 */
  create: (data: { userName: string; action: string; module: string; detail?: string }) =>
    api.post<AuditLog>('/audit-logs', data),

  /** 按模块统计 */
  statsByModule: () =>
    api.get<{ module: string; cnt: number }[]>('/audit-logs/stats/module'),
};
