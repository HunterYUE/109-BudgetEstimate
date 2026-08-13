/**
 * 时间格式化工具函数
 */

/** 将 ISO 时间戳或 Date 格式化为北京时间字符串 "yyyy-MM-dd HH:mm:ss"（B26：直接接受 Date，免调用方先 toISOString 走 UTC 往返） */
export function formatBeijing(iso: string | Date | undefined | null): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return '—';
  try {
    // ⚠️ 最终审计修正：zh-CN toLocaleString 输出非补零的 "2026-8-3 14:30:05"；改用 en-CA 日期 + en-GB 时间
    //   得零填充 "2026-08-03 14:30:05"，与 todayBeijing 及历史导出口径一致
    return `${d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })} ${d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Shanghai', hour12: false })}`;
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

