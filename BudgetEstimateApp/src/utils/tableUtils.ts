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

/** 金额输入过滤：仅保留数字，格式化为 ¥N,N 显示（多表单共用，消除 4+ 处重复内联） */
export const moneyInputFilter = (raw: string): string => {
  const num = raw.replace(/[^0-9]/g, '');
  return num ? '¥' + parseInt(num, 10).toLocaleString() : '¥';
};

/** 金额输入解析：去非数字 → 整数（0 视为空） */
export const parseMoneyInput = (text: string): number => parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;

/** Tab 栏项样式（active 高亮色可配，inactive 默认 textSecondary，可覆盖）——多页共用，消除 Tab 内联样式重复 */
export const tabItemStyle = (active: boolean, activeColor: string, inactiveColor?: string): CSSProperties => ({
  padding: '8px 20px', cursor: 'pointer', fontSize: 14,
  borderBottom: active ? `2px solid ${activeColor}` : '2px solid transparent',
  color: active ? activeColor : (inactiveColor ?? COLORS.textSecondary),
  fontWeight: active ? 600 : 400,
  marginBottom: -2, transition: 'all 0.15s', userSelect: 'none',
});

