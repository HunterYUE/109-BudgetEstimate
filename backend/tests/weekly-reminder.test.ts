import { describe, it, expect } from 'vitest';
import {
  BEIJING_OFFSET_MS,
  beijingMidnightUtc,
  isoWeekSundayFromDate,
} from '../src/jobs/weeklyReminder.js';

describe('BEIJING_OFFSET_MS 北京时区偏移（中国无夏令时，固定 UTC+8）', () => {
  it('8 小时毫秒数', () => {
    expect(BEIJING_OFFSET_MS).toBe(8 * 3600 * 1000);
  });
});

describe('beijingMidnightUtc 北京时间「某日 00:00」→ UTC 时间点（timestamptz 去重基准）', () => {
  it('2026-08-16 北京零点 = 2026-08-15T16:00:00Z', () => {
    expect(beijingMidnightUtc('2026-08-16').toISOString()).toBe('2026-08-15T16:00:00.000Z');
  });
  it('跨年/月边界正确（北京零点 = 前一日 UTC 16:00）', () => {
    expect(beijingMidnightUtc('2026-01-01').toISOString()).toBe('2025-12-31T16:00:00.000Z');
    expect(beijingMidnightUtc('2026-12-31').toISOString()).toBe('2026-12-30T16:00:00.000Z');
  });
});

describe('isoWeekSundayFromDate 当前 ISO 周（周一起）周日推导（克隆入参不 mutate）', () => {
  // 入参为「北京时间 Date」：UTC 字段即北京墙钟时间（生产构造 now()+BEIJING_OFFSET_MS）
  it('周日运行 → 当天（生产 cron 行为）', () => {
    expect(isoWeekSundayFromDate(new Date(Date.UTC(2026, 7, 16)))).toBe('2026-08-16');
  });
  it('周三运行 → 锚定本周周日（L1：非周日调用防周号错位）', () => {
    expect(isoWeekSundayFromDate(new Date(Date.UTC(2026, 7, 12)))).toBe('2026-08-16');
  });
  it('周一运行 → 本周周日', () => {
    expect(isoWeekSundayFromDate(new Date(Date.UTC(2026, 7, 10)))).toBe('2026-08-16');
  });
  it('不 mutate 入参（此前就地 setUTCDate 改写调用方 Date）', () => {
    const input = new Date(Date.UTC(2026, 7, 12));
    isoWeekSundayFromDate(input);
    expect(input.getUTCDate()).toBe(12);
    expect(input.toISOString()).toBe('2026-08-12T00:00:00.000Z');
  });
});
