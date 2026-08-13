/** 颜色工具 —— 十六进制颜色解析与派生（KPI 图标色块淡色背景共用，对齐工时应用 utils/color） */

/** 十六进制 → RGB 三元组（兼容 #888 三位简写；仅被 withAlpha 消费，不导出） */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = String(hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** 十六进制颜色 → rgba（用于图标色块淡色背景）；无法解析 → 中性灰 rgba */
export function withAlpha(hex: string, alpha: number): string {
  const c = hexToRgb(hex);
  return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})` : `rgba(128,128,128,${alpha})`;
}
