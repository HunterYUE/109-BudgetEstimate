import type { SalesOpportunity } from '../types';

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
