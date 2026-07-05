import { mockProject } from '../mockData';

/** 格式化数字为千单位显示（如 1234 → "1K"） */
export const fmtK = (v: number) => Math.round(v / 1000).toLocaleString() + 'K';

/**
 * 加载报价编制数据（匹配 DeliveryDetail.tsx 逻辑）
 * TODO: 数据库就绪后替换为 API 查询，硬编码 mock ID 需移除
 */
export function loadQuotationGroups(quotationId: string) {
  const knownIds = ['proj-003', 'proj-001', 'proj-005'];
  if (knownIds.includes(quotationId)) {
    return {
      groups: mockProject.groups.map(g => ({ ...g, items: g.items.map(i => ({ ...i })) })),
      version: {
        warranty_rate: mockProject.current_version.warranty_rate,
        risk_rate: mockProject.current_version.risk_rate,
      },
    };
  }
  return { groups: [], version: undefined };
}
