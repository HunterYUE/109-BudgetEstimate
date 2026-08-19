import React, { useState, useLayoutEffect, useRef } from 'react';
import { Card } from 'antd';
import { COLORS } from '../../styles/colors';
import { fmtK } from '../../utils/analysisShared';
import { CHART_FONT } from '../../utils/chartFonts';
import { CHART_FRAME } from '../../utils/chartFrame';

/**
 * 竖状柱状图（SVG 绘制，显示前 N 名）
 * ⚠️ B11 修复：原 SalesCharts.tsx 与 DeliveryCharts.tsx 各有一份近 90 行的重复实现，收敛为单源。
 * 差异通过 props 化：padLeft/padRight（Y 轴留白）、hoverable（悬浮 tooltip）、centeredSvg（居中收窄）。
 */
export interface BarItem {
  name: string;
  value: number;
  subValue?: number;
  color?: string;
  tooltip?: string;
  /** 柱顶自定义多行文案（按 
 分行，替代格式化数值；值仍驱动柱高）——Dashboard 利润概览/新增机会/无数据态用 */
  displayValue?: string;
}

interface VerticalBarChartProps {
  title?: string;
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
  /** 负值柱最低点相对图底的上移量（px）；仅 hasNeg 且提供时启用（延期卡：负区压缩、柱底远离 X 标签） */
  negFloorGap?: number;
  /** Y 轴 0 刻度线相对比例定位的下移量（px，正值柱扩容）；仅 hasNeg 且提供时启用 */
  zeroYOffset?: number;
  hideAvgLine?: boolean;
  cardBorder?: boolean;
  barLabelGap?: number;
  /** 柱顶数值标签字号（默认取共享常量 CHART_FONT.VALUE=11） */
  valueFontSize?: number;
  /** X 轴标签字号（默认取共享常量 CHART_FONT.X=11） */
  xLabelFontSize?: number;
  /** Y 轴刻度/目标线标签字号（默认取共享常量 CHART_FONT.Y=10） */
  yLabelFontSize?: number;
  /** 分组间隔：groupGaps 中下标对应槽位之后插入 gapSize 额外间隙；baseGap 为所有相邻槽位基础间隙（Dashboard 分组卡用） */
  groupGaps?: number[];
  gapSize?: number;
  baseGap?: number;
  /** 数值字面后缀（追加到柱顶数值与 Y 刻度，如 %、K；配合 format='num' 使用） */
  unit?: string;
  /** Y 轴刻度数（默认 5 现有逻辑；Dashboard 用 3 = [max, max/2, 0]，中间刻度几何中点、标签取整） */
  yTickCount?: number;
  /** 值 ≤ 0 时不渲染柱体（仅保留数值/displayValue 标签）——Dashboard 原 CSS 柱体行为 */
  skipNonPositive?: boolean;
  /** X 轴标签颜色（默认 #444；Dashboard 原为 textSecondary #666） */
  xLabelColor?: string;
  /** 多行 X 轴标签第一行锚定到单行标签位置（height-5）实现水平对齐；默认 false 保持 height-19（两行块整体位于 SVG 内） */
  xLabelAlignFirstLine?: boolean;
  /** 柱体最小高度（默认 2；Dashboard 原 CSS 4px） */
  minBarH?: number;
  padLeft?: number;
  padRight?: number;
  /** 悬浮显示 item.tooltip（Delivery 用）；Sales 场景数据无 tooltip，保持关闭 */
  hoverable?: boolean;
  /** SVG 收窄居中（Delivery 用）；Sales 场景铺满容器 */
  centeredSvg?: boolean;
}

export const VerticalBarChart: React.FC<VerticalBarChartProps> = ({
  title, data, format = 'num', height = 220, topN = 10, contentOffset = 0,
  barWidthRatio = 0.55, maxBarWidth = 36, noCard, chartWidth, disableSort,
  targetValue, targetLabel, padTop = 32, padBottom = 28, hideAvgLine, negFloorGap, zeroYOffset,
  cardBorder = true, barLabelGap = 18, valueFontSize = CHART_FONT.VALUE, xLabelFontSize = CHART_FONT.X, yLabelFontSize = CHART_FONT.Y,
  padLeft = 42, padRight = 26,
  hoverable = false, centeredSvg = false,
  groupGaps, gapSize, baseGap, unit, yTickCount, skipNonPositive, xLabelColor = '#444', minBarH = 2, xLabelAlignFirstLine,
}) => {
  const [hoveredTip, setHoveredTip] = useState<{ lines: string[]; cx: number; barTop: number; chartW?: number } | null>(null);
  // ⚠️ 根因修复：App.css `.app-content svg { max-width: 100%; height: auto }` 使 SVG 渲染高 = 容器宽 x vbH / vbW，
  //   viewBox 宽若不等于容器实际宽则内容被等比缩放（Sales 排行卡默认 460 vs 容器约 376 -> scale 约 0.82：
  //   底部大量空白 + X 轴标签被压入柱体，height/padBottom 等参数全部「不生效」）。
  //   ResizeObserver 实测 SVG 渲染宽并同步为 viewBox 宽 -> 比例对齐 scale 约 1，height 属性精确生效。
  //   仅「未显式传 chartWidth」的图表启用（排行卡等默认场景，首帧用 460 兜底后一帧内修正，含响应式变宽）；
  //   显式传 chartWidth 的场景（Delivery/节点/月度/竞对等）保持既定 viewBox 缩放，零回归。
  const fixedW = chartWidth ?? 460;
  const adaptive = chartWidth === undefined;
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgW, setSvgW] = useState<number | null>(null);
  // 全图统一测量 SVG 实际渲染宽：自适应图（未传 chartWidth）用它把 viewBox 宽同步为渲染宽（scale≈1、
  //   height 精确生效）；固定 chartWidth 的图用它算有效缩放，供文字归一（见 textScale 注释）。
  //   useLayoutEffect 初测（getBoundingClientRect）保证首帧即用正确宽度，避免按默认 scale 渲染的闪烁。
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const w = el.getBoundingClientRect().width;
    if (w > 0) setSvgW(w);
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect?.width;
      if (cw && cw > 0) setSvgW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const working = disableSort ? data : [...data].sort((a, b) => b.value - a.value);
  const top = working.slice(0, topN);
  const rawMax = Math.max(...top.map(d => d.value), 0);
  const rawMin = Math.min(...top.map(d => d.value), 0);
  // ⚠️ 审计修复 #13：全负值数据（如某财年交付全部提前、延期天数均为负）此前 rawMax=0 → effectiveMax 归 1，
  //   Y 轴塌缩为误导性的 [1,0]、负值标签全部挤在底部；含负值时改按真实量程 [rawMin, rawMax] 铺开、
  //   0 基线按比例定位、负值柱向下探（正确表达「提前」方向）。纯正值路径维持原 effectiveMax（targetValue 参与缩放）。
  const hasNeg = rawMin < 0;
  const effectiveMax = hasNeg
    ? Math.max(rawMax - rawMin, 1)
    : Math.max(1, targetValue ? Math.max(rawMax, targetValue) : (rawMax > 0 ? rawMax : (format === '%' ? 100 : 1)));
  const avg = data.length > 0 ? data.reduce((s, d) => s + d.value, 0) / data.length : 0;
  const slots: (BarItem | null)[] = Array.from({ length: topN }, (_, i) => top[i] || null);

  const fmtAxis = (v: number): string => {
    if (format === 'K') return fmtK(v);
    if (format === '%') return v.toFixed(1) + '%';
    return String(Math.round(v)) + (unit ?? '');
  };

  const W = adaptive ? (svgW ?? fixedW) : fixedW;
  // ⚠️ 文字缩放归一：固定 chartWidth 的图 viewBox 等比缩放（scale<1）让文字随内容一起缩小，与自适应图
  //   （scale≈1）文字大小不一致（实测同一设计字号 10px 渲染出 7~10px 之差，排行/延期卡文字显得「放大」）。
  //   effectiveScale = 实际渲染宽 / viewBox 宽；textScale = 0.7/effectiveScale 乘到所有图内文字 fontSize，
  //   使任意 scale 下文字渲染尺寸统一为设计字号×0.7（柱顶/X 轴 7px、Y 轴 6.3px）——与固定 chartWidth 图
  //   既有的小字号视觉一致，且不受容器宽度变化影响。
  const effectiveScale = (svgW ?? W) / W;
  const textScale = 0.7 / effectiveScale;
  const pad = { top: padTop, bottom: padBottom, left: padLeft, right: padRight };
  const chartW = W - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  // 分组间隙：groupGaps 中下标对应槽位之后插入 gapSize 额外间隙，baseGap 为所有相邻槽位基础间隙（Dashboard 分组卡）
  const gaps = (groupGaps ?? []).filter(k => k < topN - 1); // ⚠️ 越界间隙不计入（防 totalGap 多扣槽宽）
  const baseG = baseGap ?? 0;
  const extraG = gapSize ?? 0;
  const totalGap = baseG * (topN - 1) + extraG * gaps.length;
  const slotW = Math.max((chartW - totalGap) / topN, 0); // ⚠️ 防 totalGap>chartW 时负槽宽
  const barW = Math.min(slotW * barWidthRatio, maxBarWidth);
  /** 槽位中心 x（含其前所有累积间隙） */
  const cxOf = (i: number): number => {
    let x = pad.left + i * slotW + slotW / 2;
    for (let k = 0; k < i; k++) {
      x += baseG;
      if (gaps.includes(k)) x += extraG;
    }
    return x;
  };
  /** 数值 → Y 坐标（含负值时 rawMax 在顶、rawMin 在底；纯正值时 0 在底、effectiveMax 在顶） */
  const yOf = (v: number) => hasNeg
    ? pad.top + ((rawMax - v) / effectiveMax) * chartH
    : pad.top + (1 - v / effectiveMax) * chartH;
  // 负值柱/0 线显式位移（延期卡「负区压缩、正区扩容」）：negFloorGap 抬高负柱最低点、zeroYOffset 下移 0 线。
  //   背景：生产数据正值 max 仅 5 天、负值深至 -160 天，比例 0 线贴顶（y≈55）、正值柱几乎不可见——
  //   各 10/30px 后负柱底 205、0 线 85（负区 120px、正区 35px），长负柱缩短 40px、正值柱获得 30px 空间。
  //   仅 hasNeg 且提供对应 prop 时启用；负区高度钳制 ≥24px 防平衡数据退化。
  const asymAxis = hasNeg && (negFloorGap != null || zeroYOffset != null);
  const negFloor = pad.top + chartH - (negFloorGap ?? 0);
  const zeroY = asymAxis
    ? Math.min(pad.top + ((rawMax - 0) / effectiveMax) * chartH + (zeroYOffset ?? 0), negFloor - 24)
    : yOf(0);
  // 柱/网格线/参考线坐标：非对称轴时正负值各按所在区段比例映射（正值区 [padTop,zeroY]、负值区 [zeroY,negFloor]）
  const yOfBar = (v: number) => asymAxis
    ? (v >= 0
        ? zeroY - (v / Math.max(rawMax, 1)) * Math.max(zeroY - pad.top, 1)
        : zeroY + (Math.abs(v) / Math.max(Math.abs(rawMin), 1)) * Math.max(negFloor - zeroY, 1))
    : yOf(v);
  const gridVals = hasNeg
    ? Array.from({ length: 5 }, (_, i) => rawMax - (i * effectiveMax) / 4) // ⚠️ 含负值时固定 5 档铺开量程（yTickCount 不生效，设计使然）
    : (yTickCount != null && yTickCount >= 2  // ⚠️ 防除零：yTickCount<2 时回退默认刻度（(yTickCount-1)=0 会得 NaN）
      ? Array.from({ length: yTickCount }, (_, i) => (effectiveMax * (yTickCount - 1 - i)) / (yTickCount - 1))
      : (effectiveMax <= 10
        ? Array.from({ length: effectiveMax + 1 }, (_, i) => i).reverse()
        : Array.from({ length: 5 }, (_, i) => (effectiveMax * (4 - i)) / 4)));
  // 非对称轴时确保 0 刻度线可见（用户跟踪其下移位置）
  const gridValsWithZero = asymAxis && !gridVals.includes(0) ? [...gridVals, 0] : gridVals;

  const chart = (
    <>
      {title && <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: COLORS.chartGray, zIndex: 1 }}>{title}</span>}
      <svg ref={svgRef} width={centeredSvg ? 'calc(100% - 30px)' : '100%'} height={height} viewBox={`0 0 ${W} ${height}`}
        style={{ display: 'block', overflow: 'visible', ...(adaptive ? { height } : {}), ...(centeredSvg ? { margin: '0 auto' } : {}) }}>
        {/* ⚠️ B11 复核：bar-shadow 唯一消费者是 tooltip（hoverable），原耦合到 centeredSvg——
            若 hoverable 与 centeredSvg 分离则引用缺失；改按 hoverable 定义 */}
        {hoverable && (
          <defs><filter id="bar-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="1" dy="2" stdDeviation="2" flood-opacity="0.15" /></filter></defs>
        )}
        {/* Y 轴网格线 + 标签 */}
        {gridValsWithZero.map((gv, i) => {
          const y = yOfBar(gv);
          return (
            <g key={`g-${i}`}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke={COLORS.borderLight} strokeWidth={1} />
              <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={yLabelFontSize * textScale} fill="#aaa">
                {fmtAxis(gv)}
              </text>
            </g>
          );
        })}

        {/* 目标线 或 平均值虚线 */}
        {targetValue != null && targetValue > 0 ? (() => {
          const tgtY = yOfBar(targetValue);
          return (
            <g>
              <line x1={pad.left} y1={tgtY} x2={W - pad.right} y2={tgtY}
                stroke={COLORS.warning} strokeWidth={1} strokeDasharray="5,3" />
              {/* ⚠️ B11 复核：targetLabel 缺省时回退显示格式化目标值（原实现 targetLabel || fmtAxis(targetValue)，
                  合并时误改为仅 targetLabel 存在才渲染——传 targetValue 不传 targetLabel 会丢目标线标签） */}
              <text x={W - pad.right - 8} y={tgtY + 3} textAnchor="start" fontSize={yLabelFontSize * textScale} fill={COLORS.warning}>
                {targetLabel || fmtAxis(targetValue)}
              </text>
            </g>
          );
        })() : (!hideAvgLine && avg > 0 && data.some(d => d.value > 0) && (() => {
          const avgY = yOfBar(avg);
          return (
            <g>
              <line x1={pad.left} y1={avgY} x2={W - pad.right} y2={avgY}
                stroke={COLORS.warning} strokeWidth={1} strokeDasharray="5,3" />
            </g>
          );
        })())}

        {/* 柱子 */}
        {slots.map((item, i) => {
          const cx = cxOf(i);
          if (!item) return <g key={`e-${i}`} />;

          // ⚠️ 审计修复 #13：正值自 0 基线向上、负值向下（提前交付不再是 0 高标签挤底部的误导形态）；
          //   纯正值路径 barTop 公式与既往一致（zeroY=底部 → pad.top+chartH-barH）
          const isNegBar = item.value < 0;
          const yTop = yOfBar(item.value);
          const barH = item.value === 0 ? 0 : Math.max(minBarH, Math.abs(yTop - zeroY));
          const color = item.color || (targetValue != null && targetValue > 0 ? (item.value >= targetValue ? COLORS.primary : COLORS.danger) : COLORS.primary);
          const showBar = barH > 0 && (!skipNonPositive || item.value > 0);
          const displayLines = item.displayValue != null ? item.displayValue.split('\n') : null;
          let label: string;
          if (displayLines) label = '';
          else if (item.value === 0) label = '—';
          else if (format === 'K') label = fmtK(item.value);
          else if (format === '%') label = `${item.value.toFixed(1)}%`;
          else label = `${item.value}${unit ?? ''}`;

          const barTop = Math.min(yTop, zeroY);

          return (
            <g key={item.name + '-' + i}
              onMouseEnter={hoverable && item.tooltip ? () => setHoveredTip({ lines: item.tooltip!.split('\n'), cx, barTop, chartW: W }) : undefined}
              onMouseLeave={hoverable ? () => setHoveredTip(null) : undefined}>
              {displayLines ? (
                displayLines.map((ln, li) => (
                  <text key={li} x={cx} y={(isNegBar ? barTop + barH + barLabelGap : barTop - barLabelGap) - (displayLines.length - 1 - li) * valueFontSize * 1.2 * textScale}
                    textAnchor="middle" fontSize={valueFontSize * textScale} fill={color} fontWeight={CHART_FONT.VALUE_WEIGHT}>{ln}</text>
                ))
              ) : (
                <text x={cx} y={isNegBar ? barTop + barH + barLabelGap : barTop - barLabelGap} textAnchor="middle" fontSize={valueFontSize * textScale}
                  fill={color} fontWeight={CHART_FONT.VALUE_WEIGHT}>{label}</text>
              )}
              {item.subValue != null && item.subValue > 0 && (
                <>
                {/* ⚠️ B8 修复：副值标签改为相对主值标签基线 +valueFontSize+2 定位——barLabelGap=10（延期天数图）
                    时旧公式 -10/-6 主副值 4px 重叠；barLabelGap=18（默认，销售分析/节点分析图）下与旧位置 barTop-6
                    完全一致，无视觉回归 */}
                <text x={cx} y={(isNegBar ? barTop + barH + barLabelGap : barTop - barLabelGap) + valueFontSize + 2}
                  textAnchor="middle" fontSize={valueFontSize * textScale}
                  fill={COLORS.purple} fontWeight={CHART_FONT.VALUE_WEIGHT}>（{format === 'K' ? fmtK(item.subValue) : item.subValue}）</text>
                </>
              )}
              {showBar && (
                // ⚠️ 柱体框线厚度与文字同源：strokeWidth 是 viewBox 坐标值，渲染厚度 = strokeWidth × SVG scale。
                //   全应用统一渲染 1.75px（设计值 CHART_FRAME.STROKE×0.7）：居中/自适应/固定卡不再区分默认 2.1px，
                //   与利润卡（CHART_FRAME.STROKE×textScale）同源一致。乘 textScale 后任意缩放下恒定。
                <rect x={cx - barW / 2} y={barTop} width={barW} height={barH}
                  fill="none" stroke={color} strokeWidth={CHART_FRAME.STROKE * textScale} rx={0} ry={0} />
              )}
              <text x={cx} textAnchor="middle" fontSize={xLabelFontSize * textScale} fill={xLabelColor}>
                {item.name.includes('\n') ? (
                  item.name.split('\n').map((part, li) =>
                    li === 0
                      ? <tspan key={li} x={cx} y={xLabelAlignFirstLine ? height - 5 : height - 19}>{part}</tspan>
                      : <tspan key={li} x={cx} dy={13 * textScale}>{part}</tspan> // 行距×textScale 归一（渲染恒 13×0.7≈9.1px，与数值多行行距一致）
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
          const containerW = hoveredTip.chartW || fixedW;
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
