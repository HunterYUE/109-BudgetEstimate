import React from 'react';
import { Card } from 'antd';
import { COLORS } from '../../styles/constants';

const TOP_COLORS = [COLORS.primary, '#5a2d82', COLORS.primary, '#5a2d82'];

export interface StackedBarItem {
  name: string;
  bottom: number;
  top: number;
}

interface Props {
  title: string;
  data: StackedBarItem[];
  height?: number;
  topN?: number;
  contentOffset?: number;
  barWidthRatio?: number;
  chartWidth?: number;
  bottomPad?: number;
  labelOffset?: number;
}

const VerticalStackedBarChart: React.FC<Props> = ({
  title, data, height = 220, topN = 10, contentOffset = 0,
  barWidthRatio = 0.55, chartWidth = 460, bottomPad = 28, labelOffset = 0,
}) => {
  const sorted = [...data]
    .filter(d => d.bottom > 0 || d.top > 0)
    .sort((a, b) => (b.bottom + b.top) - (a.bottom + a.top));
  const top = sorted.slice(0, topN);
  const rawMax = Math.max(...top.map(d => d.bottom + d.top), 0);
  const effectiveMax = rawMax > 0 ? rawMax : 10;
  const W = chartWidth;
  const pad = { top: 22, bottom: bottomPad, left: 42, right: 26 };
  const chartW = W - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const slotW = chartW / topN;
  const barW = Math.min(slotW * barWidthRatio, 36);
  const gridVals = Array.from({ length: 5 }, (_, i) => (effectiveMax * (4 - i)) / 4);
  const slots: (StackedBarItem | null)[] = Array.from({ length: topN }, (_, i) => top[i] || null);

  return (
    <Card size="small"
      style={{ borderRadius: 8, border: '1px solid #f0f0f0', height: '100%', position: 'relative' }}
      styles={{ body: { padding: `${contentOffset}px 0 0`, height: '100%' } }}
    >
      <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: '#888', zIndex: 1 }}>
        {title}
      </span>
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} style={{ display: 'block' }}>
        {gridVals.map((gv, i) => {
          const y = pad.top + (i * chartH) / 4;
          return (
            <g key={`g-${i}`}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#f0f0f0" strokeWidth={1} />
              <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#aaa">
                {String(Math.round(gv))}
              </text>
            </g>
          );
        })}
        {slots.map((item, i) => {
          const cx = pad.left + i * slotW + slotW / 2;
          if (!item) return <g key={`e-${i}`} />;
          const total = item.bottom + item.top;
          const barH = total > 0 ? Math.max(2, (total / effectiveMax) * chartH) : 0;
          const bottomH = total > 0 ? (item.bottom / total) * barH : 0;
          const topH = barH - bottomH;
          const cy = pad.top + chartH - barH;
          const color = i < 4 ? TOP_COLORS[i] : '#ccc';
          return (
            <g key={item.name}>
              <text x={cx} y={cy - 4} textAnchor="middle" fontSize={10}
                fill={color} fontWeight={600}>{total > 0 ? total : '—'}</text>
              {bottomH > 0 && (
                <rect x={cx - barW / 2} y={cy}
                  width={barW} height={bottomH} fill="none" stroke="COLORS.primary" strokeWidth={3} rx={0} ry={0} />
              )}
              {topH > 0 && (
                <rect x={cx - barW / 2} y={cy + bottomH}
                  width={barW} height={topH} fill="none" stroke="#5a2d82" strokeWidth={3} />
              )}
              <text x={cx} y={height - 6 + labelOffset} textAnchor="middle" fontSize={10} fill="#666">
                {item.name.length > 4 ? <tspan x={cx} dy={0}>{item.name.slice(0, 4)}</tspan> : item.name}
                {item.name.length > 4 && <tspan x={cx} dy={10}>{item.name.slice(4)}</tspan>}
              </text>
              {bottomH > 8 && (
                <text x={cx} y={cy + bottomH / 2 + 4}
                  textAnchor="middle" fontSize={9} fill="#5a2d82" fontWeight={600}>{item.bottom}</text>
              )}
              {topH > 8 && (
                <text x={cx} y={cy + bottomH + topH / 2 + 4}
                  textAnchor="middle" fontSize={9} fill="#5a2d82" fontWeight={600}>{item.top}</text>
              )}
            </g>
          );
        })}
      </svg>
    </Card>
  );
};

export default VerticalStackedBarChart;
