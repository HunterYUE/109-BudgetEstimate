import React, { useState, useMemo } from 'react';
import { Card } from 'antd';
import { mockDeliveryProjects, mockProject } from '../mockData';
import { useMockVersion } from '../utils/mockStore';
import { COLORS } from '../styles/constants';
import { computeDeliveryEstGP3 } from '../utils/calculations';

/* ============================================================
   常量
   ============================================================ */
const FY_OPTIONS = ['FY2425', 'FY2526', 'FY2627'] as const;
const NODE_NAMES = ['资料\n交接', '合同\n签订', '项目\n启动', '方案\n细化', '技术\n会签',
  '详细\n设计', '设计\n评审', '制造\n采购', '组装\n调试', '出厂\n验收',
  '包装\n发货', '现场\n安调', '验收\n整改', '终\n验收', '项目\n总结'];

/* ============================================================
   财年工具
   ============================================================ */
/** 将名称截取前5个字符，再拆为两行显示 */
function splitLabel(name: string): string {
  const s = name.length > 5 ? name.slice(0, 5) : name;
  if (s.length <= 2) return s;
  const mid = Math.ceil(s.length / 2);
  return s.slice(0, mid) + '\n' + s.slice(mid);
}

const parseFY = (fy: string) => {
  const y1 = 2000 + parseInt(fy.slice(2, 4));
  const y2 = 2000 + parseInt(fy.slice(4, 6));
  return { start: new Date(y1, 6, 1), end: new Date(y2, 6, 0) };
};

/* ============================================================
   子组件 — 财年选择器
   ============================================================ */
const FYSelector: React.FC<{ value: string; onChange: (v: string) => void }> =
  ({ value, onChange }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        fontSize: 13, padding: '4px 12px', borderRadius: 4,
        border: 'none', background: 'transparent',
        cursor: 'pointer', outline: 'none', color: '#333',
      }}>
      {FY_OPTIONS.map(fy => <option key={fy} value={fy}>{fy}</option>)}
    </select>
  );

/* ============================================================
   子组件 — 概览卡片
   ============================================================ */
interface KpiCard {
  label: string; value: string; color: string; icon: string;
  subValue?: string;
}
const OverviewCards: React.FC<{ items: KpiCard[] }> = ({ items }) => (
  <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
    {items.map((item, i) => (
      <Card key={i} size="small"
        style={{
          flex: 1, borderRadius: 8, border: '1px solid #f0f0f0',
          transition: 'box-shadow 0.2s, transform 0.15s',
        }}
        styles={{ body: { padding: '16px 12px', textAlign: 'center' as const } }}
        hoverable
      >
        <div style={{ fontSize: 20, marginBottom: 2 }}>{item.icon}</div>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 4, letterSpacing: 0.3 }}>
          {item.label}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: item.color, lineHeight: 1.2 }}>
          {item.value}
        </div>
        {item.subValue && (
          <div style={{ fontSize: 13, fontWeight: 600, color: item.color, marginTop: 2 }}>
            {item.subValue}
          </div>
        )}
      </Card>
    ))}
  </div>
);

/* ============================================================
   子组件 — SVG 柱状图（增强版，支持 subValue / per-bar color）
   ============================================================ */
interface BarItem {
  name: string;
  value: number;
  subValue?: number;
  color?: string;
  tooltip?: string;
}

const fmtK = (v: number) => Math.round(v / 1000).toLocaleString() + 'K';

const VerticalBarChart: React.FC<{
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
}> = ({ title, data, format = 'num', height = 220, topN = 10, contentOffset = 0, barWidthRatio = 0.55, maxBarWidth = 36, noCard, chartWidth = 460, disableSort, targetValue, targetLabel, padTop = 32, padBottom = 28, hideAvgLine, cardBorder = true }) => {
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
  const pad = { top: padTop, bottom: padBottom, left: 42, right: 26 };
  const chartW = W - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const slotW = chartW / topN;
  const barW = Math.min(slotW * barWidthRatio, maxBarWidth);
  const gridVals = effectiveMax <= 10
    ? Array.from({ length: effectiveMax + 1 }, (_, i) => i).reverse()
    : Array.from({ length: 5 }, (_, i) => (effectiveMax * (4 - i)) / 4);

  const chart = (
    <>
      {title && <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: '#888', zIndex: 1 }}>{title}</span>}
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} style={{ display: 'block' }}>
        {gridVals.map((gv, i) => {
          const y = pad.top + (1 - gv / effectiveMax) * chartH;
          return (
            <g key={`g-${i}`}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#f0f0f0" strokeWidth={1} />
              <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#aaa">
                {fmtAxis(gv)}
              </text>
            </g>
          );
        })}

        {targetValue != null && targetValue > 0 ? (() => {
          const tgtY = pad.top + (1 - targetValue / effectiveMax) * chartH;
          return (
            <g>
              <line x1={pad.left} y1={tgtY} x2={W - pad.right} y2={tgtY}
                stroke="#e65100" strokeWidth={1} strokeDasharray="5,3" />
              <text x={W - pad.right - 8} y={tgtY + 3}
                textAnchor="start" fontSize={9} fill="#e65100">{targetLabel || fmtAxis(targetValue)}</text>
            </g>
          );
        })() : (!hideAvgLine && avg > 0 && data.some(d => d.value > 0) && (() => {
          const avgY = pad.top + (1 - avg / effectiveMax) * chartH;
          return (
            <g>
              <line x1={pad.left} y1={avgY} x2={W - pad.right} y2={avgY}
                stroke="#e65100" strokeWidth={1} strokeDasharray="5,3" />
              <text x={W - pad.right - 8} y={avgY + 3}
                textAnchor="start" fontSize={9} fill="#e65100">{(() => {
                if (format === 'K') return fmtAxis(avg);
                if (format === '%') return avg.toFixed(1) + '%';
                return String(Math.round(avg));
              })()}</text>
            </g>
          );
        })())}

        {slots.map((item, i) => {
          const cx = pad.left + i * slotW + slotW / 2;
          if (!item) return <g key={`e-${i}`} />;

          const isZero = item.value === 0;
          const barH = isZero ? 0 : Math.max(2, (item.value / effectiveMax) * chartH);
          const color = item.color || (targetValue != null && targetValue > 0 ? (item.value >= targetValue ? COLORS.primary : COLORS.danger) : COLORS.primary);
          let label: string;
          if (isZero) label = '—';
          else if (format === 'K') label = fmtK(item.value);
          else if (format === '%') label = `${item.value.toFixed(1)}%`;
          else label = `${item.value}`;

          const barTop = pad.top + chartH - barH;

          return (
            <g key={item.name}>
              {item.tooltip && <title>{item.tooltip}</title>}
              <text x={cx} y={barTop - 18} textAnchor="middle" fontSize={10}
                fill={color} fontWeight={600}>{label}</text>
              {item.subValue != null && item.subValue > 0 && (
                <text x={cx} y={barTop - 6} textAnchor="middle" fontSize={9}
                  fill={COLORS.purple} fontWeight={600}>（{format === 'K' ? fmtK(item.subValue) : item.subValue}）</text>
              )}
              {!isZero && (
                <rect x={cx - barW / 2} y={barTop} width={barW} height={barH}
                  fill="none" stroke={color} strokeWidth={3} rx={0} ry={0} />
              )}
              <text x={cx} textAnchor="middle" fontSize={10} fill="#444">
                {item.name.includes('\n') ? (
                  item.name.split('\n').map((part, li) =>
                    li === 0
                      ? <tspan key={li} x={cx} y={height - 14}>{part}</tspan>
                      : <tspan key={li} x={cx} dy={13}>{part}</tspan>
                  )
                ) : (
                  <tspan x={cx} y={height}>{item.name}</tspan>
                )}
              </text>
            </g>
          );
        })}
      </svg>
    </>
  );

  if (noCard) {
    return <div style={{ minHeight: '100%', position: 'relative', paddingTop: contentOffset }}>{chart}</div>;
  }

  return (
    <Card size="small"
      style={{ borderRadius: 8, border: cardBorder ? '1px solid #f0f0f0' : 'none', background: cardBorder ? '#fff' : 'transparent', height: '100%', position: 'relative', boxShadow: 'none' }}
      styles={{ body: { padding: `${contentOffset}px 0 0`, height: '100%' } }}
    >
      {chart}
    </Card>
  );
};

/* ============================================================
   子组件 — 利润分组柱状图（概算 vs 实际）
   ============================================================ */
interface ProfitItem {
  name: string;
  estProfit: number;
  estGP3: number;
  actProfit?: number;
  actGP3?: number;
  deviation: number;
}

const ProfitChart: React.FC<{
  data: ProfitItem[];
  avgEstGP3: number;
  avgActGP3?: number;
  height?: number;
  chartWidth?: number;
  contentOffset?: number;
}> = ({ data, avgEstGP3, avgActGP3, height = 300, chartWidth = 780, contentOffset = 30 }) => {
  const W = chartWidth;
  const pad = { top: 38, bottom: 32, left: 47, right: 30 };
  const chartH = height - pad.top - pad.bottom;
  const slots = data.slice(0, 15);
  const maxN = 15;
  const slotW = (W - pad.left - pad.right) / maxN;
  const allValues = slots.flatMap(s => [s.estProfit, s.actProfit ?? 0]);
  const rawMax = Math.max(...allValues, 0);
  const effectiveMax = Math.max(1, rawMax);

  const gridVals = effectiveMax <= 10
    ? Array.from({ length: effectiveMax + 1 }, (_, i) => i).reverse()
    : Array.from({ length: 5 }, (_, i) => (effectiveMax * (4 - i)) / 4);

  const fmtNum = (v: number) => Math.round(v / 1000).toLocaleString();
  const fmtPct = (v: number) => (v * 100).toFixed(1);

  // 平均利润
  const avgEstProfit = slots.reduce((s, d) => s + d.estProfit, 0) / Math.max(slots.length, 1);
  const actSlots = slots.filter(d => d.actProfit != null);
  const avgActProfit = actSlots.length > 0 ? actSlots.reduce((s, d) => s + d.actProfit!, 0) / actSlots.length : 0;

  const avgEstY = pad.top + (1 - avgEstProfit / effectiveMax) * chartH;
  const avgActY = avgActProfit > 0 ? pad.top + (1 - avgActProfit / effectiveMax) * chartH : null;

  return (
    <Card size="small"
      style={{ borderRadius: 8, border: '1px solid #f0f0f0', background: '#fff', position: 'relative' }}
      styles={{ body: { padding: `${contentOffset}px 0 0` } }}
    >
      <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 10, color: '#888', zIndex: 1 }}>利润分析</span>
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} style={{ display: 'block' }}>
        {gridVals.map((gv, i) => {
          const y = pad.top + (1 - gv / effectiveMax) * chartH;
          return (
            <g key={`g-${i}`}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#f0f0f0" strokeWidth={1} />
              <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#aaa">{fmtK(gv)}</text>
            </g>
          );
        })}

        {/* 平均概算利润线（蓝色虚线） */}
        {avgEstProfit > 0 && (
          <g>
            <line x1={pad.left} y1={avgEstY} x2={W - 47} y2={avgEstY}
              stroke={COLORS.primary} strokeWidth={1} strokeDasharray="4,3" />
            <text x={W - 21} y={avgEstY - 1} textAnchor="middle" fontSize={8} fill={COLORS.primary}>
              <tspan x={W - 21} dy={0}>{fmtNum(avgEstProfit)}</tspan>
              <tspan x={W - 21} dy={11}>（{(avgEstGP3 * 100).toFixed(1)}%）</tspan>
            </text>
          </g>
        )}

        {/* 平均实际利润线（紫色虚线） */}
        {avgActY != null && (
          <g>
            <line x1={pad.left} y1={avgActY} x2={W - 47} y2={avgActY}
              stroke={COLORS.purple} strokeWidth={1} strokeDasharray="4,3" />
            <text x={W - 21} y={avgActY - 1} textAnchor="middle" fontSize={8} fill={COLORS.purple}>
              <tspan x={W - 21} dy={0}>{fmtNum(avgActProfit)}</tspan>
              <tspan x={W - 21} dy={11}>（{(avgActGP3! * 100).toFixed(1)}%）</tspan>
            </text>
          </g>
        )}

        {slots.map((item, i) => {
          const cx = pad.left + i * slotW + slotW / 2;
          const barW = Math.min(slotW * 0.5, 28);
          const estH = Math.max(2, (item.estProfit / effectiveMax) * chartH);
          const estTop = pad.top + chartH - estH;
          const hasAct = item.actProfit != null;
          const actH = hasAct ? Math.max(2, (item.actProfit! / effectiveMax) * chartH) : 0;

          return (
            <g key={item.name}>
              {/* 概算柱（蓝色虚线框） */}
              <rect x={cx - barW / 2} y={estTop} width={barW} height={estH}
                fill="none" stroke={COLORS.primary} strokeWidth={1.5} strokeDasharray="4,3" rx={0} ry={0} />

              {/* 概算标签：高柱外侧/低柱内侧 */}
              {estH >= actH ? (
                <>
                  <text x={cx} y={estTop - 10} textAnchor="middle" fontSize={9}
                    fill={COLORS.primary} fontWeight={600}>{fmtNum(item.estProfit)}</text>
                  <text x={cx} y={estTop - 22} textAnchor="middle" fontSize={9}
                    fill={COLORS.primary}>{fmtPct(item.estGP3)}</text>
                </>
              ) : (
                <>
                  <text x={cx} y={estTop + 14} textAnchor="middle" fontSize={9}
                    fill={COLORS.primary} fontWeight={600}>{fmtNum(item.estProfit)}</text>
                  <text x={cx} y={estTop + 26} textAnchor="middle" fontSize={9}
                    fill={COLORS.primary}>{fmtPct(item.estGP3)}</text>
                </>
              )}

              {/* 实际柱（紫色实线框，与概算柱重叠） */}
              {hasAct && (
                <>
                  <rect x={cx - barW / 2} y={pad.top + chartH - actH} width={barW} height={actH}
                    fill="none" stroke={COLORS.purple} strokeWidth={2} rx={0} ry={0} />
                  {/* 实际标签：高柱外侧/低柱内侧 */}
                  {actH >= estH ? (
                    <>
                      <text x={cx} y={(pad.top + chartH - actH) - 10} textAnchor="middle" fontSize={9}
                        fill={COLORS.purple} fontWeight={600}>{fmtNum(item.actProfit!)}</text>
                      <text x={cx} y={(pad.top + chartH - actH) - 22} textAnchor="middle" fontSize={9}
                        fill={COLORS.purple}>{fmtPct(item.actGP3!)}</text>
                    </>
                  ) : (
                    <>
                      <text x={cx} y={(pad.top + chartH - actH) + 14} textAnchor="middle" fontSize={9}
                        fill={COLORS.purple} fontWeight={600}>{fmtNum(item.actProfit!)}</text>
                      <text x={cx} y={(pad.top + chartH - actH) + 26} textAnchor="middle" fontSize={9}
                        fill={COLORS.purple}>{fmtPct(item.actGP3!)}</text>
                    </>
                  )}
                </>
              )}

              {/* X 轴标签 */}
              <text x={cx} textAnchor="middle" fontSize={10} fill="#444">
                {item.name.includes('\n') ? (
                  item.name.split('\n').map((part, li) =>
                    li === 0
                      ? <tspan key={li} x={cx} y={height - 14}>{part}</tspan>
                      : <tspan key={li} x={cx} dy={11}>{part}</tspan>
                  )
                ) : (
                  <tspan x={cx} y={height - 6}>{item.name}</tspan>
                )}
              </text>
            </g>
          );
        })}
      </svg>
    </Card>
  );
};

/* ============================================================
   子组件 — 项目时间节点分布（甘特图）
   ============================================================ */
const ProjectGantt: React.FC<{
  data: Array<{ name: string; slots: { nodeNo: number; startDate: Date; endDate: Date; status: string }[] }>;
  tlStart: Date;
  totalDays: number;
  months: string[];
  todayPos: number;
  height?: number;
}> = ({ data, tlStart, totalDays, months, todayPos, height = 500 }) => {
  const W = 1250;
  const labelW = 70;
  const chartW = W - labelW;
  const projColors = [COLORS.primary, COLORS.purple, COLORS.success, COLORS.warning, COLORS.amber, COLORS.chartGray];
  const projCount = Math.max(data.length, 1);
  const maxProj = 20;
  const overhead = 64;
  const totalGap = (projCount - 1) * 4;
  const barH = Math.max(4, Math.floor((height - overhead - totalGap) / projCount));
  const rowGap = Math.max(2, Math.min(6, Math.floor(barH * 0.3)));
  const projH = barH + rowGap;
  const H = Math.max(height, overhead + projCount * projH + 10);

  const posX = (d: Date) => labelW + Math.max(0, Math.min(1, (d.getTime() - tlStart.getTime()) / (1000 * 60 * 60 * 24) / totalDays)) * chartW;
  const todayX = labelW + todayPos / totalDays * chartW;

  return (
    <Card size="small" style={{ borderRadius: 8, border: '1px solid #f0f0f0', height: '100%' }} styles={{ body: { padding: '12px 0 0', height: '100%' } }}>
      <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: '#888', zIndex: 1 }}>项目节点</span>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', padding: '0 20px', boxSizing: 'border-box' }}>
        {Array.from({ length: 13 }, (_, i) => {
          const x = labelW + i / 12 * chartW;
          return (
            <g key={`m-${i}`}>
              <line x1={x} y1={42} x2={x} y2={H - 4} stroke="#f0f0f0" strokeWidth={1} />
              {i < 12 && <text x={x + chartW / 24 - 20} y={36} textAnchor="middle" fontSize={8} fill="#888">{months[i]}</text>}
            </g>
          );
        })}
        <line x1={todayX} y1={42} x2={todayX} y2={H - 4} stroke={COLORS.danger} strokeWidth={1} strokeDasharray="4,3" />
        {data.map((proj, pi) => {
          const cy = 48 + pi * projH;
          const color = projColors[pi % projColors.length];
          return (
            <g key={proj.name}>
              <text x={4} y={cy + barH / 2 + 3} fontSize={8} fill="#444" fontWeight={600}>
                {proj.name.length > 6 ? proj.name.slice(0, 6) : proj.name}
              </text>
              {proj.slots.map(s => {
                const sx = posX(s.startDate);
                const ex = posX(s.endDate);
                const w = Math.max(4, ex - sx);
                const opacity = s.status === 'completed' ? 1 : s.status === 'in_progress' ? 0.6 : 0.3;
                return (
                  <g key={s.nodeNo}>
                    <rect x={sx} y={cy} width={w} height={barH} rx={0} ry={0}
                      fill="none" stroke={color} strokeWidth={1.5} opacity={opacity} />
                    {w > 16 && (
                      <text x={sx + w / 2} y={cy + barH / 2 + 1} textAnchor="middle" fontSize={7}
                        fill={color} opacity={opacity} fontWeight={600}>{s.nodeNo}</text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </Card>
  );
};

/* ============================================================
   子组件 — 健康矩阵（气泡图）
   ============================================================ */
const BubbleChart: React.FC<{
  data: { name: string; contractAmount: number; delayDays: number; costDeviation: number; status: string; resourceLoad: number }[];
  height?: number;
}> = ({ data, height = 300 }) => {
  const W = 1000;
  const H = height;
  const pad = { top: 40, bottom: 32, left: 48, right: 24 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const maxDelay = Math.max(...data.map(d => d.delayDays), 1);
  const maxCost = Math.max(...data.map(d => Math.abs(d.costDeviation)), 1);
  const maxLoad = Math.max(...data.map(d => d.resourceLoad), 1);
  const statusColors: Record<string, string> = { '进行中': COLORS.primary, '已完成': COLORS.success, '已延期': COLORS.danger };
  const step = 15;
  const maxTick = Math.ceil(maxDelay / step) * step;

  return (
    <Card size="small" style={{ borderRadius: 8, border: '1px solid #f0f0f0' }} styles={{ body: { padding: '22px 0 10px' } }}>
      <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: '#888', zIndex: 1 }}>健康矩阵</span>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {Array.from({ length: Math.floor(maxTick / step) * 2 + 1 }, (_, i) => (i - Math.floor(maxTick / step)) * step).map(t => {
          const r = t / maxTick;
          const x = pad.left + (r + 1) / 2 * chartW;
          const y = pad.top + (1 - (r + 1) / 2) * chartH;
          return (
            <g key={`g-${t}`}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke={t === 0 ? '#e0e0e0' : '#f0f0f0'} strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#222">{t > 0 ? '+' : ''}{Math.round(t * maxCost / maxTick)}%</text>
              <line x1={x} y1={pad.top} x2={x} y2={pad.top + chartH} stroke={t === 0 ? '#e0e0e0' : '#f0f0f0'} strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={x} y={H - 4} textAnchor="middle" fontSize={9} fill="#222">{t === 0 ? '0' : t}</text>
            </g>
          );
        })}
        <line x1={pad.left + chartW / 2} y1={pad.top} x2={pad.left + chartW / 2} y2={pad.top + chartH} stroke="#ddd" strokeWidth={1} />
        <line x1={pad.left} y1={pad.top + chartH / 2} x2={W - pad.right} y2={pad.top + chartH / 2} stroke="#ddd" strokeWidth={1} />
        <text x={W - pad.right + 60} y={H - 4} textAnchor="end" fontSize={10} fill="#444">延期天数</text>
        <text x={8} y={pad.top + chartH / 2} textAnchor="middle" fontSize={10} fill="#444" transform={`rotate(-90, 8, ${pad.top + chartH / 2})`}>成本偏差率</text>
        {data.map(d => {
          const cx = pad.left + chartW / 2 + (d.delayDays / maxDelay) * chartW / 2;
          const cy = pad.top + (1 - (d.costDeviation + maxCost) / (maxCost * 2)) * chartH;
          // 直径 = 15 + 每增加100万+5px，每减少100万-5px，以200万为基准
          const diff = d.contractAmount - 2000000;
          const dia = 15 + Math.floor(diff / 1000000) * 5 - Math.floor(Math.max(0, -diff) / 1000000) * 5;
          const r = Math.max(3, Math.min(25, Math.round(dia / 2)));
          const fillOpacity = Math.max(0.1, Math.min(0.5, d.resourceLoad / maxLoad * 0.4));
          return (
            <g key={d.name}>
              <circle cx={cx} cy={cy} r={r} fill={statusColors[d.status] || '#999'} fillOpacity={fillOpacity} stroke={statusColors[d.status] || '#999'} strokeWidth={2} opacity={0.8} />
              <text x={cx} y={cy - r - 4} textAnchor="middle" fontSize={8} fill="#222">{d.name.slice(0, 4)}</text>
              <text x={cx} y={cy + r + 10} textAnchor="middle" fontSize={8} fill="#222">{d.delayDays}d / {d.costDeviation.toFixed(1)}%</text>
            </g>
          );
        })}
      </svg>
    </Card>
  );
};

/* ============================================================
   报价数据加载（匹配 DeliveryDetail.tsx 逻辑）
   ============================================================ */
function loadQuotationGroups(quotationId: string) {
  if (quotationId === 'proj-003' || quotationId === 'proj-001' || quotationId === 'proj-005') {
    return { groups: mockProject.groups.map(g => ({ ...g, items: g.items.map(i => ({ ...i })) })), version: { warranty_rate: mockProject.current_version.warranty_rate, risk_rate: mockProject.current_version.risk_rate } };
  }
  return { groups: [], version: undefined };
}

/* ============================================================
   主组件
   ============================================================ */
const DeliveryAnalysis: React.FC = () => {
  const [fySelect, setFySelect] = useState('FY2526');
  useMockVersion();

  // ── 财年过滤（活跃期交集：与销售分析一致的逻辑）──
  const fyFiltered = useMemo(() => {
    const fyRange = parseFY(fySelect);
    return mockDeliveryProjects.filter(p => {
      const created = new Date(p.createdAt);
      const effectiveEnd = (p.status === '进行中' || p.status === '已延期')
        ? new Date()
        : new Date(p.updatedAt);
      return created <= fyRange.end && effectiveEnd >= fyRange.start;
    });
  }, [fySelect]);

  // ── 各项目延期天数 ──
  const projectDelayDays = useMemo(() => {
    const now = new Date();
    return fyFiltered.map(p => {
      let maxDelay = 0;
      for (const n of p.nodes) {
        if (n.status === 'completed') continue;
        const plannedEnd = new Date(n.plannedEndDate);
        const days = Math.round((now.getTime() - plannedEnd.getTime()) / (1000 * 60 * 60 * 24));
        if (days > maxDelay) maxDelay = days;
      }
      const name = splitLabel(p.clientName);
      return {
        name,
        value: maxDelay,
        color: maxDelay > 0 ? COLORS.danger : COLORS.success,
      };
    });
  }, [fyFiltered]);

  // ── 节点卡脖子分析（瓶颈识别）──
  const nodeBottleneck = useMemo(() => {
    const now = new Date();
    const delayed = new Array(15).fill(0);
    const reached = new Array(15).fill(0);
    const delayedProjects: string[][] = Array.from({ length: 15 }, () => []);

    for (const p of fyFiltered) {
      if (p.status !== '进行中' && p.status !== '已延期' && p.status !== '已完成') continue;
      const shortName = p.clientName.length > 4 ? p.clientName.slice(0, 4) : p.clientName;
      for (const n of p.nodes) {
        // 该项目是否已到达此节点（计划截止日已过，或节点已启动/完成）
        if (n.status === 'pending' && new Date(n.plannedEndDate) > now) continue;
        reached[n.nodeNo - 1]++;

        // 在该节点是否延期
        let isDelayed = n.status === 'delayed';
        if (!isDelayed && n.status !== 'completed') {
          const plannedEnd = new Date(n.plannedEndDate);
          if (plannedEnd < now) isDelayed = true;
        }
        if (isDelayed) { delayed[n.nodeNo - 1]++; delayedProjects[n.nodeNo - 1].push(shortName); }
      }
    }
    return NODE_NAMES.map((name, i) => ({
      name, value: delayed[i],
      subValue: delayed[i] > 0 ? reached[i] : undefined,
      tooltip: delayed[i] > 0 && delayedProjects[i].length > 0
        ? `${name}：${delayed[i]}/${reached[i]} 个项目\n${[...new Set(delayedProjects[i])].join('、')}`
        : undefined,
      color: delayed[i] > 0 ? (delayed[i] >= 2 ? COLORS.danger : '#e65100') : '#ccc',
    }));
  }, [fyFiltered]);

  // ── 利润分析数据（仅已完成项目总结的项目，按GP3偏差排序）──
  const profitChartData = useMemo(() => {
    const fyRange = parseFY(fySelect);
    const completed = fyFiltered.filter(p => {
      const n15 = p.nodes.find(n => n.nodeNo === 15);
      if (!n15 || n15.status !== 'completed') return false;
      const d = new Date(n15.actualDate || p.updatedAt);
      return d >= fyRange.start && d <= fyRange.end;
    });
    let totalEstWeighted = 0, totalActWeighted = 0, totalAmt = 0;
    const items: ProfitItem[] = completed.map(p => {
      const { groups, version } = loadQuotationGroups(p.quotationId);
      const { exTax, grandEstimated, estGP3 } = computeDeliveryEstGP3(p.contractAmount, groups, version);
      const actProfit = p.totalActualCost != null ? (exTax - p.totalActualCost) : undefined;
      const actGP3 = actProfit != null && exTax > 0 ? actProfit / exTax : undefined;
      const deviation = actGP3 != null ? actGP3 - estGP3 : 0;
      totalAmt += exTax;
      totalEstWeighted += exTax * estGP3;
      if (actGP3 != null) { totalActWeighted += exTax * actGP3; }
      return { name: splitLabel(p.clientName), estProfit: exTax - grandEstimated, estGP3, actProfit, actGP3, deviation };
    });
    items.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
    const avgEstGP3 = totalAmt > 0 ? totalEstWeighted / totalAmt : 0;
    const avgActGP3 = totalAmt > 0 ? totalActWeighted / totalAmt : 0;
    return { items, avgEstGP3, avgActGP3 };
  }, [fyFiltered, fySelect]);

  // ── 健康 KPI 卡片 ──
  const overviewItems = useMemo((): KpiCard[] => {
    const now = new Date();
    const fyRange = parseFY(fySelect);
    let totalDelayDays = 0, delayProjectCount = 0;
    let onTimeCompleted = 0, totalCompleted = 0;
    let costDevNumerator = 0, costDevDenominator = 0;

    // 财年活跃项目总数
    const totalCount = fyFiltered.length;
    const activeCount = fyFiltered.filter(p => {
      const n15 = p.nodes.find(n => n.nodeNo === 15);
      return n15?.status !== 'completed';
    }).length;
    const delayedCount = fyFiltered.filter(p => p.status === '已延期').length;
    const completedCount = fyFiltered.filter(p => {
      const n15 = p.nodes.find(n => n.nodeNo === 15);
      if (!n15 || n15.status !== 'completed') return false;
      const d = new Date(n15.actualDate || p.updatedAt);
      return d >= fyRange.start && d <= fyRange.end;
    }).length;
    const fmtKY = (v: number) => Math.round(v / 1000).toLocaleString() + 'K';
    let totalAmt = 0, activeAmt = 0, completedAmt = 0, delayedAmt = 0;
    for (const p of fyFiltered) {
      const exTax = Math.round(p.contractAmount / (1 + 0.13));
      totalAmt += exTax;
      const n15 = p.nodes.find(n => n.nodeNo === 15);
      if (n15?.status !== 'completed') activeAmt += exTax;
      if (p.status === '已延期') delayedAmt += exTax;
      if (n15?.status === 'completed') {
        const d = new Date(n15.actualDate || p.updatedAt);
        if (d >= fyRange.start && d <= fyRange.end) completedAmt += exTax;
      }
      // 加权延期天数：各项目最大延期天数的平均
      let maxDelay = 0;
      for (const n of p.nodes) {
        if (n.status === 'completed') continue;
        const plannedEnd = new Date(n.plannedEndDate);
        const days = Math.round((now.getTime() - plannedEnd.getTime()) / (1000 * 60 * 60 * 24));
        if (days > maxDelay) maxDelay = days;
      }
      if (maxDelay > 0) { totalDelayDays += maxDelay; delayProjectCount++; }

      // 节点按时完成率
      for (const n of p.nodes) {
        if (n.status === 'completed' || n.status === 'delayed') {
          totalCompleted++;
          if (n.actualDate && n.actualDate <= n.plannedEndDate) onTimeCompleted++;
        }
      }

      // 成本偏差率
      if (p.costStatus === 'approved' && p.totalActualCost != null) {
        const { groups, version } = loadQuotationGroups(p.quotationId);
        const { totalEstimated } = computeDeliveryEstGP3(p.contractAmount, groups, version);
        costDevNumerator += (p.totalActualCost - totalEstimated);
        costDevDenominator += totalEstimated;
      }
    }

    const avgDelay = delayProjectCount > 0 ? Math.round(totalDelayDays / delayProjectCount) : 0;
    const onTimeRate = totalCompleted > 0 ? Math.round(onTimeCompleted / totalCompleted * 100) : 100;
    const costDevRate = costDevDenominator > 0 ? (costDevNumerator / costDevDenominator * 100) : 0;

    return [
      { label: '项目总数', value: totalCount + '/' + fmtKY(totalAmt), color: COLORS.primary, icon: '📊' },
      { label: '进行中项目', value: activeCount + '/' + fmtKY(activeAmt), color: COLORS.primary, icon: '🚧' },
      { label: '已完成项目', value: completedCount + '/' + fmtKY(completedAmt), color: COLORS.success, icon: '✅' },
      { label: '延期项目', value: delayedCount + '/' + fmtKY(delayedAmt), color: delayedCount > 0 ? COLORS.danger : COLORS.success, icon: '🚨' },
      { label: '加权延期天数', value: `${avgDelay}天`, color: avgDelay > 0 ? COLORS.danger : COLORS.success, icon: '📅' },
      { label: '节点按时率', value: `${onTimeRate}%`, color: onTimeRate >= 80 ? COLORS.success : onTimeRate >= 50 ? '#e65100' : COLORS.danger, icon: '🎯' },
      { label: '成本偏差率', value: costDevDenominator > 0 ? `${costDevRate > 0 ? '+' : ''}${costDevRate.toFixed(1)}%` : '—', color: costDevRate <= 0 ? COLORS.success : COLORS.danger, icon: '💰' },
    ];
  }, [fyFiltered, fySelect]);

  // ── 甘特图数据（12个月时间线，仅显示在时间范围内的节点）──
  const ganttData = useMemo(() => {
    const now = new Date();
    const tlStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const tlEnd = new Date(now.getFullYear(), now.getMonth() + 6, 0);
    const DAY_MS = 1000 * 60 * 60 * 24;
    const totalDays = Math.round((tlEnd.getTime() - tlStart.getTime()) / DAY_MS);
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return d.toLocaleString('en', { month: 'short' });
    });
    const todayPos = Math.round((now.getTime() - tlStart.getTime()) / DAY_MS);
    const projectRows = fyFiltered.map(p => {
      const slots = p.nodes.map(n => {
        const startH = n.history.find(h => h.field === 'status' && h.newValue === 'in_progress');
        let start: Date, end: Date;
        if (n.status === 'completed') {
          start = startH ? new Date(startH.changedAt) : new Date(n.plannedStartDate);
          end = new Date(n.actualDate!);
        } else if (n.status === 'in_progress') {
          start = new Date(n.plannedStartDate);
          end = now;
        } else {
          start = new Date(n.plannedStartDate);
          end = new Date(n.plannedEndDate);
        }
        return { nodeNo: n.nodeNo, startDate: start, endDate: end, status: n.status };
      });
      return { name: p.clientName, slots };
    });
    return { tlStart, totalDays, months, todayPos, projectRows, DAY_MS };
  }, [fyFiltered]);

  // ── 气泡图数据 ──
  const bubbleData = useMemo(() => {
    const now = new Date();
    const items = fyFiltered.map(p => {
      let maxDelay = 0;
      for (const n of p.nodes) {
        if (n.status === 'completed') continue;
        const plannedEnd = new Date(n.plannedEndDate);
        const days = Math.round((now.getTime() - plannedEnd.getTime()) / (1000 * 60 * 60 * 24));
        if (days > maxDelay) maxDelay = days;
      }
      const { groups, version } = loadQuotationGroups(p.quotationId);
      const { exTax, totalEstimated } = computeDeliveryEstGP3(p.contractAmount, groups, version);
      const costDev = p.totalActualCost != null && totalEstimated > 0
        ? (p.totalActualCost - totalEstimated) / totalEstimated * 100 : 0;
      const projStart = new Date(p.createdAt);
      const projEnd = p.status === '已完成' ? new Date(p.updatedAt) : now;
      let concurrentAmt = 0;
      for (const other of fyFiltered) {
        if (other.id === p.id) continue;
        const oStart = new Date(other.createdAt);
        const oEnd = other.status === '已完成' ? new Date(other.updatedAt) : now;
        if (projStart <= oEnd && projEnd >= oStart) {
          const { exTax: oExTax } = computeDeliveryEstGP3(other.contractAmount, loadQuotationGroups(other.quotationId).groups, loadQuotationGroups(other.quotationId).version);
          concurrentAmt += oExTax;
        }
      }
      return {
        name: p.clientName,
        contractAmount: exTax,
        delayDays: maxDelay,
        costDeviation: costDev,
        status: p.status,
        resourceLoad: concurrentAmt,
      };
    });
    return items;
  }, [fyFiltered]);

  // ── 渲染 ──
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#0d1b2a' }}>交付分析</span>
        <FYSelector value={fySelect} onChange={setFySelect} />
      </div>

      {fyFiltered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#999', fontSize: 14 }}>
          当前财年暂无交付项目
        </div>
      ) : (
        <>
          <OverviewCards items={overviewItems} />

          <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 700, flexShrink: 0 }}>
              <ProfitChart data={profitChartData.items}
                avgEstGP3={profitChartData.avgEstGP3}
                avgActGP3={profitChartData.avgActGP3}
                height={300} chartWidth={780} contentOffset={30} />
              <VerticalBarChart title="延期天数" data={projectDelayDays}
                format="num" height={300} topN={15} barWidthRatio={0.5}
                maxBarWidth={28} chartWidth={780} contentOffset={30} hideAvgLine />
              <VerticalBarChart title="节点分析" data={nodeBottleneck}
                format="num" height={300} topN={15} barWidthRatio={0.5}
                maxBarWidth={28} chartWidth={780} contentOffset={30} hideAvgLine disableSort />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 0 }}>
              <div style={{ height: 610 }}>
                <ProjectGantt data={ganttData.projectRows}
                  tlStart={ganttData.tlStart} totalDays={ganttData.totalDays}
                  months={ganttData.months} todayPos={ganttData.todayPos} />
              </div>
              <div>
                <BubbleChart data={bubbleData} height={367} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DeliveryAnalysis;
