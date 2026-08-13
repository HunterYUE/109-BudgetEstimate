import { describe, it, expect } from 'vitest';
import { moneyInputFilter, parseMoneyInput, lockCellWidth, tabItemStyle } from '../src/utils/tableUtils';

// 金额输入家族（parseInt 截断语义的契约化：金额输入一律整元，小数被截断——应用金额全局按未税整数元处理）
describe('moneyInputFilter 输入过滤显示', () => {
  it('去非数字 + ¥千分位；纯非数字 → "¥"', () => {
    expect(moneyInputFilter('abc1234')).toBe('¥1,234');
    expect(moneyInputFilter('1,234.56')).toBe('¥123,456'); // 全非数字剥除（含逗号/小数点）后千分位
    expect(moneyInputFilter('')).toBe('¥');
    expect(moneyInputFilter('abc')).toBe('¥');
  });
});

describe('parseMoneyInput 解析（0 视为空）', () => {
  it('去非数字 → 整数；全非数字/空 → 0', () => {
    expect(parseMoneyInput('1,234')).toBe(1234);
    expect(parseMoneyInput('¥500')).toBe(500);
    expect(parseMoneyInput('abc')).toBe(0);
    expect(parseMoneyInput('')).toBe(0);
  });
});

describe('lockCellWidth 列宽锁定三件套', () => {
  it('width/minWidth/maxWidth 一致', () => {
    expect(lockCellWidth(120)()).toEqual({ style: { width: 120, minWidth: 120, maxWidth: 120 } });
    expect(lockCellWidth(80, 'center')().style.textAlign).toBe('center');
  });
});

describe('tabItemStyle 激活/未激活样式', () => {
  it('激活带下划线+加粗', () => {
    const s = tabItemStyle(true, '#1677ff');
    expect(s.fontWeight).toBe(600);
    expect(s.borderBottom).toContain('#1677ff');
  });
  it('未激活用 inactiveColor 兜底', () => {
    const s = tabItemStyle(false, '#1677ff', '#888');
    expect(s.color).toBe('#888');
  });
});
