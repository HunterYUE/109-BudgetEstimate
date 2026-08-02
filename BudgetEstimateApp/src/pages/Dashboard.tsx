import React, { useMemo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from 'antd';
import {
  RightOutlined,
} from '@ant-design/icons';
import { parseFY } from '../utils/fiscalYear';
import { formatBeijing } from '../utils/timeFormat';
import { fmtK, compressNo } from '../utils/analysisShared';
import { COLORS } from '../styles/colors';
import { opportunityService } from '../services/opportunityService';
import { deliveryService } from '../services/deliveryService';
import { clientService } from '../services/clientService';
import { quotationService } from '../services/quotationService';
import type { SalesOpportunity, DeliveryProject, Client, QuotationSummary } from '../types';

const exAmount = (v: number, taxRate?: number) => Math.round(v / (1 + (taxRate ?? 0.13)));

/** 机会的有效结束日期：过程中/冻结→至今（持续活跃）；赢→wonAt；输→lostAt；缺失回退 updatedAt */
const oppEffectiveEnd = (o: SalesOpportunity): Date => {
  if (o.status === '过程中' || o.status === '冻结') return new Date();
  if (o.status === '赢' && o.wonAt) return new Date(o.wonAt);
  if (o.status === '输' && o.lostAt) return new Date(o.lostAt);
  return new Date(o.updatedAt);
};

/** 机会在指定时间点的阶段：取"进入阶段时间 ≤ 该时间"的最高阶段（议价→投标→机会→线索→信息） */
const stageAsOf = (o: SalesOpportunity, date: Date): string => {
  const t = (v?: string) => (v ? new Date(v) : null);
  const neg = t(o.negotiationAt), bid = t(o.bidAt), opp = t(o.opportunityAt), lead = t(o.leadAt);
  if (neg && neg <= date) return '议价';
  if (bid && bid <= date) return '投标';
  if (opp && opp <= date) return '机会';
  if (lead && lead <= date) return '线索';
  return '信息';
};

/** 月度 KPI 卡片展示：数量为 0 时显示 —（避免 "0K / 0" 误导） */
const fmtMonthly = (amt: number, cnt: number): string =>
  cnt === 0 ? '—' : `${fmtK(amt)} / ${cnt}`;

/* ── KPI 卡片（与销售分析完全一致） ── */
const KpiCard: React.FC<{
  label: string; value: string; color: string; icon: React.ReactNode;
  prevValues?: { value: string; color: string }[];
}> = ({ label, value, color, icon, prevValues }) => (
  <Card size="small" hoverable
    style={{
      flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}`,
      transition: 'box-shadow 0.2s, transform 0.15s',
    }}
    styles={{ body: { padding: '16px 12px', textAlign: 'center' as const } }}
  >
    <div style={{ fontSize: 26, marginBottom: 4, lineHeight: 1, color }}>{icon}</div>
    <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4, letterSpacing: 0.3 }}>
      {label}
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
    {prevValues && prevValues.length === 2 && (
      <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3, marginTop: 3, opacity: 0.7 }}>
        <span style={{ color: prevValues[0].color }}>{prevValues[0].value}</span>
        <span style={{ color: COLORS.textLight, margin: '0 4px' }}>|</span>
        <span style={{ color: prevValues[1].color }}>{prevValues[1].value}</span>
      </div>
    )}
  </Card>
);

/* ── 区块标题 ── */
const SectionTitle: React.FC<{ title: string; count?: number }> = ({ title, count }) => (
  <div style={{
    fontSize: 14, fontWeight: 700, color: COLORS.textDark, marginBottom: 16, letterSpacing: 0.5,
    display: 'flex', alignItems: 'center', gap: 10,
  }}>
    <span style={{ display: 'inline-block', width: 3, height: 16, borderRadius: 2, background: `linear-gradient(${COLORS.primary}, ${COLORS.purple})` }} />
    {title}
    {count !== undefined && (
      <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: COLORS.primary, borderRadius: 10, padding: '0 8px', lineHeight: '18px' }}>
        {count}
      </span>
    )}
  </div>
);

/* ── 框体柱状图（与销售分析风格一致） ── */
const VerticalBars: React.FC<{
  items: { label: string; value: number; color: string; displayValue?: string }[];
  height?: number;
  unit?: string;
  maxSlots?: number;
  groupGaps?: number[];
  gapSize?: number;
  barWidth?: number;
}> = ({ items, height = 120, unit, maxSlots, groupGaps, gapSize = 14, barWidth = 25 }) => {
  const slotCount = maxSlots || items.length;
  const maxVal = items.reduce((m, i) => Math.max(m, i.value), 0);
  const max = maxVal > 0 ? maxVal : 1;
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => i === 0 || v !== a[i - 1]);
  const slots = Array.from({ length: slotCount }, (_, i) => items[i] || null);
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <div style={{ width: 28, flexShrink: 0, height, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {[...ticks].reverse().map(t => (
            <span key={t} style={{ fontSize: 9, color: '#aaa', textAlign: 'right', lineHeight: 1 }}>{t}{unit}</span>
          ))}
        </div>
        <div style={{ flex: 1, height, position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 2 }}>
          {ticks.map(t => (
            <div key={t} style={{ position: 'absolute', left: 0, right: 0, top: `${(1 - t / max) * 100}%`, borderTop: `1px solid ${COLORS.borderLight}`, pointerEvents: 'none' }} />
          ))}
          {slots.map((item, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              flex: 1, justifyContent: 'flex-end', alignSelf: 'stretch',
              marginLeft: groupGaps?.includes(i - 1) ? gapSize : 0,
              position: 'relative', zIndex: 1,
            }}>
              {item && item.color !== 'transparent' ? (
                <>
                  {item.displayValue ? (
                    <div style={{ fontSize: 9, fontWeight: 600, color: item.color, marginBottom: 3, textAlign: 'center', lineHeight: 1.2 }}>
                      {item.displayValue.split('\n').map((line, li) => (
                        <div key={li}>{line}</div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 600, color: item.color, marginBottom: 3, textAlign: 'center', lineHeight: 1.2 }}>{item.value}{unit || ''}</span>
                  )}
                  <div style={{
                    width: barWidth,
                    height: `${Math.max((item.value / max) * 100, 4)}%`, minHeight: 4,
                    border: `3px solid ${item.color}`,
                    background: 'transparent',
                  }} />
                </>
              ) : (
                <div style={{ width: item && item.color === 'transparent' ? 16 : barWidth, height: 0 }} />
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', marginTop: 6, paddingLeft: 32 }}>
        {slots.map((item, i) => (
          <span key={i} style={{
            flex: 1, textAlign: 'center', fontSize: 9, color: COLORS.textSecondary,
            lineHeight: 1.3, opacity: item && item.color !== 'transparent' ? 1 : 0,
            marginLeft: groupGaps?.includes(i - 1) ? gapSize : 0,
          }}>
            {item && item.color !== 'transparent' ? item.label.split('\n').map((l, j) => <span key={j} style={{ display: 'block' }}>{l}</span>) : ''}
          </span>
        ))}
      </div>
    </div>
  );
};

/* ── 饼图（引出线沿圆周分布） ── */
const PieChart: React.FC<{
  items: { label: string; value: number; color: string }[];
  pieSize?: number;
}> = ({ items, pieSize = 130 }) => {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return null;
  const pad = 48;
  const W = pieSize + pad * 2;
  const H = pieSize + pad * 2;
  const cx = W / 2, cy = H / 2, r = pieSize / 2;
  type Slice = { start: number; end: number; label: string; value: number; color: string };
  const slices: Slice[] = [];
  for (let i = 0, cur = 0; i < items.length; i++) {
    const start = (cur / total) * 360;
    cur += items[i].value;
    slices.push({ start, end: (cur / total) * 360, ...items[i] });
  }
  const polar = (angle: number, radius: number) => ({
    x: cx + radius * Math.cos((angle - 90) * Math.PI / 180),
    y: cy + radius * Math.sin((angle - 90) * Math.PI / 180),
  });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      {slices.length === 1 ? (
        <circle cx={cx} cy={cy} r={r} fill={slices[0].color} opacity={0.85} />
      ) : slices.map(s => {
        const p1 = polar(s.start, r), p2 = polar(s.end, r);
        const large = s.end - s.start > 180 ? 1 : 0;
        return <path key={s.label} d={`M${cx} ${cy} L${p1.x} ${p1.y} A${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y} Z`} fill={s.color} opacity={0.85} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.45} fill="#fff" />
      {slices.map(s => {
        const mid = (s.start + s.end) / 2;
        const rad = (mid - 90) * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const lx = cx + (r + 3) * cos;
        const ly = cy + (r + 3) * sin;
        const tx = cx + (r + 34) * cos;
        const ty = cy + (r + 34) * sin;
        const isRight = cos > 0.3, isLeft = cos < -0.3, isBottom = sin > 0.3;
        const anchor = isRight ? 'start' : isLeft ? 'end' : 'middle';
        const dx = isRight ? 8 : isLeft ? -8 : 0;
        const dy = isBottom ? 18 : -4;
        return (
          <g key={s.label}>
            <line x1={lx} y1={ly} x2={tx} y2={ty} stroke={s.color} strokeWidth={1.5} />
            <circle cx={tx} cy={ty} r={2.5} fill={s.color} />
            <text x={tx + dx} y={ty + dy} textAnchor={anchor} fontSize={11} fill={s.color}>{s.value}</text>
          </g>
        );
      })}
    </svg>
  );
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const [opportunities, setOpportunities] = useState<SalesOpportunity[]>([]);
    const [deliveries, setDeliveries] = useState<DeliveryProject[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [quotations, setQuotations] = useState<QuotationSummary[]>([]);

  useEffect(() => {
    Promise.all([
      // ⚠️ 全部传 limit:'1000'，避免后端默认 limit=100 导致统计静默截断（对齐 DeliveryAnalysis）
      opportunityService.list({ limit: '1000' }),
      deliveryService.list({ limit: '1000' }),
      clientService.list({ limit: '1000' }),
      quotationService.list({ limit: '1000' }),
    ]).then(([opps, dels, clis, quots]) => {
      setOpportunities(opps);
      setDeliveries(dels);
      setClients(clis);
      setQuotations(quots);
    }).catch(() => console.warn('[Dashboard] 加载数据失败'));
  }, []);

  const now = useMemo(() => new Date(), []);

  // ── 按月 KPI（最近3个完整月） ──
  const monthlyKpi = useMemo(() => {
    const calcMonth = (offset: number) => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const monthOpps = opportunities.filter(o => {
        const created = new Date(o.createdAt);
        // ⚠️ 有效结束用 oppEffectiveEnd（赢→wonAt/输→lostAt），与销售分析/财年规则一致，不用 updatedAt
        return created <= mEnd && oppEffectiveEnd(o) >= mStart;
      });
      const monthWins = monthOpps.filter(o => {
        if (o.status !== '赢' || !o.wonAt) return false;
        const wonD = new Date(o.wonAt);
        return wonD >= mStart && wonD <= mEnd;
      });
      const monthNew = opportunities.filter(o => new Date(o.createdAt) >= mStart && new Date(o.createdAt) <= mEnd);
      const activeDel = deliveries.filter(p => {
        const created = new Date(p.createdAt);
        if (created > mEnd) return false;
        if (p.status === '已完成') {
          const node15 = (p.nodes||[]).find(n => n.nodeNo === 15);
          const doneDate = node15?.actualDate ? new Date(node15.actualDate) : new Date(p.updatedAt);
          if (doneDate < mStart) return false;
        }
        return true;
      });
      const monthDelivered = deliveries.filter(p => {
        const node15 = (p.nodes||[]).find(n => n.nodeNo === 15);
        if (!node15 || (node15.status !== 'completed' && node15.status !== 'delayed')) return false;
        const d = new Date(node15.actualDate || p.updatedAt);
        return d >= mStart && d <= mEnd;
      });
      const winCnt = monthWins.length;
      return {
        amt: monthOpps.reduce((s, o) => s + exAmount(o.amount, o.taxRate), 0), cnt: monthOpps.length,
        winAmt: monthWins.reduce((s, o) => s + exAmount(o.amount, o.taxRate), 0), winCnt,
        newAmt: monthNew.reduce((s, o) => s + exAmount(o.amount, o.taxRate), 0), newCnt: monthNew.length,
        delAmt: activeDel.reduce((s, p) => s + exAmount(p.contractAmount), 0), delCnt: activeDel.length,
        deliveredAmt: monthDelivered.reduce((s, p) => s + exAmount(p.contractAmount), 0),
        deliveredCnt: monthDelivered.length,
      };
    };
    return [calcMonth(1), calcMonth(2), calcMonth(3)];
  }, [opportunities, deliveries]);

  const recentWins = useMemo(() => {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 2);
    return opportunities.filter(o => o.status === '赢' && o.wonAt && new Date(o.wonAt) >= cutoff).sort((a, b) => new Date(b.wonAt!).getTime() - new Date(a.wonAt!).getTime()).slice(0, 5);
  }, [opportunities]);

  const recentLosses = useMemo(() => {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 2);
    return opportunities.filter(o => o.status === '输' && o.lostAt && new Date(o.lostAt) >= cutoff).sort((a, b) => new Date(b.lostAt!).getTime() - new Date(a.lostAt!).getTime()).slice(0, 5);
  }, [opportunities]);


  const stageDist = useMemo(() => {
    const stages = ['信息', '线索', '机会', '投标', '议价'];
    const colors = [COLORS.chartGray, COLORS.primary, COLORS.purple, COLORS.warning, COLORS.amber];
    const monthLabels = [3,2,1].map(i => new Date(now.getFullYear(), now.getMonth() - i, 1).toLocaleString('en', {month:'short'}));
    const getPipelineStage = (o: typeof opportunities[0], monthEnd: Date) => {
      if (new Date(o.createdAt) > monthEnd) return null;
      if (o.status === '赢' && o.wonAt && new Date(o.wonAt) <= monthEnd) return null;
      if (o.status === '输' && o.lostAt && new Date(o.lostAt) <= monthEnd) return null;
      // ⚠️ 用阶段推进时间还原该月月底的历史阶段（与销售分析漏斗 stageAsOf 同口径），而非当前阶段
      return stageAsOf(o, monthEnd);
    };
    const result: { label: string; value: number; color: string }[] = [];
    for (const stage of stages) {
      const ci = stages.indexOf(stage);
      for (let mi = 3; mi >= 1; mi--) {
        const d = new Date(now.getFullYear(), now.getMonth() - mi, 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const count = opportunities.filter(o => getPipelineStage(o, monthEnd) === stage).length;
        result.push({ label: monthLabels[3 - mi], value: count, color: colors[ci] });
      }
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunities]);

  // −− 近期交付（已完成的项目，按第15节点实际完成时间倒序）−−
  const recentDeliveries = useMemo(() => {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 2);
    const done = deliveries.filter(p => {
      const node15 = (p.nodes||[]).find(n => n.nodeNo === 15);
      if (!node15 || node15.status !== 'completed') return false;
      return node15.actualDate && new Date(node15.actualDate) >= cutoff;
    }).sort((a, b) => {
      const da = new Date((a.nodes||[]).find(n => n.nodeNo === 15)?.actualDate || 0).getTime();
      const db = new Date((b.nodes||[]).find(n => n.nodeNo === 15)?.actualDate || 0).getTime();
      return db - da;
    }).slice(0, 5);
    return done;
  }, [deliveries]);


  const currentFy = useMemo(() => {
    const y = now.getFullYear(), m = now.getMonth();
    const y1 = m >= 6 ? y : y - 1;
    const y2 = m >= 6 ? y + 1 : y;
    return `FY${String(y1 % 100).padStart(2, '0')}${String(y2 % 100).padStart(2, '0')}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deliveryStats = useMemo(() => {
    // 项目延期判断（以第15节点为准，与 DeliveryDetail 一致）
    // 项目延期判断：仅在项目进行中且已过基准截止日期时算延期中
    const getProjDelayedAt = (p: typeof deliveries[0], refDate: Date): boolean => {
      const node15 = (p.nodes||[]).find(n => n.nodeNo === 15);
      if (!node15 || node15.status === 'completed') return false; // 已完成不算延期
      const baseline = node15.baselineEndDate || node15.baselinePlannedEndDate || node15.plannedEndDate;
      return !!baseline && new Date(baseline) <= refDate;
    };
    const getStatusInMonth = (p: typeof deliveries[0], monthEnd: Date): string | null => {
      const created = new Date(p.createdAt);
      if (created > monthEnd) return null;
      const node15 = (p.nodes||[]).find(n => n.nodeNo === 15);
      if (node15?.actualDate && new Date(node15.actualDate) <= monthEnd) return '已完成';
      if (getProjDelayedAt(p, monthEnd)) return '已延期';
      return '进行中';
    };
    const changedThisMonth = (p: typeof deliveries[0], monthEnd: Date): boolean => {
      const node15 = (p.nodes||[]).find(n => n.nodeNo === 15);
      if (!node15?.actualDate) return false;
      const d = new Date(node15.actualDate);
      const monthStart = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), 1);
      return d >= monthStart && d <= monthEnd;
    };
    const monthLabels = [3,2,1].map(i => new Date(now.getFullYear(), now.getMonth() - i, 1).toLocaleString('en', {month:'short'}));
    const statusNames = ['已完成', '进行中', '已延期'] as const;
    const statusColors = [COLORS.success, COLORS.primary, COLORS.danger] as const;
    const projectStatus: { label: string; value: number; color: string }[] = [];
    for (let si = 0; si < 3; si++) {
      for (let mi = 3; mi >= 1; mi--) {
        const d = new Date(now.getFullYear(), now.getMonth() - mi, 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const count = deliveries.filter(p => getStatusInMonth(p, monthEnd) === statusNames[si]).length;
        projectStatus.push({ label: monthLabels[3 - mi], value: count, color: statusColors[si] });
      }
    }
    const getNodeStatusInMonth = (node: any, monthEnd: Date): string | null => {
      if (node.status === 'completed' && node.actualDate && new Date(node.actualDate) <= monthEnd) return 'completed';
      if (new Date(node.plannedStartDate) > monthEnd) return null;
      if (node.status !== 'completed') {
        const baseline = node.baselineEndDate || node.baselinePlannedEndDate || node.plannedEndDate;
        if (baseline && new Date(baseline) <= monthEnd) return 'delayed';
      }
      return node.status === 'in_progress' ? 'in_progress' : 'pending';
    };
    const nodeStNames = ['completed', 'in_progress', 'delayed', 'pending'] as const;
    const nodeStColors = [COLORS.success, COLORS.primary, COLORS.danger, COLORS.chartGray];
    const nodeStatus: { label: string; value: number; color: string }[] = [];
    const allNodes = (deliveries||[]).flatMap(p => p.nodes || []);
    for (let si = 0; si < 4; si++) {
      for (let mi = 3; mi >= 1; mi--) {
        const d = new Date(now.getFullYear(), now.getMonth() - mi, 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const count = allNodes.filter(n => getNodeStatusInMonth(n, monthEnd) === nodeStNames[si]).length;
        nodeStatus.push({ label: monthLabels[3 - mi], value: count, color: nodeStColors[si] });
      }
    }
    const fyRange = parseFY(currentFy);
    const inFyDels = deliveries.filter(p => {
      const created = new Date(p.createdAt);
      if (created > fyRange.end) return false;
      const node15 = (p.nodes||[]).find(n => n.nodeNo === 15);
      let effEnd: Date;
      if (node15?.actualDate) {
        effEnd = new Date(node15.actualDate);
      } else if (p.status === '已完成' || p.status === '已延期') {
        effEnd = new Date(p.updatedAt);
      } else {
        effEnd = new Date();
      }
      return effEnd >= fyRange.start;
    });
    const onTimeRate = [...inFyDels].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(p => {
      const nowD = new Date();
      const scheduled = (p.nodes || []).filter(n => n.actualDate || new Date(n.plannedEndDate) <= nowD);
      const delayed = scheduled.filter(n => {
        if (n.actualDate) {
          const baseline = n.baselineEndDate || n.baselinePlannedEndDate || n.plannedEndDate;
          return !!baseline && new Date(n.actualDate) > new Date(baseline);
        }
        return new Date(n.plannedEndDate) <= nowD;
      });
      const onTime = scheduled.length - delayed.length;
      const rate = scheduled.length > 0 ? Math.round((onTime / scheduled.length) * 100) : 0;
      return {
        label: (() => { const s = compressNo(p.salesNo); return s.length > 4 ? s.slice(0, 4) + '\n' + s.slice(4) : s; })(),
        value: rate,
        color: p.status === '已完成' ? COLORS.chartGray : (rate >= 90 ? COLORS.success : rate >= 70 ? COLORS.warning : COLORS.danger),
      };
    });
    const getEstProfit = (p: typeof deliveries[0]) => {
      const q = quotations.find(q => q.id === p.quotationId);
      return q ? Math.round(exAmount(p.contractAmount) * q.profitRate / 100) : 0;
    };
    const getActProfit = (p: typeof deliveries[0]) => p.totalActualCost ? exAmount(p.contractAmount) - p.totalActualCost : 0;
    const profitOverview: { label: string; value: number; color: string; displayValue?: string }[] = [];
    for (const prefix of ['概算', '实际'] as const) {
      for (let mi = 3; mi >= 1; mi--) {
        const d = new Date(now.getFullYear(), now.getMonth() - mi, 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        let totalAmt = 0, totalProfit = 0;
        deliveries.forEach(p => {
          const status = getStatusInMonth(p, monthEnd);
          if (prefix === '概算' && status === '进行中') {
            totalProfit += getEstProfit(p);
            totalAmt += exAmount(p.contractAmount);
          } else if (prefix === '实际' && status === '已完成' && changedThisMonth(p, monthEnd)) {
            totalProfit += getActProfit(p);
            totalAmt += exAmount(p.contractAmount);
          }
        });
        profitOverview.push({
          label: monthLabels[3 - mi],
          value: Math.round(totalProfit / 1000),
          color: prefix === '概算' ? COLORS.primary : COLORS.success,
          displayValue: totalProfit > 0 ? `${fmtK(totalProfit)}\n（${fmtK(totalAmt)}）` : undefined,
        });
      }
    }
    return { projectStatus, nodeStatus, onTimeRate, profitOverview };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveries, quotations]);



  const fyTrend = useMemo(() => {
    const fyRange = parseFY(currentFy);
    const fyOpps = opportunities.filter(o => {
      const created = new Date(o.createdAt);
      return created >= fyRange.start && created <= fyRange.end && oppEffectiveEnd(o) >= fyRange.start;
    });
    const monthLabels = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];
    return Array.from({ length: 12 }, (_, i) => {
      const month = (6 + i) % 12;
      const monthOpps = fyOpps.filter(o => new Date(o.createdAt).getMonth() === month);
      const count = monthOpps.length;
      const amount = monthOpps.reduce((s, o) => s + exAmount(o.amount, o.taxRate), 0);
      return {
        label: monthLabels[i],
        value: count > 0 ? Math.round(amount / 1000) : 0,
        color: COLORS.primary,
        displayValue: count > 0 ? `${fmtK(amount)}\n(${count})` : undefined,
      };
    });
  }, [opportunities, currentFy]);

  const industryDist = useMemo(() => {
    const fyRange = parseFY(currentFy);
    const clientMap = new Map(clients.map(c => [c.name, { industry: c.industry, code: c.code }]));
    const counts: Record<string, number> = {};
    opportunities.forEach(o => {
      const created = new Date(o.createdAt);
      if (created <= fyRange.end && oppEffectiveEnd(o) >= fyRange.start) {
        const info = clientMap.get(o.clientName);
        const industry = info?.industry || '其他';
        counts[industry] = (counts[industry] || 0) + 1;
      }
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const colors = [COLORS.primary, COLORS.purple, COLORS.warning, COLORS.amber, COLORS.chartGray, COLORS.textSecondary, COLORS.danger];
    return sorted.map(([label, value], i) => ({ label, value, color: colors[i] || COLORS.chartGray }));
  }, [clients, opportunities, currentFy]);

  // −− 当前交付中快照（未完成的项目，不过滤月份）−−
  const currentActiveDel = useMemo(() => {
    const active = deliveries.filter(p => p.status !== '已完成');
    return {
      amt: active.reduce((s, p) => s + exAmount(p.contractAmount), 0),
      cnt: active.length,
    };
  }, [deliveries]);

  return (
    <div className="dashboard-container">
      {/* ── 标题 ── */}
      <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark, marginBottom: 20, letterSpacing: 0.5 }}>
        仪表盘
      </div>

      {/* ── KPI 卡片行（等宽铺满，与销售分析一致） ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
        <KpiCard label="上月机会" value={fmtMonthly(monthlyKpi[0].amt, monthlyKpi[0].cnt)} color={COLORS.primary} icon="📊"
          prevValues={[
            { value: fmtMonthly(monthlyKpi[1].amt, monthlyKpi[1].cnt), color: COLORS.primary },
            { value: fmtMonthly(monthlyKpi[2].amt, monthlyKpi[2].cnt), color: COLORS.primary },
          ]} />
        <KpiCard label="上月赢单" value={fmtMonthly(monthlyKpi[0].winAmt, monthlyKpi[0].winCnt)} color={COLORS.success} icon="🏆"
          prevValues={[
            { value: fmtMonthly(monthlyKpi[1].winAmt, monthlyKpi[1].winCnt), color: COLORS.success },
            { value: fmtMonthly(monthlyKpi[2].winAmt, monthlyKpi[2].winCnt), color: COLORS.success },
          ]} />
        <KpiCard label="上月新增" value={fmtMonthly(monthlyKpi[0].newAmt, monthlyKpi[0].newCnt)} color={COLORS.amber} icon="✨"
          prevValues={[
            { value: fmtMonthly(monthlyKpi[1].newAmt, monthlyKpi[1].newCnt), color: COLORS.amber },
            { value: fmtMonthly(monthlyKpi[2].newAmt, monthlyKpi[2].newCnt), color: COLORS.amber },
          ]} />
        <KpiCard label="上月交付" value={fmtMonthly(monthlyKpi[0].deliveredAmt, monthlyKpi[0].deliveredCnt)} color={COLORS.success} icon="🚚"
          prevValues={[
            { value: fmtMonthly(monthlyKpi[1].deliveredAmt, monthlyKpi[1].deliveredCnt), color: COLORS.success },
            { value: fmtMonthly(monthlyKpi[2].deliveredAmt, monthlyKpi[2].deliveredCnt), color: COLORS.success },
          ]} />
        <KpiCard label="交付中" value={fmtMonthly(currentActiveDel.amt, currentActiveDel.cnt)} color={COLORS.purple} icon="🚧"
          prevValues={[
            { value: fmtMonthly(monthlyKpi[0].delAmt, monthlyKpi[0].delCnt), color: COLORS.purple },
            { value: fmtMonthly(monthlyKpi[1].delAmt, monthlyKpi[1].delCnt), color: COLORS.purple },
          ]} />
      </div>

      {/* ── 交付状态 ── */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
        <Card size="small"
          style={{ flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '18px 20px' } }}>
          <SectionTitle title="交付状态" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minHeight: 150, marginTop: -18 }}>
            <div style={{ flex: 3.5, display: 'flex', flexDirection: 'column', marginLeft: -20 }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>项目状态</div>
              <VerticalBars items={deliveryStats.projectStatus} height={210} groupGaps={[2, 5]} gapSize={4} />
            </div>
            <div style={{ width: 1, background: COLORS.borderLight, flexShrink: 0 }} />
            <div style={{ flex: 4.5, display: 'flex', flexDirection: 'column', marginLeft: -10 }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>节点执行</div>
              <VerticalBars items={deliveryStats.nodeStatus} height={210} groupGaps={[2, 5, 8]} gapSize={5} />
            </div>
            <div style={{ width: 1, background: COLORS.borderLight, flexShrink: 0 }} />
            <div style={{ flex: 7.5, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>节点准时率</div>
              <VerticalBars items={deliveryStats.onTimeRate} height={210} unit="%" maxSlots={18} />
            </div>
            <div style={{ width: 1, background: COLORS.borderLight, flexShrink: 0 }} />
            <div style={{ flex: 3.5, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>利润概览</div>
              <VerticalBars items={deliveryStats.profitOverview} height={210} unit="K" />
            </div>
          </div>
        </Card>
      </div>

      {/* ── 底栏：管道节点 | 行业分布 | 机会趋势 ── */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <Card size="small"
          style={{ flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '16px 18px' } }}>
          <SectionTitle title="管道节点" />
          <div style={{ marginTop: 50, marginLeft: -20 }}>
            <VerticalBars items={stageDist} height={250} groupGaps={[2, 5, 8, 11]} />
          </div>
        </Card>

        <Card size="small"
          style={{ flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '16px 18px' } }}>
          <SectionTitle title="行业分布" count={industryDist.reduce((s, i) => s + i.value, 0)} />
          {industryDist.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无数据</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: -20 }}>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', overflow: 'visible' }}>
                <PieChart items={industryDist} pieSize={240} />
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {industryDist.map(i => (
                  <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: i.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>{i.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card size="small"
          style={{ flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '16px 18px' } }}>
          <SectionTitle title="机会趋势" count={fyTrend.reduce((s, m) => s + m.value, 0)} />
          {fyTrend.every(m => m.value === 0) ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>当前财年暂无新增</div>
          ) : (
            <div style={{ marginTop: 50 }}>
              <VerticalBars items={fyTrend} height={250} unit="K" />
            </div>
          )}
        </Card>
      </div>

      {/* ── 动态：近期赢单 | 待审批项 | 近期输单 ── */}
      <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
        <Card size="small"
          style={{ flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '4px 16px' } }}>
          <SectionTitle title="近期赢单" count={recentWins.length} />
          {recentWins.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无赢单记录</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recentWins.map(o => (
                <div key={o.id} onClick={() => navigate('/opportunities')}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = COLORS.bgSelected}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 16, lineHeight: 1, color: COLORS.success }}>✔</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.salesNo}</div>
                    <div style={{ fontSize: 11, color: COLORS.textLight, display: 'flex', gap: 10, marginTop: 1 }}>
                      <span>{o.salesman}</span>
                      <span>{formatBeijing(o.wonAt)}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.success, whiteSpace: 'nowrap' }}>¥{fmtK(exAmount(o.amount, o.taxRate))}</span>
                  <RightOutlined style={{ color: COLORS.textLight, fontSize: 12 }} />
                </div>
              ))}
            </div>
          )}
        </Card>

                <Card size="small"
          style={{ flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '4px 16px' } }}>
          <SectionTitle title="近期输单" count={recentLosses.length} />
          {recentLosses.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无输单记录</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recentLosses.map(o => {
                return (
                  <div key={o.id} onClick={() => navigate('/opportunities')}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = COLORS.bgSelected}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontSize: 16, lineHeight: 1, color: COLORS.danger }}>✘</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.salesNo}</div>
                      <div style={{ fontSize: 11, color: COLORS.textLight, display: 'flex', gap: 10, marginTop: 1 }}>
                        <span>{o.salesman}</span>
                        <span>{formatBeijing(o.lostAt || o.updatedAt)}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>¥{fmtK(exAmount(o.amount, o.taxRate))}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

<Card size="small"
          style={{ flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '4px 16px' } }}>
          <SectionTitle title="近期交付" count={recentDeliveries.length} />
          {recentDeliveries.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无已交付项目</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recentDeliveries.map(p => {
                const node15 = (p.nodes||[]).find(n => n.nodeNo === 15);
                return (
                <div key={p.id} onClick={() => navigate('/delivery/' + p.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = COLORS.bgSelected}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 16, lineHeight: 1, color: COLORS.success }}>✔</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.salesNo}</div>
                    <div style={{ fontSize: 11, color: COLORS.textLight, display: 'flex', gap: 10, marginTop: 1 }}>
                      <span>{p.clientName}</span>
                      <span>{formatBeijing(node15?.actualDate || p.updatedAt)}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.success, whiteSpace: 'nowrap' }}>¥{fmtK(exAmount(p.contractAmount))}</span>
                  <RightOutlined style={{ color: COLORS.textLight, fontSize: 12 }} />
                </div>
              );})}
            </div>
          )}
        </Card>

        
      </div>
    </div>
  );
};

export default Dashboard;
