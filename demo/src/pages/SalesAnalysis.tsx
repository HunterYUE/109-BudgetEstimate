import React, { useState, useMemo } from 'react';
import { Card } from 'antd';
import { mockOpportunities, mockQuotationSummaries } from '../mockData';
import type { SalesOpportunity } from '../types';
import { parseReasons } from '../reasonTaxonomy';
const fmtK = (v: number) => Math.round(v / 1000).toLocaleString() + 'K';

/* ============================================================
   常量
   ============================================================ */
const stageColors: Record<string, string> = {
  信息: '#999', 线索: '#00509e', 机会: '#5a2d82',
  投标: '#e65100', 议价: '#c76a00', 中标: '#1a6b3c',
};
const statusColors: Record<string, string> = {
  赢: '#1a6b3c', 输: '#c62828', 冻结: '#999', 过程中: '#00509e',
};
const STAGES = ['信息', '线索', '机会', '投标', '议价', '中标'] as const;
const FY_OPTIONS = ['FY2425', 'FY2526', 'FY2627'] as const;

/** 竞对数据项 */
interface CompetitorRow {
  competitor: string; total: number; wins: number; losses: number; amount: number;
}
/* ============================================================
   财年工具函数
   ============================================================ */
const parseFY = (fy: string) => {
  const y1 = 2000 + parseInt(fy.slice(2, 4));
  const y2 = 2000 + parseInt(fy.slice(4, 6));
  return { start: new Date(y1, 6, 1), end: new Date(y2, 6, 0) };
};
const stageIdx = (s: string) => STAGES.indexOf(s as typeof STAGES[number]);

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
}

const SalesFunnel: React.FC<FunnelProps> = ({ funnelData, fyInfo, fyLead, fyOpp, fyWon }) => {
  // 四阶段可视化数据
  const stages = [
    { key: 'info', label: '信息', color: '#999' },
    { key: 'lead', label: '线索', color: '#00509e' },
    { key: 'opp', label: '机会', color: '#5a2d82' },
    { key: 'won', label: '中标', color: '#1a6b3c' },
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

  const countFor = (key: string) => {
    if (key === 'opp') return oppAgg.reduce((s, f) => s + f.count, 0);
    const f = funnelData.find(f => f.stage === ({ info: '信息', lead: '线索', won: '中标' } as any)[key]);
    return f?.count || 0;
  };
  const amountFor = (key: string) => {
    if (key === 'opp') return oppAgg.reduce((s, f) => s + f.amount, 0);
    const f = funnelData.find(f => f.stage === ({ info: '信息', lead: '线索', won: '中标' } as any)[key]);
    return f?.amount || 0;
  };

  const fyData: Record<string, { count: number; amount: number }> = {
    info: fyInfo, lead: fyLead, opp: fyOpp, won: fyWon,
  };

  // 阶段间转化率
  const convData = [
    { key: 'lead', cnt: fyInfo.count > 0 ? fyLead.count / fyInfo.count * 100 : 0, amt: fyInfo.amount > 0 ? fyLead.amount / fyInfo.amount * 100 : 0 },
    { key: 'opp', cnt: fyLead.count > 0 ? fyOpp.count / fyLead.count * 100 : 0, amt: fyLead.amount > 0 ? fyOpp.amount / fyLead.amount * 100 : 0 },
    { key: 'won', cnt: fyOpp.count > 0 ? fyWon.count / fyOpp.count * 100 : 0, amt: fyOpp.amount > 0 ? fyWon.amount / fyOpp.amount * 100 : 0 },
  ];

  return (
    <div style={{ position: 'relative', padding: '12px 0' }}>
      <svg width="100%" height="360" style={{ display: 'block' }}>
        <g transform="translate(250, 40)">
          {/* 漏斗填充 */}
          <polygon
            points={pts.map((p, i) => `${-p.w / 2},${p.x} `).join('') +
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
            stroke="#1a6b3c" strokeWidth={2.5} strokeLinecap="round" />

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
                {/* 当期数据 */}
                <text x={pts[0].w / 2 + 46} y={y + 14}
                  fill="#666" fontSize={11}
                  dominantBaseline="middle">{count}/{fmtK(amount)}</text>
                {/* 财年累计 */}
                <text x={pts[0].w / 2 + 115} y={y + 14}
                  fill="#00509e" fontSize={11} fontWeight={600}
                  dominantBaseline="middle">{fyc}/{fmtK(fya)}</text>

                {/* 阶段间转化率（漏斗内居中） */}
                {conv && (
                  <text x={0} y={y + 14} fontSize={12} textAnchor="middle">
                    <tspan fill="#00509e" fontWeight="600">{conv.cnt.toFixed(1)}%</tspan>
                    <tspan fill="#999"> / </tspan>
                    <tspan fill="#1a6b3c" fontWeight="600">{conv.amt.toFixed(1)}%</tspan>
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
const TOP_COLORS = ['#00509e', '#5a2d82', '#00509e', '#5a2d82'];

interface BarItem {
  name: string;
  value: number;
}

const VerticalBarChart: React.FC<{
  title: string;
  data: BarItem[];
  format?: 'K' | '%' | 'num';
  height?: number;
  topN?: number;
  contentOffset?: number;
  barWidthRatio?: number;
}> = ({ title, data, format = 'num', height = 220, topN = 10, contentOffset = 0, barWidthRatio = 0.55 }) => {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, topN);
  const rawMax = Math.max(...top.map(d => d.value), 0);
  const effectiveMax = rawMax > 0 ? rawMax : (format === '%' ? 100 : 1);
  const avg = data.length > 0 ? data.reduce((s, d) => s + d.value, 0) / data.length : 0;
  const slots: (BarItem | null)[] = Array.from({ length: topN }, (_, i) => top[i] || null);

  const fmtAxis = (v: number): string => {
    if (format === 'K') return Math.round(v / 1000).toLocaleString() + 'K';
    if (format === '%') return v.toFixed(1) + '%';
    return String(Math.round(v));
  };

  const W = 460;
  const pad = { top: 22, bottom: 28, left: 42, right: 26 };
  const chartW = W - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const slotW = chartW / topN;
  const barW = Math.min(slotW * barWidthRatio, 36);
  const gridVals = Array.from({ length: 5 }, (_, i) => (effectiveMax * (4 - i)) / 4);

  return (
    <Card size="small"
      style={{ borderRadius: 8, border: '1px solid #f0f0f0', height: '100%', position: 'relative' }}
      styles={{ body: { padding: `${contentOffset}px 0 0`, height: '100%' } }}
    >
      <span style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: '#888', zIndex: 1 }}>
        {title}
      </span>
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} style={{ display: 'block' }}>
        {/* Y 轴网格线 + 标签 */}
        {gridVals.map((gv, i) => {
          const y = pad.top + (i * chartH) / 4;
          return (
            <g key={`g-${i}`}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#f0f0f0" strokeWidth={1} />
              <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#aaa">
                {fmtAxis(gv)}
              </text>
            </g>
          );
        })}

        {/* 平均值虚线 */}
        {avg > 0 && data.some(d => d.value > 0) && (() => {
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
        })()}

        {/* 柱子 */}
        {slots.map((item, i) => {
          const cx = pad.left + i * slotW + slotW / 2;
          if (!item) return <g key={`e-${i}`} />;

          const isZero = item.value === 0;
          const barH = isZero ? 0 : Math.max(2, (item.value / effectiveMax) * chartH);
          const color = i < 4 ? TOP_COLORS[i] : '#ccc';
          let label: string;
          if (isZero) label = '—';
          else if (format === 'K') label = fmtK(item.value);
          else if (format === '%') label = `${item.value.toFixed(1)}%`;
          else label = `${item.value}`;

          const barTop = pad.top + chartH - barH;

          return (
            <g key={item.name}>
              <text x={cx} y={barTop - 4} textAnchor="middle" fontSize={10}
                fill={color} fontWeight={600}>{label}</text>
              {!isZero && (
                <rect x={cx - barW / 2} y={barTop} width={barW} height={barH}
                  fill="none" stroke={color} strokeWidth={3} rx={0} ry={0} />
              )}
              <text x={cx} y={height - 6} textAnchor="middle" fontSize={10} fill="#666">
                {item.name}
              </text>
            </g>
          );
        })}
      </svg>
    </Card>
  );
};

/* ============================================================
   竖状堆叠柱状图（漏斗健康度专用）
   ============================================================ */
interface StackedBarItem {
  name: string;
  bottom: number;
  top: number;
}

const VerticalStackedBarChart: React.FC<{
  title: string;
  data: StackedBarItem[];
  height?: number;
  topN?: number;
  contentOffset?: number;
  barWidthRatio?: number;
}> = ({ title, data, height = 220, topN = 10, contentOffset = 0, barWidthRatio = 0.55 }) => {
  const sorted = [...data]
    .filter(d => d.bottom > 0 || d.top > 0)
    .sort((a, b) => (b.bottom + b.top) - (a.bottom + a.top));
  const top = sorted.slice(0, topN);
  const rawMax = Math.max(...top.map(d => d.bottom + d.top), 0);
  const effectiveMax = rawMax > 0 ? rawMax : 10;
  const avg = data.length > 0
    ? data.reduce((s, d) => s + d.bottom + d.top, 0) / data.length
    : 0;
  const slots: (StackedBarItem | null)[] = Array.from({ length: topN }, (_, i) => top[i] || null);

  const W = 460;
  const pad = { top: 22, bottom: 28, left: 42, right: 26 };
  const chartW = W - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const slotW = chartW / topN;
  const barW = Math.min(slotW * barWidthRatio, 36);
  const gridVals = Array.from({ length: 5 }, (_, i) => (effectiveMax * (4 - i)) / 4);

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

        {avg > 0 && data.some(d => d.bottom + d.top > 0) && (() => {
          const avgY = pad.top + (1 - avg / effectiveMax) * chartH;
          return (
            <g>
              <line x1={pad.left} y1={avgY} x2={W - pad.right} y2={avgY}
                stroke="#e65100" strokeWidth={1} strokeDasharray="5,3" />
              <text x={W - pad.right + 2} y={avgY + 3}
                textAnchor="start" fontSize={9} fill="#e65100">{String(Math.round(avg))}</text>
            </g>
          );
        })()}

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
                  width={barW} height={bottomH} fill="none" stroke="#00509e" strokeWidth={3} rx={0} ry={0} />
              )}
              {topH > 0 && (
                <rect x={cx - barW / 2} y={cy + bottomH}
                  width={barW} height={topH} fill="none" stroke="#5a2d82" strokeWidth={3} />
              )}
              <text x={cx} y={height - 6} textAnchor="middle" fontSize={10} fill="#666">
                {item.name}
              </text>
              {bottomH > 8 && (
                <text x={cx} y={cy + bottomH / 2 + 4}
                  textAnchor="middle" fontSize={9} fill="#5a2d82" fontWeight={600}>
                  {item.bottom}
                </text>
              )}
              {topH > 8 && (
                <text x={cx} y={cy + bottomH + topH / 2 + 4}
                  textAnchor="middle" fontSize={9} fill="#5a2d82" fontWeight={600}>
                  {item.top}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Card>
  );
};

/* ============================================================
   输单原因子项定义
   ============================================================ */
interface LossSubItem {
  subCategory: string;
  thirdLevel: string;
  count: number;
  color: string;
}

interface LossCategoryStack {
  category: string;
  count: number;
  percent: number;
  color: string;
  subItems: LossSubItem[];
}

const SUB_PATTERNS = [
  { color: '#00509e', dashed: false },
  { color: '#888', dashed: false },
  { color: '#00509e', dashed: false },
  { color: '#888', dashed: false },
  { color: '#00509e', dashed: false },
  { color: '#888', dashed: false },
];

/* ============================================================
   子组件 — 输单原因（横向堆叠图）
   ============================================================ */
const LossChart: React.FC<{ data: LossCategoryStack[] }> = ({ data }) => {
  const total = data.reduce((s, d) => s + d.count, 0);
  const maxCount = Math.max(...data.map(d => d.count), 1);
  if (total === 0) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#bbb', fontSize: 13 }}>暂无输单数据</div>;
  }

  return (
    <div>
      {data.map(cat => {
        if (cat.count === 0) return null;
        const active = cat.subItems.filter(s => s.count > 0);
        return (
          <div key={cat.category}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
            <div style={{ width: 64, flexShrink: 0, textAlign: 'right', fontSize: 12, color: '#555', fontWeight: 500 }}>
              <div style={{ fontSize: 12, lineHeight: 1.2 }}>{cat.category.replace(/\(.*\)/g, '')}</div>
            </div>
            <div style={{ flex: 1, position: 'relative', height: 30 }}>
              <div style={{ display: 'flex', height: '100%', borderLeft: '1px solid #ddd' }}>
                {Array.from({ length: maxCount }, (_, i) => (
                  <div key={i} style={{ flex: 1, borderRight: '1px solid #eee', height: '100%' }} />
                ))}
              </div>
              <div style={{ display: 'flex', height: '100%', position: 'absolute', left: 0, right: 0, top: 0, zIndex: 2 }}>
                {active.map((sub, segIdx) => {
                  const p = SUB_PATTERNS[segIdx % SUB_PATTERNS.length];
                  const w = (sub.count / cat.count) * 100;
                  return (
                    <div key={sub.subCategory + sub.thirdLevel}
                      style={{
                        width: `${w}%`,
                        borderTop: `2px ${p.dashed ? 'dashed' : 'solid'} ${p.color}`,
                        borderBottom: `2px ${p.dashed ? 'dashed' : 'solid'} ${p.color}`,
                        borderRight: segIdx < active.length - 1 ? 'none' : `2px ${p.dashed ? 'dashed' : 'solid'} ${p.color}`,
                        borderLeft: segIdx === 0 ? `2px ${p.dashed ? 'dashed' : 'solid'} ${p.color}` : 'none',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: p.color, fontWeight: 500,
                        padding: '0 2px', boxSizing: 'border-box',
                        overflow: 'hidden',
                      }}
                    >
                      <span style={{ lineHeight: 1.3, whiteSpace: 'nowrap' }}>{sub.subCategory}</span>
                      {sub.thirdLevel && <span style={{ lineHeight: 1.3, fontSize: 9, opacity: 0.65 }}>{sub.thirdLevel}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 9, color: '#aaa' }}>
        <div style={{ width: 64, flexShrink: 0 }} />
        <div style={{ flex: 1, position: 'relative', height: 14 }}>
          {Array.from({ length: maxCount + 1 }, (_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${(i / maxCount) * 100}%`,
              transform: 'translateX(-50%)',
            }}>
              {i}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   简易横向柱状图（无 Card 包装，内嵌用）
   ============================================================ */
const MiniBarChart: React.FC<{ title: string; data: BarItem[]; height?: number }> = ({ title, data, height = 120 }) => {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const maxVal = sorted[0]?.value || 1;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 6 }}>{title}</div>
      {sorted.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#ccc', fontSize: 12 }}>暂无数据</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sorted.map((item, i) => {
            const w = (item.value / maxVal) * 100;
            const color = i < 4 ? TOP_COLORS[i] : '#ccc';
            return (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ width: 60, textAlign: 'right', color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                <div style={{ flex: 1, height: 14, border: `2px solid ${color}`, position: 'relative' }} />
                <span style={{ width: 20, textAlign: 'right', color: '#888' }}>{item.value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================
   子组件 — 竞对分析
   ============================================================ */


const SalesAnalysis: React.FC = () => {
  const [fySelect, setFySelect] = useState('FY2526');
  const allOpps = mockOpportunities;
  const fyFiltered = useFyFiltered(allOpps, fySelect);

  // ── 各阶段数据（FY 过滤） ──
  const funnel = useMemo(() =>
    STAGES.map(stage => {
      const items = fyFiltered.filter(o => o.stage === stage);
      return {
        stage, count: items.length,
        amount: items.reduce((s, o) => s + o.amount, 0),
        color: stageColors[stage] || '#999',
      };
    }), [fyFiltered]);

  // ── 财年各阶段汇总 ──
  const fyInfo = useMemo(() => ({
    count: fyFiltered.length,
    amount: fyFiltered.reduce((s, o) => s + o.amount, 0),
  }), [fyFiltered]);

  const fyLead = useMemo(() => {
    const items = fyFiltered.filter(o =>
      stageIdx(o.stage) >= stageIdx('线索') || o.status === '赢');
    return { count: items.length, amount: items.reduce((s, o) => s + o.amount, 0) };
  }, [fyFiltered]);

  const fyOpp = useMemo(() => {
    const items = fyFiltered.filter(o =>
      stageIdx(o.stage) >= stageIdx('机会') || o.status === '赢');
    return { count: items.length, amount: items.reduce((s, o) => s + o.amount, 0) };
  }, [fyFiltered]);

  const fyWon = useMemo(() => {
    const items = fyFiltered.filter(o => o.status === '赢');
    return { count: items.length, amount: items.reduce((s, o) => s + o.amount, 0) };
  }, [fyFiltered]);

  // ── 关键指标 ──
  const kpi = useMemo(() => {
    const weightedPipeline = fyFiltered
      .filter(o => {
        const idx = stageIdx(o.stage);
        return (idx >= stageIdx('机会') && o.status !== '输' && o.status !== '冻结') || o.status === '赢';
      })
      .reduce((s, o) => s + (o.status === '赢' ? o.amount : Math.round(o.amount * o.winRate / 100)), 0);
    const wonCount = fyWon.count;
    const avgOrderAmount = wonCount > 0 ? Math.round(fyWon.amount / wonCount) : 0;
    const profitData = fyFiltered
      .filter(o => o.quotationId)
      .map(o => {
        const q = mockQuotationSummaries.find(q => q.id === o.quotationId);
        const profitRate = q ? q.profitRate / 100 : 0.15;
        return { amount: o.amount, profit: Math.round(o.amount * profitRate) };
      });
    const avgProfitAmt = profitData.length > 0
      ? Math.round(profitData.reduce((s, p) => s + p.profit, 0) / profitData.length)
      : 0;
    const totalProfitAmt = profitData.reduce((s, p) => s + p.profit, 0);
    const totalProfitBase = profitData.reduce((s, p) => s + p.amount, 0);
    const weightedProfitRate = totalProfitBase > 0 ? totalProfitAmt / totalProfitBase * 100 : 0;
    const salesCycle = (() => {
      if (fyWon.count === 0) return 0;
      const days = fyFiltered.filter(o => o.status === '赢').reduce((s, o) => {
        const start = new Date(o.createdAt);
        const end = new Date(o.updatedAt);
        return s + Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      }, 0);
      return Math.round(days / fyWon.count);
    })();
    const leadToWonRate = fyOpp.count > 0 ? fyWon.count / fyOpp.count * 100 : 0;
    return { weightedPipeline, avgOrderAmount, avgProfitAmt,
      weightedProfitRate, salesCycle, leadToWonRate };
  }, [fyFiltered, fyWon, fyOpp]);

  // ── 输单原因分层数据（使用 reasons 字段，通过 parseReasons 解析）──
  const lossStacked = useMemo(() => {
    const lost = fyFiltered.filter(o => o.status === '输');
    const totalLost = lost.length;

    // 按 groupLabel 汇总：groupLabel -> { subLabel: count }
    const groupMap = new Map<string, Map<string, number>>();
    for (const opp of lost) {
      if (!opp.reasons) continue;
      for (const r of parseReasons(opp.reasons)) {
        let subMap = groupMap.get(r.groupLabel);
        if (!subMap) { subMap = new Map(); groupMap.set(r.groupLabel, subMap); }
        subMap.set(r.subLabel, (subMap.get(r.subLabel) || 0) + 1);
      }
    }

    const groupLabels = ['竞对', '取消', '放弃'];
    return groupLabels.map(groupLabel => {
      const subMap = groupMap.get(groupLabel);
      const totalCount = subMap ? [...subMap.values()].reduce((a, b) => a + b, 0) : 0;
      const subItems: LossSubItem[] = subMap
        ? [...subMap.entries()].map(([subLabel, count]) => ({
            subCategory: subLabel, thirdLevel: '', count, color: '#888',
          }))
        : [];
      return {
        category: groupLabel,
        count: totalCount,
        percent: totalLost > 0 ? (totalCount / totalLost) * 100 : 0,
        color: '#888',
        subItems,
      };
    });
  }, [fyFiltered]);

  // ── 竞对分析 ──

  // ── 销售员统一统计（所有维度一次遍历） ──
  const salesmenStats = useMemo(() => {
    const map = new Map<string, {
      name: string; count: number; amount: number;
      wins: number; winAmount: number;
      pipelinePotential: number; profitTotal: number;
      leadCount: number; lateStageCount: number; lostAmount: number;
    }>();
    for (const o of fyFiltered) {
      if (!o.salesman) continue;
      let s = map.get(o.salesman);
      if (!s) {
        s = { name: o.salesman, count: 0, amount: 0, wins: 0, winAmount: 0,
          pipelinePotential: 0, profitTotal: 0, leadCount: 0, lateStageCount: 0, lostAmount: 0 };
        map.set(o.salesman, s);
      }
      s.count++;
      s.amount += o.amount;

      if (o.status === '赢') {
        s.wins++;
        s.winAmount += o.amount;
        // 利润 = 成交金额 × 报价利润率
        let profitRate = 0.15;
        if (o.quotationId) {
          const q = mockQuotationSummaries.find(q => q.id === o.quotationId);
          if (q) profitRate = q.profitRate / 100;
        }
        s.profitTotal += Math.round(o.amount * profitRate);
      } else if (o.status === '输') {
        s.lostAmount += o.amount;
      }

      if (o.status === '过程中') {
        const idx = stageIdx(o.stage);
        if (idx >= stageIdx('机会')) {
          s.pipelinePotential += Math.round(o.amount * o.winRate / 100);
          s.lateStageCount++;
        } else if (idx === stageIdx('线索')) {
          s.leadCount++;
        }
      }
      // 冻结/信息阶段的 count++ 和 amount 已计入，但不计入任何维度指标
    }

    return [...map.values()].map(s => ({
      ...s,
      avgAmount: s.count > 0 ? Math.round(s.amount / s.count) : 0,
      conversionEff: s.amount > 0 ? (s.winAmount / s.amount) * 100 : 0,
    }));
  }, [fyFiltered]);

  // ── 7 个维度提取 ──
  const dimWinAmount: BarItem[] = salesmenStats
    .map(s => ({ name: s.name, value: s.winAmount }));
  const dimPipeline: BarItem[] = salesmenStats
    .map(s => ({ name: s.name, value: s.pipelinePotential }));
  const dimEfficiency: BarItem[] = salesmenStats
    .map(s => ({ name: s.name, value: Math.round(s.conversionEff * 10) / 10 }));
  const dimProfit: BarItem[] = salesmenStats
    .map(s => ({ name: s.name, value: s.profitTotal }));
  const dimFunnelHealth: StackedBarItem[] = salesmenStats
    .map(s => ({ name: s.name, bottom: s.leadCount, top: s.lateStageCount }));
  const dimAvgAmount: BarItem[] = salesmenStats
    .map(s => ({ name: s.name, value: s.avgAmount }));
  const dimLostAmount: BarItem[] = salesmenStats
    .map(s => ({ name: s.name, value: s.lostAmount }));

  // ── 赢单原因统计（6 个预定义子因，含零值）──
  // ── 输单量按竞争对手排名（前 10）──
  const dimLossByCompetitor: BarItem[] = useMemo(() => {
    const lossMap = new Map<string, number>();
    for (const o of fyFiltered) {
      if (o.status === '输' && o.competitor) {
        const names = o.competitor.split(/[、，]/);
        for (const name of names) {
          const t = name.trim();
          if (t) lossMap.set(t, (lossMap.get(t) || 0) + 1);
        }
      }
    }
    return [...lossMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [fyFiltered]);

  const dimWinReasons: BarItem[] = useMemo(() => {
    const winLeafItems = ['主机成本', '解决方案成本', '痛点发掘和解决', '主机性能', '客户关系', '品牌'];
    const won = fyFiltered.filter(o => o.status === '赢');
    const countMap = new Map<string, number>();
    for (const opp of won) {
      if (!opp.reasons) continue;
      for (const r of parseReasons(opp.reasons)) {
        if (r.detailItems.length > 0) {
          for (const item of r.detailItems) {
            countMap.set(item, (countMap.get(item) || 0) + 1);
          }
        } else {
          countMap.set(r.subLabel, (countMap.get(r.subLabel) || 0) + 1);
        }
      }
    }
    return winLeafItems.map(name => ({ name, value: countMap.get(name) || 0 }));
  }, [fyFiltered]);

  // ── 赢单-打败的竞争对手统计 ──
  const dimWinByCompetitor: BarItem[] = useMemo(() => {
    const won = fyFiltered.filter(o => o.status === '赢' && o.competitor);
    const map = new Map<string, number>();
    for (const o of won) {
      const names = o.competitor.split(/[、，]/);
      for (const name of names) {
        const t = name.trim();
        if (t) map.set(t, (map.get(t) || 0) + 1);
      }
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [fyFiltered]);


  // 概览卡片
  const overviewItems = [
    { label: '加权管道', value: `¥${fmtK(kpi.weightedPipeline)}`, color: '#00509e', icon: '📊' },
    { label: '平均订单', value: `¥${fmtK(kpi.avgOrderAmount)}`, color: '#1a6b3c', icon: '📦' },
    { label: '平均利润', value: `¥${fmtK(kpi.avgProfitAmt)}`, color: '#5a2d82', icon: '💰' },
    { label: '利润率', value: `${kpi.weightedProfitRate.toFixed(1)}%`,
      color: kpi.weightedProfitRate >= 15 ? '#1a6b3c' : '#e65100', icon: '📈' },
    { label: '销售周期', value: `${kpi.salesCycle} 天`,
      color: kpi.salesCycle > 0 && kpi.salesCycle <= 120 ? '#1a6b3c' : '#e65100', icon: '⏱️' },
    { label: '中标转化率', value: `${kpi.leadToWonRate.toFixed(1)}%`,
      color: kpi.leadToWonRate >= 20 ? '#1a6b3c' : '#e65100', icon: '🎯' },
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
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>赢单原因</span>}
          style={{ flex: 1, borderRadius: 8, border: '1px solid #f0f0f0' }}
          styles={{ body: { padding: '12px 16px' } }}
        >
          <VerticalBarChart title="" data={dimWinReasons} format="num" height={200} topN={6} barWidthRatio={0.3} />
          <div style={{ marginTop: 33, paddingTop: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 400, color: '#888', display: 'block', marginBottom: 6, textAlign: 'right', paddingRight: 10 }}>击败对手</span>
            {dimWinByCompetitor.length === 0 ? (
              <div style={{ fontSize: 12, color: '#ccc', textAlign: 'center', padding: 8 }}>暂无数据</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {dimWinByCompetitor.slice(0, 5).map((item, i) => {
                  const maxVal = Math.max(...dimWinByCompetitor.map(d => d.value), 1);
                  return (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                      <span style={{ width: 60, textAlign: 'right', color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                      <div style={{ flex: 1, height: 12, border: '2px solid #888', position: 'relative' }}>
                        <div style={{ width: `${(item.value / maxVal) * 100}%`, height: '100%', background: 'transparent' }} />
                      </div>
                      <span style={{ width: 16, textAlign: 'right', color: '#888' }}>{item.value}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <Card size="small"
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>销售漏斗</span>}
          style={{ flex: 1, borderRadius: 8, border: '1px solid #f0f0f0' }}
          styles={{ body: { padding: '8px 12px' } }}
        >
          <SalesFunnel
            funnelData={funnel}
            fyInfo={fyInfo} fyLead={fyLead} fyOpp={fyOpp} fyWon={fyWon}
          />
        </Card>

        <Card size="small"
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>输单原因</span>}
          style={{ flex: 1, borderRadius: 8, border: '1px solid #f0f0f0' }}
          styles={{ body: { padding: '12px 16px' } }}
        >
          <div style={{ marginBottom: 12, width: '100%', overflow: 'hidden' }}>
            <VerticalBarChart title="竞争对手" data={dimLossByCompetitor} format="num" height={200} topN={10} barWidthRatio={0.4} />
          </div>
          <div style={{ transform: 'translateX(-15px) translateY(25px)' }}><LossChart data={lossStacked} /></div>
        </Card>
      </div>

      {/* Row 3: 销售排行 4×2 网格 */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, gridAutoRows: 270, marginTop: 10 }}>
          <VerticalBarChart title="销售额" data={dimWinAmount} format="K" contentOffset={35} />
          <VerticalBarChart title="利润额" data={dimProfit} format="K" contentOffset={35} />
          <VerticalBarChart title="管道潜力" data={dimPipeline} format="K" contentOffset={35} />
          <VerticalBarChart title="转化效率" data={dimEfficiency} format="%" contentOffset={35} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginTop: 15, gridAutoRows: 270 }}>
          <VerticalBarChart title="项目单价" data={dimAvgAmount} format="K" contentOffset={35} />
          <VerticalBarChart title="输单金额" data={dimLostAmount} format="K" contentOffset={35} />
          <VerticalStackedBarChart title="漏斗健康度" data={dimFunnelHealth} contentOffset={35} />
          {/* 预留格 */}
          <Card size="small"
            style={{ borderRadius: 8, border: '1px dashed #e8e8e8', height: '100%' }}
            styles={{ body: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' } }}
          >
            <span style={{ color: '#ccc', fontSize: 13 }}>待扩展</span>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SalesAnalysis;
