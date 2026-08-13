import React, { useState, useMemo } from 'react';
import { Card } from 'antd';
import { COLORS } from '../../styles/colors';
import { fmtK, fmtKBase, type NodeDelayInfo } from '../../utils/analysisShared';

// ── 类型定义 ──
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
  baselineDate?: Date;
  /** 共享延期判定结果（由数据方用 getNodeDelay 计算） */
  delay: NodeDelayInfo;
}

export interface BubbleDataItem {
  name: string;
  contractAmount: number;
  delayDays: number;
  costDeviation: number;
  status: string;
  capacityPressure: number;
  /** 派生延期维度（getProjectDelay） */
  delayed: boolean;
}

interface GanttHoverInfo {
  slot: GanttSlot;
  projectKey: string;
  sx: number; ex: number; w: number;
  cy: number; barH: number; color: string;
}

interface BubbleHoverInfo {
  item: BubbleDataItem;
  cx: number; cy: number; r: number;
  fillOpacity: number; color: string;
}

// ── 工具 ──
/** 格式化日期为短格式 "YY-MM-DD" */
const fmtShort = (d: Date) => `${String(d.getFullYear()).slice(2)}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

/** 节点状态条颜色：未开始/进行中(含延期)/已完成 */
const GANTT_STATUS_COLOR: Record<string, string> = {
  pending: '#1a4f83', in_progress: '#593b73', completed: '#275d3e',
};

/**
 * ⚠️ B11：通用竖状柱状图已收敛至 components/charts/VerticalBarChart.tsx 单源
 * （SalesAnalysis 与 DeliveryAnalysis 共用）；此处仅保留利润分组柱状图特殊变体。
 */
// ── 利润分组柱状图（概算 vs 实际） ──
export const ProfitChart: React.FC<{
  data: ProfitItem[];
  height?: number;
  chartWidth?: number;
  contentOffset?: number;
}> = ({ data, height = 300, chartWidth = 780, contentOffset = 30 }) => {
  const W = chartWidth;
  const pad = { top: 25, bottom: 35, left: 36, right: 8 };
  const chartH = height - pad.top - pad.bottom;
  const slots = data.slice(0, 15);
  const maxN = 15;
  const slotW = (W - pad.left - pad.right) / maxN;
  const allValues = slots.flatMap(s => [s.estProfit, s.actProfit ?? 0]);
  const rawMax = Math.max(...allValues, 0);
  const rawMin = Math.min(...allValues, 0);
  // ⚠️ B3 修复：移植 VerticalBarChart #13 负数刻度算法——存在亏损（负利润）时按真实量程 [rawMin, rawMax] 铺开、
  //   0 基线按比例定位、负值柱向下探；纯正值路径与旧公式（zeroY=底部）完全一致，无视觉回归
  const hasNeg = rawMin < 0;
  const effectiveMax = hasNeg ? Math.max(rawMax - rawMin, 1) : Math.max(1, rawMax);
  /** 数值 → Y 坐标（含负值时 rawMax 在顶、rawMin 在底；纯正值时 0 在底） */
  const yOf = (v: number) => hasNeg
    ? pad.top + ((rawMax - v) / effectiveMax) * chartH
    : pad.top + (1 - v / effectiveMax) * chartH;
  const zeroY = yOf(0);
  const gridVals = hasNeg
    ? Array.from({ length: 5 }, (_, i) => rawMax - (i * effectiveMax) / 4)
    : (effectiveMax <= 10
      ? Array.from({ length: effectiveMax + 1 }, (_, i) => i).reverse()
      : Array.from({ length: 5 }, (_, i) => (effectiveMax * (4 - i)) / 4));

  const fmtPct = (v: number) => (v * 100).toFixed(1);

  return (
    <Card size="small"
      style={{ borderRadius: 8, border: `1px solid ${COLORS.borderLight}`, background: '#fff', position: 'relative', width: '100%', height: '100%' }}
      styles={{ body: { padding: `${contentOffset}px 0 0`, height: '100%' } }}
    >
      <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: COLORS.chartGray, zIndex: 1 }}>利润分析</span>
      <svg width="calc(100% - 30px)" height={height} viewBox={`0 0 ${W} ${height}`} style={{ display: 'block', margin: '0 auto' }}>
        {gridVals.map((gv, i) => {
          const y = yOf(gv);
          return (
            <g key={`g-${i}`}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke={COLORS.borderLight} strokeWidth={1} />
              <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#aaa">{fmtK(gv)}</text>
            </g>
          );
        })}

        {slots.map((item, i) => {
          const cx = pad.left + i * slotW + slotW / 2;
          const barW = Math.min(slotW * 0.75, 40);
          // ⚠️ B3 修复：负利润柱自 0 基线向下探（正值 barTop=zeroY-estH、负值 barTop=zeroY）——
          //   此前负值被当正值从底部上探，亏损项目表现为 0 高矮柱误导分析
          const estH = Math.max(2, (Math.abs(item.estProfit) / effectiveMax) * chartH);
          const estTop = item.estProfit >= 0 ? zeroY - estH : zeroY;
          const hasAct = item.actProfit != null;
          const actH = hasAct ? Math.max(2, (Math.abs(item.actProfit!) / effectiveMax) * chartH) : 0;
          const actTop = hasAct ? (item.actProfit! >= 0 ? zeroY - actH : zeroY) : 0;

          return (
            <g key={item.name + '-' + i}>
              {/* 概算柱（蓝色虚线框） */}
              <rect x={cx - barW / 2} y={estTop} width={barW} height={estH}
                fill="none" stroke={COLORS.primary} strokeWidth={2.5} strokeDasharray="4,3" rx={0} ry={0} />

              {/* 概算标签：高柱外侧/低柱内侧 */}
              {estH >= actH ? (
                <>
                  <text x={cx} y={estTop - 7} textAnchor="middle" fontSize={9}
                    fill={COLORS.primary} fontWeight={600}>{fmtKBase(item.estProfit)}</text>
                  <text x={cx} y={estTop - 17} textAnchor="middle" fontSize={9}
                    fill={COLORS.primary}>{fmtPct(item.estGP3)}</text>
                </>
              ) : (
                <>
                  <text x={cx} y={estTop + 14} textAnchor="middle" fontSize={9}
                    fill={COLORS.primary} fontWeight={600}>{fmtKBase(item.estProfit)}</text>
                  <text x={cx} y={estTop + 23} textAnchor="middle" fontSize={9}
                    fill={COLORS.primary}>{fmtPct(item.estGP3)}</text>
                </>
              )}

              {/* 实际柱（紫色实线框，与概算柱重叠） */}
              {hasAct && (
                <>
                  <rect x={cx - barW / 2} y={actTop} width={barW} height={actH}
                    fill="none" stroke={COLORS.purple} strokeWidth={2.5} rx={0} ry={0} />
                  {/* 实际标签：高柱外侧/低柱内侧 */}
                  {actH >= estH ? (
                    <>
                      <text x={cx} y={(actTop) - 7} textAnchor="middle" fontSize={9}
                        fill={COLORS.purple} fontWeight={600}>{fmtKBase(item.actProfit!)}</text>
                      <text x={cx} y={(actTop) - 17} textAnchor="middle" fontSize={9}
                        fill={COLORS.purple}>{fmtPct(item.actGP3!)}</text>
                    </>
                  ) : (
                    <>
                      <text x={cx} y={(actTop) + 14} textAnchor="middle" fontSize={9}
                        fill={COLORS.purple} fontWeight={600}>{fmtKBase(item.actProfit!)}</text>
                      <text x={cx} y={(actTop) + 23} textAnchor="middle" fontSize={9}
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
    </Card>
  );
};

// ── 甘特子组件 ──
/** 单条甘特节点条（hover 提升到父组件） */
const GanttNode: React.FC<{
  slot: GanttSlot;
  projectKey: string;
  sx: number; ex: number; w: number;
  cy: number; barH: number;
  onHover: (info: GanttHoverInfo | null) => void;
}> = ({ slot, projectKey, sx, ex, w, cy, barH, onHover }) => {
  const color = slot.status === 'completed'
    ? GANTT_STATUS_COLOR.completed
    : slot.status === 'in_progress'
    ? GANTT_STATUS_COLOR.in_progress
    : GANTT_STATUS_COLOR.pending;
  const delayDays = slot.delay.days;
  const showContent = w > 9;
  return (
    <g style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover({ slot, projectKey, sx, ex, w, cy, barH, color })}
      onMouseLeave={() => onHover(null)}>
      {/* 透明热区（完整覆盖 bar 区域，确保鼠标捕获） */}
      <rect x={sx} y={cy - 4} width={w} height={barH + 8} fill="transparent" stroke="none"
        pointerEvents="all" />
      {/* 可见条 */}
      <rect x={sx} y={cy} width={w} height={barH} rx={2} ry={2}
        fill={color} fillOpacity={0.5} />
      {showContent && (
        <text x={sx + w / 2} y={cy + barH / 2 + 3} textAnchor="middle" fontSize={8}
          fill={color} fontWeight={700}>{slot.nodeNo}</text>
      )}
      {showContent && delayDays !== 0 && (
        <text x={sx + w / 2} y={cy - 4} textAnchor="middle" fontSize={8}
          fill={delayDays > 0 ? COLORS.danger : delayDays < 0 ? COLORS.success : COLORS.textLight}
          fontWeight={400}>
          {delayDays > 0 ? `+${delayDays}d` : `${delayDays}d`}
        </text>
      )}
    </g>
  );
};

/** 甘特 tooltip（单独渲染到 SVG 末尾，确保在最上层） */
const GanttTooltip: React.FC<{
  hovered: GanttHoverInfo | null;
  W: number;
}> = ({ hovered, W }) => {
  if (!hovered) return null;
  const { slot, sx, ex, cy, barH } = hovered;
  const tooltipW = 180, tooltipH = 72;
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
      {/* 已完成节点→实际时间；未完成→最新计划；超期未完成→至今 */}
      {slot.status === 'completed' && slot.actualDate ? (
        <>
          <text x={ttx + 12} y={tty + 46} fontSize={11} fill={COLORS.textLight}>实际时间</text>
          <text x={ttx + tooltipW - 12} y={tty + 46} fontSize={11} fill="#444" textAnchor="end">
            {fmtShort(slot.startDate)}~{fmtShort(slot.actualDate)}
          </text>
        </>
      ) : slot.status === 'in_progress' ? (
        (() => {
          const overdue = new Date(slot.plannedEndDate) < new Date(); // 已超最新计划
          return (
            <>
              <text x={ttx + 12} y={tty + 46} fontSize={11} fill={overdue ? COLORS.danger : COLORS.textLight}>
                {overdue ? '超期进行' : '进行中'}
              </text>
              <text x={ttx + tooltipW - 12} y={tty + 46} fontSize={11} fill="#444" textAnchor="end">
                {fmtShort(slot.startDate)}~{overdue ? '至今' : fmtShort(slot.plannedEndDate)}
              </text>
            </>
          );
        })()
      ) : (
        <>
          <text x={ttx + 12} y={tty + 46} fontSize={11} fill={COLORS.textLight}>计划时间</text>
          <text x={ttx + tooltipW - 12} y={tty + 46} fontSize={11} fill="#444" textAnchor="end">
            {fmtShort(slot.plannedStartDate)}~{fmtShort(slot.plannedEndDate)}
          </text>
        </>
      )}
      {/* 基线参考 */}
      <text x={ttx + 12} y={tty + 66} fontSize={11} fill={COLORS.textLight}>基线计划</text>
      <text x={ttx + tooltipW - 12} y={tty + 66} fontSize={11} fill="#444" textAnchor="end">
        {slot.baselineDate ? `${fmtShort(slot.plannedStartDate)}~${fmtShort(slot.baselineDate)}` : '—'}
      </text>
    </g>
  );
};

// ── 项目时间节点分布（甘特图） ──
/** 甘特图项目行数据 */
interface GanttProject {
  name: string;
  slots: GanttSlot[];
  doneCount: number;
  totalCount: number;
  status: string;
  /** 派生延期维度（getProjectDelay） */
  delayed: boolean;
}

export const ProjectGantt: React.FC<{
  data: GanttProject[];
  tlStart: Date;
  totalDays: number;
  months: string[];
  todayPos: number;
  lifecycles: { projectId: string; exTax: number }[];
  height?: number;
}> = ({ data, tlStart, totalDays, months, todayPos, lifecycles, height = 500 }) => {
  const [hoveredGantt, setHoveredGantt] = useState<GanttHoverInfo | null>(null);
  const [lineX, setLineX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const W = 1800;
  const labelW = 105;
  const chartW = W - labelW;
  const projCount = Math.max(data.length, 1);
  const barH = 20;
  const rowGap = 28;
  const projH = barH + rowGap; // =48
  const baseH = 100;
  const H = Math.max(height, baseH + projCount * projH);
  /** 内容中心位置（行分隔线间的中点） */
  const rowCenter = (pi: number) => 73 +pi * projH + projH / 2;
  const posX = (d: Date) => {
    const ms = d.getTime() - tlStart.getTime();
    if (isNaN(ms)) return labelW;
    return labelW + Math.max(0, Math.min(1, ms / 86400000 / totalDays)) * chartW;
  };
  const todayX = labelW + todayPos / totalDays * chartW;

  // ── 交付负荷线 ──
  const loadInfo = useMemo(() => {
    if (lineX == null) return null;
    const dayOffset = (lineX - labelW) / chartW * totalDays;
    const lineDate = new Date(tlStart.getTime() + dayOffset * 86400000);
    const t = lineDate.getTime();
    // 交付负荷 = 时间线该时刻有节点活跃的所有项目的全额 exTax
    let wAmt = 0, wCnt = 0;
    for (const proj of data) {
      const hasActive = proj.slots.some(s => t >= s.startDate.getTime() && t <= s.endDate.getTime());
      if (hasActive) {
        const projExTax = lifecycles.find(lc => lc.projectId === proj.name)?.exTax || 0;
        wAmt += projExTax;
        wCnt++;
      }
    }
    const k = 0.2;
    const raw = wAmt * (1 + k * Math.max(0, wCnt - 1));
    return { value: Math.round(raw / 10000), date: lineDate, count: wCnt };
  }, [lineX, data, lifecycles, tlStart, labelW, chartW, totalDays]);

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
              <line x1={x} y1={67} x2={x} y2={H - 4} stroke={COLORS.borderLight} strokeWidth={1} />
              {i < 12 && <text x={x + chartW / 24} y={36} textAnchor="middle" fontSize={12} fill="#444">{months[i]}</text>}
            </g>
          );
        })}
        {/* 行分隔横线 */}
        {data.map((_proj, pi) => (
          <line key={'hr-' + pi} x1={labelW} y1={73 +(pi + 1) * projH} x2={W} y2={73 +(pi + 1) * projH}
            stroke={COLORS.borderLight} strokeWidth={1.5} opacity={0.9} />
        ))}
        <line x1={todayX} y1={67} x2={todayX} y2={H - 4} stroke={COLORS.danger} strokeWidth={1} strokeDasharray="4,3" />
        {data.map((proj, pi) => {
          const cy = rowCenter(pi) - barH / 2; // 居中于行分隔线之间
          const badgeCx = 22;
          const badgeR = 14;
          const badgeBg = proj.status === '已完成' ? '#e8f5e9' : proj.delayed ? '#ffebee' : '#e6f0fa';
          const badgeColor = proj.status === '已完成' ? COLORS.success : proj.delayed ? COLORS.danger : COLORS.primary;
          return (
            <g key={proj.name + '-' + pi}>
              {/* 先绘矩形条（底层），再绘标签（顶层） */}
              {proj.slots.map(s => {
                const sx = posX(s.startDate);
                const ex = posX(s.endDate);
                const w = Math.max(4, ex - sx);
                return (
                  <GanttNode key={s.nodeNo}
                    slot={s} projectKey={proj.name}
                    sx={sx} ex={ex} w={w}
                    cy={cy} barH={barH}
                    onHover={setHoveredGantt} />
                );
              })}
              {/* 完成度圆形徽标 */}
              <g>
                <circle cx={badgeCx} cy={rowCenter(pi)} r={badgeR} fill={badgeBg} />
                <text x={badgeCx} y={rowCenter(pi) + 4} textAnchor="middle" fontSize={9} fontWeight={700}
                  fill={badgeColor}>
                  {proj.doneCount}/{proj.totalCount}
                </text>
              </g>
              {/* 项目编号（右对齐） */}
              <text fontSize={11} fill="#444" textAnchor="end">
                {proj.name.length > 8 ? (
                  <><tspan x={labelW - 8} y={rowCenter(pi) - 4}>{proj.name.slice(0, 4)}</tspan><tspan x={labelW - 8} y={rowCenter(pi) + 10}>{proj.name.slice(4)}</tspan></>
                ) : (
                  <tspan x={labelW - 8} y={rowCenter(pi) + 4}>{proj.name}</tspan>
                )}
              </text>
            </g>
          );
        })}
        {/* tooltip 末尾渲染 = 最上层 */}
        <GanttTooltip hovered={hoveredGantt} W={W} />
        {/* ── 交付负荷虚线（最上层，无背景） ── */}
        {lineX != null && (
          <g>
            <line x1={lineX} y1={67} x2={lineX} y2={H - 4}
              stroke={COLORS.purple} strokeWidth={1} strokeDasharray="4,3" />
            <text x={lineX} y={60} textAnchor="middle" fontSize={11} fill={COLORS.purple} fontWeight={700}
              stroke="#fff" strokeWidth={2.5} paintOrder="stroke">
              {loadInfo ? loadInfo.value.toLocaleString() : '—'}
            </text>
          </g>
        )}
      </svg>
    </Card>
  );
};

// ── 气泡子组件 ──
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
      {/* 气泡本体 + 项目编号由 SVG title 展示 */}
      <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={fillOpacity}
        stroke={color} strokeWidth={2.5} opacity={hovered ? 1 : 0.85}
        style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }}>
        <title>{item.name}</title>
      </circle>
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
  const delayLabel = item.delayDays !== 0 ? `${item.delayDays} 天` : '0 天';

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
        {fmtK(item.contractAmount)}
      </text>
      <text x={ttx + 12} y={tty + 72} fontSize={11} fill={COLORS.textLight}>延期天数</text>
      <text x={ttx + tooltipW - 12} y={tty + 72} fontSize={12} fill={item.delayDays > 0 ? COLORS.danger : COLORS.success} textAnchor="end" fontWeight={600}>
        {delayLabel}
      </text>
      <text x={ttx + 12} y={tty + 95} fontSize={11} fill={COLORS.textLight}>成本偏差率</text>
      <text x={ttx + tooltipW - 12} y={tty + 95} fontSize={12} fill={colorLabel} textAnchor="end" fontWeight={600}>
        {item.costDeviation > 0 ? '+' : ''}{item.costDeviation.toFixed(1)}%
      </text>
      <text x={ttx + 12} y={tty + 118} fontSize={11} fill={COLORS.textLight}>并行压力</text>
      <text x={ttx + tooltipW - 12} y={tty + 118} fontSize={12} fill={COLORS.purple} textAnchor="end" fontWeight={600}>
        {Math.round(item.capacityPressure).toLocaleString()}
      </text>
    </g>
  );
};

// ── 健康矩阵（气泡图） ──
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
  const pad = { top: 40, bottom: 32, left: 68, right: 24 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const maxDelay = Math.max(...data.map(d => Math.abs(d.delayDays)), 1);
  // Y轴非对称缩放 + 封顶：正/负偏差分别取最大值（≤30%），避免单个异常点把整轴对称拉大、压平细节
  const Y_CAP = 30; // 成本偏差率轴封顶 ±30%
  const maxCostPos = Math.max(1, Math.min(Y_CAP, Math.max(...data.map(d => d.costDeviation), 0)));
  const maxCostNeg = Math.max(1, Math.min(Y_CAP, Math.max(...data.map(d => -d.costDeviation), 0)));
  const yTotal = maxCostPos + maxCostNeg;
  const maxPressure = Math.max(...data.map(d => d.capacityPressure), 0.001);
  /** 气泡颜色：已完成绿；未完成且延期中（派生）红；否则蓝 */
  const bubbleColor = (d: BubbleDataItem): string =>
    d.status === '已完成' ? COLORS.success : d.delayed ? COLORS.danger : COLORS.primary;
  const step = 15;
  const maxTick = Math.ceil(maxDelay / step) * step;
  // Y轴刻度独立计算（避免与X轴共用时，在小范围内重复取值）
  const yStep = (() => {
    const rough = Math.max(maxCostPos, maxCostNeg) / 3;
    if (rough <= 0.15) return 0.1;
    if (rough <= 0.3) return 0.2;
    if (rough <= 0.7) return 0.5;
    if (rough <= 1.5) return 1;
    if (rough <= 3) return 2;
    if (rough <= 7) return 5;
    if (rough <= 15) return 10;
    if (rough <= 30) return 20;
    return 50;
  })();
  /** Y 值 → 画布 y（正值区在顶部、负值区在底部，超出轴范围的极端点钳制到边缘） */
  const yPos = (v: number) => {
    const clamped = Math.max(-maxCostNeg, Math.min(maxCostPos, v));
    return pad.top + (1 - (clamped + maxCostNeg) / yTotal) * chartH;
  };
  // 正/负两侧刻度各自独立生成，合并后排序
  const yTicks: number[] = [];
  for (let i = 1; i * yStep <= maxCostPos; i++) yTicks.push(i * yStep);
  for (let i = 1; i * yStep <= maxCostNeg; i++) yTicks.push(-i * yStep);
  yTicks.push(0);
  yTicks.sort((a, b) => a - b);

  return (
    <Card size="small" style={{ borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }} styles={{ body: { padding: `${bodyPadTop}px 0 ${bodyPadBottom}px` } }}>
      <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: COLORS.chartGray, zIndex: 1 }}>健康矩阵</span>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${CH}`} style={{ display: 'block' }}>
        <defs>
          <filter id="bubble-shadow" x="-10%" y="-10%" width="130%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.12)" />
          </filter>
        </defs>
        {/* X轴网格 + 标签（延期天数） */}
        {Array.from({ length: Math.floor(maxTick / step) * 2 + 1 }, (_, i) => (i - Math.floor(maxTick / step)) * step).map(t => {
          const r = t / maxTick;
          const x = pad.left + (r + 1) / 2 * chartW;
          return (
            <g key={`xg-${t}`}>
              <line x1={x} y1={pad.top} x2={x} y2={pad.top + chartH} stroke={t === 0 ? '#e0e0e0' : COLORS.borderLight} strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={x} y={H - 4} textAnchor="middle" fontSize={9} fill="#aaa">{t === 0 ? '0' : t}</text>
            </g>
          );
        })}
        {/* Y轴网格 + 标签（成本偏差率，非对称刻度） */}
        {yTicks.map(t => {
          const y = yPos(t);
          return (
            <g key={`yg-${t}`}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke={t === 0 ? '#e0e0e0' : COLORS.borderLight} strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#aaa">{t > 0 ? '+' : ''}{t}%</text>
            </g>
          );
        })}
        <line x1={pad.left + chartW / 2} y1={pad.top} x2={pad.left + chartW / 2} y2={pad.top + chartH} stroke="#ddd" strokeWidth={1} />
        <line x1={pad.left} y1={yPos(0)} x2={W - pad.right} y2={yPos(0)} stroke="#ddd" strokeWidth={1} />
        <text x={pad.left + chartW / 2} y={H + 21} textAnchor="middle" fontSize={10} fill="#444">延期天数</text>
        <text x={8} y={pad.top + chartH / 2} textAnchor="middle" fontSize={10} fill="#444" transform={`rotate(-90, 24, ${pad.top + chartH / 2})`}>成本偏差率</text>
        {data.map(d => {
          const cx = pad.left + chartW / 2 + (d.delayDays / maxTick) * chartW / 2;
          const cy = yPos(d.costDeviation);
          // 直径 = 15 + (金额 - 200万) / 100万 × 5；半径 r = 直径/2，钳制 [3, 25]
          const diff = d.contractAmount - 2000000;
          const dia = 15 + diff / 1000000 * 5;
          const r = Math.max(3, Math.min(25, Math.round(dia / 2)));
          const fillOpacity = Math.max(0.1, Math.min(0.6, (d.capacityPressure / maxPressure) * 0.5 + 0.1));
          return (
            <BubbleNode key={d.name}
              item={d}
              cx={cx} cy={cy} r={r}
              fillOpacity={fillOpacity}
              color={bubbleColor(d)}
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
