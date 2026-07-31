/** 格式化数字为千单位显示（如 1234 → "1K"） */
export const fmtK = (v: number) => Math.round(v / 1000).toLocaleString() + 'K';
/** 压缩销售编号：A2026-07-003-S → 2607003S */
export const compressNo = (sn: string | undefined | null): string => {
  const m = sn && sn.match(/^A(\d{4})-(\d{2})-(\d{3})-(.)(-.)?$/);
  if (m) return m[1].slice(2) + m[2] + m[3] + m[4] + (m[5] || '');
  return sn || '';
};
