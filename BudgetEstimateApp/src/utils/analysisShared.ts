import type { SalesOpportunity, DeliveryNode } from '../types';

/** 格式化数字为千单位显示（如 1234 → "1K"） */
export const fmtK = (v: number) => Math.round(v / 1000).toLocaleString() + 'K';
/** 压缩销售编号：A2026-07-003-S → 2607003S */
export const compressNo = (sn: string | undefined | null): string => {
  const m = sn && sn.match(/^A(\d{4})-(\d{2})-(\d{3})-(.)(-.)?$/);
  if (m) return m[1].slice(2) + m[2] + m[3] + m[4] + (m[5] || '');
  return sn || '';
};

/** 机会是否已确认为真正的赢单：需先标记为赢（status='赢'）再转交付（terminated=true），两者缺一不可 */
export const isRealWin = (o: SalesOpportunity): boolean =>
  o.status === '赢' && o.terminated === true;

/** 机会的有效结束日期：过程中/冻结/未转交付标赢→至今；已转交付赢→wonAt；输→lostAt；缺失回退 updatedAt */
export const oppEffectiveEnd = (o: SalesOpportunity): Date => {
  if (o.status === '过程中' || o.status === '冻结') return new Date();
  if (o.status === '赢' && o.terminated && o.wonAt) return new Date(o.wonAt);
  if (o.status === '赢') return new Date();
  if (o.status === '输' && o.lostAt) return new Date(o.lostAt);
  return new Date(o.updatedAt);
};

/** 取某月最后一天 23:59:59.999（月末排他边界，含最后一天数据；勿用 new Date(y,m+1,0) 的 00:00 漏数） */
export const monthEndOf = (year: number, month: number): Date =>
  new Date(year, month + 1, 0, 23, 59, 59, 999);

/** 未税金额：含税 ÷ (1+税率)，缺省 13%（全应用统一未税口径） */
export const exAmount = (v: number, taxRate?: number): number =>
  Math.round(v / (1 + (taxRate ?? 0.13)));

/** 机会在指定时间点的阶段：取"进入阶段时间 ≤ 该时间"的最高阶段（议价→投标→机会→线索→信息） */
export const stageAsOf = (o: SalesOpportunity, date: Date): string => {
  const t = (v?: string) => (v ? new Date(v) : null);
  const neg = t(o.negotiationAt), bid = t(o.bidAt), opp = t(o.opportunityAt), lead = t(o.leadAt);
  if (neg && neg <= date) return '议价';
  if (bid && bid <= date) return '投标';
  if (opp && opp <= date) return '机会';
  if (lead && lead <= date) return '线索';
  return '信息';
};

/** 取交付项目第15节点（项目总结） */
export const getNode15 = (nodes: DeliveryNode[] | undefined): DeliveryNode | undefined =>
  (nodes || []).find(n => n.nodeNo === 15);

/** 节点是否已完成/已延期（交付完成判定，与销售/交付分析一致） */
export const isNode15Done = (node: DeliveryNode | undefined): boolean =>
  !!node && (node.status === 'completed' || node.status === 'delayed');

/** 节点基准计划结束日（审批基线，无则当前计划；延期判定用） */
export const getNodeBaseline = (node: DeliveryNode | undefined): string | undefined =>
  node?.baselineEndDate || node?.baselinePlannedEndDate || node?.plannedEndDate;
