/** 主题色常量 —— React 内联样式中引用，与 App.css CSS 变量同步 */

export const COLORS = {
  /** 主色 — 蓝色（品牌色） */
  primary: '#00509e',
  /** 主色悬浮 */
  primaryHover: '#0066cc',
  /** 成功/已完成 — 深绿色 */
  success: '#1a6b3c',
  /** 危险/延期 — 红色 */
  danger: '#c62828',
  /** 警告 — 橙色 */
  warning: '#e65100',
  /** 次要文字 — 灰色 */
  textSecondary: '#666',
  /** 浅色文字 — 浅灰 */
  textLight: '#999',
  /** 深色文字 */
  textDark: '#0d1b2a',
  /** 边框色 */
  border: '#e8e8e8',
  /** 浅色背景 */
  bgLight: '#fafafa',
  /** 选中/悬停背景（蓝色调） */
  bgSelected: '#f0f6ff',
  /** 紫色（机会阶段/标注用） */
  purple: '#5a2d82',
  /** 琥珀色（甘特图项目色） */
  amber: '#c76a00',
  /** 灰色（甘特图项目色） */
  chartGray: '#888',
} as const;

/** 标签背景色候选项（15 色深色系） */
export const TAG_COLORS = [
  '#c0392b', '#d35400', '#e67e22', '#d4ac0d', '#27ae60',
  '#1abc9c', '#2980b9', '#2c3e50', '#7d3c98', '#a04000',
  '#5d6d7e', '#b03a2e', '#1f618d', '#1e8449', '#6c3483',
];
