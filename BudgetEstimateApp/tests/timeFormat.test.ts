import { describe, it, expect } from 'vitest';
import { formatBeijing, todayBeijing } from '../src/utils/timeFormat';

describe('formatBeijing 北京时间格式化（+8h，零填充）', () => {
  it('ISO UTC → 北京时间（同日前移 8 小时）', () => {
    expect(formatBeijing('2026-07-05T04:00:00Z')).toBe('2026-07-05 12:00:00');
  });
  it('跨日：UTC 前夜 20:00 → 北京次日 04:00', () => {
    expect(formatBeijing('2026-07-05T20:00:00Z')).toBe('2026-07-06 04:00:00');
  });
  it('接受 Date 对象（免 toISOString 走 UTC 往返）', () => {
    expect(formatBeijing(new Date('2026-07-05T04:00:00Z'))).toBe('2026-07-05 12:00:00');
  });
  it('空 / 非法 → —', () => {
    expect(formatBeijing(null)).toBe('—');
    expect(formatBeijing(undefined)).toBe('—');
    expect(formatBeijing('not-a-date')).toBe('—');
  });
});

describe('todayBeijing 今天日期', () => {
  it('YYYY-MM-DD 零填充', () => {
    expect(todayBeijing()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
