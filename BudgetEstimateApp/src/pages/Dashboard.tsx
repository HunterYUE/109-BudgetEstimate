import React, { useMemo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { parseFY } from '../utils/fiscalYear';
import { formatBeijing } from '../utils/timeFormat';
import { fmtK, compressNo, oppEffectiveEnd, isRealWin, monthEndOf, exAmount, stageAsOf, getNode15, getNodeDelay, getProjectDelay, getProjectDoneDate, projectMonthlySales } from '../utils/analysisShared';
import { COLORS } from '../styles/colors';
import { opportunityService } from '../services/opportunityService';
import { deliveryService } from '../services/deliveryService';
import { clientService } from '../services/clientService';
import { quotationService } from '../services/quotationService';
import type { SalesOpportunity, DeliveryProject, Client, QuotationSummary, DeliveryNode } from '../types';

/** 交付合同额未税：取机会关联报价的实际税率（与销售分析 exTaxOf 同口径），无报价回退 13% */
const exTaxOfDelivery = (p: DeliveryProject, quotations: QuotationSummary[]): number => {
  const q = quotations.find(q => q.id === p.quotationId);
  return exAmount(p.contractAmount, q?.taxRate);
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
                  {/* 0 值（含负值）不渲染柱条，仅保留数值标签，避免 4% 兜底产生误导性 stub */}
                  {item.value > 0 && (
                    <div style={{
                      width: barWidth,
                      height: `${Math.max((item.value / max) * 100, 4)}%`, minHeight: 4,
                      border: `3px solid ${item.color}`,
                      background: 'transparent',
                    }} />
                  )}
                </>
              ) : (
                <div style={{ width: item && item.color === 'transparent' ? 16 : barWidth, height: 0 }} />
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', marginTop: 6, paddingLeft: 32, gap: 2 }}>
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
      const mEnd = monthEndOf(d.getFullYear(), d.getMonth());
      const monthOpps = opportunities.filter(o => {
        const created = new Date(o.createdAt);
        // ⚠️ 有效结束用 oppEffectiveEnd（赢→wonAt/输→lostAt），与销售分析/财年规则一致，不用 updatedAt
        return created <= mEnd && oppEffectiveEnd(o) >= mStart;
      });
      const monthWins = monthOpps.filter(o => {
        // ⚠️ 赢单以「转交付（terminated）」为终极确认：手动标赢未转交付不算赢单，仍当作机会
        if (!isRealWin(o) || !o.wonAt) return false;
        const wonD = new Date(o.wonAt);
        return wonD >= mStart && wonD <= mEnd;
      });
      const monthNew = opportunities.filter(o => new Date(o.createdAt) >= mStart && new Date(o.createdAt) <= mEnd);
      const activeDel = deliveries.filter(p => {
        const created = new Date(p.createdAt);
        if (created > mEnd) return false;
        // 交付中 = 该月末仍在交付的项目快照：月末前已完成 → 排除
        const doneDate = getProjectDoneDate(p);
        if (doneDate && doneDate <= mEnd) return false;
        return true;
      });
      const monthDelivered = deliveries.filter(p => {
        const doneDate = getProjectDoneDate(p);
        return !!doneDate && doneDate >= mStart && doneDate <= mEnd;
      });
      const winCnt = monthWins.length;
      return {
        amt: monthOpps.reduce((s, o) => s + exAmount(o.amount, o.taxRate), 0), cnt: monthOpps.length,
        winAmt: monthWins.reduce((s, o) => s + exAmount(o.amount, o.taxRate), 0), winCnt,
        newAmt: monthNew.reduce((s, o) => s + exAmount(o.amount, o.taxRate), 0), newCnt: monthNew.length,
        delAmt: activeDel.reduce((s, p) => s + exTaxOfDelivery(p, quotations), 0), delCnt: activeDel.length,
        deliveredAmt: monthDelivered.reduce((s, p) => s + exTaxOfDelivery(p, quotations), 0),
        deliveredCnt: monthDelivered.length,
      };
    };
    return [calcMonth(1), calcMonth(2), calcMonth(3)];
  }, [opportunities, deliveries, quotations, now]);

  const recentWins = useMemo(() => {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 2);
    return opportunities.filter(o => isRealWin(o) && o.wonAt && new Date(o.wonAt) >= cutoff).sort((a, b) => new Date(b.wonAt!).getTime() - new Date(a.wonAt!).getTime()).slice(0, 5);
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
      if (isRealWin(o) && o.wonAt && new Date(o.wonAt) <= monthEnd) return null;
      if (o.status === '输' && o.lostAt && new Date(o.lostAt) <= monthEnd) return null;
      // ⚠️ 用阶段推进时间还原该月月底的历史阶段（与销售分析漏斗 stageAsOf 同口径），而非当前阶段
      return stageAsOf(o, monthEnd);
    };
    const result: { label: string; value: number; color: string }[] = [];
    for (const stage of stages) {
      const ci = stages.indexOf(stage);
      for (let mi = 3; mi >= 1; mi--) {
        const d = new Date(now.getFullYear(), now.getMonth() - mi, 1);
        const monthEnd = monthEndOf(d.getFullYear(), d.getMonth());
        const count = opportunities.filter(o => getPipelineStage(o, monthEnd) === stage).length;
        result.push({ label: monthLabels[3 - mi], value: count, color: colors[ci] });
      }
    }
    return result;
  }, [opportunities, now]);

  // −− 近期交付（已完成的项目，按第15节点实际完成时间倒序）−−
  const recentDeliveries = useMemo(() => {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 2);
    const done = deliveries.filter(p => {
      const node15 = getNode15(p.nodes);
      if (!node15 || node15.status !== 'completed') return false;
      return node15.actualDate && new Date(node15.actualDate) >= cutoff;
    }).sort((a, b) => {
      const da = new Date(getNode15(a.nodes)?.actualDate || 0).getTime();
      const db = new Date(getNode15(b.nodes)?.actualDate || 0).getTime();
      return db - da;
    }).slice(0, 5);
    return done;
  }, [deliveries]);


  const currentFy = useMemo(() => {
    const y = now.getFullYear(), m = now.getMonth();
    const y1 = m >= 6 ? y : y - 1;
    const y2 = m >= 6 ? y + 1 : y;
    return `FY${String(y1 % 100).padStart(2, '0')}${String(y2 % 100).padStart(2, '0')}`;
  }, [now]);

  const deliveryStats = useMemo(() => {
    // 项目延期判断（以第15节点为准，共享延期口径 getProjectDelay）：
    // 该月月底前已完成→已完成；否则该月底超出初始审批基线（计划排后或已超期）→已延期
    const getProjDelayedAt = (p: typeof deliveries[0], refDate: Date): boolean =>
      getProjectDelay(p, refDate).delayed;
    const getStatusInMonth = (p: typeof deliveries[0], monthEnd: Date): string | null => {
      const created = new Date(p.createdAt);
      if (created > monthEnd) return null;
      const doneDate = getProjectDoneDate(p);
      if (doneDate && doneDate <= monthEnd) {
        // 完成月份：实际完成日 > 基线 → 延期完成（已延期）；否则按时完成（已完成）
        const monthStart = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), 1);
        if (doneDate >= monthStart && getProjDelayedAt(p, monthEnd)) return '已延期';
        return '已完成';
      }
      // 未完成：该月月末已超出初始基线 → 事实延期（已延期）
      if (getProjDelayedAt(p, monthEnd)) return '已延期';
      return '进行中';
    };
    const monthLabels = [3,2,1].map(i => new Date(now.getFullYear(), now.getMonth() - i, 1).toLocaleString('en', {month:'short'}));
    const statusNames = ['已完成', '进行中', '已延期'] as const;
    const statusColors = [COLORS.success, COLORS.primary, COLORS.danger] as const;
    const projectStatus: { label: string; value: number; color: string }[] = [];
    for (let si = 0; si < 3; si++) {
      for (let mi = 3; mi >= 1; mi--) {
        const d = new Date(now.getFullYear(), now.getMonth() - mi, 1);
        const monthEnd = monthEndOf(d.getFullYear(), d.getMonth());
        const count = deliveries.filter(p => getStatusInMonth(p, monthEnd) === statusNames[si]).length;
        projectStatus.push({ label: monthLabels[3 - mi], value: count, color: statusColors[si] });
      }
    }
    // 节点在月内的各桶（当月口径，不含未开始）：已完成=当月完成；进行中=当月执行过（含当月完成者）；
    //   延期=当月延期完成+延期中。月前已完成节点不计入当月各桶。
    const getNodeBucketsInMonth = (node: DeliveryNode, monthEnd: Date): string[] => {
      const monthStart = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), 1);
      const doneDate = node.actualDate || node.actualEndDate;
      const doneD = doneDate ? new Date(doneDate) : null;
      // 月前已完成 → 属历史执行月份，本月不计
      if (node.status === 'completed' && doneD && doneD < monthStart) return [];
      // 该月计划窗口未开始 → 不计
      if (new Date(node.plannedStartDate) > monthEnd) return [];
      const delay = getNodeDelay(node, monthEnd);
      // 当月执行过：开始 ≤ 月末（含当月完成者）
      const executedInM = (node.actualStartDate && new Date(node.actualStartDate) <= monthEnd)
        || node.status === 'in_progress';
      const buckets: string[] = [];
      if (executedInM) buckets.push('in_progress');
      // 当月完成：延期完成 → delayed；按时完成 → completed
      if (node.status === 'completed' && doneD && doneD <= monthEnd) {
        buckets.push(delay.delayed ? 'delayed' : 'completed');
      } else if (delay.delayed) {
        // 延期中（未完成且已超基线；含未开始但已超基线的事实延期）
        buckets.push('delayed');
      }
      return buckets;
    };
    const nodeStNames = ['completed', 'in_progress', 'delayed'] as const;
    const nodeStColors = [COLORS.success, COLORS.primary, COLORS.danger];
    const nodeStatus: { label: string; value: number; color: string }[] = [];
    const allNodes = (deliveries||[]).flatMap(p => p.nodes || []);
    for (let si = 0; si < 3; si++) {
      for (let mi = 3; mi >= 1; mi--) {
        const d = new Date(now.getFullYear(), now.getMonth() - mi, 1);
        const monthEnd = monthEndOf(d.getFullYear(), d.getMonth());
        const count = allNodes.filter(n => getNodeBucketsInMonth(n, monthEnd).includes(nodeStNames[si])).length;
        nodeStatus.push({ label: monthLabels[3 - mi], value: count, color: nodeStColors[si] });
      }
    }
    const fyRange = parseFY(currentFy);
    const inFyDels = deliveries.filter(p => {
      const created = new Date(p.createdAt);
      if (created > fyRange.end) return false;
      // 有效结束：已完成→实际完成日（updatedAt 回退）；未完成→至今
      const doneDate = getProjectDoneDate(p);
      const effEnd = doneDate ?? new Date();
      return effEnd >= fyRange.start;
    });
    const onTimeRate = [...inFyDels].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(p => {
      const nowD = new Date();
      // 到期节点 = 已完成 或 已超基线（事实延期）；与事实延期判定一致（基线口径，非当前计划）
      const scheduled = (p.nodes || []).filter(n => n.actualDate || getNodeDelay(n, nowD).delayed);
      const delayed = scheduled.filter(n => getNodeDelay(n, nowD).delayed);
      const onTime = scheduled.length - delayed.length;
      const hasDue = scheduled.length > 0;
      const rate = hasDue ? Math.round((onTime / scheduled.length) * 100) : -1; // -1 = 无到期节点
      return {
        label: (() => { const s = compressNo(p.salesNo); return s.length > 4 ? s.slice(0, 4) + '\n' + s.slice(4) : s; })(),
        value: hasDue ? rate : 0,
        color: !hasDue ? COLORS.textLight : (p.status === '已完成' ? COLORS.chartGray : (rate >= 90 ? COLORS.success : rate >= 70 ? COLORS.warning : COLORS.danger)),
        displayValue: hasDue ? undefined : '—',
      };
    });
    const profitOverview: { label: string; value: number; color: string; displayValue?: string }[] = [];
    // 利润概览（与销售分析月度订单/月度销售同源，共享 projectMonthlySales）：
    //   概算 = 每月转交付项目的订单利润（报价概算利润未税）→ 观察近3月订单利润
    //   实际 = 每月完成交付项目的销售利润（未税 − 实际成本）→ 观察近3月销售利润
    for (const prefix of ['概算', '实际'] as const) {
      for (let mi = 3; mi >= 1; mi--) {
        const d = new Date(now.getFullYear(), now.getMonth() - mi, 1);
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const monthEnd = monthEndOf(d.getFullYear(), d.getMonth());
        let totalAmt = 0, totalProfit = 0, incomplete = false;
        deliveries.forEach(p => {
          const q = quotations.find(q => q.id === p.quotationId);
          const pt = projectMonthlySales(p, monthStart, monthEnd, q?.taxRate, q?.gp3Amount);
          if (prefix === '概算') {
            totalProfit += pt.orderProfit;
            totalAmt += pt.orderAmt;
          } else {
            totalAmt += pt.salesAmt;
            // ⚠️ 某月任一完成交付项目无成本 → 该月销售利润为无值（—），提示成本缺失
            if (pt.salesProfit !== undefined) totalProfit += pt.salesProfit;
            else incomplete = true;
          }
        });
        profitOverview.push({
          label: monthLabels[3 - mi],
          value: incomplete ? 0 : Math.round(totalProfit / 1000),
          color: prefix === '概算' ? COLORS.primary : COLORS.success,
          displayValue: incomplete ? '—' : (totalProfit > 0 ? `${fmtK(totalProfit)}\n（${fmtK(totalAmt)}）` : undefined),
        });
      }
    }
    return { projectStatus, nodeStatus, onTimeRate, profitOverview };
  }, [deliveries, quotations, now, currentFy]);



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
    const industryByName = new Map(clients.map(c => [c.name, c.industry]));
    const counts: Record<string, number> = {};
    opportunities.forEach(o => {
      const created = new Date(o.createdAt);
      if (created <= fyRange.end && oppEffectiveEnd(o) >= fyRange.start) {
        const industry = industryByName.get(o.clientName) || '其他';
        counts[industry] = (counts[industry] || 0) + 1;
      }
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const colors = [COLORS.primary, COLORS.purple, COLORS.warning, COLORS.amber, COLORS.chartGray, COLORS.textSecondary, COLORS.danger];
    return sorted.map(([label, value], i) => ({ label, value, color: colors[i] || COLORS.chartGray }));
  }, [clients, opportunities, currentFy]);

  // 交付中 = monthlyKpi[0]/[1]/[2]（与其他卡片同口径：主值=上一个完整月，副值=前两月/前三月）
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
        <KpiCard label="交付中" value={fmtMonthly(monthlyKpi[0].delAmt, monthlyKpi[0].delCnt)} color={COLORS.purple} icon="🚧"
          prevValues={[
            { value: fmtMonthly(monthlyKpi[1].delAmt, monthlyKpi[1].delCnt), color: COLORS.purple },
            { value: fmtMonthly(monthlyKpi[2].delAmt, monthlyKpi[2].delCnt), color: COLORS.purple },
          ]} />
      </div>

      {/* ── 交付状态 ── */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
        <Card size="small"
          style={{ flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '18px 20px' } }}>
          <SectionTitle title="交付状态" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minHeight: 150, marginTop: -18 }}>
            <div style={{ flex: 4.0625, display: 'flex', flexDirection: 'column', marginLeft: -20 }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>项目状态</div>
              <VerticalBars items={deliveryStats.projectStatus} height={210} groupGaps={[2, 5]} gapSize={4} />
            </div>
            <div style={{ width: 1, background: COLORS.borderLight, flexShrink: 0 }} />
            <div style={{ flex: 4.0625, display: 'flex', flexDirection: 'column', marginLeft: -10 }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>节点执行</div>
              <VerticalBars items={deliveryStats.nodeStatus} height={210} groupGaps={[2, 5]} gapSize={5} />
            </div>
            <div style={{ width: 1, background: COLORS.borderLight, flexShrink: 0 }} />
            <div style={{ flex: 8.0625, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>节点准时率</div>
              <VerticalBars items={deliveryStats.onTimeRate} height={210} unit="%" maxSlots={18} />
            </div>
            <div style={{ width: 1, background: COLORS.borderLight, flexShrink: 0 }} />
            <div style={{ flex: 2.8125, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>利润概览</div>
              <VerticalBars items={deliveryStats.profitOverview} height={210} unit="K" groupGaps={[2]} />
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

      {/* ── 动态：近期赢单 | 近期输单 | 近期交付 ── */}
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
              {recentLosses.map(o => (
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
              ))}
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
                const doneDate = getProjectDoneDate(p);
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
                        <span>{formatBeijing(doneDate?.toISOString() || p.updatedAt)}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.success, whiteSpace: 'nowrap' }}>¥{fmtK(exTaxOfDelivery(p, quotations))}</span>
                    <RightOutlined style={{ color: COLORS.textLight, fontSize: 12 }} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>


      </div>
    </div>
  );
};

export default Dashboard;
