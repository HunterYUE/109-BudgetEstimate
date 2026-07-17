import React from 'react';
import { Card } from 'antd';
import { COLORS } from '../../styles/colors';
import { fmtK } from '../../utils/analysisShared';

/* ============================================================
   SV G 销售漏斗
   ============================================================ */
export interface FunnelProps {
  funnelData: { stage: string; count: number; amount: number; color: string }[];
  fyInfo: { count: number; amount: number };
  fyLead: { count: number; amount: number };
  fyOpp: { count: number; amount: number };
  fyWon: { count: number; amount: number };
  convInfo?: { count: number; amount: number };
  convLead?: { count: number; amount: number };
  convOpp?: { count: number; amount: number };
  convWon?: { count: number; amount: number };
}

export const SalesFunnel: React.FC<FunnelProps> = ({ funnelData, fyInfo, fyLead, fyOpp, fyWon, convInfo, convLead, convOpp, convWon }) => {
  // 四阶段可视化数据
  const stages = [
    { key: 'info', label: '信息', color: COLORS.textLight },
    { key: 'lead', label: '线索', color: COLORS.primary },
    { key: 'opp', label: '机会', color: COLORS.purple },
    { key: 'won', label: '赢单', color: COLORS.success },
  ] as const;

  // 漏斗几何参数
  const hs = [70, 70, 150];
  const angles = [60, 30, 20];
  const rad = angles.map(a => a * Math.PI / 180);
  const halfDeltas = rad.map((r, i) => Math.round(hs[i] * Math.tan(r)));
  const topW = 480;
  const pts = [{ x: 0, w: topW }];
  for (let i = 0; i < halfDeltas.length; i++) {
    pts.push({ x: pts[i].x + hs[i], w: pts[i].w - 2 * halfDeltas[i] });
  }
  pts.push({ x: pts[3].x, w: pts[3].w });

  // 汇总机会阶段（含投标/议价）
  const oppAgg = funnelData.filter(f => ['机会', '投标', '议价'].includes(f.stage));

  const stageMap: Record<string, string> = { info: '信息', lead: '线索', won: '中标' };
  const countFor = (key: string) => {
    if (key === 'opp') return oppAgg.reduce((s, f) => s + f.count, 0);
    const f = (funnelData||[]).find(f => f.stage === stageMap[key]);
    return f?.count || 0;
  };
  const amountFor = (key: string) => {
    if (key === 'opp') return oppAgg.reduce((s, f) => s + f.amount, 0);
    const f = (funnelData||[]).find(f => f.stage === stageMap[key]);
    return f?.amount || 0;
  };

  const fyData: Record<string, { count: number; amount: number }> = {
    info: fyInfo, lead: fyLead, opp: fyOpp, won: fyWon,
  };

  // 转化率使用 conv*（过去12个月），回退到 fy* 兼容
  const ci = convInfo || fyInfo, cl = convLead || fyLead, co = convOpp || fyOpp, cw = convWon || fyWon;
  const convData = [
    { key: 'lead', cnt: ci.count > 0 ? cl.count / ci.count * 100 : 0, amt: ci.amount > 0 ? cl.amount / ci.amount * 100 : 0 },
    { key: 'opp', cnt: cl.count > 0 ? co.count / cl.count * 100 : 0, amt: cl.amount > 0 ? co.amount / cl.amount * 100 : 0 },
    { key: 'won', cnt: co.count > 0 ? cw.count / co.count * 100 : 0, amt: co.amount > 0 ? cw.amount / co.amount * 100 : 0 },
  ];

  return (
    <div style={{ position: 'relative', padding: '12px 0' }}>
      <svg width="100%" height="360" viewBox="0 0 680 360" style={{ display: 'block' }}>
        <g transform="translate(250, 40)">
          {/* 漏斗填充 */}
          <polygon
            points={pts.map(p => `${-p.w / 2},${p.x} `).join('') +
              [...pts].reverse().map(p => `${p.w / 2},${p.x} `).join('')}
            fill="rgba(0, 80, 158, 0.12)" stroke="none"
          />

          {/* 轮廓线 - 左 */}
          {stages.slice(0, 3).map((st, idx) => (
            <line key={'l-' + st.key}
              x1={-pts[idx].w / 2} y1={pts[idx].x}
              x2={-pts[idx + 1].w / 2} y2={pts[idx + 1].x}
              stroke={st.color} strokeWidth={2.5} strokeLinecap="round" />
          ))}
          {/* 轮廓线 - 右 */}
          {stages.slice(0, 3).map((st, idx) => (
            <line key={'r-' + st.key}
              x1={pts[idx].w / 2} y1={pts[idx].x}
              x2={pts[idx + 1].w / 2} y2={pts[idx + 1].x}
              stroke={st.color} strokeWidth={2.5} strokeLinecap="round" />
          ))}

          {/* 顶边 / 底边 */}
          <line x1={-pts[0].w / 2} y1={0} x2={pts[0].w / 2} y2={0}
            stroke={COLORS.textLight} strokeWidth={2.5} strokeLinecap="round" />
          <line x1={-pts[3].w / 2} y1={pts[3].x} x2={pts[3].w / 2} y2={pts[3].x}
            stroke={COLORS.danger} strokeWidth={2.5} strokeLinecap="round" />

          {/* 阶段标注 */}
          {stages.map((st, idx) => {
            const halfW = pts[idx].w / 2;
            const y = pts[idx].x;
            const count = countFor(st.key);
            const amount = amountFor(st.key);
            const fyc = fyData[st.key]?.count || 0;
            const fya = fyData[st.key]?.amount || 0;
            const conv = convData.find(c => c.key === st.key);

            return (
              <g key={st.key}>
                {/* 水平分割线（虚线） */}
                {idx > 0 && idx < stages.length - 1 && (
                  <line x1={-halfW} y1={y} x2={halfW} y2={y}
                    stroke={st.color} strokeWidth={1.5} strokeDasharray="5,4" />
                )}
                {/* 引出线 */}
                <line x1={halfW} y1={y} x2={pts[0].w / 2 + 105} y2={y}
                  stroke={st.color} strokeWidth={1.5} strokeDasharray="4,3" />
                <circle cx={pts[0].w / 2 + 105} cy={y} r={3} fill={st.color} />

                {/* 阶段标签 */}
                <text x={pts[0].w / 2 + 105} y={y - 10}
                  fill={st.color} fontSize={13} fontWeight="700"
                  textAnchor="middle">{st.label}</text>
                {/* 当期数据（中标阶段不显示） */}
                {st.key !== 'won' && (
                  <text x={pts[0].w / 2 + 46} y={y + 14}
                    fill={COLORS.textSecondary} fontSize={11}
                    dominantBaseline="middle">{count}/{fmtK(amount)}</text>
                )}
                {/* 财年累计（中标阶段与红点对齐） */}
                <text x={pts[0].w / 2 + (st.key === 'won' ? 80 : 115)} y={y + 14}
                  fill={COLORS.primary} fontSize={11} fontWeight={600}
                  dominantBaseline="middle">{fyc}/{fmtK(fya)}</text>

                {/* 阶段间转化率（漏斗内居中） */}
                {conv && (
                  <text x={0} y={y + 14} fontSize={12} textAnchor="middle">
                    <tspan fill={COLORS.primary} fontWeight="600">{conv.cnt.toFixed(1)}%</tspan>
                    <tspan fill={COLORS.textLight}> / </tspan>
                    <tspan fill={COLORS.success} fontWeight="600">{conv.amt.toFixed(1)}%</tspan>
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

/* ============================================================
   竖状柱状图（SVG 绘制，显示前 N 名）
   ============================================================ */
export interface BarItem {
  name: string;
  value: number;
  subValue?: number;
  color?: string;
}

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
      {title && <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: COLORS.chartGray, zIndex: 1 }}>{title}</span>}
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} style={{ display: 'block' }}>
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
              <text x={W - pad.right + 2} y={tgtY + 3}
                textAnchor="start" fontSize={9} fill={COLORS.warning}>{targetLabel || fmtAxis(targetValue)}</text>
            </g>
          );
        })() : (!hideAvgLine && avg > 0 && data.some(d => d.value > 0) && (() => {
          const avgY = pad.top + (1 - avg / effectiveMax) * chartH;
          return (
            <g>
              <line x1={pad.left} y1={avgY} x2={W - pad.right} y2={avgY}
                stroke={COLORS.warning} strokeWidth={1} strokeDasharray="5,3" />
              <text x={W - pad.right + 2} y={avgY + 3}
                textAnchor="start" fontSize={9} fill={COLORS.warning}>{(() => {
                if (format === 'K') return fmtAxis(avg);
                if (format === '%') return avg.toFixed(1) + '%';
                return String(Math.round(avg));
              })()}</text>
            </g>
          );
        })())}

        {/* 柱子 */}
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
              <text x={cx} y={barTop - 18} textAnchor="middle" fontSize={10}
                fill={color} fontWeight={600}>{label}</text>
              {item.subValue != null && item.subValue > 0 && (
                <text x={cx} y={barTop - 6} textAnchor="middle" fontSize={9}
                  fill={COLORS.purple} fontWeight={600}>（{fmtK(item.subValue)}）</text>
              )}
              {!isZero && (
                <rect x={cx - barW / 2} y={barTop} width={barW} height={barH}
                  fill="none" stroke={color} strokeWidth={3} rx={0} ry={0} />
              )}
              <text x={cx} y={height - 10} textAnchor="middle" fontSize={10} fill={COLORS.textSecondary}>
                {item.name}
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
      style={{ borderRadius: 8, border: cardBorder ? `1px solid ${COLORS.borderLight}` : 'none', background: cardBorder ? '#fff' : 'transparent', height: '100%', position: 'relative', boxShadow: cardBorder ? 'none' : 'none' }}
      styles={{ body: { padding: `${contentOffset}px 0 0`, height: '100%' } }}
    >
      {chart}
    </Card>
  );
};
