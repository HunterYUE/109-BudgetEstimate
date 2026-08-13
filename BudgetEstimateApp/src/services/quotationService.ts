import { api } from '../utils/api';
import type { QuotationSummary } from '../types';

export const quotationService = {
  list: (params?: Record<string, string>, opts?: { noCache?: boolean }) =>
    api.get<QuotationSummary[]>('/quotations' + (params ? '?' + new URLSearchParams(params).toString() : ''), opts),

  get: (id: string) => api.get<QuotationSummary>(`/quotations/${id}`),

  /**
   * 同步报价摘要（upsert）：保存项目时调用，写入/更新报价汇总记录。
   * ⚠️ D6 修复：签名收敛为后端实际读取的 10 字段（折扣/GP3/成本分解等存于 project_versions，sync 不处理）
   */
  sync: (data: {
    projectId: string;
    versionNo: string;
    salesNo: string;
    clientName: string;
    projectName: string;
    status?: string;
    amount?: number;
    totalCost?: number;
    profitRate?: number;
    opportunityId?: string | null;
  }) => api.put<QuotationSummary>('/quotations/sync', data),
};
