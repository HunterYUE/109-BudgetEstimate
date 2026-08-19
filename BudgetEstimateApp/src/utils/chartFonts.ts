// ── 柱状图文字字号（全局统一单源）──
// SVG 柱状图（VerticalBarChart / ProfitChart）内部对图内 fontSize 乘 textScale=0.7/effectiveScale 归一：
//   任意宽度渲染 = 设计字号 × 0.7（X/柱顶数值 11×0.7=7.7px、Y 10×0.7=7px）。
// Dashboard 的 CSS 柱状图（VerticalBars）无缩放归一，直接用 *_RENDERED 渲染尺寸。
// ⚠️ 调整柱状图 X/Y 轴标签或柱顶数值字号/字重只改本文件，全应用柱状图同步生效。
export const CHART_FONT = {
  /** X 轴标签设计字号（渲染 7.7px） */
  X: 11,
  /** Y 轴刻度/目标线标签设计字号（渲染 7px） */
  Y: 10,
  /** 柱顶/柱底数值设计字号（渲染 7.7px） */
  VALUE: 11,
  /** 柱顶/柱底数值字重 */
  VALUE_WEIGHT: 600,
  /** X 轴标签渲染尺寸（CSS 无缩放柱状图用） */
  X_RENDERED: 7.7,
  /** Y 轴标签渲染尺寸（CSS 无缩放柱状图用） */
  Y_RENDERED: 7,
  /** 柱顶/柱底数值渲染尺寸（CSS 无缩放柱状图用） */
  VALUE_RENDERED: 7.7,
} as const;
