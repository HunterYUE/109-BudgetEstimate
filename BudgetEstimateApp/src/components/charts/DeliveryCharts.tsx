import React, { useState, useMemo } from 'react';
import { Card } from 'antd';
import { COLORS } from '../../styles/colors';
import { fmtK } from '../../utils/analysisShared';

/* ============================================================
   类型定义
   ============================================================ */
export interface BarItem {
  name: string;
  value: number;
  subValue?: number;
  color?: string;
  tooltip?: string;
}

export interface ProfitItem {
  name: string;
  estProfit: number;
  estGP3: number;
  actProfit?: number;
  actGP3?: number;
  deviation: number;
}

interface GanttSlot {
  nodeNo: number;
  startDate: Date;
  endDate: Date;
  status: string;
  name: string;
  plannedStartDate: Date;
  plannedEndDate: Date;
  actualDate?: Date;
  /** 初始计划时间（第一次制定时的计划，从 history 推算，无变更时=当前计划） */
  initStartDate: Date;
  initEndDate: Date;
}

export interface BubbleDataItem {
  name: string;
  contractAmount: number;
  delayDays: number;
  costDeviation: number;
  status: string;
  capacityPressure: number;
}

interface GanttHoverInfo {
  slot: GanttSlot;
  sx: number; ex: number; w: number;
  cy: number; barH: number; color: string;
}

interface BubbleHoverInfo {
  item: BubbleDataItem;
  cx: number; cy: number; r: number;
  fillOpacity: number; color: string;
}

/* ============================================================
   工具
   ============================================================ */
/** 格式化日期为短格式 "M/d" */
const fmtShort = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

const fmtWan = (v: number) => Math.round(v / 10000).toLocaleString() + '万';

/** 节点状态标签 & 条颜色（三类：未开始/进行中/已完成） */
const GANTT_STATUS_COLOR: Record<string, string> = {
  pending: COLORS.barPending, in_progress: COLORS.purple, delayed: COLORS.purple, completed: COLORS.success,
};

/** 计算某节点的延期天数（与初始计划完成时间比） */
function calcNodeDelay(s: GanttSlot): number {
  if (s.status === 'completed') {
    if (!s.actualDate) return 0;
    return Math.max(0, Math.round((s.actualDate.getTime() - s.initEndDate.getTime()) / (1000 * 60 * 60 * 24)));
  }
  if (s.status === 'in_progress' || s.status === 'delayed') {
    return Math.max(0, Math.round((Date.now() - s.initEndDate.getTime()) / (1000 * 60 * 60 * 24)));
  }
  return 0;
}

/* ============================================================
   SVG 柱状图（增强版，支持 subValue / per-bar color）
   ============================================================ */
export const VerticalBarChart: React.FC<{
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
}> = ({ title, data, format = 'num', height = 220, topN = 10, contentOffset = 0, barWidthRatio = 0.55, maxBarWidth = 36, noCard, chartWidth = 460, disableSort, targetValue, targetLabel, padTop = 32, padBottom = 28, hideAvgLine, cardBorder = true, barLabelGap = 18 }) => {
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
  const pad = { top: padTop, bottom: padBottom, left: 6, right: 6 };
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
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} style={{ display: 'block' }}>
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

        {targetValue != null && targetValue > 0 ? (() => {
          const tgtY = pad.top + (1 - targetValue / effectiveMax) * chartH;
          return (
            <g>
              <line x1={pad.left} y1={tgtY} x2={W - pad.right} y2={tgtY}
                stroke={COLORS.warning} strokeWidth={1} strokeDasharray="5,3" />
              <text x={W - pad.right - 8} y={tgtY + 3}
                textAnchor="start" fontSize={9} fill={COLORS.warning}>{targetLabel || fmtAxis(targetValue)}</text>
            </g>
          );
        })() : (!hideAvgLine && avg > 0 && data.some(d => d.value > 0) && (() => {
          const avgY = pad.top + (1 - avg / effectiveMax) * chartH;
          return (
            <g>
              <line x1={pad.left} y1={avgY} x2={W - pad.right} y2={avgY}
                stroke={COLORS.warning} strokeWidth={1} strokeDasharray="5,3" />
              <text x={W - pad.right - 8} y={avgY + 3}
                textAnchor="start" fontSize={9} fill={COLORS.warning}>{(() => {
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
            <g key={item.name + '-' + i}>
              {item.tooltip && <title>{item.tooltip}</title>}
              <text x={cx} y={barTop - barLabelGap} textAnchor="middle" fontSize={9}
                fill={color} fontWeight={600}>{label}</text>
              {item.subValue != null && item.subValue > 0 && (
                <text x={cx} y={barTop - 6} textAnchor="middle" fontSize={9}
                  fill={COLORS.purple} fontWeight={600}>（{format === 'K' ? fmtK(item.subValue) : item.subValue}）</text>
              )}
              {!isZero && (
                <rect x={cx - barW / 2} y={barTop} width={barW} height={barH}
                  fill="none" stroke={color} strokeWidth={2.5} rx={0} ry={0} />
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
      </svg>
    </>
  );

  if (noCard) {
    return <div style={{ minHeight: '100%', position: 'relative', paddingTop: contentOffset }}>{chart}</div>;
  }

  return (
    <Card size="small"
      style={{ borderRadius: 8, border: cardBorder ? `1px solid ${COLORS.borderLight}` : ' none', background: cardBorder ? '#fff' : 'transparent', height: '100%', position: 'relative', boxShadow: 'none', width: '100%' }}
      styles={{ body: { padding: `${contentOffset}px 0 0 0`, height: '100%' } }}
    >
      {chart}
    </Card>
  );
};

/* ============================================================
   利润分组柱状图（概算 vs 实际）
   ============================================================ */
export const ProfitChart: React.FC<{
  data: ProfitItem[];
  avgEstGP3: number;
  avgActGP3?: number;
  height?: number;
  chartWidth?: number;
  contentOffset?: number;
}> = ({ data, avgEstGP3, avgActGP3, height = 300, chartWidth = 780, contentOffset = 30 }) => {
  const W = chartWidth;
  const pad = { top: 35, bottom: 35, left: 10, right: 8 };
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

  const fmtKNum = (v: number) => Math.round(v / 1000).toLocaleString();
  const fmtPct = (v: number) => (v * 100).toFixed(1);

  // 平均利润
  const avgEstProfit = slots.reduce((s, d) => s + d.estProfit, 0) / Math.max(slots.length, 1);
  const actSlots = slots.filter(d => d.actProfit != null);
  const avgActProfit = actSlots.length > 0 ? actSlots.reduce((s, d) => s + d.actProfit!, 0) / actSlots.length : 0;

  const avgEstY = pad.top + (1 - avgEstProfit / effectiveMax) * chartH;
  const avgActY = avgActProfit > 0 ? pad.top + (1 - avgActProfit / effectiveMax) * chartH : null;

  return (
    <Card size="small"
      style={{ borderRadius: 8, border: `1px solid ${COLORS.borderLight}`, background: '#fff', position: 'relative', width: '100%' }}
      styles={{ body: { padding: `${contentOffset}px 0 0 0` } }}
    >
      <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 10, color: COLORS.chartGray, zIndex: 1 }}>利润分析</span>
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} style={{ display: 'block' }}>
        {gridVals.map((gv, i) => {
          const y = pad.top + (1 - gv / effectiveMax) * chartH;
          return (
            <g key={`g-${i}`}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke={COLORS.borderLight} strokeWidth={1} />
              <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#aaa">{fmtK(gv)}</text>
            </g>
          );
        })}

        {/* 平均概算利润线（蓝色虚线） */}
        {avgEstProfit > 0 && (
          <g>
            <line x1={pad.left} y1={avgEstY} x2={W - 47} y2={avgEstY}
              stroke={COLORS.primary} strokeWidth={1} strokeDasharray="4,3" />
            <text x={W - 21} y={avgEstY - 1} textAnchor="middle" fontSize={9} fill={COLORS.primary}>
              <tspan x={W - 21} dy={0}>{fmtKNum(avgEstProfit)}</tspan>
              <tspan x={W - 21} dy={11}>（{(avgEstGP3 * 100).toFixed(1)}%）</tspan>
            </text>
          </g>
        )}

        {/* 平均实际利润线（紫色虚线） */}
        {avgActY != null && (
          <g>
            <line x1={pad.left} y1={avgActY} x2={W - 47} y2={avgActY}
              stroke={COLORS.purple} strokeWidth={1} strokeDasharray="4,3" />
            <text x={W - 21} y={avgActY - 1} textAnchor="middle" fontSize={9} fill={COLORS.purple}>
              <tspan x={W - 21} dy={0}>{fmtKNum(avgActProfit)}</tspan>
              <tspan x={W - 21} dy={11}>（{(avgActGP3! * 100).toFixed(1)}%）</tspan>
            </text>
          </g>
        )}

        {slots.map((item, i) => {
          const cx = pad.left + i * slotW + slotW / 2;
          const barW = Math.min(slotW * 0.75, 40);
          const estH = Math.max(2, (item.estProfit / effectiveMax) * chartH);
          const estTop = pad.top + chartH - estH;
          const hasAct = item.actProfit != null;
          const actH = hasAct ? Math.max(2, (item.actProfit! / effectiveMax) * chartH) : 0;

          return (
            <g key={item.name + '-' + i}>
              {/* 概算柱（蓝色虚线框） */}
              <rect x={cx - barW / 2} y={estTop} width={barW} height={estH}
                fill="none" stroke={COLORS.primary} strokeWidth={2.5} strokeDasharray="4,3" rx={0} ry={0} />

              {/* 概算标签：高柱外侧/低柱内侧 */}
              {estH >= actH ? (
                <>
                  <text x={cx} y={estTop - 10} textAnchor="middle" fontSize={9}
                    fill={COLORS.primary} fontWeight={600}>{fmtKNum(item.estProfit)}</text>
                  <text x={cx} y={estTop - 22} textAnchor="middle" fontSize={9}
                    fill={COLORS.primary}>{fmtPct(item.estGP3)}</text>
                </>
              ) : (
                <>
                  <text x={cx} y={estTop + 14} textAnchor="middle" fontSize={9}
                    fill={COLORS.primary} fontWeight={600}>{fmtKNum(item.estProfit)}</text>
                  <text x={cx} y={estTop + 26} textAnchor="middle" fontSize={9}
                    fill={COLORS.primary}>{fmtPct(item.estGP3)}</text>
                </>
              )}

              {/* 实际柱（紫色实线框，与概算柱重叠） */}
              {hasAct && (
                <>
                  <rect x={cx - barW / 2} y={pad.top + chartH - actH} width={barW} height={actH}
                    fill="none" stroke={COLORS.purple} strokeWidth={2.5} rx={0} ry={0} />
                  {/* 实际标签：高柱外侧/低柱内侧 */}
                  {actH >= estH ? (
                    <>
                      <text x={cx} y={(pad.top + chartH - actH) - 10} textAnchor="middle" fontSize={9}
                        fill={COLORS.purple} fontWeight={600}>{fmtKNum(item.actProfit!)}</text>
                      <text x={cx} y={(pad.top + chartH - actH) - 22} textAnchor="middle" fontSize={9}
                        fill={COLORS.purple}>{fmtPct(item.actGP3!)}</text>
                    </>
                  ) : (
                    <>
                      <text x={cx} y={(pad.top + chartH - actH) + 14} textAnchor="middle" fontSize={9}
                        fill={COLORS.purple} fontWeight={600}>{fmtKNum(item.actProfit!)}</text>
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
                      ? <tspan key={li} x={cx} y={height - 19}>{part}</tspan>
                      : <tspan key={li} x={cx} dy={11}>{part}</tspan>
                  )
                ) : (
                  <tspan x={cx} y={height - 11}>{item.name}</tspan>
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
   甘特子组件
   ============================================================ */

/** 单条甘特节点条（hover 提升到父组件） */
const GanttNode: React.FC<{
  slot: GanttSlot;
  sx: number; ex: number; w: number;
  cy: number; barH: number;
  hovered: boolean;
  onHover: (info: GanttHoverInfo | null) => void;
}> = ({ slot, sx, ex, w, cy, barH, hovered, onHover }) => {
  const color = slot.status === 'completed'
    ? GANTT_STATUS_COLOR.completed
    : (slot.status === 'in_progress' || slot.status === 'delayed')
    ? GANTT_STATUS_COLOR.in_progress
    : GANTT_STATUS_COLOR.pending;
  const active = slot.status === 'in_progress' || slot.status === 'delayed';
  const opacity = slot.status === 'completed' ? 1 : active ? 0.7 : 0.35;
  return (
    <g style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover({ slot, sx, ex, w, cy, barH, color })}
      onMouseLeave={() => onHover(null)}>
      {/* 透明捕获区 */}
      <rect x={sx} y={cy - 4} width={w} height={barH + 8} fill="transparent" stroke="none" />
      {/* 可见条 */}
      <rect x={sx} y={cy} width={w} height={barH} rx={0} ry={0}
        fill="none" stroke={color} strokeWidth={2.5} opacity={hovered ? 1 : opacity} />
      {w > 16 && (
        <text x={sx + w / 2} y={cy + barH / 2 + 2.5} textAnchor="middle" fontSize={7}
          fill={color} opacity={opacity} fontWeight={600}>{slot.nodeNo}</text>
      )}
    </g>
  );
};

/** 甘特 tooltip（单独渲染到 SVG 末尾，确保在最上层） */
const GanttTooltip: React.FC<{
  hovered: GanttHoverInfo | null;
  W: number; H: number;
}> = ({ hovered, W }) => {
  if (!hovered) return null;
  const { slot, sx, ex, cy, barH } = hovered;
  const delayDays = calcNodeDelay(slot);
  const tooltipW = 250, tooltipH = delayDays > 0 ? 105 : 80;
  let ttx = ex + 8;
  let tty = cy - tooltipH - 4;
  if (ttx + tooltipW > W - 6) ttx = sx - 8 - tooltipW;
  if (tty < 4) tty = cy + barH + 6;
  return (
    <g>
      <rect x={ttx} y={tty} width={tooltipW} height={tooltipH} rx={5} ry={5}
        fill="#fff" stroke={COLORS.border} strokeWidth={1} filter="url(#gantt-shadow)" />
      <polygon
        points={tty < cy
          ? `${ttx + 8},${tty + tooltipH} ${ttx + 4},${tty + tooltipH - 6} ${ttx + 12},${tty + tooltipH - 6}`
          : `${ttx + 8},${tty} ${ttx + 4},${tty + 6} ${ttx + 12},${tty + 6}`}
        fill="#fff" stroke={COLORS.border} strokeWidth={1} />
      <text x={ttx + 12} y={tty + 20} fontSize={12} fontWeight={700} fill={COLORS.textDark}>{slot.name.replace('\n', '')}</text>
      <line x1={ttx + 12} y1={tty + 27} x2={ttx + tooltipW - 12} y2={tty + 27} stroke={COLORS.borderLight} strokeWidth={1} />
      {/* 初始计划 */}
      <text x={ttx + 12} y={tty + 46} fontSize={11} fill={COLORS.textLight}>初始计划</text>
      <text x={ttx + tooltipW - 12} y={tty + 46} fontSize={11} fill="#444" textAnchor="end">
        {fmtShort(slot.initStartDate)} → {fmtShort(slot.initEndDate)}
      </text>
      {/* 更新计划 / 完成时间 */}
      <text x={ttx + 12} y={tty + 68} fontSize={11} fill={COLORS.textLight}>
        {slot.status === 'completed' ? '完成时间' : '更新计划'}
      </text>
      <text x={ttx + tooltipW - 12} y={tty + 68} fontSize={11} fill="#444" textAnchor="end">
        {slot.status === 'completed'
          ? `${fmtShort(slot.startDate)} → ${fmtShort(slot.endDate)}`
          : `${fmtShort(slot.plannedStartDate)} → ${fmtShort(slot.plannedEndDate)}`}
      </text>
      {/* 延期天数 */}
      {delayDays > 0 && (
        <>
          <text x={ttx + 12} y={tty + 90} fontSize={11} fill={COLORS.textLight}>延期天数</text>
          <text x={ttx + tooltipW - 12} y={tty + 90} fontSize={11} fill={COLORS.danger} textAnchor="end" fontWeight={600}>
            +{delayDays} 天
          </text>
        </>
      )}
    </g>
  );
};

/* ============================================================
   项目时间节点分布（甘特图）
   ============================================================ */
export const ProjectGantt: React.FC<{
  data: Array<{ name: string; slots: GanttSlot[] }>;
  tlStart: Date;
  totalDays: number;
  months: string[];
  todayPos: number;
  lifecycles: { id: string; start: Date; end: Date; exTax: number }[];
  height?: number;
}> = ({ data, tlStart, totalDays, months, todayPos, lifecycles, height = 500 }) => {
  const [hoveredGantt, setHoveredGantt] = useState<GanttHoverInfo | null>(null);
  const [lineX, setLineX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const W = 1800;
  const labelW = 70;
  const chartW = W - labelW;
  const projCount = Math.max(data.length, 1);
  const barH = 20;
  const rowGap = 10;
  const projH = barH + rowGap; // =26
  const baseH = 100;
  const H = Math.max(height, baseH + projCount * projH);

  const posX = (d: Date) => labelW + Math.max(0, Math.min(1, (d.getTime() - tlStart.getTime()) / (1000 * 60 * 60 * 24) / totalDays)) * chartW;
  const todayX = labelW + todayPos / totalDays * chartW;

  // ── 负载压力线 ──
  const loadInfo = useMemo(() => {
    if (lineX == null) return null;
    const dayOffset = (lineX - labelW) / chartW * totalDays;
    const lineDate = new Date(tlStart.getTime() + dayOffset * 86400000);
    const t = lineDate.getTime();
    let wAmt = 0, wCnt = 0;
    for (const lc of lifecycles) {
      if (t >= lc.start.getTime() && t <= lc.end.getTime()) {
        wAmt += lc.exTax;
        wCnt += 1;
      }
    }
    const k = 0.2;
    const raw = wAmt * (1 + k * Math.max(0, wCnt - 1));
    return { value: Math.round(raw / 10000), date: lineDate, count: wCnt };
  }, [lineX, lifecycles, tlStart, labelW, chartW, totalDays]);

  const svgToX = (clientX: number, svgEl: SVGSVGElement) => {
    const rect = svgEl.getBoundingClientRect();
    return (clientX - rect.left) * (W / rect.width);
  };

  return (
    <Card size="small" style={{ borderRadius: 8, border: `1px solid ${COLORS.borderLight}`, height: '100%' }} styles={{ body: { padding: '12px 0 0', height: '100%' } }}>
      <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: COLORS.chartGray, zIndex: 1 }}>项目节点</span>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', userSelect: 'none' }}
        onMouseDown={(e) => {
          const x = svgToX(e.clientX, e.currentTarget);
          if (x >= labelW && x <= W) { setLineX(x); setIsDragging(true); }
        }}
        onMouseMove={(e) => {
          if (!isDragging) return;
          const x = svgToX(e.clientX, e.currentTarget);
          setLineX(Math.max(labelW, Math.min(W, x)));
        }}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => { if (isDragging) setIsDragging(false); }}>
        <defs><filter id="gantt-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="1" dy="2" stdDeviation="2" flood-opacity="0.15" /></filter></defs>
        {Array.from({ length: 13 }, (_, i) => {
          const x = labelW + i / 12 * chartW;
          return (
            <g key={`m-${i}`}>
              <line x1={x} y1={42} x2={x} y2={H - 4} stroke={COLORS.borderLight} strokeWidth={1} />
              {i < 12 && <text x={x + chartW / 24 - 20} y={21} textAnchor="middle" fontSize={10} fill="#444">{months[i]}</text>}
            </g>
          );
        })}
        <line x1={todayX} y1={42} x2={todayX} y2={H - 4} stroke={COLORS.danger} strokeWidth={1} strokeDasharray="4,3" />
        {data.map((proj, pi) => {
          const cy = 48 + pi * projH;
          return (
            <g key={proj.name + '-' + pi}>
              <text fontSize={10} fill="#444">
                {proj.name.length > 4 ? (
                  <><tspan x={4} y={cy + barH / 2 - 4}>{proj.name.slice(0, 4)}</tspan><tspan x={4} y={cy + barH / 2 + 10}>{proj.name.slice(4)}</tspan></>
                ) : (
                  <tspan x={4} y={cy + barH / 2 + 4}>{proj.name}</tspan>
                )}
              </text>
              {proj.slots.map(s => {
                const sx = posX(s.startDate);
                const ex = posX(s.endDate);
                const w = Math.max(4, ex - sx);
                return (
                  <GanttNode key={s.nodeNo}
                    slot={s}
                    sx={sx} ex={ex} w={w}
                    cy={cy} barH={barH}
                    hovered={hoveredGantt?.slot.nodeNo === s.nodeNo && hoveredGantt?.cy === cy}
                    onHover={setHoveredGantt} />
                );
              })}
            </g>
          );
        })}
        {/* tooltip 末尾渲染 = 最上层 */}
        <GanttTooltip hovered={hoveredGantt} W={W} H={H} />
        {/* ── 负载压力虚线（最上层，无背景） ── */}
        {lineX != null && (
          <g>
            <line x1={lineX} y1={42} x2={lineX} y2={H - 4}
              stroke={COLORS.danger} strokeWidth={1} strokeDasharray="4,3"
              style={{ stroke: COLORS.purple }} />
            <text x={lineX} y={35} textAnchor="middle" fontSize={12} fill={COLORS.purple}
              stroke="#fff" strokeWidth={2.5} paintOrder="stroke">
              {loadInfo ? loadInfo.value.toLocaleString() : '—'}
            </text>
            <text x={lineX} y={35} textAnchor="middle" fontSize={12} fill={COLORS.purple}>
              {loadInfo ? loadInfo.value.toLocaleString() : '—'}
            </text>
          </g>
        )}
      </svg>
    </Card>
  );
};

/* ============================================================
   气泡子组件
   ============================================================ */

/** 单个气泡（hover 提升到父组件） */
const BubbleNode: React.FC<{
  item: BubbleDataItem;
  cx: number; cy: number; r: number;
  fillOpacity: number; color: string;
  hovered: boolean;
  onHover: (info: BubbleHoverInfo | null) => void;
}> = ({ item, cx, cy, r, fillOpacity, color, hovered, onHover }) => {
  return (
    <g style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover({ item, cx, cy, r, fillOpacity, color })}
      onMouseLeave={() => onHover(null)}>
      {/* 透明大区域方便鼠标捕获 */}
      <circle cx={cx} cy={cy} r={r + 10} fill="transparent" stroke="none" />
      {/* 气泡本体 */}
      <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={fillOpacity}
        stroke={color} strokeWidth={2.5} opacity={hovered ? 1 : 0.85}
        style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }} />
      {/* 标签始终显示 */}
      <text x={cx} y={cy - r - 4} textAnchor="middle" fontSize={9} fill="#222">
        {item.name.length > 4 ? item.name.slice(0, 4) : item.name}
      </text>
      <text x={cx} y={cy + r + 10} textAnchor="middle" fontSize={9} fill="#222">
        {item.delayDays}d / {item.costDeviation.toFixed(1)}%
      </text>
    </g>
  );
};

/** 气泡 tooltip（单独渲染到 SVG 末尾，确保在最上层） */
const BubbleTooltip: React.FC<{
  hovered: BubbleHoverInfo | null;
  W: number; CH: number;
}> = ({ hovered, W, CH }) => {
  if (!hovered) return null;
  const { item, cx, cy, r } = hovered;
  const tooltipW = 240, tooltipH = 140;
  let ttx = cx + r + 12;
  let tty = cy - 10;
  if (ttx + tooltipW > W - 6) ttx = cx - r - 12 - tooltipW;
  if (tty + tooltipH > CH - 6) tty = CH - 6 - tooltipH;

  const colorLabel =
    item.costDeviation > 0 ? COLORS.danger : item.costDeviation < 0 ? COLORS.success : COLORS.textSecondary;
  const delayLabel = item.delayDays > 0 ? `${item.delayDays} 天` : '0 天';

  return (
    <g>
      <rect x={ttx} y={tty} width={tooltipW} height={tooltipH} rx={5} ry={5}
        fill="#fff" stroke={COLORS.border} strokeWidth={1} filter="url(#gantt-shadow)" />
      <polygon
        points={ttx > cx
          ? `${ttx + 6},${tty + 16} ${ttx},${tty + 10} ${ttx + 6},${tty + 4}`
          : `${ttx + tooltipW - 6},${tty + 16} ${ttx + tooltipW},${tty + 10} ${ttx + tooltipW - 6},${tty + 4}`}
        fill="#fff" stroke={COLORS.border} strokeWidth={1} />
      <text x={ttx + 12} y={tty + 21} fontSize={12} fontWeight={700} fill={COLORS.textDark}>
        {item.name.length > 12 ? item.name.slice(0, 12) + '…' : item.name}
      </text>
      <line x1={ttx + 12} y1={tty + 29} x2={ttx + tooltipW - 12} y2={tty + 29} stroke={COLORS.borderLight} strokeWidth={1} />
      <text x={ttx + 12} y={tty + 49} fontSize={11} fill={COLORS.textLight}>合同金额</text>
      <text x={ttx + tooltipW - 12} y={tty + 49} fontSize={12} fill="#222" textAnchor="end" fontWeight={600}>
        {fmtWan(item.contractAmount)}
      </text>
      <text x={ttx + 12} y={tty + 72} fontSize={11} fill={COLORS.textLight}>延期天数</text>
      <text x={ttx + tooltipW - 12} y={tty + 72} fontSize={12} fill={item.delayDays > 0 ? COLORS.danger : COLORS.success} textAnchor="end" fontWeight={600}>
        {delayLabel}
      </text>
      <text x={ttx + 12} y={tty + 95} fontSize={11} fill={COLORS.textLight}>成本偏差率</text>
      <text x={ttx + tooltipW - 12} y={tty + 95} fontSize={12} fill={colorLabel} textAnchor="end" fontWeight={600}>
        {item.costDeviation > 0 ? '+' : ''}{item.costDeviation.toFixed(1)}%
      </text>
      <text x={ttx + 12} y={tty + 118} fontSize={11} fill={COLORS.textLight}>产能压力</text>
      <text x={ttx + tooltipW - 12} y={tty + 118} fontSize={12} fill={COLORS.purple} textAnchor="end" fontWeight={600}>
        {Math.round(item.capacityPressure).toLocaleString()}
      </text>
    </g>
  );
};

/* ============================================================
   健康矩阵（气泡图）
   ============================================================ */
export const BubbleChart: React.FC<{
  data: BubbleDataItem[];
  height?: number;
  /** 画布（viewBox）高度，默认与 height 相同。设大则 SVG 缩放显示，不裁剪边缘项目 */
  canvasHeight?: number;
  bodyPadTop?: number;
  bodyPadBottom?: number;
}> = ({ data, height = 300, canvasHeight, bodyPadTop = 37, bodyPadBottom = 25 }) => {
  const [hoveredBubble, setHoveredBubble] = useState<BubbleHoverInfo | null>(null);
  const W = 940;
  const H = height;
  const CH = canvasHeight ?? H;
  const pad = { top: 40, bottom: 32, left: 48, right: 24 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const maxDelay = Math.max(...data.map(d => d.delayDays), 1);
  const maxCost = Math.max(...data.map(d => Math.abs(d.costDeviation)), 1);
  const maxPressure = Math.max(...data.map(d => d.capacityPressure), 0.001);
  const statusColors: Record<string, string> = { '进行中': COLORS.primary, '已完成': COLORS.success, '已延期': COLORS.danger };
  const step = 15;
  const maxTick = Math.ceil(maxDelay / step) * step;

  return (
    <Card size="small" style={{ borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }} styles={{ body: { padding: `${bodyPadTop}px 0 ${bodyPadBottom}px` } }}>
      <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: COLORS.chartGray, zIndex: 1 }}>健康矩阵</span>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${CH}`} style={{ display: 'block' }}>
        <defs>
          <filter id="bubble-shadow" x="-10%" y="-10%" width="130%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.12)" />
          </filter>
        </defs>
        {Array.from({ length: Math.floor(maxTick / step) * 2 + 1 }, (_, i) => (i - Math.floor(maxTick / step)) * step).map(t => {
          const r = t / maxTick;
          const x = pad.left + (r + 1) / 2 * chartW;
          const y = pad.top + (1 - (r + 1) / 2) * chartH;
          return (
            <g key={`g-${t}`}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke={t === 0 ? '#e0e0e0' : COLORS.borderLight} strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#aaa">{t > 0 ? '+' : ''}{Math.round(t * maxCost / maxTick)}%</text>
              <line x1={x} y1={pad.top} x2={x} y2={pad.top + chartH} stroke={t === 0 ? '#e0e0e0' : COLORS.borderLight} strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={x} y={H - 4} textAnchor="middle" fontSize={9} fill="#aaa">{t === 0 ? '0' : t}</text>
            </g>
          );
        })}
        <line x1={pad.left + chartW / 2} y1={pad.top} x2={pad.left + chartW / 2} y2={pad.top + chartH} stroke="#ddd" strokeWidth={1} />
        <line x1={pad.left} y1={pad.top + chartH / 2} x2={W - pad.right} y2={pad.top + chartH / 2} stroke="#ddd" strokeWidth={1} />
        <text x={pad.left + chartW / 2} y={H + 21} textAnchor="middle" fontSize={12} fill="#444">延期天数</text>
        <text x={8} y={pad.top + chartH / 2} textAnchor="middle" fontSize={12} fill="#444" transform={`rotate(-90, 8, ${pad.top + chartH / 2})`}>成本偏差率</text>
        {data.map(d => {
          const cx = pad.left + chartW / 2 + (d.delayDays / maxDelay) * chartW / 2;
          const cy = pad.top + (1 - (d.costDeviation + maxCost) / (maxCost * 2)) * chartH;
          // 直径 = 15 + 每增加100万+5px，每减少100万-5px，以200万为基准
          const diff = d.contractAmount - 2000000;
          const dia = 15 + Math.floor(diff / 1000000) * 5 - Math.floor(Math.max(0, -diff) / 1000000) * 5;
          const r = Math.max(3, Math.min(25, Math.round(dia / 2)));
          const fillOpacity = Math.max(0.1, Math.min(0.6, (d.capacityPressure / maxPressure) * 0.5 + 0.1));
          return (
            <BubbleNode key={d.name}
              item={d}
              cx={cx} cy={cy} r={r}
              fillOpacity={fillOpacity}
              color={statusColors[d.status] || COLORS.textLight}
              hovered={hoveredBubble?.item.name === d.name}
              onHover={setHoveredBubble} />
          );
        })}
        {/* tooltip 末尾渲染 = 最上层 */}
        <BubbleTooltip hovered={hoveredBubble} W={W} CH={CH} />
      </svg>
    </Card>
  );
};
