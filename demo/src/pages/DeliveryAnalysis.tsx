import React, { useState, useMemo } from 'react';
import { Card } from 'antd';
import { mockDeliveryProjects } from '../mockData';
import { useMockVersion } from '../utils/mockStore';
import { COLORS } from '../styles/constants';
import { computeDeliveryEstGP3 } from '../utils/calculations';
import { parseFY } from '../utils/fiscalYear';
import { fmtK, loadQuotationGroups } from '../utils/analysisShared';

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

/* ============================================================
   子组件 — 财年选择器
   ============================================================ */
const FYSelector: React.FC<{ value: string; onChange: (v: string) => void }> =
  ({ value, onChange }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        fontSize: 13, padding: '4px 12px', borderRadius: 4,
        border: 'none', background: 'transparent',
        cursor: 'pointer', outline: 'none', color: COLORS.textPrimary,
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
    {items.map(item => (
      <Card key={item.label} size="small"
        style={{
          flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}`,
          transition: 'box-shadow 0.2s, transform 0.15s',
        }}
        styles={{ body: { padding: '16px 12px', textAlign: 'center' as const } }}
        hoverable
      >
        <div style={{ fontSize: 20, marginBottom: 2 }}>{item.icon}</div>
        <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4, letterSpacing: 0.3 }}>
          {item.label}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: item.color, lineHeight: 1.2 }}>
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
      style={{ borderRadius: 8, border: cardBorder ? `1px solid ${COLORS.borderLight}` : 'none', background: cardBorder ? '#fff' : 'transparent', height: '100%', position: 'relative', boxShadow: 'none', width: '100%' }}
      styles={{ body: { padding: `${contentOffset}px 0 0 0`, height: '100%' } }}
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
   子组件 — 甘特节点（含 tooltip）
   ============================================================ */
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

/** 格式化日期为短格式 "M/d" */
const fmtShort = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

/** 节点状态标签 & 条颜色（三类：未开始/进行中/已完成） */
const GANTT_STATUS_COLOR: Record<string, string> = {
  pending: '#bbb', in_progress: COLORS.labelDark, delayed: COLORS.warning, completed: COLORS.success,
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

/** 单条甘特节点条（hover 提升到父组件） */
interface GanttHoverInfo {
  slot: GanttSlot;
  sx: number; ex: number; w: number;
  cy: number; barH: number; color: string;
}
const GanttNode: React.FC<{
  slot: GanttSlot;
  sx: number; ex: number; w: number;
  cy: number; barH: number;
  hovered: boolean;
  onHover: (info: GanttHoverInfo | null) => void;
}> = ({ slot, sx, ex, w, cy, barH, hovered, onHover }) => {
  const color = GANTT_STATUS_COLOR[slot.status] || '#bbb';
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
        fill="#fff" stroke={COLORS.border} strokeWidth={1} filter="url(#bubble-shadow)" />
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
   子组件 — 项目时间节点分布（甘特图）
   ============================================================ */
const ProjectGantt: React.FC<{
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
        <defs />
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
   子组件 — 气泡节点
   ============================================================ */
interface BubbleDataItem {
  name: string;
  contractAmount: number;
  delayDays: number;
  costDeviation: number;
  status: string;
  capacityPressure: number;
}

const fmtWan = (v: number) => Math.round(v / 10000).toLocaleString() + '万';

interface BubbleHoverInfo {
  item: BubbleDataItem;
  cx: number; cy: number; r: number;
  fillOpacity: number; color: string;
}

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
        fill="#fff" stroke={COLORS.border} strokeWidth={1} filter="url(#bubble-shadow)" />
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
   子组件 — 健康矩阵（气泡图）
   ============================================================ */
const BubbleChart: React.FC<{
  data: BubbleDataItem[];
  height?: number;
  /** 画布（viewBox）高度，默认与 height 相同。设大则 SVG 缩放显示，不裁剪边缘项目 */
  canvasHeight?: number;
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

/* ============================================================
   主组件
   ============================================================ */
const DeliveryAnalysis: React.FC = () => {
  const [fySelect, setFySelect] = useState('FY2526');
  useMockVersion();

  // ── 共享工具函数 ──
  /** 计算某项目的最大延期天数 */
  const calcMaxDelay = (p: typeof mockDeliveryProjects[number], now: Date) => {
    let maxDelay = 0;
    for (const n of p.nodes) {
      if (n.status === 'completed') continue;
      const plannedEnd = new Date(n.plannedEndDate);
      const days = Math.round((now.getTime() - plannedEnd.getTime()) / (1000 * 60 * 60 * 24));
      if (days > maxDelay) maxDelay = days;
    }
    return maxDelay;
  };
  /** 判断项目节点15是否已完成且在财年范围内 */
  const isNode15CompletedInFy = (p: typeof mockDeliveryProjects[number], fyRange: ReturnType<typeof parseFY>) => {
    const n15 = p.nodes.find(n => n.nodeNo === 15);
    if (!n15 || n15.status !== 'completed') return false;
    const d = new Date(n15.actualDate || p.updatedAt);
    return d >= fyRange.start && d <= fyRange.end;
  };

  // ── 缓存财年范围 ──
  const fyRange = useMemo(() => parseFY(fySelect), [fySelect]);

  // ── 财年过滤（活跃期交集：与销售分析一致的逻辑）──
  const fyFiltered = useMemo(() => {
    return mockDeliveryProjects.filter(p => {
      const created = new Date(p.createdAt);
      const effectiveEnd = (p.status === '进行中' || p.status === '已延期')
        ? new Date()
        : new Date(p.updatedAt);
      return created <= fyRange.end && effectiveEnd >= fyRange.start;
    });
  }, [fyRange]);

  // ── 各项目延期天数 ──
  const projectDelayDays = useMemo(() => {
    const now = new Date();
    return fyFiltered.map(p => {
      const maxDelay = calcMaxDelay(p, now);
      return {
        name: splitLabel(p.clientName),
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
      color: delayed[i] > 0 ? (delayed[i] >= 2 ? COLORS.danger : COLORS.warning) : '#ccc',
    }));
  }, [fyFiltered]);

  // ── 利润分析数据（仅已完成项目总结的项目，按GP3偏差排序）──
  const profitChartData = useMemo(() => {
    const completed = fyFiltered.filter(p => isNode15CompletedInFy(p, fyRange));
    const itemData = completed.map(p => {
      const { groups, version } = loadQuotationGroups(p.quotationId);
      const { exTax, grandEstimated, estGP3 } = computeDeliveryEstGP3(p.contractAmount, groups, version);
      const actProfit = p.totalActualCost != null ? (exTax - p.totalActualCost) : undefined;
      const actGP3 = actProfit != null && exTax > 0 ? actProfit / exTax : undefined;
      return { exTax, estGP3, actGP3, deviation: actGP3 != null ? actGP3 - estGP3 : 0, name: splitLabel(p.clientName), estProfit: exTax - grandEstimated };
    });
    const items: ProfitItem[] = itemData.map(d => ({ name: d.name, estProfit: d.estProfit, estGP3: d.estGP3, actProfit: d.actProfit, actGP3: d.actGP3, deviation: d.deviation }))
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
    const totalAmt = itemData.reduce((s, d) => s + d.exTax, 0);
    const avgEstGP3 = totalAmt > 0 ? itemData.reduce((s, d) => s + d.exTax * d.estGP3, 0) / totalAmt : 0;
    const actItems = itemData.filter(d => d.actGP3 != null);
    const avgActGP3 = actItems.length > 0 ? actItems.reduce((s, d) => s + d.exTax * d.actGP3!, 0) / actItems.reduce((s, d) => s + d.exTax, 0) : 0;
    return { items, avgEstGP3, avgActGP3 };
  }, [fyFiltered, fyRange]);

  // ── 健康 KPI 卡片 ──
  const overviewItems = useMemo((): KpiCard[] => {
    const now = new Date();
    let totalDelayDays = 0, delayProjectCount = 0;
    let onTimeCompleted = 0, totalCompleted = 0;
    let costDevNumerator = 0, costDevDenominator = 0;

    const totalCount = fyFiltered.length;
    const activeCount = fyFiltered.filter(p => p.nodes.find(n => n.nodeNo === 15)?.status !== 'completed').length;
    const delayedCount = fyFiltered.filter(p => p.status === '已延期').length;
    const completedCount = fyFiltered.filter(p => isNode15CompletedInFy(p, fyRange)).length;
    let totalAmt = 0, activeAmt = 0, completedAmt = 0, delayedAmt = 0;
    for (const p of fyFiltered) {
      const exTax = Math.round(p.contractAmount / (1 + 0.13));
      totalAmt += exTax;
      const n15Done = p.nodes.find(n => n.nodeNo === 15)?.status === 'completed';
      if (!n15Done) activeAmt += exTax;
      if (p.status === '已延期') delayedAmt += exTax;
      if (isNode15CompletedInFy(p, fyRange)) completedAmt += exTax;
      // 加权延期天数：各项目最大延期天数的平均
      const maxDelay = calcMaxDelay(p, now);
      if (maxDelay > 0) { totalDelayDays += maxDelay; delayProjectCount++; }

      // 节点按时完成率
      for (const n of p.nodes) {
        if (n.status === 'completed' || n.status === 'delayed') {
          totalCompleted++;
          if (n.actualDate && new Date(n.actualDate) <= new Date(n.plannedEndDate)) onTimeCompleted++;
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
      { label: '项目总数', value: fmtK(totalAmt) + ' / ' + totalCount, color: COLORS.primary, icon: '📊' },
      { label: '进行中项目', value: fmtK(activeAmt) + ' / ' + activeCount, color: COLORS.primary, icon: '🚧' },
      { label: '已完成项目', value: fmtK(completedAmt) + ' / ' + completedCount, color: COLORS.success, icon: '✅' },
      { label: '延期项目', value: fmtK(delayedAmt) + ' / ' + delayedCount, color: delayedCount > 0 ? COLORS.danger : COLORS.success, icon: '🚨' },
      { label: '加权延期天数', value: `${avgDelay}天`, color: avgDelay > 0 ? COLORS.danger : COLORS.success, icon: '📅' },
      { label: '节点按时率', value: `${onTimeRate}%`, color: onTimeRate >= 80 ? COLORS.success : onTimeRate >= 50 ? COLORS.warning : COLORS.danger, icon: '🎯' },
      { label: '成本偏差率', value: costDevDenominator > 0 ? `${costDevRate > 0 ? '+' : ''}${costDevRate.toFixed(1)}%` : '—', color: costDevRate <= 0 ? COLORS.success : COLORS.danger, icon: '💰' },
    ];
  }, [fyFiltered, fyRange]);

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
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const projectRows = fyFiltered.filter(p => {
      const n15 = p.nodes.find(n => n.nodeNo === 15);
      if (n15 && n15.status === 'completed') {
        const doneDate = n15.actualDate ? new Date(n15.actualDate) : new Date(p.updatedAt);
        return doneDate >= currentMonthStart;
      }
      return true;
    }).map(p => {
      const slots = p.nodes.map(n => {
        const startH = n.history.find(h => h.field === 'status' && h.newValue === 'in_progress');
        let start: Date, end: Date;
        if (n.status === 'completed') {
          start = startH ? new Date(startH.changedAt) : new Date(n.plannedStartDate);
          end = n.actualDate ? new Date(n.actualDate) : new Date(n.plannedEndDate);
        } else if (n.status === 'in_progress') {
          start = new Date(n.plannedStartDate);
          end = now;
        } else {
          start = new Date(n.plannedStartDate);
          end = new Date(n.plannedEndDate);
        }
        // 初始计划时间：从 history 中找最早的 plannedDate 变更前的值
        const planChanges = n.history.filter(h => h.field === 'plannedDate')
          .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
        const initStart = planChanges.length > 0
          ? new Date(planChanges[0].oldValue)
          : new Date(n.plannedStartDate);
        const initEnd = planChanges.length > 0
          ? new Date(planChanges[planChanges.length - 1].oldValue)
          : new Date(n.plannedEndDate);
        return { nodeNo: n.nodeNo, startDate: start, endDate: end, status: n.status,
          name: n.name, plannedStartDate: new Date(n.plannedStartDate),
          plannedEndDate: new Date(n.plannedEndDate), actualDate: n.actualDate ? new Date(n.actualDate) : undefined,
          initStartDate: initStart, initEndDate: initEnd };
      });
      return { name: p.clientName, slots };
    });
    return { tlStart, totalDays, months, todayPos, projectRows, DAY_MS };
  }, [fyFiltered]);

  // ── 所有 fyFiltered 项目的生命周期（用于甘特图负载压力线）──
  const projectLifecycles = useMemo(() => {
    const now = new Date();
    return fyFiltered.map(p => {
      const node1 = p.nodes.find(n => n.nodeNo === 1)!;
      const node15 = p.nodes.find(n => n.nodeNo === 15);
      const start = new Date(node1.plannedStartDate);
      // 已完成项目用实际完成日，未完成项目取 updatedAt / 末节点计划完成日 / now 三者最晚
      const end = node15?.actualDate
        ? new Date(node15.actualDate)
        : new Date(Math.max(
            new Date(p.updatedAt).getTime(),
            new Date(p.nodes[p.nodes.length - 1].plannedEndDate).getTime(),
            now.getTime()
          ));
      const { groups, version } = loadQuotationGroups(p.quotationId);
      const { exTax } = computeDeliveryEstGP3(p.contractAmount, groups, version);
      return { id: p.id, start, end, exTax };
    });
  }, [fyFiltered]);

  // ── 气泡图数据（仅含当前财年内完成节点15的项目）──
  // 产能压力：按实际时间窗口计算并行项目的时间加权贡献
  // 公式：加权金额 × (1 + k × max(0, 加权个数 - 1))，k=0.2，显示值/10000
  const bubbleData = useMemo(() => {
    const now = new Date();
    const k = 0.2;

    // 当前财年内完成(节点15)的项目
    const completed = fyFiltered.filter(p => isNode15CompletedInFy(p, fyRange));

    // 构建所有 fyFiltered 项目的实际生命周期（回顾性分析用实际完成时间）
    const lifecycles = new Map<string, { start: Date; end: Date; exTax: number }>();
    for (const p of fyFiltered) {
      const node1 = p.nodes.find(n => n.nodeNo === 1)!;
      const node15 = p.nodes.find(n => n.nodeNo === 15);
      // 实际开始 = 节点1计划开始（无实际开始日期字段时的最佳近似）
      const start = new Date(node1.plannedStartDate);
      // 实际结束 = 节点15实际完成（如有），否则使用最近更新时间或现在
      const end = node15?.actualDate
        ? new Date(node15.actualDate)
        : new Date(p.updatedAt);
      const { groups, version } = loadQuotationGroups(p.quotationId);
      const { exTax } = computeDeliveryEstGP3(p.contractAmount, groups, version);
      lifecycles.set(p.id, { start, end, exTax });
    }

    return completed.map(p => {
      const lc = lifecycles.get(p.id)!;
      const projDuration = lc.end.getTime() - lc.start.getTime();

      const maxDelay = calcMaxDelay(p, now);
      const { groups, version } = loadQuotationGroups(p.quotationId);
      const { exTax, totalEstimated } = computeDeliveryEstGP3(p.contractAmount, groups, version);
      const costDev = p.totalActualCost != null && totalEstimated > 0
        ? (p.totalActualCost - totalEstimated) / totalEstimated * 100 : 0;

      // 时间加权并行计算
      let weightedAmount = 0;
      let weightedCount = 0;

      for (const [otherId, otherLc] of lifecycles) {
        if (otherId === p.id) continue;

        const overlapStart = Math.max(lc.start.getTime(), otherLc.start.getTime());
        const overlapEnd = Math.min(lc.end.getTime(), otherLc.end.getTime());
        const overlapDuration = Math.max(0, overlapEnd - overlapStart);

        if (overlapDuration <= 0) continue;

        const overlapFrac = overlapDuration / projDuration;
        weightedAmount += otherLc.exTax * overlapFrac;
        weightedCount += overlapFrac;
      }

      const capacityRaw = weightedAmount * (1 + k * Math.max(0, weightedCount - 1));

      return {
        name: p.clientName,
        contractAmount: exTax,
        delayDays: maxDelay,
        costDeviation: costDev,
        status: p.status,
        capacityPressure: capacityRaw / 10000,
      };
    });
  }, [fyFiltered, fyRange]);

  // ── 渲染 ──
  // 左列每张卡片高度 = 边框2 + padding-top30 + SVG225 = 257px，间隔16px
  const CARD_BORDER = 2, CARD_PAD_TOP = 30, SVG_H = 225, GAP = 16;
  const CARD_TOTAL = CARD_BORDER + CARD_PAD_TOP + SVG_H; // 257
  const LEFT_COL_H = CARD_TOTAL * 3 + GAP * 2; // 803
  // 气泡图卡片
  const BUBBLE_PAD_TOP = 37; // 原22 + 15
  const BUBBLE_PAD_BOTTOM = 25; // 原10 + 15
  const BUBBLE_SVG_H = LEFT_COL_H - 2 - BUBBLE_PAD_TOP - BUBBLE_PAD_BOTTOM; // 739
  // 画布高度 = 左列总高 − 原始border(2) − 原始padding-bottom(10) − 原始padding-top(22) = 769
  // 再 − 原缩减30px + 标签下移合计25px = 764
  const BUBBLE_ORIG_PAD_TOP = 22, BUBBLE_ORIG_PAD_BOT = 10;
  const BUBBLE_CANVAS_SHRINK = 30; // 原高度缩减
  const BUBBLE_LABEL_OFFSET = 15 + 10; // "延期天数"标签两次下移
  const BUBBLE_CANVAS_H = LEFT_COL_H - 2 - BUBBLE_ORIG_PAD_BOT - BUBBLE_ORIG_PAD_TOP - BUBBLE_CANVAS_SHRINK + BUBBLE_LABEL_OFFSET; // 764
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark }}>交付分析</span>
        <FYSelector value={fySelect} onChange={setFySelect} />
      </div>

      {fyFiltered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: COLORS.textLight, fontSize: 14 }}>
          当前财年暂无交付项目
        </div>
      ) : (
        <>
          <OverviewCards items={overviewItems} />

          <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: '0 0 calc(3 / 7 * (100% - 96px) + 32px)' }}>
              <ProfitChart data={profitChartData.items}
                avgEstGP3={profitChartData.avgEstGP3}
                avgActGP3={profitChartData.avgActGP3}
                height={225} chartWidth={702} contentOffset={30} />
              <VerticalBarChart title="延期天数" data={projectDelayDays}
                format="num" height={225} topN={15} barWidthRatio={0.75}
                maxBarWidth={40} chartWidth={702} contentOffset={30} hideAvgLine padTop={27} padBottom={33} barLabelGap={10} />
              <VerticalBarChart title="节点分析" data={nodeBottleneck}
                format="num" height={225} topN={15} barWidthRatio={0.75}
                maxBarWidth={40} chartWidth={702} contentOffset={30} hideAvgLine padTop={27} padBottom={33} disableSort />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 0 }}>
              <BubbleChart data={bubbleData} height={BUBBLE_SVG_H} canvasHeight={BUBBLE_CANVAS_H} bodyPadTop={BUBBLE_PAD_TOP} bodyPadBottom={BUBBLE_PAD_BOTTOM} />
            </div>
          </div>

          {/* Row 4: 项目节点甘特图 */}
          <div style={{ minHeight: 750, marginTop: 26 }}>
            <ProjectGantt data={ganttData.projectRows}
              tlStart={ganttData.tlStart} totalDays={ganttData.totalDays}
              months={ganttData.months} todayPos={ganttData.todayPos}
              lifecycles={projectLifecycles}
              height={750} />
          </div>
        </>
      )}
    </div>
  );
};

export default DeliveryAnalysis;
