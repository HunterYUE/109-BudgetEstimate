import React from 'react';
import { Card } from 'antd';
import { COLORS } from '../../styles/constants';

const TOP_COLORS = [COLORS.primary, COLORS.purple, COLORS.primary, COLORS.purple];

export interface BarItem {
  name: string;
  value: number;
}

interface Props {
  title: string;
  data: BarItem[];
  format?: 'K' | '%' | 'num';
  height?: number;
  topN?: number;
  contentOffset?: number;
  barWidthRatio?: number;
  chartWidth?: number;
  bottomPad?: number;
  labelOffset?: number;
  noBorder?: boolean;
  sorted?: boolean;
  targetValue?: number;
  profitData?: number[];
}

const VerticalBarChart: React.FC<Props> = ({
  title, data, format = 'num', height = 220, topN = 10,
  contentOffset = 0, barWidthRatio = 0.55, chartWidth = 460,
  bottomPad = 28, labelOffset = 0, noBorder = false, sorted: doSort = true,
  targetValue, profitData,
}) => {
  const working = doSort ? [...data].sort((a, b) => b.value - a.value) : data;
  const top = working.slice(0, topN);
  const rawMax = Math.max(...top.map(d => d.value), 0);
  const effectiveMax = Math.max(
    rawMax > 0 ? rawMax : (format === '%' ? 100 : 1),
    targetValue || 0
  );
  const slots: (BarItem | null)[] = Array.from({ length: topN }, (_, i) => top[i] || null);

  const fmtAxis = (v: number): string => {
    if (format === 'K') return Math.round(v / 1000).toLocaleString() + 'K';
    if (format === '%') return v.toFixed(1) + '%';
    return String(Math.round(v));
  };

  const W = chartWidth;
  const pad = { top: noBorder ? 26 : 22, bottom: bottomPad, left: 42 - (noBorder ? 10 : 0), right: 26 - (noBorder ? 6 : 0) };
  const chartW = W - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const slotW = chartW / topN;
  const barW = Math.min(slotW * barWidthRatio, 36);
  const gridVals = Array.from({ length: 5 }, (_, i) => (effectiveMax * (4 - i)) / 4);

  return (
    <Card size="small"
      style={{ borderRadius: noBorder ? 0 : 8, border: noBorder ? 'none' : `1px solid ${COLORS.borderLight}`, height: '100%', position: 'relative' }}
      styles={{ body: { padding: `${contentOffset}px 0 0`, height: '100%' } }}
    >
      {title && (
        <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: COLORS.chartGray, zIndex: 1 }}>
          {title}
        </span>
      )}
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} style={{ display: 'block' }}>
        {gridVals.map((gv, i) => {
          const y = pad.top + (i * chartH) / 4;
          return (
            <g key={`g-${i}`}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke={COLORS.borderLight} strokeWidth={1} />
              <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#aaa">
                {fmtAxis(gv)}
              </text>
            </g>
          );
        })}
        {slots.map((item, i) => {
          const cx = pad.left + i * slotW + slotW / 2;
          if (!item) return <g key={`e-${i}`} />;
          const isZero = item.value === 0;
          const barH = isZero ? 0 : Math.max(2, (item.value / effectiveMax) * chartH);
          const color = targetValue !== undefined
            ? (item.value >= targetValue ? COLORS.primary : item.value > 0 ? COLORS.danger : '#eee')
            : (i < 4 ? TOP_COLORS[i] : '#ccc');
          const label = isZero ? '—' : fmtAxis(item.value);
          const profit = profitData?.[i];
          const barTop = pad.top + chartH - barH;
          return (
            <g key={item.name}>
              <text x={cx} y={barTop - (profit ? 18 : 14)} textAnchor="middle" fontSize={10}
                fill={color} fontWeight={600}>{label}</text>
              {profit !== undefined && profit > 0 && (
                <text x={cx} y={barTop - 8} textAnchor="middle" fontSize={9}
                  fill={COLORS.purple} fontWeight={500}>({fmtAxis(profit)})</text>
              )}
              {!isZero && (
                <rect x={cx - barW / 2} y={barTop} width={barW} height={barH}
                  fill="none" stroke={color} strokeWidth={3} rx={0} ry={0} />
              )}
              <text x={cx} y={height - 6 + labelOffset} textAnchor="middle" fontSize={10} fill={COLORS.textSecondary}>
                {item.name.length > 4 ? <tspan x={cx} dy={0}>{item.name.slice(0, 4)}</tspan> : item.name}
                {item.name.length > 4 && <tspan x={cx} dy={10}>{item.name.slice(4)}</tspan>}
              </text>
            </g>
          );
        })}
        {targetValue !== undefined && targetValue > 0 && (() => {
          const targetY = pad.top + (1 - targetValue / effectiveMax) * chartH;
          return (
            <g>
              <line x1={pad.left} y1={targetY} x2={W - pad.right} y2={targetY}
                stroke="COLORS.success" strokeWidth={1.5} strokeDasharray="6,4" />
              <rect x={W - pad.right + 2} y={targetY - 5} width={64} height={14} fill="rgba(255,255,255,0.85)" rx={2} />
              <text x={W - pad.right + 4} y={targetY + 3}
                textAnchor="start" fontSize={9} fill="COLORS.success" fontWeight={600}
                >
                {fmtAxis(targetValue)}
              </text>
            </g>
          );
        })()}
      </svg>
    </Card>
  );
};

export default VerticalBarChart;
