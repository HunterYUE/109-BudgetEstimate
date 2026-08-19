// ── 柱体框线（全局统一单源）──
// 所有柱状图柱体描边设计值（viewBox 单位）；渲染厚度 = 设计值 × textScale = 恒 1.75px（全应用统一，
//   实测 ~2 设备像素足迹，与迁移前 CSS 2px 视觉一致）。SalesAnalysis/DeliveryAnalysis/Dashboard 全部引用本文件。
// ⚠️ 调整框线宽度只改此处；利润分析卡概算柱虚线为功能性保留（与实线实际柱重叠时仍透出可见）。
export const CHART_FRAME = {
  /** 柱体描边设计值 */
  STROKE: 2.5,
} as const;
