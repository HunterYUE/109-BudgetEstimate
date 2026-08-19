import React, { useMemo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { FiBarChart2, FiAward, FiPlusCircle, FiTruck, FiTool } from 'react-icons/fi';
import { parseFY, fiscalYearLabel } from '../utils/fiscalYear';
import { formatBeijing } from '../utils/timeFormat';
import { LIST_LIMIT } from '../utils/constants';
import { fmtK, chartLabel, oppEffectiveEnd, isRealWin, monthEndOf, exAmount, stageAsOf, getNodeDelay, getProjectDelay, isProjectDelivered, getProjectDoneDate, projectMonthlySales, FY_MONTH_LABELS, buildQuoteInfoMap, deliveryExTax, computeProjectOnTimeRate } from '../utils/analysisShared';
import { COLORS } from '../styles/colors';
import { VerticalBarChart } from '../components/charts/VerticalBarChart';
import { OverviewCards } from '../components/shared/OverviewCards';
import { opportunityService } from '../services/opportunityService';
import { deliveryService } from '../services/deliveryService';
import { clientService } from '../services/clientService';
import { quotationService } from '../services/quotationService';
import type { SalesOpportunity, DeliveryProject, Client, QuotationSummary, DeliveryNode } from '../types';

/** 月度 KPI 卡片展示：数量为 0 时显示 —（避免 "0K / 0" 误导） */
const fmtMonthly = (amt: number, cnt: number): string =>
  cnt === 0 ? '—' : `${fmtK(amt)} / ${cnt}`;

/** 距今 n 个月的 1 号（首日，避免 setMonth 月末溢出） */
const monthsAgoStart = (now: Date, n: number): Date =>
  new Date(now.getFullYear(), now.getMonth() - n, 1);

/** 近 3 个完整月的起止窗口（[前3月, 前2月, 前1月]，与展示标签顺序一致）；全页统计 memo 共享的唯一来源 */
const last3MonthsOf = (now: Date): { start: Date; end: Date }[] =>
  [3, 2, 1].map(mi => {
    const start = monthsAgoStart(now, mi);
    return { start, end: monthEndOf(start.getFullYear(), start.getMonth()) };
  });

// ── 区块标题 ──
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

// ── 饼图（引出线沿圆周分布） ──
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
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', maxWidth: W, height: 'auto', display: 'block', overflow: 'visible' }}>
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
    let cancelled = false;
    // ⚠️ allSettled：单个接口失败不拖垮整页（Promise.all 会整体拒绝导致仪表盘全空）
    Promise.allSettled([
      // 全部传 limit: LIST_LIMIT，避免后端默认 limit=100 导致统计静默截断（对齐 DeliveryAnalysis）
      opportunityService.list({ limit: LIST_LIMIT }),
      deliveryService.list({ limit: LIST_LIMIT }),
      clientService.list({ limit: LIST_LIMIT }),
      quotationService.list({ limit: LIST_LIMIT }),
    ]).then(([opps, dels, clis, quots]) => {
      if (cancelled) return;
      if (opps.status === 'fulfilled') setOpportunities(opps.value);
      if (dels.status === 'fulfilled') setDeliveries(dels.value);
      if (clis.status === 'fulfilled') setClients(clis.value);
      if (quots.status === 'fulfilled') setQuotations(quots.value);
    });
    return () => { cancelled = true; };
  }, []);

  const now = useMemo(() => new Date(), []);
  // 近 3 个月窗口唯一事实来源：各统计 memo 共享，避免各自重复计算
  const last3Months = useMemo(() => last3MonthsOf(now), [now]);
  const last3Labels = useMemo(() => last3Months.map(w => w.start.toLocaleString('en', { month: 'short' })), [last3Months]);
  // 报价按 id 建索引，避免利润概览反复 find（O(N×M)）
  const quotationsById = useMemo(() => new Map(quotations.map(q => [q.id, q])), [quotations]);
  // 交付关联报价（按交付项目 id 索引）：税率统一取交付自身 quotationId（共享 deliveryExTax 口径，与销售/交付分析一致）
  const deliveryQuoteInfo = useMemo(() => buildQuoteInfoMap(deliveries, qid => quotationsById.get(qid)), [deliveries, quotationsById]);

  // ── 按月 KPI（最近3个完整月） ──
  const monthlyKpi = useMemo(() => {
    const calcMonth = (offset: number) => {
      // offset 1→上月(索引2)、2→前2月(索引1)、3→前3月(索引0)
      const { start: mStart, end: mEnd } = last3Months[3 - offset];
      const monthOpps = opportunities.filter(o => {
        const created = new Date(o.createdAt);
        // ⚠️ 有效结束用 oppEffectiveEnd（赢→wonAt/输→lostAt），与销售分析/财年规则一致，不用 updatedAt
        // 冻结机会不属于活跃（全页面统一口径），不计入
        return created <= mEnd && oppEffectiveEnd(o) >= mStart && o.status !== '冻结';
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
        delAmt: activeDel.reduce((s, p) => s + deliveryExTax(p, deliveryQuoteInfo), 0), delCnt: activeDel.length,
        deliveredAmt: monthDelivered.reduce((s, p) => s + deliveryExTax(p, deliveryQuoteInfo), 0),
        deliveredCnt: monthDelivered.length,
      };
    };
    return [calcMonth(1), calcMonth(2), calcMonth(3)];
  }, [opportunities, deliveries, deliveryQuoteInfo, last3Months]);

  const recentWins = useMemo(() => {
    // 近 2 个月窗口：前两个月首日（避免 setMonth 月末溢出）
    const cutoff = monthsAgoStart(now, 2);
    return opportunities.filter(o => isRealWin(o) && o.wonAt && new Date(o.wonAt) >= cutoff).sort((a, b) => new Date(b.wonAt!).getTime() - new Date(a.wonAt!).getTime()).slice(0, 5);
  }, [opportunities, now]);

  const recentLosses = useMemo(() => {
    // 近 2 个月窗口：前两个月首日（避免 setMonth 月末溢出）
    const cutoff = monthsAgoStart(now, 2);
    return opportunities.filter(o => o.status === '输' && o.lostAt && new Date(o.lostAt) >= cutoff).sort((a, b) => new Date(b.lostAt!).getTime() - new Date(a.lostAt!).getTime()).slice(0, 5);
  }, [opportunities, now]);


  const stageDist = useMemo(() => {
    const stages = ['信息', '线索', '机会', '投标', '议价'];
    const colors = [COLORS.chartGray, COLORS.primary, COLORS.purple, COLORS.warning, COLORS.amber];
    const getPipelineStage = (o: SalesOpportunity, monthEnd: Date) => {
      if (new Date(o.createdAt) > monthEnd) return null;
      // 冻结机会排除在管道之外（全页面统一口径）
      if (o.status === '冻结') return null;
      if (isRealWin(o) && o.wonAt && new Date(o.wonAt) <= monthEnd) return null;
      if (o.status === '输' && o.lostAt && new Date(o.lostAt) <= monthEnd) return null;
      // ⚠️ 用阶段推进时间还原该月月底的历史阶段（与销售分析漏斗 stageAsOf 同口径），而非当前阶段
      return stageAsOf(o, monthEnd);
    };
    const result: { name: string; value: number; color: string }[] = [];
    stages.forEach((stage, ci) => {
      for (let mi = 3; mi >= 1; mi--) {
        const { end: monthEnd } = last3Months[3 - mi];
        const count = opportunities.filter(o => getPipelineStage(o, monthEnd) === stage).length;
        result.push({ name: last3Labels[3 - mi], value: count, color: colors[ci] });
      }
    });
    return result;
  }, [opportunities, last3Months, last3Labels]);

  // ── 近期交付（已完成的项目，按实际完成时间倒序）──
  const recentDeliveries = useMemo(() => {
    // 近 2 个月窗口：前两个月首日（避免 setMonth 月末溢出）
    const cutoff = monthsAgoStart(now, 2);
    return deliveries.filter(p => {
      const doneDate = getProjectDoneDate(p);
      return !!doneDate && doneDate >= cutoff;
    }).sort((a, b) => {
      const da = getProjectDoneDate(a)?.getTime() ?? 0;
      const db = getProjectDoneDate(b)?.getTime() ?? 0;
      return db - da;
    }).slice(0, 5);
  }, [deliveries, now]);


  const currentFy = useMemo(() => fiscalYearLabel(now), [now]);

  const deliveryStats = useMemo(() => {
    // 项目延期判断（以第15节点为准，共享延期口径 getProjectDelay）：
    // 该月月底前已完成→已完成；否则该月底超出初始审批基线（计划排后或已超期）→已延期
    const getProjDelayedAt = (p: DeliveryProject, refDate: Date): boolean =>
      getProjectDelay(p, refDate).delayed;
    const getStatusInMonth = (p: DeliveryProject, monthEnd: Date): string | null => {
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
    const statusNames = ['已完成', '进行中', '已延期'] as const;
    const statusColors = [COLORS.success, COLORS.primary, COLORS.danger] as const;
    const projectStatus: { name: string; value: number; color: string }[] = [];
    for (let si = 0; si < 3; si++) {
      for (let mi = 3; mi >= 1; mi--) {
        const { end: monthEnd } = last3Months[3 - mi];
        const count = deliveries.filter(p => getStatusInMonth(p, monthEnd) === statusNames[si]).length;
        projectStatus.push({ name: last3Labels[3 - mi], value: count, color: statusColors[si] });
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
    const nodeStatus: { name: string; value: number; color: string }[] = [];
    const allNodes = deliveries.flatMap(p => p.nodes || []);
    for (let si = 0; si < 3; si++) {
      for (let mi = 3; mi >= 1; mi--) {
        const { end: monthEnd } = last3Months[3 - mi];
        const count = allNodes.filter(n => getNodeBucketsInMonth(n, monthEnd).includes(nodeStNames[si])).length;
        nodeStatus.push({ name: last3Labels[3 - mi], value: count, color: nodeStColors[si] });
      }
    }
    const fyRange = parseFY(currentFy);
    const inFyDels = deliveries.filter(p => {
      const created = new Date(p.createdAt);
      if (created > fyRange.end) return false;
      // 有效结束：已完成→实际完成日；未完成→至今（统一共享口径，时基与 now 一致）
      const doneDate = getProjectDoneDate(p);
      const effEnd = doneDate ?? now;
      return effEnd >= fyRange.start;
    });
    const onTimeRate = [...inFyDels].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(p => {
      // ⚠️ A2 审计修复：无基线节点不判定——提取为共享纯函数 computeProjectOnTimeRate，
      //   与 DeliveryAnalysis 节点按时率「无基线不判定」口径一致（原内联实现把无基线已完节点计为按时，
      //   未审批实施计划的项目节点按时率恒 100%）
      const { scheduled, rate } = computeProjectOnTimeRate(p, now);
      const hasDue = scheduled > 0;
      return {
        name: chartLabel(p.salesNo),
        value: rate ?? 0,
        color: !hasDue ? COLORS.textLight : (isProjectDelivered(p) ? COLORS.chartGray : ((rate ?? 0) >= 90 ? COLORS.success : (rate ?? 0) >= 70 ? COLORS.warning : COLORS.danger)),
        displayValue: hasDue ? undefined : '—',
      };
    });
    const profitOverview: { name: string; value: number; color: string; displayValue?: string }[] = [];
    // 利润概览（与销售分析月度订单/月度销售同源，共享 projectMonthlySales）：
    //   概算 = 每月转交付项目的订单利润（报价概算利润未税）→ 观察近3月订单利润
    //   实际 = 每月完成交付项目的销售利润（未税 − 实际成本）→ 观察近3月销售利润
    // ⚠️ 近 3 个月窗口（含边界）预过滤交付项目，避免对每个月份窗口全量遍历（O(M×N)）
    // last3Months[0]=3个月前(最早月)，[2]=上个月(最晚月)；窗口取最早起点~最晚终点
    const winLo = last3Months[0].start, winHi = last3Months[2].end;
    const profitDels = deliveries.filter(p => {
      const created = new Date(p.createdAt);
      const done = getProjectDoneDate(p);
      return (created >= winLo && created <= winHi) || (done != null && done >= winLo && done <= winHi);
    });
    for (const prefix of ['概算', '实际'] as const) {
      for (let mi = 3; mi >= 1; mi--) {
        const { start: monthStart, end: monthEnd } = last3Months[3 - mi];
        let totalAmt = 0, totalProfit = 0, incomplete = false;
        profitDels.forEach(p => {
          const q = quotationsById.get(p.quotationId);
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
          name: last3Labels[3 - mi],
          value: incomplete ? 0 : Math.round(totalProfit / 1000),
          color: prefix === '概算' ? COLORS.primary : COLORS.success,
          displayValue: incomplete ? '—' : (totalProfit > 0 ? `${fmtK(totalProfit)}\n（${fmtK(totalAmt)}）` : undefined),
        });
      }
    }
    return { projectStatus, nodeStatus, onTimeRate, profitOverview };
  }, [deliveries, quotationsById, now, currentFy, last3Months, last3Labels]);



  const fyTrend = useMemo(() => {
    const fyRange = parseFY(currentFy);
    const fyOpps = opportunities.filter(o => {
      const created = new Date(o.createdAt);
      return created >= fyRange.start && created <= fyRange.end && oppEffectiveEnd(o) >= fyRange.start;
    });
    return Array.from({ length: 12 }, (_, i) => {
      const month = (6 + i) % 12;
      const monthOpps = fyOpps.filter(o => new Date(o.createdAt).getMonth() === month);
      const count = monthOpps.length;
      const amount = monthOpps.reduce((s, o) => s + exAmount(o.amount, o.taxRate), 0);
      return {
        name: FY_MONTH_LABELS[i],
        count, // 机会数（空判断用）；value 是 K 金额（徽标累加用）——两者用途不同
        value: count > 0 ? Math.round(amount / 1000) : 0,
        color: COLORS.primary,
        displayValue: count > 0 ? `${fmtK(amount)}\n(${count})` : undefined,
      };
    });
  }, [opportunities, currentFy]);

  const industryDist = useMemo(() => {
    // 自上月起过去 12 个月窗口（年初数据充足）：创建于该窗口内的机会（含赢/输/进行中等全部类型）按客户行业分布
    const winStart = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    const winEnd = monthEndOf(now.getFullYear(), now.getMonth() - 1);
    const industryByName = new Map(clients.map(c => [c.name, c.industry]));
    const counts: Record<string, number> = {};
    opportunities.forEach(o => {
      const created = new Date(o.createdAt);
      if (created >= winStart && created <= winEnd) {
        const industry = industryByName.get(o.clientName) || '其他';
        counts[industry] = (counts[industry] || 0) + 1;
      }
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const colors = [COLORS.primary, COLORS.purple, COLORS.warning, COLORS.amber, COLORS.chartGray, COLORS.textSecondary, COLORS.danger];
    return sorted.map(([label, value], i) => ({ label, value, color: colors[i] || COLORS.chartGray }));
  }, [clients, opportunities, now]);

  return (
    <div className="dashboard-container">
      {/* ── 标题 ── */}
      <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark, marginBottom: 20, letterSpacing: 0.5 }}>
        仪表盘
      </div>

      {/* ── KPI 卡片行（共享 OverviewCards，样式对齐工时应用仪表盘） ── */}
      <OverviewCards
        items={[
          { label: '上月活跃', value: fmtMonthly(monthlyKpi[0].amt, monthlyKpi[0].cnt), color: COLORS.primary, icon: <FiBarChart2 size={18} />,
            prevValues: [
              { value: fmtMonthly(monthlyKpi[1].amt, monthlyKpi[1].cnt), color: COLORS.primary },
              { value: fmtMonthly(monthlyKpi[2].amt, monthlyKpi[2].cnt), color: COLORS.primary },
            ] },
          { label: '上月赢单', value: fmtMonthly(monthlyKpi[0].winAmt, monthlyKpi[0].winCnt), color: COLORS.success, icon: <FiAward size={18} />,
            prevValues: [
              { value: fmtMonthly(monthlyKpi[1].winAmt, monthlyKpi[1].winCnt), color: COLORS.success },
              { value: fmtMonthly(monthlyKpi[2].winAmt, monthlyKpi[2].winCnt), color: COLORS.success },
            ] },
          { label: '上月新增', value: fmtMonthly(monthlyKpi[0].newAmt, monthlyKpi[0].newCnt), color: COLORS.amber, icon: <FiPlusCircle size={18} />,
            prevValues: [
              { value: fmtMonthly(monthlyKpi[1].newAmt, monthlyKpi[1].newCnt), color: COLORS.amber },
              { value: fmtMonthly(monthlyKpi[2].newAmt, monthlyKpi[2].newCnt), color: COLORS.amber },
            ] },
          { label: '上月交付', value: fmtMonthly(monthlyKpi[0].deliveredAmt, monthlyKpi[0].deliveredCnt), color: COLORS.success, icon: <FiTruck size={18} />,
            prevValues: [
              { value: fmtMonthly(monthlyKpi[1].deliveredAmt, monthlyKpi[1].deliveredCnt), color: COLORS.success },
              { value: fmtMonthly(monthlyKpi[2].deliveredAmt, monthlyKpi[2].deliveredCnt), color: COLORS.success },
            ] },
          { label: '交付中', value: fmtMonthly(monthlyKpi[0].delAmt, monthlyKpi[0].delCnt), color: COLORS.purple, icon: <FiTool size={18} />,
            prevValues: [
              { value: fmtMonthly(monthlyKpi[1].delAmt, monthlyKpi[1].delCnt), color: COLORS.purple },
              { value: fmtMonthly(monthlyKpi[2].delAmt, monthlyKpi[2].delCnt), color: COLORS.purple },
            ] },
        ]}
      />

      {/* ── 交付状态 ── */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
        <Card size="small"
          style={{ flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '18px 20px' } }}>
          <SectionTitle title="交付状态" />
          {/* 四列宽度：flex-basis % = 原 grow 比例 ÷ 19（4.0625→21.382%、8.0625→42.434%、2.8125→14.803%）。
              准时率 −38px 转给利润概览（先 −18 再 −20）：px 项承载平移（±38 相抵，四列基值和仍 100%），flex-shrink 按基值比例
              吸收间隙/分隔线占用（6×8px + 3×1px = 51px），故项目状态/节点执行像素不变、准时率精确 −38、利润概览 +38 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minHeight: 150, marginTop: -18 }}>
            <div style={{ flex: '0 1 21.382%', display: 'flex', flexDirection: 'column', marginLeft: -20 }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>项目状态</div>
              <VerticalBarChart data={deliveryStats.projectStatus} format="num" height={236} topN={9} disableSort noCard
  barWidthRatio={0.8} maxBarWidth={22.5} groupGaps={[2, 5]} gapSize={4} baseGap={2} yTickCount={3} padTop={13} padBottom={13} padLeft={36} padRight={6} barLabelGap={13}
  hideAvgLine xLabelColor={COLORS.textSecondary} minBarH={4} />
            </div>
            <div style={{ width: 1, background: COLORS.borderLight, flexShrink: 0 }} />
            <div style={{ flex: '0 1 21.382%', display: 'flex', flexDirection: 'column', marginLeft: -10 }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>节点执行</div>
              <VerticalBarChart data={deliveryStats.nodeStatus} format="num" height={236} topN={9} disableSort noCard
  barWidthRatio={0.8} maxBarWidth={22.5} groupGaps={[2, 5]} gapSize={5} baseGap={2} yTickCount={3} padTop={13} padBottom={13} padLeft={36} padRight={6} barLabelGap={13}
  hideAvgLine xLabelColor={COLORS.textSecondary} minBarH={4} />
            </div>
            <div style={{ width: 1, background: COLORS.borderLight, flexShrink: 0 }} />
            <div style={{ flex: '0 1 calc(42.434% - 38px)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>节点准时率</div>
              <VerticalBarChart data={deliveryStats.onTimeRate} format="num" height={236} topN={18} disableSort noCard
  barWidthRatio={0.8} maxBarWidth={22.5} unit="%" skipNonPositive xLabelAlignFirstLine yTickCount={3} padTop={13} padBottom={13} padLeft={36} padRight={6} barLabelGap={13}
  hideAvgLine xLabelColor={COLORS.textSecondary} minBarH={4} />
            </div>
            <div style={{ width: 1, background: COLORS.borderLight, flexShrink: 0 }} />
            <div style={{ flex: '0 1 calc(14.803% + 38px)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>利润概览</div>
              <VerticalBarChart data={deliveryStats.profitOverview} format="num" height={236} topN={6} disableSort noCard
  barWidthRatio={0.8} maxBarWidth={22.5} unit="K" groupGaps={[2]} gapSize={14} baseGap={2} skipNonPositive yTickCount={3} padTop={13} padBottom={13} padLeft={36} padRight={6} barLabelGap={13}
  hideAvgLine xLabelColor={COLORS.textSecondary} minBarH={4} />
            </div>
          </div>
        </Card>
      </div>

      {/* ── 底栏：管道节点 | 行业分布 | 新增机会 ── */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <Card size="small"
          style={{ flex: '1 1 calc((100% - 40px) / 3 + 20px)', borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '16px 0 16px 18px' } }}>
          <SectionTitle title="管道节点" />
          <div style={{ marginTop: 50, marginLeft: -20 }}>
            <VerticalBarChart data={stageDist} format="num" height={226} topN={15} disableSort noCard
  barWidthRatio={0.8} maxBarWidth={26.5} groupGaps={[2, 5, 8, 11]} gapSize={14} baseGap={2} yTickCount={3} padTop={13} padBottom={13} padLeft={36} padRight={6} barLabelGap={13}
  hideAvgLine xLabelColor={COLORS.textSecondary} minBarH={4} />
          </div>
        </Card>

        <Card size="small"
          style={{ flex: '1 1 calc((100% - 40px) / 3 - 20px)', borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '16px 18px' } }}>
          <SectionTitle title="行业分布" count={industryDist.reduce((s, i) => s + i.value, 0)} />
          {industryDist.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无数据</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: -20 }}>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', overflow: 'visible' }}>
                <PieChart items={industryDist} pieSize={190} />
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
          style={{ flex: '1 1 calc((100% - 40px) / 3)', borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '16px 18px' } }}>
          <SectionTitle title="新增机会" count={fyTrend.reduce((s, m) => s + m.value, 0)} />
          {fyTrend.every(m => m.count === 0) ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>当前财年暂无新增</div>
          ) : (
            <div style={{ marginTop: 50 }}>
              <VerticalBarChart data={fyTrend} format="num" height={226} topN={12} disableSort noCard
  barWidthRatio={0.8} maxBarWidth={26.5} unit="K" yTickCount={3} padTop={13} padBottom={13} padLeft={36} padRight={6} barLabelGap={13}
  hideAvgLine xLabelColor={COLORS.textSecondary} minBarH={4} />
            </div>
          )}
        </Card>
      </div>

      {/* ── 动态：近期赢单 | 近期输单 | 近期交付 ── */}
      <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
        <Card size="small"
          style={{ flex: '1 1 calc((100% - 40px) / 3 + 20px)', borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
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
          style={{ flex: '1 1 calc((100% - 40px) / 3 - 20px)', borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
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
          style={{ flex: '1 1 calc((100% - 40px) / 3)', borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
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
                        <span>{formatBeijing(doneDate || p.updatedAt)}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.success, whiteSpace: 'nowrap' }}>¥{fmtK(deliveryExTax(p, deliveryQuoteInfo))}</span>
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
