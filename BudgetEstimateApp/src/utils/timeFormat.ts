/**
 * 时间格式化工具函数
 */

/** 将 ISO 时间戳或 Date 格式化为北京时间字符串 "yyyy-MM-dd HH:mm:ss"（B26：直接接受 Date，免调用方先 toISOString 走 UTC 往返） */
export function formatBeijing(iso: string | Date | undefined | null): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
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

