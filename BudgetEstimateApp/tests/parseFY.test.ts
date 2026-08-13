import { describe, it, expect } from 'vitest';
import { parseFY, fiscalYearLabel } from '../src/utils/parseFY';
import { fyMonthWindows } from '../src/utils/analysisShared';

describe('parseFY 财年解析（7/1 起算、6/30 末）', () => {
  it('FY2526 → 2025-07-01 ~ 2026-06-30 23:59:59.999', () => {
    const { start, end } = parseFY('FY2526');
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(5);
    expect(end.getDate()).toBe(30);
    expect(end.getHours()).toBe(23);
    expect(end.getMilliseconds()).toBe(999); // 月末排他边界，防漏最后一天
  });
});

describe('fiscalYearLabel 财年归属（月 ≥7 → 跨年标签）', () => {
  it('7 月 1 日跨入下一财年', () => {
    expect(fiscalYearLabel(new Date(2025, 6, 1))).toBe('FY2526');
    expect(fiscalYearLabel(new Date(2025, 11, 31))).toBe('FY2526');
    expect(fiscalYearLabel(new Date(2026, 0, 1))).toBe('FY2526');
    expect(fiscalYearLabel(new Date(2026, 5, 30))).toBe('FY2526');
  });
  it('6 月 30 日仍属上一财年', () => {
    expect(fiscalYearLabel(new Date(2025, 5, 30))).toBe('FY2425');
    expect(fiscalYearLabel(new Date(2025, 0, 1))).toBe('FY2425');
  });
  it('跨年临界 6/30 与 7/1 分别落在两财年', () => {
    expect(fiscalYearLabel(new Date(2025, 5, 30))).toBe('FY2425');
    expect(fiscalYearLabel(new Date(2025, 6, 1))).toBe('FY2526');
  });
});
describe('fyMonthWindows 跨月天数边界（F05 月末 23:59:59.999）', () => {
  it('2 月（平年）28 天窗口', () => {
    const wins = fyMonthWindows({ start: new Date(2025, 6, 1), end: new Date(2026, 5, 30, 23, 59, 59, 999) });
    const feb = wins[7]; // index 7 = 2026-02
    expect(feb.start.getFullYear()).toBe(2026);
    expect(feb.start.getMonth()).toBe(1);
    expect(feb.end.getDate()).toBe(28);
    expect(feb.end.getMilliseconds()).toBe(999);
  });
  it('12 月跨年窗口（index 5 = 2025-12）', () => {
    const wins = fyMonthWindows({ start: new Date(2025, 6, 1), end: new Date(2026, 5, 30, 23, 59, 59, 999) });
    const dec = wins[5];
    expect(dec.start.getFullYear()).toBe(2025);
    expect(dec.start.getMonth()).toBe(11);
    expect(dec.end.getDate()).toBe(31);
    expect(dec.end.getMilliseconds()).toBe(999);
  });
});
