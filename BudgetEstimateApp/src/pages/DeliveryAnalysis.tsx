import React, { useState, useMemo, useEffect } from 'react';
import { deliveryService } from '../services/deliveryService';
import { quotationService } from '../services/quotationService';
import type { DeliveryProject } from '../types';
import { COLORS } from '../styles/colors';
import { NODE_DISPLAY_NAMES } from '../utils/constants';
import { parseFY, FYSelector, fiscalYearLabel } from '../utils/fiscalYear';
import { fmtK, compressNo, monthEndOf, getNodeBaseline, getNodeDelay, getProjectDelay, isProjectDelivered, getProjectDoneDate, quoteProfitExTax, deliverySalesProfit, buildQuoteInfoMap, deliveryExTax } from '../utils/analysisShared';
import { VerticalBarChart, ProfitChart, ProjectGantt, BubbleChart } from '../components/charts/DeliveryCharts';
import type { ProfitItem, BubbleDataItem } from '../components/charts/DeliveryCharts';
import { OverviewCards, type KpiCardItem } from '../components/shared/OverviewCards';

/* ============================================================
   概览卡片（共享组件 OverviewCards，valueFontSize=26 保持交付分析视觉）
   ============================================================ */

/** 某财年截止到某月月底的累计 KPI 口径；hasData=false 表示该月早于财年起点、无完整月数据 */
interface MonthlyCum {
  hasData: boolean;
  total: number; tAmt: number;
  active: number; aAmt: number;
  completed: number; cAmt: number;
  delayed: number; dAmt: number;
  avgDelay: number;
  onTimeRate: number;
  costDev: number;
  costDevDenom: number;
}

/** 无完整月数据时的空口径 */
const NO_DATA_CUM: MonthlyCum = {
  hasData: false, total: 0, tAmt: 0, active: 0, aAmt: 0, completed: 0, cAmt: 0,
  delayed: 0, dAmt: 0, avgDelay: 0, onTimeRate: -1, costDev: 0, costDevDenom: 0,
};

/** 第 idx 个 KPI 的当月格式化值（0-6：项目总数/进行中/已完成/延期/平均延期天数/节点按时率/成本偏差率）；无数据返回 — */
const cumVal = (m: MonthlyCum, idx: number): string => {
  if (!m.hasData) return '—';
  const arr = [
    `${fmtK(m.tAmt)} / ${m.total}`,
    `${fmtK(m.aAmt)} / ${m.active}`,
    `${fmtK(m.cAmt)} / ${m.completed}`,
    `${fmtK(m.dAmt)} / ${m.delayed}`,
    m.completed > 0 ? m.avgDelay + '天' : '—',
    m.onTimeRate >= 0 ? m.onTimeRate + '%' : '—',
    m.costDevDenom > 0 ? (m.costDev > 0 ? '+' : '') + m.costDev.toFixed(1) + '%' : '—',
  ];
  return arr[idx] || '—';
};

/* ============================================================
   模块级工具函数（不依赖组件状态，避免每次渲染重建）
   ============================================================ */
/** 节点总数（与 NODE_DISPLAY_NAMES 一一对应，避免硬编码 15） */
const NODE_COUNT = NODE_DISPLAY_NAMES.length;

/** 压缩销售编号并换行：A2026-07-003-E → 2607003E，超4位时拆两行（图表 X 轴标签用） */
const chartLabel = (salesNo: string | undefined): string => {
  const s = compressNo(salesNo);
  return s.length > 4 ? s.slice(0, 4) + '\n' + s.slice(4) : s;
};

/** 计算项目延期天数（共享延期口径，以第15节点为准，与实施计划一致），负值表示提前 */
const calcProjDelay = (p: DeliveryProject): number => getProjectDelay(p).days;

/** 交付报价信息映射类型（报价编制表持久化数据：税率/折后报价/概算利润/概算利润率） */
type DeliveryQuoteMap = Map<string, { taxRate: number; discounted: number; gp3Amt: number; rate: number }>;

/** 交付概算利润（未税）= 报价概算利润转未税（共享 quoteProfitExTax） */
const estProfitOf = (p: DeliveryProject, info: DeliveryQuoteMap): number => {
  const i = info.get(p.id);
  return quoteProfitExTax(i?.gp3Amt, i?.taxRate);
};
/** 交付概算总成本（未税）= 未税金额 − 概算利润 */
const grandEstimatedOf = (p: DeliveryProject, info: DeliveryQuoteMap): number =>
  deliveryExTax(p, info) - estProfitOf(p, info);
/** 交付概算GP3 = 报价概算利润率 */
const estGP3Of = (p: DeliveryProject, info: DeliveryQuoteMap): number =>
  info.get(p.id)?.rate ?? 0;

/** 判断项目是否已完成交付且在财年范围内（完成日 = 节点15实际完成日或 updatedAt 回退） */
const isNode15CompletedInFy = (p: DeliveryProject, fyRange: ReturnType<typeof parseFY>): boolean => {
  if (!isProjectDelivered(p)) return false;
  const d = getProjectDoneDate(p);
  return !!d && d >= fyRange.start && d <= fyRange.end;
};

/** 默认财年：当前日期所属财年（7月起），共享 fiscalYearLabel */
const defaultFy = fiscalYearLabel(new Date());

// ── 布局常量（左列 3 张卡片：利润分析/延期天数/节点分析，每张高225px，间距16px）──
const CARD_H = 225;
const LEFT_COL_H = (2 + 30 + CARD_H) * 3 + 16 * 2; // 803
const BUBBLE_SVG_H = LEFT_COL_H - 2 - 37 - 25; // 739
const BUBBLE_CANVAS_H = LEFT_COL_H - 2 - 10 - 22 - 30 + 25; // 764

/* ============================================================
   主组件
   ============================================================ */
const DeliveryAnalysis: React.FC = () => {
  const [fySelect, setFySelect] = useState(defaultFy);
  const [deliveryProjects, setDeliveryProjects] = useState<DeliveryProject[]>([]);
  // 报价编制表持久化数据（税率/折后报价/概算利润含税），经交付 quotationId 关联
  const [quoteMap, setQuoteMap] = useState<Record<string, { taxRate?: number; discountedPrice?: number; gp3Amount?: number }>>({});

  useEffect(() => {
    let cancelled = false;
    // 分析页需要最新数据：交付一次取全量（limit=1000）并绕过 api.ts 的 30s GET 缓存
    // ⚠️ allSettled：单个接口失败不拖垮整页（Promise.all 会整体拒绝导致整页空白）
    Promise.allSettled([
      deliveryService.list({ limit: '1000' }, { noCache: true }),
      quotationService.list({ limit: '1000' }),
    ]).then(([dps, quotes]) => {
      if (cancelled) return;
      if (dps.status === 'fulfilled') setDeliveryProjects(dps.value.map(p => ({ ...p, nodes: p.nodes || [] })));
      if (quotes.status === 'fulfilled') {
        const m: Record<string, { taxRate?: number; discountedPrice?: number; gp3Amount?: number }> = {};
        for (const q of quotes.value) m[q.id] = { taxRate: q.taxRate, discountedPrice: q.discountedPrice, gp3Amount: q.gp3Amount };
        setQuoteMap(m);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // ── 缓存财年范围 ──
  const fyRange = useMemo(() => parseFY(fySelect), [fySelect]);

  // ── 财年过滤（活跃期交集：与销售分析一致的逻辑）──
  // ⚠️ 已完成项目的有效结束 = 节点15实际完成日，而非 updatedAt：
  //    updated_at 有触发器覆盖为 now()，已交付项目被后续编辑/回填会污染其财年归属
  const fyFiltered = useMemo(() => {
    return deliveryProjects.filter(p => {
      const created = new Date(p.createdAt);
      // 有效结束：未完结→至今；已完结→实际完成日（统一共享口径 getProjectDoneDate）
      // ⚠️ 不用 p.status==='已完成' 区分：节点15已完成但未点「完成项目」的项目同样算已完结，
      //    否则会因其 active 状态被计入后续财年，造成财年归属漂移
      const effectiveEnd = getProjectDoneDate(p) ?? new Date();
      return created <= fyRange.end && effectiveEnd >= fyRange.start;
    });
  }, [deliveryProjects, fyRange]);

  // ── 各项目延期天数（项目级，节点15）──
  const projectDelayDays = useMemo(() => {
    return fyFiltered.map(p => {
      const delay = calcProjDelay(p);
      // 已完成项目灰显；未完成按延期/提前着色
      const done = isProjectDelivered(p);
      return {
        name: chartLabel(p.salesNo),
        value: delay,
        color: done ? COLORS.textLight : (delay > 0 ? COLORS.danger : delay < 0 ? COLORS.success : COLORS.textLight),
      };
    });
  }, [fyFiltered]);

  // ── 节点卡脖子分析（瓶颈识别）──
  const nodeBottleneck = useMemo(() => {
    const now = new Date();
    const delayCount = new Array(NODE_COUNT).fill(0);
    const delayDays = new Array(NODE_COUNT).fill(0);
    const reached = new Array(NODE_COUNT).fill(0);
    const delayedProjects: string[][] = Array.from({ length: NODE_COUNT }, () => []);

    for (const p of fyFiltered) {
      const shortName = compressNo(p.salesNo) || p.clientName;
      for (const n of p.nodes) {
        // ⚠️ 节点编号越界防护：nodeNo 应 1~15，异常数据跳过避免污染统计
        const idx = n.nodeNo - 1;
        if (idx < 0 || idx >= NODE_COUNT) continue;
        // 节点级财年裁剪（与节点按时率/甘特图同口径）：
        //   已完成节点：完成日 ∈ 财年才计入；未完成节点：计划窗口与财年有交集才计入
        if (n.status === 'completed' && n.actualDate) {
          const doneD = new Date(n.actualDate);
          if (doneD < fyRange.start || doneD > fyRange.end) continue;
        } else if (new Date(n.plannedEndDate) < fyRange.start || new Date(n.plannedStartDate) > fyRange.end) {
          continue;
        }
        // 未开始的 pending 不计入「到达次数」，但若其基线已过（事实延期）仍需计入延期
        const isFuturePending = n.status === 'pending' && new Date(n.plannedStartDate) > now;
        if (!isFuturePending) reached[idx]++;

        // ⚠️ 共享延期判定：基线 = 初始审批实施计划；无审批基线不判延期
        const delay = getNodeDelay(n, now);
        if (delay.delayed && delay.hasBaseline) {
          delayCount[idx]++;
          delayedProjects[idx].push(shortName);
          // delayed=true 已保证 days > 0，无需 Math.max 兜底
          delayDays[idx] += delay.days;
        }
      }
    }
    return NODE_DISPLAY_NAMES.map((name, i) => {
      const avgDays = delayCount[i] > 0 ? Math.round(delayDays[i] / delayCount[i]) : 0;
      return {
        name, value: delayCount[i],
        subValue: delayCount[i] > 0 ? reached[i] : undefined,
        tooltip: delayCount[i] > 0
        ? `${delayCount[i]} 次，${avgDays > 0 ? avgDays + ' 天/次' : '—'}\n${[...new Set(delayedProjects[i])].join('、')}`
        : undefined,
        color: delayCount[i] > 0 ? (avgDays >= 10 ? COLORS.danger : avgDays >= 3 ? COLORS.warning : '#ccc') : '#ccc',
      };
    });
  }, [fyFiltered, fyRange]);

  // ── 交付项目 → 其报价编制表（最新版本）持久化数据：税率/折后报价/概算利润（含税）──
  // 概算成本/概算利润/概算GP3 全部以此为准，不再运行时从组数据估算
  const deliveryQuoteInfo = useMemo(
    () => buildQuoteInfoMap(deliveryProjects, qid => quoteMap[qid]),
    [deliveryProjects, quoteMap],
  );

  // ── 利润分析数据（仅已完成项目总结的项目，按GP3偏差排序）──
  const profitChartData = useMemo(() => {
    const items: ProfitItem[] = fyFiltered
      .filter(p => isNode15CompletedInFy(p, fyRange) && deliveryQuoteInfo.has(p.id))
      .map(p => {
        const exTax = deliveryExTax(p, deliveryQuoteInfo);
        const estGP3 = estGP3Of(p, deliveryQuoteInfo);
        const estProfit = estProfitOf(p, deliveryQuoteInfo);
        // 实际销售利润（共享 deliverySalesProfit：无成本数据返回 undefined，图表不显示实际）
        const actProfit = deliverySalesProfit(exTax, p.totalActualCost);
        const actGP3 = actProfit != null && exTax > 0 ? actProfit / exTax : undefined;
        return {
          name: chartLabel(p.salesNo),
          estProfit, estGP3, actProfit, actGP3,
          deviation: actGP3 != null ? actGP3 - estGP3 : 0,
        };
      })
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
    return { items };
  }, [fyFiltered, fyRange, deliveryQuoteInfo]);

  // ── 财年累计KPI（最近3个完整月累计；已完结财年取财年最后三个月）──
  const monthlyCumKpi = useMemo((): MonthlyCum[] => {
    const now = new Date();
    /** 相对 now 的最近完整月月底（k=1 最近，k=2/3 依次更早） */
    const recentMonthEnd = (k: number) => {
      const cur = new Date(now.getFullYear(), now.getMonth(), 1);
      return monthEndOf(cur.getFullYear(), cur.getMonth() - k);
    };

    const calcCum = (mEnd: Date): MonthlyCum => {
      // 该月早于财年起点 → 当前财年内尚无完整月数据
      if (mEnd < fyRange.start) return { ...NO_DATA_CUM };
      let tAmt = 0, aAmt = 0, cAmt = 0, dAmt = 0, tDelay = 0, onT = 0, tN = 0, costDevNumerator = 0, costDevDenominator = 0;
      let active = 0, completed = 0, delayed = 0, totalCount = 0;
      for (const p of fyFiltered) {
        if (new Date(p.createdAt) > mEnd) continue;
        totalCount++;
        const ex = deliveryExTax(p, deliveryQuoteInfo);
        tAmt += ex;
        // 已完成交付判定：节点15实际完成日或 updatedAt 回退（统一共享口径）
        const doneDate = getProjectDoneDate(p);
        const n15done = !!doneDate && doneDate >= fyRange.start && doneDate <= mEnd;
        if (n15done) { completed++; cAmt += ex; } else { active++; aAmt += ex; }
        const pd = calcProjDelay(p);
        if (n15done) {
          if (pd > 0) { delayed++; dAmt += ex; }
          tDelay += pd; // 提前完成记负值、按时完成记 0，全部计入分子
        }
        for (const n of p.nodes) {
          // 节点按时率：仅统计已完成节点（完成日 ∈ [财年起点, 截止月]），
          // 与实际完成日对比最初的基线：≤基线 = 正常/提前（计入分子），>基线 = 延期
          if (n.status !== 'completed' || !n.actualDate) continue;
          const actual = new Date(n.actualDate);
          if (actual < fyRange.start || actual > mEnd) continue;
          const refEnd = getNodeBaseline(n);
          if (!refEnd) continue; // 无基线不判定
          const refD = new Date(refEnd);
          tN++;
          if (actual <= refD) onT++;
        }
        // 成本偏差（仅统计已完成交付项目，与「已完成项目」KPI 同源；概算成本取自报价编制表持久化数据）
        if (n15done && p.costStatus === 'approved' && p.totalActualCost != null) {
          const grandEstimated = grandEstimatedOf(p, deliveryQuoteInfo);
          costDevNumerator += (p.totalActualCost - grandEstimated);
          costDevDenominator += grandEstimated;
        }
      }
      const costDevRate = costDevDenominator > 0 ? (costDevNumerator / costDevDenominator * 100) : 0;
      return {
        hasData: true, total: totalCount, tAmt, active, aAmt, completed, cAmt, delayed, dAmt,
        avgDelay: completed > 0 ? Math.sign(tDelay) * Math.round(Math.abs(tDelay) / completed) : 0,
        onTimeRate: tN > 0 ? Math.round(onT / tN * 100) : -1,
        costDev: costDevRate, costDevDenom: costDevDenominator,
      };
    };

    if (now > fyRange.end) {
      // 已完结财年：取财年最后三个月（Apr/May/Jun 月底）
      const yr = fyRange.end.getFullYear();
      return [monthEndOf(yr, 5), monthEndOf(yr, 4), monthEndOf(yr, 3)].map(calcCum);
    }
    // 当前财年：取相对 now 的最近三个完整月（首月尚无完整月数据时显示 —）
    return [1, 2, 3].map(recentMonthEnd).map(calcCum);
  }, [fyFiltered, deliveryQuoteInfo, fyRange]);


  // ── 健康 KPI 卡片（使用财年截止到各月月底的累计值）──
  const overviewItems = useMemo((): KpiCardItem[] => {
    const main = monthlyCumKpi[0]; // 截止到最近完整月（已完结财年=Jun；当前财年无完整月时 hasData=false）
    return [
      { label: '项目总数', value: cumVal(main, 0), color: COLORS.primary, icon: '📊' },
      { label: '进行中项目', value: cumVal(main, 1), color: COLORS.primary, icon: '🚧' },
      { label: '已完成项目', value: cumVal(main, 2), color: COLORS.success, icon: '✅' },
      { label: '延期项目', value: cumVal(main, 3), color: main.hasData && main.delayed > 0 ? COLORS.danger : COLORS.success, icon: '🚨' },
      { label: '平均延期天数', value: cumVal(main, 4), color: main.hasData && main.avgDelay > 0 ? COLORS.danger : COLORS.success, icon: '📅' },
      { label: '节点按时率', value: cumVal(main, 5), color: main.hasData && main.onTimeRate >= 0 ? (main.onTimeRate >= 80 ? COLORS.success : main.onTimeRate >= 50 ? COLORS.warning : COLORS.danger) : COLORS.textLight, icon: '🎯' },
      { label: '成本偏差率', value: cumVal(main, 6), color: main.hasData && main.costDev <= 0 ? COLORS.success : COLORS.danger, icon: '💰' },
    ];
  }, [monthlyCumKpi]);

  // ── 甘特图数据（统一按标准财年月份显示：7月到次年6月，所有财年一致）──
  const ganttData = useMemo(() => {
    const now = new Date();
    const tlStart = new Date(fyRange.start.getFullYear(), fyRange.start.getMonth(), 1);
    // ⚠️ 时间线末尾 = 财年结束（6月30日 23:59:59.999，完整覆盖最后一天）
    const tlEnd = fyRange.end;
    const DAY_MS = 1000 * 60 * 60 * 24;
    const totalDays = Math.round((tlEnd.getTime() - tlStart.getTime()) / DAY_MS);
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(tlStart.getFullYear(), tlStart.getMonth() + i, 1);
      return d.toLocaleString('en', { month: 'short' });
    });
    const todayPos = Math.round((now.getTime() - tlStart.getTime()) / DAY_MS);
    const projectRows = fyFiltered.filter(p => {
      // 已完成项目仅在完成日期在时间线范围内时显示（统一共享完成判定）
      if (isProjectDelivered(p)) {
        const doneDate = getProjectDoneDate(p);
        return !!doneDate && doneDate >= tlStart;
      }
      return true;
    }).map(p => {
      // 仅保留计划时间与 12 月时间线有交集的节点，超出范围的节点不绘制
      const slots = p.nodes.filter(n => {
        // 已完成节点用实际完成日判断，其余用计划时间判断
        if (n.status === 'completed' && n.actualDate) return new Date(n.actualDate) >= tlStart;
        return new Date(n.plannedEndDate) >= tlStart && new Date(n.plannedStartDate) <= tlEnd;
      }).map(n => {
        let start: Date, end: Date;
        const baselineEnd = n.baselineEndDate || n.baselinePlannedEndDate;
        if (n.status === 'completed' && n.actualDate) {
          // 已完成节点：开始=实际开始(优先)或计划开始，结束=实际完成
          start = n.actualStartDate ? new Date(n.actualStartDate) : new Date(n.plannedStartDate);
          end = new Date(n.actualDate);
          if (start > end) start = end;
        } else if (n.status === 'in_progress') {
          // 进行中：开始=实际开始（人为设定开始的时刻），已超最新计划则结束=now
          start = n.actualStartDate ? new Date(n.actualStartDate) : new Date(n.plannedStartDate);
          end = new Date(n.plannedEndDate) < now ? now : new Date(n.plannedEndDate);
        } else {
          // 未开始：按计划时间
          start = new Date(n.plannedStartDate);
          end = new Date(n.plannedEndDate);
        }
        return { nodeNo: n.nodeNo, startDate: start, endDate: end, status: n.status,
          name: n.name, plannedStartDate: new Date(n.plannedStartDate),
          plannedEndDate: new Date(n.plannedEndDate), actualDate: n.actualDate ? new Date(n.actualDate) : undefined,
          baselineDate: baselineEnd ? new Date(baselineEnd) : undefined,
          delay: getNodeDelay(n) };
      });
      return {
        name: compressNo(p.salesNo),
        slots,
        doneCount: p.nodes.filter(n => n.status === 'completed').length,
        totalCount: p.nodes.length,
        status: p.status,
        delayed: getProjectDelay(p).delayed,
      };
    });
    return { tlStart, totalDays, months, todayPos, projectRows, DAY_MS };
  }, [fyFiltered, fyRange]);

  // ── 各项目未税金额查找表（甘特图交付负荷按节点级计算时需要）──
  const projectExTaxLookup = useMemo(() => {
    return fyFiltered.map(p => ({ projectId: compressNo(p.salesNo), exTax: deliveryExTax(p, deliveryQuoteInfo) }));
  }, [fyFiltered, deliveryQuoteInfo]);

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
      // 实际开始 = 节点1计划开始（无实际开始日期字段时的最佳近似）
      const start = new Date(node1.plannedStartDate);
      // 实际结束 = 已完成项目实际完成日（updatedAt 回退）；未完成 → 现在
      const end = getProjectDoneDate(p) ?? now;
      const exTax = deliveryExTax(p, deliveryQuoteInfo);
      lifecycles.set(p.id, { start, end, exTax });
    }

    return completed.map(p => {
      const lc = lifecycles.get(p.id); if (!lc) return null;
      // null items 在末尾 filter(Boolean) 剔除
      // ⚠️ 防止同日创建/完成的项目 duration=0 导致并行度除零得 Infinity
      const projDuration = Math.max(1, lc.end.getTime() - lc.start.getTime());

      const projDelay = calcProjDelay(p);
      const exTax = deliveryExTax(p, deliveryQuoteInfo);
      const estTotal = grandEstimatedOf(p, deliveryQuoteInfo);
      const costDev = p.costStatus === 'approved' && p.totalActualCost != null && estTotal > 0
        ? (p.totalActualCost - estTotal) / estTotal * 100 : 0;

      // 时间加权并行计算
      let weightedAmount = 0;
      let weightedCount = 0;

      for (const [otherId, otherLc] of lifecycles) {
        if (otherId === p.id) { weightedAmount += otherLc.exTax; weightedCount += 1; continue; }

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
        name: compressNo(p.salesNo),
        contractAmount: exTax,
        delayDays: projDelay,
        costDeviation: costDev,
        status: p.status,
        delayed: getProjectDelay(p).delayed,
        capacityPressure: capacityRaw / 10000,
      };
    }).filter(Boolean) as BubbleDataItem[];
  }, [fyFiltered, fyRange, deliveryQuoteInfo]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark }}>交付分析</span>
        <FYSelector value={fySelect} onChange={setFySelect} />
      </div>


      <OverviewCards items={overviewItems.map((item, i) => ({
            ...item,
            prevValues: [
              { value: cumVal(monthlyCumKpi[1], i), color: item.color },
              { value: cumVal(monthlyCumKpi[2], i), color: item.color },
            ],
          }))} valueFontSize={26} />

          <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: '0 0 calc(3 / 7 * (100% - 96px) + 32px)' }}>
              <ProfitChart data={profitChartData.items}
                height={CARD_H} chartWidth={702} contentOffset={40} />
              <VerticalBarChart title="延期天数" data={projectDelayDays}
                format="num" height={CARD_H} topN={15} barWidthRatio={0.75}
                maxBarWidth={40} chartWidth={702} contentOffset={40} hideAvgLine padTop={25} padBottom={35} barLabelGap={10} />
              <VerticalBarChart title="节点分析" data={nodeBottleneck}
                format="num" height={CARD_H} topN={15} barWidthRatio={0.75}
                maxBarWidth={40} chartWidth={702} contentOffset={40} hideAvgLine padTop={25} padBottom={35} disableSort />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 0 }}>
              <BubbleChart data={bubbleData} height={BUBBLE_SVG_H} canvasHeight={BUBBLE_CANVAS_H} bodyPadTop={37} bodyPadBottom={25} />
            </div>
          </div>

          {/* Row 4: 项目节点甘特图 */}
          <div style={{ minHeight: 750, marginTop: 26 }}>
            <ProjectGantt data={ganttData.projectRows}
              tlStart={ganttData.tlStart} totalDays={ganttData.totalDays}
              months={ganttData.months} todayPos={ganttData.todayPos}
              lifecycles={projectExTaxLookup}
              height={1050} />
          </div>
      </div>
    );
};

export default DeliveryAnalysis;
