/**
 * 时间格式化工具函数
 */

/** 将 ISO 时间戳格式化为北京时间字符串 "yyyy-MM-dd HH:mm:ss" */
export function formatBeijing(iso: string | undefined | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime() + 8 * 3600 * 1000;
  return new Date(t).toISOString().replace('T', ' ').slice(0, 19);
}

/** 将 ISO 时间戳格式化为短日期 "yyyy-mm-dd" */
export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}
