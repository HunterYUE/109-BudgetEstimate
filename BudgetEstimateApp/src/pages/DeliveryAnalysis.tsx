import React, { useState, useMemo, useEffect } from 'react';
import { Card } from 'antd';
import { deliveryService } from '../services/deliveryService';
import type { DeliveryProject } from '../types';
import { COLORS } from '../styles/colors';
import { NODE_DISPLAY_NAMES } from '../utils/constants';
import { computeDeliveryEstGP3 } from '../utils/calculations';
import { parseFY, FYSelector } from '../utils/fiscalYear';
import { fmtK, loadQuotationGroups, preloadQuotationGroupsBatch, getPreloadVersion } from '../utils/analysisShared';
import { VerticalBarChart, ProfitChart, ProjectGantt, BubbleChart } from '../components/charts/DeliveryCharts';
import type { ProfitItem, BubbleDataItem } from '../components/charts/DeliveryCharts';

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
   子组件 — 概览卡片
   ============================================================ */
interface KpiCard {
  label: string; value: string; color: string; icon: string;
  subValue?: string;
  prevValues?: { value: string; color: string }[];
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
        {item.prevValues && item.prevValues.length === 2 && (
          <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3, marginTop: 3, opacity: 0.7 }}>
            <span style={{ color: item.prevValues[0].color }}>{item.prevValues[0].value}</span>
            <span style={{ color: COLORS.textLight, margin: '0 4px' }}>|</span>
            <span style={{ color: item.prevValues[1].color }}>{item.prevValues[1].value}</span>
          </div>
        )}
      </Card>
    ))}
  </div>
);


/* ============================================================
   主组件
   ============================================================ */
const DeliveryAnalysis: React.FC = () => {
  const defaultFy = `FY${String(new Date().getFullYear() % 100).padStart(2,'0')}${String((new Date().getFullYear() + 1) % 100).padStart(2,'0')}`;
const [fySelect, setFySelect] = useState(defaultFy);
  const [deliveryProjects, setDeliveryProjects] = useState<DeliveryProject[]>([]);

  useEffect(() => {
    deliveryService.list()
      .then((data: DeliveryProject[]) => setDeliveryProjects(data.map(p => ({ ...p, nodes: p.nodes || [] }))))
      .catch(() => setDeliveryProjects([]));
  }, []);

  // 交货项目加载完成后，预加载报价数据到缓存
  useEffect(() => {
    const ids = deliveryProjects.filter(p => p.quotationId).map(p => p.quotationId);
    if (ids.length > 0) preloadQuotationGroupsBatch(ids);
  }, [deliveryProjects]);

  // ── 共享工具函数 ──
  /** 计算某项目的最大延期天数 */
  const calcMaxDelay = (p: DeliveryProject, now: Date) => {
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
  const isNode15CompletedInFy = (p: DeliveryProject, fyRange: ReturnType<typeof parseFY>) => {
    const n15 = p.nodes.find(n => n.nodeNo === 15);
    if (!n15 || n15.status !== 'completed') return false;
    const d = new Date(n15.actualDate || p.updatedAt);
    return d >= fyRange.start && d <= fyRange.end;
  };

  // ── 缓存财年范围 ──
  const fyRange = useMemo(() => parseFY(fySelect), [fySelect]);
  const preloadVersion = preloadVersion;

  // ── 财年过滤（活跃期交集：与销售分析一致的逻辑）──
  const fyFiltered = useMemo(() => {
    return deliveryProjects.filter(p => {
      const created = new Date(p.createdAt);
      const effectiveEnd = (p.status === '进行中' || p.status === '已延期')
        ? new Date()
        : new Date(p.updatedAt);
      return created <= fyRange.end && effectiveEnd >= fyRange.start;
    });
  }, [deliveryProjects, fyRange]);

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
    return NODE_DISPLAY_NAMES.map((name, i) => ({
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
      return { exTax, estGP3, actGP3, actProfit, deviation: actGP3 != null ? actGP3 - estGP3 : 0, name: splitLabel(p.clientName), estProfit: exTax - grandEstimated };
    });
    const items: ProfitItem[] = itemData.map(d => ({ name: d.name, estProfit: d.estProfit, estGP3: d.estGP3, actProfit: d.actProfit, actGP3: d.actGP3, deviation: d.deviation }))
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
    const totalAmt = itemData.reduce((s, d) => s + d.exTax, 0);
    const avgEstGP3 = totalAmt > 0 ? itemData.reduce((s, d) => s + d.exTax * d.estGP3, 0) / totalAmt : 0;
    const actItems = itemData.filter(d => d.actGP3 != null);
    const avgActGP3 = actItems.length > 0 ? actItems.reduce((s, d) => s + d.exTax * d.actGP3!, 0) / actItems.reduce((s, d) => s + d.exTax, 0) : 0;
    return { items, avgEstGP3, avgActGP3 };
  }, [fyFiltered, fyRange, preloadVersion]);

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
      const taxRate = loadQuotationGroups(p.quotationId).version?.taxRate ?? 0.13;
      const exTax = Math.round(p.contractAmount / (1 + taxRate));
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

  // ── 按月交付 KPI（最近3个完整月） ──
  const monthlyDelKpi = useMemo(() => {
    const now = new Date();
    const calcMonth = (offset: number) => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const mp = deliveryProjects.filter(p => new Date(p.createdAt) <= mEnd);
      let tAmt = 0, aAmt = 0, cAmt = 0, dAmt = 0, tDelay = 0, dCnt = 0, onT = 0, tN = 0;
      let active = 0, completed = 0, delayed = 0;
      for (const p of mp) {
        const taxRate = loadQuotationGroups(p.quotationId).version?.taxRate ?? 0.13;
        const ex = Math.round(p.contractAmount / (1 + taxRate));
        tAmt += ex;
        const n15 = p.nodes.find(n => n.nodeNo === 15);
        const n15done = n15?.status === 'completed' && !!n15.actualDate && new Date(n15.actualDate) <= mEnd;
        if (n15done) { completed++; cAmt += ex; } else { active++; aAmt += ex; }
        if (p.status === '已延期') { delayed++; dAmt += ex; }
        const md = calcMaxDelay(p, mEnd);
        if (md > 0) { tDelay += md; dCnt++; }
        for (const n of p.nodes) {
          if (n.status === 'completed' || n.status === 'delayed') { tN++; if (n.actualDate && new Date(n.actualDate) <= new Date(n.plannedEndDate)) onT++; }
        }
      }
      return { total: mp.length, tAmt, active, aAmt, completed, cAmt, delayed, dAmt, avgDelay: dCnt > 0 ? Math.round(tDelay / dCnt) : 0, onTimeRate: tN > 0 ? Math.round(onT / tN * 100) : 100 };
    };
    return [calcMonth(1), calcMonth(2), calcMonth(3)];
  }, [deliveryProjects, preloadVersion]);

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
  }, [fyFiltered, preloadVersion]);

  // ── 所有 fyFiltered 项目的生命周期（用于甘特图负载压力线）──
  const projectLifecycles = useMemo(() => {
    const now = new Date();
    return fyFiltered.map(p => {
      const node1 = p.nodes.find(n => n.nodeNo === 1);
      if (!node1) return null;
      // null items filtered below
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
    }).filter(Boolean) as { id: string; start: Date; end: Date; exTax: number }[];
  }, [fyFiltered, preloadVersion]);

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
      const node1 = p.nodes.find(n => n.nodeNo === 1);
      if (!node1) continue;
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

    return completed.filter(p => {const n1 = p.nodes.find(n => n.nodeNo === 1); return n1 != null;}).map(p => {
      const lc = lifecycles.get(p.id); if (!lc) return null;
      // null items filtered below
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
    }).filter(Boolean) as BubbleDataItem[];
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


      <OverviewCards items={overviewItems.map((item, i) => {
            const mk = monthlyDelKpi;
            const v1 = [`${fmtK(mk[1].tAmt)} / ${mk[1].total}`, `${fmtK(mk[1].aAmt)} / ${mk[1].active}`, `${fmtK(mk[1].cAmt)} / ${mk[1].completed}`, `${fmtK(mk[1].dAmt)} / ${mk[1].delayed}`, `${mk[1].avgDelay}天`, `${mk[1].onTimeRate}%`, ''];
            const v2 = [`${fmtK(mk[2].tAmt)} / ${mk[2].total}`, `${fmtK(mk[2].aAmt)} / ${mk[2].active}`, `${fmtK(mk[2].cAmt)} / ${mk[2].completed}`, `${fmtK(mk[2].dAmt)} / ${mk[2].delayed}`, `${mk[2].avgDelay}天`, `${mk[2].onTimeRate}%`, ''];
            return { ...item, prevValues: [{ value: v1[i] || '', color: item.color }, { value: v2[i] || '', color: item.color }] };
          })} />

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
      </div>
      );
};

export default DeliveryAnalysis;
