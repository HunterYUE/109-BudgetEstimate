/**
 * 时间格式化工具函数
 */

/** 将 ISO 时间戳格式化为北京时间字符串 "yyyy-MM-dd HH:mm:ss" */
export function formatBeijing(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }).replace(/\//g, '-');
  } catch {
    // Fallback: manual offset
    const t = d.getTime() + 8 * 3600 * 1000;
    return new Date(t).toISOString().replace('T', ' ').slice(0, 19);
  }
}

/** 获取北京时间今天的日期字符串 YYYY-MM-DD */
export function todayBeijing(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

