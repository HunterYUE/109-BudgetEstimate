import { api } from '../utils/api';

export interface AuditLog {
  id: string;
  time: string;
  userName: string;
  displayName?: string;    // 关联 users 表的真实姓名（后端 LEFT JOIN 返回）
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
};
