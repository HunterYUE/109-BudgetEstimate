import type { CSSProperties } from 'react';
import { COLORS } from '../styles/colors';

/** Ant Table 列宽锁定三件套（width/minWidth/maxWidth，可选居中）——多表共用，防各页实现漂移 */
export const lockCellWidth = (w: number, align?: 'center' | 'left' | 'right') => () => ({
  style: { width: w, minWidth: w, maxWidth: w, ...(align ? { textAlign: align } : {}) },
});

/** 裸输入框基础样式（border/background/outline 三无）——多表单共用，消除 40+ 处内联重复 */
export const BARE_INPUT_STYLE: CSSProperties = {
  border: 'none', background: 'transparent', outline: 'none',
};

/** 金额输入过滤：解析为整元后格式化为 ¥N,N 显示（多表单共用，消除 4+ 处重复内联） */
export const moneyInputFilter = (raw: string): string => {
  const num = parseMoneyInput(raw);
  return num ? '¥' + num.toLocaleString() : '¥';
};

/** 金额输入解析：按数值字面量解析后取整元（0 视为空）。
 * 不能直接删除所有非数字字符——`1,234.56` 会被拼成 123456（放大 100 倍），
 * `-100` 会被改成正数。此处保留符号/小数点/千分位，再按整数元截断 */
export const parseMoneyInput = (text: string): number => {
  const cleaned = String(text ?? '').replace(/[^\d.-]/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? (Math.trunc(n) || 0) : 0;
};

/** Tab 栏项样式（active 高亮色可配，inactive 默认 textSecondary，可覆盖）——多页共用，消除 Tab 内联样式重复 */
export const tabItemStyle = (active: boolean, activeColor: string, inactiveColor?: string): CSSProperties => ({
  padding: '8px 20px', cursor: 'pointer', fontSize: 14,
  borderBottom: active ? `2px solid ${activeColor}` : '2px solid transparent',
  color: active ? activeColor : (inactiveColor ?? COLORS.textSecondary),
  fontWeight: active ? 600 : 400,
  marginBottom: -2, transition: 'all 0.15s', userSelect: 'none',
});

