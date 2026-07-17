import { api } from '../utils/api';
import type { QuotationSummary } from '../types';

export const quotationService = {
  list: (params?: Record<string, string>) =>
    api.get<QuotationSummary[]>('/quotations' + (params ? '?' + new URLSearchParams(params).toString() : '')),

  get: (id: string) => api.get<QuotationSummary>(`/quotations/${id}`),

  create: (data: Partial<QuotationSummary>) => api.post<QuotationSummary>('/quotations', data),

  update: (id: string, data: Partial<QuotationSummary>) => api.put<QuotationSummary>(`/quotations/${id}`, data),

  delete: (id: string) => api.delete(`/quotations/${id}`),

  /** 同步报价摘要（upsert）：保存项目时调用，写入/更新报价汇总记录 */
  sync: (data: {
    projectId: string;
    versionNo: string;
    salesNo: string;
    clientName: string;
    projectName: string;
    status?: string;
    amount?: number;
    totalDirectCost?: number;
    totalAccountingPrice?: number;
    discountedPrice?: number;
    discountRate?: number;
    gp3ProfitRate?: number;
    totalCost?: number;
    warrantyCost?: number;
    riskCost?: number;
    materialCost?: number;
    laborCost?: number;
    profitRate?: number;
    opportunityId?: string | null;
  }) => api.put<QuotationSummary>('/quotations/sync', data),
};
