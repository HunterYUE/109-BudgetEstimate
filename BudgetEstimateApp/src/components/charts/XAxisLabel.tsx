import React from 'react';
import { CHART_FONT } from '../../utils/chartFonts';

/**
 * 柱状图 X 轴标签（单行 / 换行多行渲染）
 * ⚠️ 行距单源：VerticalBarChart 与 ProfitChart 共用，调行距只改本文件。
 *  多行第二行起 dy=13×textScale 归一——SVG viewBox 任意缩放（effectiveScale≠1）下渲染恒 13×0.7≈9.1px，
 *  与柱顶多行数值（11×1.2×0.7≈9.24px）视觉一致；若直接写 dy=13 会随容器缩放漂移
 *  （利润卡此前即此缺陷：窄容器下行距小于字号、两行拥挤）。
 *  多行第一行默认锚定 height-19（两行块整体位于 SVG 内）；alignFirstLine 时锚定单行位置 height-5 实现水平对齐。
 */
export const XAxisLabel: React.FC<{
  cx: number;
  height: number;
  name: string;
  textScale: number;
  fontSize?: number;
  fill?: string;
  /** 多行 X 轴标签第一行锚定到单行标签位置（height-5）；默认 false 保持 height-19 */
  alignFirstLine?: boolean;
}> = ({ cx, height, name, textScale, fontSize = CHART_FONT.X, fill = '#444', alignFirstLine = false }) => (
  <text x={cx} textAnchor="middle" fontSize={fontSize * textScale} fill={fill}>
    {name.includes('\n') ? (
      name.split('\n').map((part, li) =>
        li === 0
          ? <tspan key={li} x={cx} y={alignFirstLine ? height - 5 : height - 19}>{part}</tspan>
          : <tspan key={li} x={cx} dy={13 * textScale}>{part}</tspan>
      )
    ) : (
      <tspan x={cx} y={height - 5}>{name}</tspan>
    )}
  </text>
);
