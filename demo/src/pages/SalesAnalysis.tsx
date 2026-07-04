import React, { useState, useMemo } from 'react';
import { Card } from 'antd';
import { mockOpportunities, mockQuotationSummaries, mockDeliveryProjects, mockProject } from '../mockData';
import type { SalesOpportunity } from '../types';
import { parseReasons, REASON_TAXONOMY } from '../reasonTaxonomy';
import { useMockVersion } from '../utils/mockStore';
import { COLORS } from '../styles/constants';
import { computeDeliveryEstGP3 } from '../utils/calculations';
const fmtK = (v: number) => Math.round(v / 1000).toLocaleString() + 'K';

/* ============================================================
   常量
   ============================================================ */
const stageColors: Record<string, string> = {
  信息: '#999', 线索: COLORS.primary, 机会: COLORS.purple,
  投标: '#e65100', 议价: '#c76a00', 中标: COLORS.success,
};
const STAGES = ['信息', '线索', '机会', '投标', '议价', '中标'] as const;
const FY_OPTIONS = ['FY2425', 'FY2526', 'FY2627'] as const;

// localStorage 输入的 parseInt 保护
const safeParseInt = (val: string | undefined | null): number => {
  const n = parseInt(val ?? '', 10);
  return isNaN(n) ? 0 : n;
};

/* ============================================================
   财年工具函数
   ============================================================ */
const parseFY = (fy: string) => {
  const y1 = 2000 + parseInt(fy.slice(2, 4));
  const y2 = 2000 + parseInt(fy.slice(4, 6));
  return { start: new Date(y1, 6, 1), end: new Date(y2, 6, 0) };
};
const stageIdx = (s: string) => STAGES.indexOf(s as typeof STAGES[number]);

/** 加载报价编制数据（匹配交付详情页逻辑） */
function loadQuotationGroups(quotationId: string) {
  if (quotationId === 'proj-003' || quotationId === 'proj-001' || quotationId === 'proj-005') {
    return { groups: mockProject.groups.map(g => ({ ...g, items: g.items.map(i => ({ ...i })) })), version: { warranty_rate: mockProject.current_version.warranty_rate, risk_rate: mockProject.current_version.risk_rate } };
  }
  return { groups: [], version: undefined };
}

/** 根据财年过滤机会列表 */
function useFyFiltered(allOpps: SalesOpportunity[], fy: string) {
  return useMemo(() => {
    const fyRange = parseFY(fy);
    return allOpps.filter(o => {
      const created = new Date(o.createdAt);
      const effectiveEnd = (o.status === '过程中' || o.status === '冻结')
        ? new Date()
        : new Date(o.updatedAt);
      return created <= fyRange.end && effectiveEnd >= fyRange.start;
    });
  }, [allOpps, fy]);
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
      </Card>
    ))}
  </div>
);

/* ============================================================
   子组件 — SV G 销售漏斗
   ============================================================ */
interface FunnelProps {
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

const SalesFunnel: React.FC<FunnelProps> = ({ funnelData, fyInfo, fyLead, fyOpp, fyWon, convInfo, convLead, convOpp, convWon }) => {
  // 四阶段可视化数据
  const stages = [
    { key: 'info', label: '信息', color: '#999' },
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
    const f = funnelData.find(f => f.stage === stageMap[key]);
    return f?.count || 0;
  };
  const amountFor = (key: string) => {
    if (key === 'opp') return oppAgg.reduce((s, f) => s + f.amount, 0);
    const f = funnelData.find(f => f.stage === stageMap[key]);
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
            stroke="#999" strokeWidth={2.5} strokeLinecap="round" />
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
                    fill="#666" fontSize={11}
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
                    <tspan fill="#999"> / </tspan>
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
interface BarItem {
  name: string;
  value: number;
  subValue?: number;
  color?: string;
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
        {/* Y 轴网格线 + 标签 */}
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

        {/* 目标线 或 平均值虚线 */}
        {targetValue != null && targetValue > 0 ? (() => {
          const tgtY = pad.top + (1 - targetValue / effectiveMax) * chartH;
          return (
            <g>
              <line x1={pad.left} y1={tgtY} x2={W - pad.right} y2={tgtY}
                stroke="#e65100" strokeWidth={1} strokeDasharray="5,3" />
              <text x={W - pad.right + 2} y={tgtY + 3}
                textAnchor="start" fontSize={9} fill="#e65100">{targetLabel || fmtAxis(targetValue)}</text>
            </g>
          );
        })() : (!hideAvgLine && avg > 0 && data.some(d => d.value > 0) && (() => {
          const avgY = pad.top + (1 - avg / effectiveMax) * chartH;
          return (
            <g>
              <line x1={pad.left} y1={avgY} x2={W - pad.right} y2={avgY}
                stroke="#e65100" strokeWidth={1} strokeDasharray="5,3" />
              <text x={W - pad.right + 2} y={avgY + 3}
                textAnchor="start" fontSize={9} fill="#e65100">{(() => {
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
            <g key={item.name}>
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
              <text x={cx} y={height - 10} textAnchor="middle" fontSize={10} fill="#666">
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
      style={{ borderRadius: 8, border: cardBorder ? '1px solid #f0f0f0' : 'none', background: cardBorder ? '#fff' : 'transparent', height: '100%', position: 'relative', boxShadow: cardBorder ? 'none' : 'none' }}
      styles={{ body: { padding: `${contentOffset}px 0 0`, height: '100%' } }}
    >
      {chart}
    </Card>
  );
};

/* ============================================================ */

const SalesAnalysis: React.FC = () => {
  const [fySelect, setFySelect] = useState('FY2526');
  const allOpps = mockOpportunities;
  const fyFiltered = useFyFiltered(allOpps, fySelect);
  useMockVersion();

  // ── 年度订单指标 + 目标GP3 ──
  const [annualTargetInput, setAnnualTargetInput] = useState(() => localStorage.getItem('sa_annualTarget') || '');
  const [targetEditing, setTargetEditing] = useState(false);
  const targetRef = React.useRef<HTMLInputElement>(null);
  const [gp3Input, setGp3Input] = useState(() => localStorage.getItem('sa_targetGP3') || '');
  const [orderGp3Editing, setOrderGp3Editing] = useState(false);
  const orderGp3Ref = React.useRef<HTMLInputElement>(null);
  const [salesGp3Editing, setSalesGp3Editing] = useState(false);
  const salesGp3Ref = React.useRef<HTMLInputElement>(null);
  // ── 月度销售指标 ──
  const [annualSalesTarget, setAnnualSalesTarget] = useState(() => localStorage.getItem('sa_annualSalesTarget') || '');
  const [salesTargetEditing, setSalesTargetEditing] = useState(false);
  const salesTargetRef = React.useRef<HTMLInputElement>(null);
  const saveSalesTarget = (v: string) => { setAnnualSalesTarget(v); localStorage.setItem('sa_annualSalesTarget', v); };

  // 保存到 localStorage
  const saveAnnualTarget = (v: string) => { setAnnualTargetInput(v); localStorage.setItem('sa_annualTarget', v); };
  const saveGp3 = (v: string) => { setGp3Input(v); localStorage.setItem('sa_targetGP3', v); };

  // ── 月度订单数据（当月转交付项目的合同金额之和，按财年月汇总）──
  const monthlyOrderData = useMemo(() => {
    const fyRange = parseFY(fySelect);
    // 过滤在该财年内转交付的项目
    const inFy = mockDeliveryProjects.filter(p => {
      const d = new Date(p.createdAt);
      return d >= fyRange.start && d <= fyRange.end;
    });
    // 财年月：month=1 → 7月(Jul), month=12 → 6月(Jun)
    const byMonth = new Map<number, { amount: number; profit: number }>();
    for (const p of inFy) {
      const d = new Date(p.createdAt);
      const fyMonth = d.getMonth() < 6 ? d.getMonth() + 6 : d.getMonth() - 6;
      const prev = byMonth.get(fyMonth) || { amount: 0, profit: 0 };
      const { groups, version } = loadQuotationGroups(p.quotationId);
      const { exTax, grandEstimated } = computeDeliveryEstGP3(p.contractAmount, groups, version);
      const estProfit = exTax - grandEstimated;
      byMonth.set(fyMonth, { amount: prev.amount + p.contractAmount, profit: prev.profit + estProfit });
    }
    const MONTH_LABELS = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];
    return Array.from({ length: 12 }, (_, i) => {
      const m = byMonth.get(i);
      return {
        name: MONTH_LABELS[i],
        value: m ? m.amount : 0,
        subValue: m ? m.profit : undefined,
      };
    });
  }, [fySelect]);

  // ── 月度销售数据（已完成项目总结的交付项目按月汇总）──
  const monthlySalesData = useMemo(() => {
    const fyRange = parseFY(fySelect);
    const MONTH_LABELS = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];
    const byMonth = new Map<number, { amount: number; profit: number }>();
    for (const p of mockDeliveryProjects) {
      const node15 = p.nodes.find(n => n.nodeNo === 15);
      if (!node15 || (node15.status !== 'completed' && node15.status !== 'delayed')) continue;
      const completionDate = node15.actualDate || p.updatedAt;
      const d = new Date(completionDate);
      if (d < fyRange.start || d > fyRange.end) continue;
      const fyMonth = d.getMonth() < 6 ? d.getMonth() + 6 : d.getMonth() - 6;
      const prev = byMonth.get(fyMonth) || { amount: 0, profit: 0 };
      const { groups, version } = loadQuotationGroups(p.quotationId);
      const { exTax } = computeDeliveryEstGP3(p.contractAmount, groups, version);
      const actualProfit = p.totalActualCost != null ? (exTax - p.totalActualCost) : Math.round(exTax * 0.20);
      byMonth.set(fyMonth, { amount: prev.amount + exTax, profit: prev.profit + actualProfit });
    }
    return Array.from({ length: 12 }, (_, i) => {
      const m = byMonth.get(i);
      return { name: MONTH_LABELS[i], value: m ? m.amount : 0, subValue: m ? m.profit : undefined };
    });
  }, [fySelect]);

  // ── 共享：财年已过月数 ──
  const elapsedMonths = useMemo(() => {
    const now = new Date();
    const fyRange = parseFY(fySelect);
    if (now > fyRange.end) return 12;
    if (now < fyRange.start) return 0;
    const jsMonth = now.getMonth();
    return (jsMonth >= 6 ? jsMonth - 6 : jsMonth + 6) + 1;
  }, [fySelect]);

  // ── 销售累计 ──
  const salesCumulative = useMemo(() => {
    const cumulative = monthlySalesData.slice(0, elapsedMonths).reduce((s, m) => s + m.value, 0);
    const profitCumulative = monthlySalesData.slice(0, elapsedMonths).reduce((s, m) => s + (m.subValue || 0), 0);
    const parsedAnnualTarget = parseInt(annualSalesTarget, 10);
    const validAnnualTarget = !isNaN(parsedAnnualTarget) ? parsedAnnualTarget : 0;
    const avgMonthly = annualSalesTarget ? Math.round(validAnnualTarget * 1000 / 12) : 0;
    const expectedCumulative = avgMonthly * elapsedMonths;
    const gp3 = parseFloat(gp3Input) || 0;
    const annualProfitTarget = annualSalesTarget && gp3 ? Math.round(validAnnualTarget * gp3 / 100) : 0;
    const avgMonthlyProfit = annualProfitTarget ? Math.round(annualProfitTarget * 1000 / 12) : 0;
    const expectedProfitCumulative = avgMonthlyProfit * elapsedMonths;
    return { cumulative, expectedCumulative, profitCumulative, expectedProfitCumulative, annualProfitTarget };
  }, [monthlySalesData, annualSalesTarget, gp3Input, elapsedMonths]);

  // ── 月度订单累计 + 利润累计 ──
  const monthlyCumulative = useMemo(() => {
    const cumulative = monthlyOrderData.slice(0, elapsedMonths).reduce((s, m) => s + m.value, 0);
    const profitCumulative = monthlyOrderData.slice(0, elapsedMonths).reduce((s, m) => s + (m.subValue || 0), 0);
    const parsedTargetInput = parseInt(annualTargetInput, 10);
    const validTargetInput = !isNaN(parsedTargetInput) ? parsedTargetInput : 0;
    const avgMonthly = annualTargetInput ? Math.round(validTargetInput * 1000 / 12) : 0;
    const expectedCumulative = avgMonthly * elapsedMonths;

    const gp3 = parseFloat(gp3Input) || 0;
    const annualProfitTarget = annualTargetInput && gp3 ? Math.round(validTargetInput * gp3 / 100) : 0;
    const avgMonthlyProfit = annualProfitTarget ? Math.round(annualProfitTarget * 1000 / 12) : 0;
    const expectedProfitCumulative = avgMonthlyProfit * elapsedMonths;

    return { cumulative, expectedCumulative, profitCumulative, expectedProfitCumulative, elapsedMonths, annualProfitTarget, gp3 };
  }, [monthlyOrderData, annualTargetInput, gp3Input, elapsedMonths]);

  // ── 过去12个月范围（不随财年变化） ──
  const past12mRange = useMemo(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    const start = new Date(end);
    start.setFullYear(start.getFullYear() - 1);
    start.setDate(1);
    return { start, end };
  }, []);

  // ── 当前活跃管道（不过滤财年，仅 status='过程中'）──
  const currentPipeline = useMemo(() =>
    mockOpportunities.filter(o => o.status === '过程中'),
  []);

  // ── 过去12个月活跃的机会（用于转化率等）──
  const past12mOpps = useMemo(() => {
    const r = past12mRange;
    return mockOpportunities.filter(o => {
      const created = new Date(o.createdAt);
      const updated = new Date(o.updatedAt);
      return created <= r.end && updated >= r.start;
    });
  }, [past12mRange]);

  // ── 漏斗：当前快照 ──
  const funnelSnapshot = useMemo(() =>
    STAGES.map(stage => ({
      stage,
      count: currentPipeline.filter(o => o.stage === stage).length,
      amount: currentPipeline.filter(o => o.stage === stage).reduce((s, o) => s + o.amount, 0),
      color: stageColors[stage] || '#999',
    })), [currentPipeline]);

  // ── 中标（按赢单时间 updatedAt 归入财年）──
  const fyWonByTime = useMemo(() => {
    const fyRange = parseFY(fySelect);
    return mockOpportunities.filter(o => {
      if (o.status !== '赢') return false;
      const d = new Date(o.updatedAt);
      return d >= fyRange.start && d <= fyRange.end;
    });
  }, [fySelect]);

  // ── 订单加权 GP3（财年内交付项目的加权平均 GP3，取自交付管理概算 GP3）──
  const orderWeightedGP3 = useMemo(() => {
    const fyRange = parseFY(fySelect);
    const inFy = mockDeliveryProjects.filter(p => {
      const d = new Date(p.createdAt);
      return d >= fyRange.start && d <= fyRange.end;
    });
    if (inFy.length === 0) return 0;
    let totalAmt = 0, weighted = 0;
    for (const p of inFy) {
      const { groups, version } = loadQuotationGroups(p.quotationId);
      const { estGP3 } = computeDeliveryEstGP3(p.contractAmount, groups, version);
      totalAmt += p.contractAmount;
      weighted += p.contractAmount * estGP3;
    }
    return totalAmt > 0 ? (weighted / totalAmt * 100) : 0;
  }, [fySelect]);

  // ── 已交付项目实际 GP3（已完成项目总结且成本审批通过的项目的加权平均实际 GP3）──
  const deliveredActualGP3 = useMemo(() => {
    const fyRange = parseFY(fySelect);
    const delivered = mockDeliveryProjects.filter(p => {
      const d = new Date(p.createdAt);
      if (d < fyRange.start || d > fyRange.end) return false;
      const node15 = p.nodes.find(n => n.nodeNo === 15);
      if (!node15 || (node15.status !== 'completed' && node15.status !== 'delayed')) return false;
      if (p.costStatus !== 'approved' || !p.totalActualCost) return false;
      return true;
    });
    if (delivered.length === 0) return 0;
    let totalAmt = 0, weighted = 0;
    for (const p of delivered) {
      totalAmt += p.contractAmount;
      const actProfit = p.contractAmount - p.totalActualCost;
      const actGP3 = p.contractAmount > 0 ? actProfit / p.contractAmount : 0;
      weighted += p.contractAmount * actGP3;
    }
    return totalAmt > 0 ? (weighted / totalAmt * 100) : 0;
  }, [fySelect]);

  // ── 漏斗右侧 FY 累计用 ──
  const fyWon = useMemo(() => ({
    count: fyWonByTime.length,
    amount: fyWonByTime.reduce((s, o) => s + o.amount, 0),
  }), [fyWonByTime]);

  // ── 输单（按输单时间 updatedAt 归入财年）──
  const fyLostByTime = useMemo(() => {
    const fyRange = parseFY(fySelect);
    return mockOpportunities.filter(o => {
      if (o.status !== '输') return false;
      const d = new Date(o.updatedAt);
      return d >= fyRange.start && d <= fyRange.end;
    });
  }, [fySelect]);

  // ── 财年各阶段汇总（用于漏斗右侧 FY 累计显示）──
  const fyInfo = useMemo(() => {
    const inFy = mockOpportunities.filter(o => {
      const fyRange = parseFY(fySelect);
      const created = new Date(o.createdAt);
      const updated = new Date(o.updatedAt);
      const effectiveEnd = (o.status === '过程中' || o.status === '冻结') ? new Date() : updated;
      return created <= fyRange.end && effectiveEnd >= fyRange.start;
    });
    return { count: inFy.length, amount: inFy.reduce((s, o) => s + o.amount, 0) };
  }, [fySelect]);

  const fyLead = useMemo(() => {
    const items = fyFiltered.filter(o => stageIdx(o.stage) >= stageIdx('线索') || o.status === '赢');
    return { count: items.length, amount: items.reduce((s, o) => s + o.amount, 0) };
  }, [fyFiltered]);

  const fyOpp = useMemo(() => {
    const items = fyFiltered.filter(o => stageIdx(o.stage) >= stageIdx('机会') || o.status === '赢');
    return { count: items.length, amount: items.reduce((s, o) => s + o.amount, 0) };
  }, [fyFiltered]);

  // ── 过去12个月各阶段汇总（用于转化率）──
  const p12mInfo = useMemo(() => ({
    count: past12mOpps.length,
    amount: past12mOpps.reduce((s, o) => s + o.amount, 0),
  }), [past12mOpps]);

  const p12mLead = useMemo(() => {
    const items = past12mOpps.filter(o => stageIdx(o.stage) >= stageIdx('线索') || o.status === '赢');
    return { count: items.length, amount: items.reduce((s, o) => s + o.amount, 0) };
  }, [past12mOpps]);

  const p12mOpp = useMemo(() => {
    const items = past12mOpps.filter(o => stageIdx(o.stage) >= stageIdx('机会') || o.status === '赢');
    return { count: items.length, amount: items.reduce((s, o) => s + o.amount, 0) };
  }, [past12mOpps]);

  const p12mWon = useMemo(() => {
    const items = past12mOpps.filter(o => o.status === '赢');
    return { count: items.length, amount: items.reduce((s, o) => s + o.amount, 0) };
  }, [past12mOpps]);

  // ── 关键指标 ──
  const kpi = useMemo(() => {
    const pipelineOpps = currentPipeline.filter(o => stageIdx(o.stage) >= stageIdx('机会'));
    // 加权管道：当前活跃管道
    let totalWeighted = 0;
    let totalProfit = 0;
    for (const o of pipelineOpps) {
      const weightedAmt = Math.round(o.amount * o.winRate / 100);
      totalWeighted += weightedAmt;
      const q = o.quotationId ? mockQuotationSummaries.find(q => q.id === o.quotationId) : undefined;
      const profitRate = q ? q.profitRate / 100 : 0.15;
      totalProfit += Math.round(weightedAmt * profitRate);
    }
    const weightedPipeline = totalWeighted;
    const weightedProfit = totalProfit;
    const weightedProfitRate = weightedPipeline > 0 ? (totalProfit / totalWeighted * 100) : 0;
    // 以下为过去12个月滚动数据
    const p12mWonOpps = past12mOpps.filter(o => o.status === '赢');
    const salesCycle = (() => {
      if (p12mWonOpps.length === 0) return 0;
      const days = p12mWonOpps.reduce((s, o) => {
        const start = new Date(o.createdAt);
        const end = new Date(o.updatedAt);
        return s + Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      }, 0);
      return Math.round(days / p12mWonOpps.length);
    })();
    const leadToWonRate = p12mOpp.count > 0 ? p12mWon.count / p12mOpp.count * 100 : 0;
    return { weightedPipeline, weightedProfit, weightedProfitRate, salesCycle, leadToWonRate };
  }, [currentPipeline, past12mOpps, p12mOpp, p12mWon]);

  // ── 输单原因柱状图（按输单时间归入财年）──
  const dimLossReasons: BarItem[] = useMemo(() => {
    const lossCompGroup = REASON_TAXONOMY.loss.groups.find(g => g.groupLabel === '竞对');
    const allReasons: string[] = [];
    if (lossCompGroup) {
      for (const item of lossCompGroup.items) {
        if (item.items && item.items.length > 0) {
          for (const sub of item.items) allReasons.push(sub.label);
        } else {
          allReasons.push(item.label);
        }
      }
    }
    const countMap = new Map<string, number>();
    for (const name of allReasons) countMap.set(name, 0);
    for (const opp of fyLostByTime) {
      if (!opp.reasons) continue;
      for (const r of parseReasons(opp.reasons)) {
        if (r.groupLabel !== '竞对') continue;
        if (r.detailItems.length > 0) {
          for (const item of r.detailItems) { if (countMap.has(item)) countMap.set(item, countMap.get(item)! + 1); }
        } else {
          if (countMap.has(r.subLabel)) countMap.set(r.subLabel, countMap.get(r.subLabel)! + 1);
        }
      }
    }
    return allReasons.map((name, i) => ({ name, value: countMap.get(name) || 0, color: i % 2 === 0 ? COLORS.primary : COLORS.purple }));
  }, [fyLostByTime]);

  const dimCancelReasons: BarItem[] = useMemo(() => {
    const grp = REASON_TAXONOMY.loss.groups.find(g => g.groupLabel === '取消');
    const allReasons: string[] = grp ? grp.items.map(i => i.label) : [];
    const countMap = new Map<string, number>();
    for (const name of allReasons) countMap.set(name, 0);
    for (const opp of fyLostByTime) {
      if (!opp.reasons) continue;
      for (const r of parseReasons(opp.reasons)) {
        if (r.groupLabel !== '取消') continue;
        if (r.detailItems.length > 0) { for (const item of r.detailItems) { if (countMap.has(item)) countMap.set(item, countMap.get(item)! + 1); } }
        else { if (countMap.has(r.subLabel)) countMap.set(r.subLabel, countMap.get(r.subLabel)! + 1); }
      }
    }
    return allReasons.map((name, i) => ({ name, value: countMap.get(name) || 0, color: i % 2 === 0 ? COLORS.primary : COLORS.purple }));
  }, [fyLostByTime]);

  const dimAbandonReasons: BarItem[] = useMemo(() => {
    const grp = REASON_TAXONOMY.loss.groups.find(g => g.groupLabel === '放弃');
    const allReasons: string[] = grp ? grp.items.map(i => i.label) : [];
    const countMap = new Map<string, number>();
    for (const name of allReasons) countMap.set(name, 0);
    for (const opp of fyLostByTime) {
      if (!opp.reasons) continue;
      for (const r of parseReasons(opp.reasons)) {
        if (r.groupLabel !== '放弃') continue;
        if (r.detailItems.length > 0) { for (const item of r.detailItems) { if (countMap.has(item)) countMap.set(item, countMap.get(item)! + 1); } }
        else { if (countMap.has(r.subLabel)) countMap.set(r.subLabel, countMap.get(r.subLabel)! + 1); }
      }
    }
    return allReasons.map((name, i) => ({ name, value: countMap.get(name) || 0, color: i % 2 === 0 ? COLORS.primary : COLORS.purple }));
  }, [fyLostByTime]);

  // ── 销售员统一统计 ──
  const salesmenStats = useMemo(() => {
    const map = new Map<string, {
      name: string; wins: number; orderAmount: number; totalAmount: number;
      pipelinePotential: number; profitTotal: number;
    }>();
    // 订单金额/利润：财年赢单（按 time 归入）
    for (const o of fyWonByTime) {
      if (!o.salesman) continue;
      let s = map.get(o.salesman);
      if (!s) { s = { name: o.salesman, wins: 0, orderAmount: 0, totalAmount: 0, pipelinePotential: 0, profitTotal: 0 }; map.set(o.salesman, s); }
      s.wins++;
      s.orderAmount += o.amount;
      s.totalAmount += o.amount;
      // 利润
      let profitRate = 0.15;
      if (o.quotationId) {
        const q = mockQuotationSummaries.find(q => q.id === o.quotationId);
        if (q) profitRate = q.profitRate / 100;
      }
      s.profitTotal += Math.round(o.amount * profitRate);
    }
    // 管道潜力：当前活跃管道（不过滤财年）
    for (const o of currentPipeline) {
      if (!o.salesman) continue;
      let s = map.get(o.salesman);
      if (!s) { s = { name: o.salesman, wins: 0, orderAmount: 0, pipelinePotential: 0, profitTotal: 0 }; map.set(o.salesman, s); }
      const idx = stageIdx(o.stage);
      if (idx >= stageIdx('机会')) {
        s.pipelinePotential += Math.round(o.amount * o.winRate / 100);
      }
    }
        return [...map.values()].map(s => ({
      ...s,
      avgOrderAmount: s.wins > 0 ? Math.round(s.orderAmount / s.wins) : 0,
      conversionEff: s.totalAmount > 0 ? s.orderAmount / s.totalAmount * 100 : 0,
    }));
  }, [fyWonByTime, currentPipeline]);

  // ── 4 个维度提取 ──
  const dimEfficiency: BarItem[] = salesmenStats.map(s => ({ name: s.name, value: Math.round(s.conversionEff * 10) / 10 }));
  const dimOrderAmount: BarItem[] = salesmenStats.map(s => ({ name: s.name, value: s.orderAmount }));
  const dimPipeline: BarItem[] = salesmenStats.map(s => ({ name: s.name, value: s.pipelinePotential }));
  const dimProfit: BarItem[] = salesmenStats.map(s => ({ name: s.name, value: s.profitTotal }));

  // 概览卡片
  const overviewItems = [
    { label: '加权管道', value: `¥${fmtK(kpi.weightedPipeline)}`, color: COLORS.primary, icon: '📊' },
    { label: '加权利润', value: `¥${fmtK(kpi.weightedProfit)}`, color: COLORS.purple, icon: '💰' },
    { label: '加权利润率', value: `${kpi.weightedProfitRate.toFixed(1)}%`,
      color: kpi.weightedProfitRate >= 15 ? COLORS.success : '#e65100', icon: '📈' },
    { label: '销售周期', value: `${kpi.salesCycle} 天`,
      color: kpi.salesCycle > 0 && kpi.salesCycle <= 120 ? COLORS.success : '#e65100', icon: '⏱️' },
    { label: '赢单转化率', value: `${kpi.leadToWonRate.toFixed(1)}%`,
      color: kpi.leadToWonRate >= 20 ? COLORS.success : '#e65100', icon: '🎯' },
  ];

  return (
    <div>
      {/* 标题行 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#0d1b2a' }}>销售分析</span>
        <FYSelector value={fySelect} onChange={setFySelect} />
      </div>

      {/* Row 1: 概览卡片 */}
      <OverviewCards items={overviewItems} />

      {/* Row 2: 漏斗 | 赢单原因 | 输单原因 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <Card size="small"
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>月度订单</span>}
          style={{ flex: 1, borderRadius: 8, border: '1px solid #f0f0f0' }}
          styles={{ body: { padding: '8px 12px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 2, minHeight: 18 }}>
            {targetEditing ? (
              <input type="number" min={0} ref={targetRef}
                value={annualTargetInput}
                onChange={e => saveAnnualTarget(e.target.value.replace(/\D/g, '').slice(0, 10))}
                onBlur={() => setTargetEditing(false)}
                onKeyDown={e => {{ if (e.key === 'Enter') setTargetEditing(false); }}}
                style={{
                  width: `${Math.max(annualTargetInput.length || 1, 1)}ch`,
                  minWidth: '14ch', height: 18,
                  border: 'none', borderRadius: 0,
                  padding: 0, margin: 0, boxSizing: 'content-box',
                  fontSize: 12, outline: 'none', textAlign: 'right',
                  background: 'transparent', color: COLORS.primary, fontFamily: 'inherit',
                  fontWeight: 700,
                }}
                autoFocus
              />
            ) : (
              <span style={{ fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700 }}
                onClick={() => {{ setTargetEditing(true); setTimeout(() => targetRef.current?.focus(), 0); }}}>
                <span style={{ color: COLORS.primary }}>{annualTargetInput ? `${safeParseInt(annualTargetInput).toLocaleString()}K` : '—'}</span>
                {annualTargetInput ? (
                  <span style={{ color: monthlyCumulative.cumulative >= monthlyCumulative.expectedCumulative ? COLORS.primary : COLORS.danger, fontSize: 10 }}>
                    {`(${Math.round(monthlyCumulative.cumulative / 1000).toLocaleString()}K)`}
                  </span>
                ) : null}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 2, minHeight: 18 }}>
            <span style={{ fontSize: 10, whiteSpace: 'nowrap', fontWeight: 700 }}>
              <span style={{ color: COLORS.purple }}>
                {annualTargetInput && gp3Input ? `${monthlyCumulative.annualProfitTarget.toLocaleString()}K` : '—'}
              </span>
              {annualTargetInput && gp3Input ? (
                <span style={{ color: monthlyCumulative.profitCumulative >= monthlyCumulative.expectedProfitCumulative ? COLORS.purple : COLORS.danger, fontSize: 10 }}>
                  &nbsp;{`(${Math.round(monthlyCumulative.profitCumulative / 1000).toLocaleString()}K)`}
                </span>
              ) : null}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 2, minHeight: 18 }}>
            {orderGp3Editing ? (
              <input type="number" min={0} max={100} ref={orderGp3Ref}
                value={gp3Input}
                onChange={e => saveGp3(e.target.value.replace(/[^\d.]/g, '').replace(/(\.\d).*/, '$1').slice(0, 5))}
                onBlur={() => setOrderGp3Editing(false)}
                onKeyDown={e => {{ if (e.key === 'Enter') setOrderGp3Editing(false); }}}
                style={{
                  width: `${Math.max(gp3Input.length || 1, 1)}ch`,
                  minWidth: '4ch', height: 18,
                  border: 'none', borderRadius: 0,
                  padding: 0, margin: 0, boxSizing: 'content-box',
                  fontSize: 10, outline: 'none', textAlign: 'right',
                  background: 'transparent', color: COLORS.purple, fontFamily: 'inherit',
                  fontWeight: 700,
                }}
                autoFocus
              />
            ) : (
              <span style={{ fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700 }}
                onClick={() => {{ setOrderGp3Editing(true); setTimeout(() => orderGp3Ref.current?.focus(), 0); }}}>
                <span style={{ color: COLORS.purple }}>
                  {gp3Input || '—'}
                </span>
              </span>
            )}
            <span style={{ fontSize: 10, color: COLORS.purple, fontWeight: 700, marginLeft: 4 }}>
              ({orderWeightedGP3 > 0 ? orderWeightedGP3.toFixed(1) : '—'})
            </span>
          </div>
          <VerticalBarChart title="" data={monthlyOrderData} format="K" height={290} topN={12} barWidthRatio={0.6} maxBarWidth={120} contentOffset={25} chartWidth={620} disableSort padTop={32} cardBorder={false}
            targetValue={annualTargetInput ? Math.round(safeParseInt(annualTargetInput) * 1000 / 12) : undefined}
            targetLabel={annualTargetInput ? `${Math.round(safeParseInt(annualTargetInput) / 12)}K` : undefined}
          />
        </Card>

        <Card size="small"
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>销售漏斗</span>}
          style={{ flex: 1, borderRadius: 8, border: '1px solid #f0f0f0' }}
          styles={{ body: { padding: '8px 12px' } }}
        >
          <SalesFunnel
            funnelData={funnelSnapshot}
            fyInfo={fyInfo} fyLead={fyLead} fyOpp={fyOpp} fyWon={fyWon}
            convInfo={p12mInfo} convLead={p12mLead} convOpp={p12mOpp} convWon={p12mWon}
          />
        </Card>


        <Card size="small"
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>月度销售</span>}
          style={{ flex: 1, borderRadius: 8, border: '1px solid #f0f0f0' }}
          styles={{ body: { padding: '8px 12px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 2, minHeight: 18 }}>
            {salesTargetEditing ? (
              <input type="number" min={0} ref={salesTargetRef}
                value={annualSalesTarget}
                onChange={e => saveSalesTarget(e.target.value.replace(/\D/g, '').slice(0, 10))}
                onBlur={() => setSalesTargetEditing(false)}
                onKeyDown={e => {{ if (e.key === 'Enter') setSalesTargetEditing(false); }}}
                style={{
                  width: `${Math.max(annualSalesTarget.length || 1, 1)}ch`,
                  minWidth: '14ch', height: 18,
                  border: 'none', borderRadius: 0,
                  padding: 0, margin: 0, boxSizing: 'content-box',
                  fontSize: 12, outline: 'none', textAlign: 'right',
                  background: 'transparent', color: COLORS.success, fontFamily: 'inherit',
                  fontWeight: 700,
                }}
                autoFocus
              />
            ) : (
              <span style={{ fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700 }}
                onClick={() => {{ setSalesTargetEditing(true); setTimeout(() => salesTargetRef.current?.focus(), 0); }}}>
                <span style={{ color: COLORS.success }}>{annualSalesTarget ? `${safeParseInt(annualSalesTarget).toLocaleString()}K` : '—'}</span>
                {annualSalesTarget ? (
                  <span style={{ color: salesCumulative.cumulative >= salesCumulative.expectedCumulative ? COLORS.success : COLORS.danger, fontSize: 10 }}>
                    {`(${Math.round(salesCumulative.cumulative / 1000).toLocaleString()}K)`}
                  </span>
                ) : null}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 2, minHeight: 18 }}>
            <span style={{ fontSize: 10, whiteSpace: 'nowrap', fontWeight: 700 }}>
              <span style={{ color: COLORS.purple }}>
                {annualSalesTarget && gp3Input ? `${salesCumulative.annualProfitTarget.toLocaleString()}K` : '—'}
              </span>
              {annualSalesTarget && gp3Input ? (
                <span style={{ color: salesCumulative.profitCumulative >= salesCumulative.expectedProfitCumulative ? COLORS.purple : COLORS.danger, fontSize: 10 }}>
                  &nbsp;{`(${Math.round(salesCumulative.profitCumulative / 1000).toLocaleString()}K)`}
                </span>
              ) : null}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 2, minHeight: 18 }}>
            {salesGp3Editing ? (
              <input type="number" min={0} max={100} ref={salesGp3Ref}
                value={gp3Input}
                onChange={e => saveGp3(e.target.value.replace(/[^\d.]/g, '').replace(/(\.\d).*/, '$1').slice(0, 5))}
                onBlur={() => setSalesGp3Editing(false)}
                onKeyDown={e => {{ if (e.key === 'Enter') setSalesGp3Editing(false); }}}
                style={{
                  width: `${Math.max(gp3Input.length || 1, 1)}ch`,
                  minWidth: '4ch', height: 18,
                  border: 'none', borderRadius: 0,
                  padding: 0, margin: 0, boxSizing: 'content-box',
                  fontSize: 10, outline: 'none', textAlign: 'right',
                  background: 'transparent', color: COLORS.danger, fontFamily: 'inherit',
                  fontWeight: 700,
                }}
                autoFocus
              />
            ) : (
              <span style={{ fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700 }}
                onClick={() => {{ setSalesGp3Editing(true); setTimeout(() => salesGp3Ref.current?.focus(), 0); }}}>
                <span style={{ color: COLORS.danger }}>
                  {gp3Input || '—'}
                </span>
              </span>
            )}
            <span style={{ fontSize: 10, color: COLORS.danger, fontWeight: 700, marginLeft: 4 }}>
              ({deliveredActualGP3 > 0 ? deliveredActualGP3.toFixed(1) : '—'})
            </span>
          </div>
          <VerticalBarChart title="" data={monthlySalesData} format="K" height={290} topN={12} barWidthRatio={0.6} maxBarWidth={120} contentOffset={25} chartWidth={620} disableSort padTop={32} cardBorder={false}
            targetValue={annualSalesTarget ? Math.round(safeParseInt(annualSalesTarget) * 1000 / 12) : undefined}
            targetLabel={annualSalesTarget ? `${Math.round(safeParseInt(annualSalesTarget) / 12)}K` : undefined}
          />
        </Card>
      </div>

      {/* Row 3: 销售排行 4×2 网格 */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 10 }}>
          <div style={{ flex: '0 0 calc(25% - 12px)' }}><VerticalBarChart title="竞对" data={dimLossReasons} format="num" height={220} topN={7} barWidthRatio={0.6} maxBarWidth={26} hideAvgLine contentOffset={30} padBottom={28} /></div>
          <div style={{ flex: '0 0 calc(25% - 12px)' }}><VerticalBarChart title="取消" data={dimCancelReasons} format="num" height={220} topN={4} barWidthRatio={0.6} maxBarWidth={26} hideAvgLine contentOffset={30} padBottom={28} /></div>
          <div style={{ flex: '0 0 calc(25% - 12px)' }}><VerticalBarChart title="放弃" data={dimAbandonReasons} format="num" height={220} topN={6} barWidthRatio={0.6} maxBarWidth={26} hideAvgLine contentOffset={30} padBottom={28} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginTop: 15, gridAutoRows: 270 }}>
          <VerticalBarChart title="订单金额" data={dimOrderAmount} format="K" contentOffset={35} />
          <VerticalBarChart title="订单利润" data={dimProfit} format="K" contentOffset={35} />
          <VerticalBarChart title="转化效率" data={dimEfficiency} format="%" contentOffset={35} />
          <VerticalBarChart title="管道潜力" data={dimPipeline} format="K" contentOffset={35} />
        </div>
      </div>
    </div>
  );
};

export default SalesAnalysis;
