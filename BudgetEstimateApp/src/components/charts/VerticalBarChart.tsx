import React, { useState } from 'react';
import { Card } from 'antd';
import { COLORS } from '../../styles/colors';
import { fmtK } from '../../utils/analysisShared';

/* ============================================================
   竖状柱状图（SVG 绘制，显示前 N 名）
   ⚠️ B11 修复：原 SalesCharts.tsx 与 DeliveryCharts.tsx 各有一份近 90 行的重复实现，收敛为单源。
   差异通过 props 化：padLeft/padRight（Y 轴留白）、hoverable（悬浮 tooltip）、centeredSvg（居中收窄）。
   ============================================================ */
export interface BarItem {
  name: string;
  value: number;
  subValue?: number;
  color?: string;
  tooltip?: string;
}

interface VerticalBarChartProps {
  title: string;
  data: BarItem[];
  format?: 'K' | '%' | 'num';
  height?: number;
  topN?: number;
  contentOffset?: number;
  barWidthRatio?: number;
  maxBarWidth?: number;
  noCard?: boolean;
  chartWidth?: number;
  disableSort?: boolean;
  targetValue?: number;
  targetLabel?: string;
  padTop?: number;
  padBottom?: number;
  hideAvgLine?: boolean;
  cardBorder?: boolean;
  barLabelGap?: number;
  /** 柱顶数值标签字号（B11 复核：合并前为 10，收敛后误降为 9，恢复默认 10） */
  valueFontSize?: number;
  padLeft?: number;
  padRight?: number;
  /** 悬浮显示 item.tooltip（Delivery 用）；Sales 场景数据无 tooltip，保持关闭 */
  hoverable?: boolean;
  /** SVG 收窄居中（Delivery 用）；Sales 场景铺满容器 */
  centeredSvg?: boolean;
}

export const VerticalBarChart: React.FC<VerticalBarChartProps> = ({
  title, data, format = 'num', height = 220, topN = 10, contentOffset = 0,
  barWidthRatio = 0.55, maxBarWidth = 36, noCard, chartWidth = 460, disableSort,
  targetValue, targetLabel, padTop = 32, padBottom = 28, hideAvgLine,
  cardBorder = true, barLabelGap = 18, valueFontSize = 10, padLeft = 42, padRight = 26,
  hoverable = false, centeredSvg = false,
}) => {
  const [hoveredTip, setHoveredTip] = useState<{ lines: string[]; cx: number; barTop: number; chartW?: number } | null>(null);
  const working = disableSort ? data : [...data].sort((a, b) => b.value - a.value);
  const top = working.slice(0, topN);
  const rawMax = Math.max(...top.map(d => d.value), 0);
  const effectiveMax = Math.max(1, targetValue ? Math.max(rawMax, targetValue) : (rawMax > 0 ? rawMax : (format === '%' ? 100 : 1)));
  const avg = data.length > 0 ? data.reduce((s, d) => s + d.value, 0) / data.length : 0;
  const slots: (BarItem | null)[] = Array.from({ length: topN }, (_, i) => top[i] || null);

  const fmtAxis = (v: number): string => {
    if (format === 'K') return Math.round(v / 1000).toLocaleString() + 'K';
    if (format === '%') return v.toFixed(1) + '%';
    return String(Math.round(v));
  };

  const W = chartWidth;
  const pad = { top: padTop, bottom: padBottom, left: padLeft, right: padRight };
  const chartW = W - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const slotW = chartW / topN;
  const barW = Math.min(slotW * barWidthRatio, maxBarWidth);
  const gridVals = effectiveMax <= 10
    ? Array.from({ length: effectiveMax + 1 }, (_, i) => i).reverse()
    : Array.from({ length: 5 }, (_, i) => (effectiveMax * (4 - i)) / 4);

  const chart = (
    <>
      {title && <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: COLORS.chartGray, zIndex: 1 }}>{title}</span>}
      <svg width={centeredSvg ? 'calc(100% - 30px)' : '100%'} height={height} viewBox={`0 0 ${W} ${height}`}
        style={{ display: 'block', ...(centeredSvg ? { margin: '0 auto' } : {}) }}>
        {/* ⚠️ B11 复核：bar-shadow 唯一消费者是 tooltip（hoverable），原耦合到 centeredSvg——
            若 hoverable 与 centeredSvg 分离则引用缺失；改按 hoverable 定义 */}
        {hoverable && (
          <defs><filter id="bar-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="1" dy="2" stdDeviation="2" flood-opacity="0.15" /></filter></defs>
        )}
        {/* Y 轴网格线 + 标签 */}
        {gridVals.map((gv, i) => {
          const y = pad.top + (1 - gv / effectiveMax) * chartH;
          return (
            <g key={`g-${i}`}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke={COLORS.borderLight} strokeWidth={1} />
              <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#aaa">
                {fmtAxis(gv)}
              </text>
            </g>
          );
        })}

        {/* 目标线 或 平均值虚线 */}
        {targetValue != null && targetValue > 0 ? (() => {
          const tgtY = pad.top + (1 - targetValue / effectiveMax) * chartH;
          return (
            <g>
              <line x1={pad.left} y1={tgtY} x2={W - pad.right} y2={tgtY}
                stroke={COLORS.warning} strokeWidth={1} strokeDasharray="5,3" />
              {/* ⚠️ B11 复核：targetLabel 缺省时回退显示格式化目标值（原实现 targetLabel || fmtAxis(targetValue)，
                  合并时误改为仅 targetLabel 存在才渲染——传 targetValue 不传 targetLabel 会丢目标线标签） */}
              <text x={W - pad.right - 8} y={tgtY + 3} textAnchor="start" fontSize={9} fill={COLORS.warning}>
                {targetLabel || fmtAxis(targetValue)}
              </text>
            </g>
          );
        })() : (!hideAvgLine && avg > 0 && data.some(d => d.value > 0) && (() => {
          const avgY = pad.top + (1 - avg / effectiveMax) * chartH;
          return (
            <g>
              <line x1={pad.left} y1={avgY} x2={W - pad.right} y2={avgY}
                stroke={COLORS.warning} strokeWidth={1} strokeDasharray="5,3" />
            </g>
          );
        })())}

        {/* 柱子 */}
        {slots.map((item, i) => {
          const cx = pad.left + i * slotW + slotW / 2;
          if (!item) return <g key={`e-${i}`} />;

          // ⚠️ 最终审计修正：非正数（≤0）统一底对齐 0 高，不再 Math.max(2, 负) 渲染出 2px 假柱——
          //   延期天数提前交付为负值，此前显示成极短正柱误导读图；负值仍显示其真实标签（如 -5）
          const isNonPositive = item.value <= 0;
          const barH = isNonPositive ? 0 : Math.max(2, (item.value / effectiveMax) * chartH);
          const color = item.color || (targetValue != null && targetValue > 0 ? (item.value >= targetValue ? COLORS.primary : COLORS.danger) : COLORS.primary);
          let label: string;
          if (item.value === 0) label = '—';
          else if (format === 'K') label = fmtK(item.value);
          else if (format === '%') label = `${item.value.toFixed(1)}%`;
          else label = `${item.value}`;

          const barTop = pad.top + chartH - barH;

          return (
            <g key={item.name + '-' + i}
              onMouseEnter={hoverable && item.tooltip ? () => setHoveredTip({ lines: item.tooltip!.split('\n'), cx, barTop, chartW: chartWidth }) : undefined}
              onMouseLeave={hoverable ? () => setHoveredTip(null) : undefined}>
              <text x={cx} y={barTop - barLabelGap} textAnchor="middle" fontSize={valueFontSize}
                fill={color} fontWeight={600}>{label}</text>
              {item.subValue != null && item.subValue > 0 && (
                <text x={cx} y={barTop - 6} textAnchor="middle" fontSize={valueFontSize}
                  fill={COLORS.purple} fontWeight={600}>（{format === 'K' ? fmtK(item.subValue) : item.subValue}）</text>
              )}
              {!isNonPositive && (
                <rect x={cx - barW / 2} y={barTop} width={barW} height={barH}
                  fill="none" stroke={color} strokeWidth={centeredSvg ? 2.5 : 3} rx={0} ry={0} />
              )}
              <text x={cx} textAnchor="middle" fontSize={10} fill="#444">
                {item.name.includes('\n') ? (
                  item.name.split('\n').map((part, li) =>
                    li === 0
                      ? <tspan key={li} x={cx} y={height - 19}>{part}</tspan>
                      : <tspan key={li} x={cx} dy={13}>{part}</tspan>
                  )
                ) : (
                  <tspan x={cx} y={height - 5}>{item.name}</tspan>
                )}
              </text>
            </g>
          );
        })}
        {/* 样式化 tooltip：靠右超出时自动翻转到左侧 */}
        {hoverable && hoveredTip && (() => {
          const tw = 170;
          const tipRight = hoveredTip.cx + 8 + tw;
          const containerW = hoveredTip.chartW || chartWidth;
          const flip = tipRight > containerW - 4;
          const tx = flip ? hoveredTip.cx - 8 - tw : hoveredTip.cx + 8;
          return (
            <g>
              <rect x={tx} y={hoveredTip.barTop - 16} width={tw} height={18 + hoveredTip.lines.length * 18} rx={5} ry={5}
                fill="#fff" stroke={COLORS.border} strokeWidth={1} filter="url(#bar-shadow)" />
              <text x={tx + 8} y={hoveredTip.barTop + 2} fontSize={12} fontWeight={700} fill={COLORS.textDark}>{hoveredTip.lines[0]}</text>
              <line x1={tx + 8} y1={hoveredTip.barTop + 10} x2={tx + 8 + tw - 16} y2={hoveredTip.barTop + 10} stroke={COLORS.borderLight} strokeWidth={1} />
              {hoveredTip.lines.slice(1).map((line, li) => (
                <text key={li} x={tx + 8} y={hoveredTip.barTop + 32 + li * 18} fontSize={11} fill="#444">{line}</text>
              ))}
            </g>
          );
        })()}
      </svg>
    </>
  );

  if (noCard) {
    return <div style={{ minHeight: '100%', position: 'relative', paddingTop: contentOffset }}>{chart}</div>;
  }

  return (
    <Card size="small"
      style={{ borderRadius: 8, border: cardBorder ? `1px solid ${COLORS.borderLight}` : 'none', background: cardBorder ? '#fff' : 'transparent', height: '100%', position: 'relative', boxShadow: 'none' }}
      styles={{ body: { padding: `${contentOffset}px 0 0`, height: '100%' } }}
    >
      {chart}
    </Card>
  );
};
