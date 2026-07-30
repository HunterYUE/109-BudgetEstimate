import React, { useState, useMemo, useEffect } from 'react';
import { Card } from 'antd';
import { deliveryService } from '../services/deliveryService';
import type { DeliveryProject } from '../types';
import { COLORS } from '../styles/colors';
import { NODE_DISPLAY_NAMES } from '../utils/constants';
import { computeDeliveryEstGP3 } from '../utils/calculations';
import { parseFY, FYSelector } from '../utils/fiscalYear';
import { fmtK, compressNo, loadQuotationGroups, preloadQuotationGroupsBatch } from '../utils/analysisShared';
import { VerticalBarChart, ProfitChart, ProjectGantt, BubbleChart } from '../components/charts/DeliveryCharts';
import type { ProfitItem, BubbleDataItem } from '../components/charts/DeliveryCharts';

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
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const y1 = m >= 6 ? y : y - 1;
  const y2 = m >= 6 ? y + 1 : y;
  const defaultFy = `FY${String(y1 % 100).padStart(2,'0')}${String(y2 % 100).padStart(2,'0')}`;
  const [fySelect, setFySelect] = useState(defaultFy);
  const [deliveryProjects, setDeliveryProjects] = useState<DeliveryProject[]>([]);

  useEffect(() => {
    let cancelled = false;
    deliveryService.list()
      .then((data: DeliveryProject[]) => { if (!cancelled) setDeliveryProjects(data.map(p => ({ ...p, nodes: p.nodes || [] }))); })
      .catch(() => { if (!cancelled) setDeliveryProjects([]); });
    return () => { cancelled = true; };
  }, []);

  // 交货项目加载完成后，预加载报价数据到缓存
  const [preloadReady, setPreloadReady] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const ids = deliveryProjects.filter(p => p.quotationId).map(p => p.quotationId);
    if (ids.length > 0) {
      preloadQuotationGroupsBatch(ids).then(() => { if (!cancelled) setPreloadReady(v => v + 1); });
    }
    return () => { cancelled = true; };
  }, [deliveryProjects]);

  // ── 共享工具函数 ──
  /** 计算项目延期天数（以第15节点基线为准，与交付管理页实施计划一致），负值表示提前 */
  const calcProjDelay = (p: DeliveryProject): number => {
    const n15 = p.nodes.find(n => n.nodeNo === 15);
    if (!n15) return 0;
    const refDate = n15.baselineEndDate || n15.baselinePlannedEndDate || n15.plannedEndDate;
    if (!refDate) return 0;
    const end = (n15.status === 'completed' && n15.actualDate) ? new Date(n15.actualDate) : new Date();
    return Math.round((end.getTime() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24));
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

  // ── 各项目延期天数（项目级，节点15）──
  const projectDelayDays = useMemo(() => {
    return fyFiltered.map(p => {
      const delay = calcProjDelay(p);
      const n15completed = p.nodes.find(n => n.nodeNo === 15)?.status === 'completed';
      return {
        name: (() => { const s = compressNo(p.salesNo); return s.length > 4 ? s.slice(0,4) + String.fromCharCode(10) + s.slice(4) : s; })(),
        value: delay,
        color: n15completed ? COLORS.textLight : (delay > 0 ? COLORS.danger : delay < 0 ? COLORS.success : COLORS.textLight),
      };
    });
  }, [fyFiltered]);

  // ── 节点卡脖子分析（瓶颈识别）──
  const nodeBottleneck = useMemo(() => {
    const now = new Date();
    const delayCount = new Array(15).fill(0);
    const delayDays = new Array(15).fill(0);
    const reached = new Array(15).fill(0);
    const delayedProjects: string[][] = Array.from({ length: 15 }, () => []);

    for (const p of fyFiltered) {
      if (p.status !== '进行中' && p.status !== '已延期' && p.status !== '已完成') continue;
      const shortName = compressNo(p.salesNo) || p.clientName;
      for (const n of p.nodes) {
        if (n.status === 'pending' && new Date(n.plannedStartDate) > now) continue;
        reached[n.nodeNo - 1]++;

        let isDelayed = n.status === 'delayed';
        if (!isDelayed && n.status !== 'completed') {
          const plannedEnd = new Date(n.plannedEndDate);
          if (plannedEnd < now) isDelayed = true;
        }
        if (!isDelayed && n.status === 'completed' && n.actualDate) {
          const refDc = n.baselineEndDate || n.baselinePlannedEndDate;
          if (refDc) isDelayed = new Date(n.actualDate) > new Date(refDc);
        }
        if (isDelayed) {
          const refD = n.baselineEndDate || n.baselinePlannedEndDate;
          if (refD && refD.length >= 10) {
            delayCount[n.nodeNo - 1]++;
            delayedProjects[n.nodeNo - 1].push(shortName);
            const endD = (n.status === 'completed' && n.actualDate) ? new Date(n.actualDate) : now;
            delayDays[n.nodeNo - 1] += Math.max(0, Math.round((endD.getTime() - new Date(refD).getTime()) / (1000 * 60 * 60 * 24)));
          }
        }
      }
    }
    return NODE_DISPLAY_NAMES.map((name, i) => {
      const avgDays = delayCount[i] > 0 ? Math.round(delayDays[i] / delayCount[i]) : 0;
      return {
        name, value: delayCount[i],
        subValue: delayCount[i] > 0 ? reached[i] : undefined,
        tooltip: delayCount[i] > 0
        ? delayCount[i] + " 次，" + (avgDays > 0 ? avgDays + " 天/次" : "—") + String.fromCharCode(10) + [...new Set(delayedProjects[i])].join("、")
        : undefined,
        color: delayCount[i] > 0 ? (avgDays >= 10 ? COLORS.danger : avgDays >= 3 ? COLORS.warning : '#ccc') : '#ccc',
      };
    });
  }, [fyFiltered]);

  // ── 每个项目的报价估算数据（缓存）──
  const projectEstimates = useMemo(() => {
    void preloadReady;
    const map = new Map<string, ReturnType<typeof computeDeliveryEstGP3>>();
    for (const p of fyFiltered) {
      if (!p.quotationId) continue;
      const { groups, version } = loadQuotationGroups(p.quotationId);
      map.set(p.id, computeDeliveryEstGP3(p.contractAmount, groups, version));
    }
    return map;
  }, [fyFiltered, preloadReady]);

  // ── 利润分析数据（仅已完成项目总结的项目，按GP3偏差排序）──
  const profitChartData = useMemo(() => {
    const completed = fyFiltered.filter(p => isNode15CompletedInFy(p, fyRange));
    const itemData = completed.map(p => {
      const est = projectEstimates.get(p.id);
      if (!est) return null;
      const { exTax, grandEstimated, estGP3 } = est;
      const actProfit = p.totalActualCost != null ? (exTax - p.totalActualCost) : undefined;
      const actGP3 = actProfit != null && exTax > 0 ? actProfit / exTax : undefined;
      return { exTax, estGP3, actGP3, actProfit, deviation: actGP3 != null ? actGP3 - estGP3 : 0, name: (() => { const s = compressNo(p.salesNo); return s.length > 4 ? s.slice(0, 4) + '\n' + s.slice(4) : s; })(), estProfit: exTax - grandEstimated };
    });
    const items: ProfitItem[] = itemData.filter(Boolean).map(d => ({ name: d.name!, estProfit: d.estProfit!, estGP3: d.estGP3, actProfit: d.actProfit, actGP3: d.actGP3, deviation: d.deviation }))
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
    return { items };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fyFiltered, fyRange, projectEstimates, preloadReady]);

  // ── 财年累计KPI（按FY内月份累计）──
  const monthlyCumKpi = useMemo(() => {
    const now = new Date();
    const calcCum = (fyMo: number) => {
      // fyMo: 0=FY首月(Jul)～11=FY末月(Jun)
      let mEnd: Date;
      if (now > fyRange.end) {
        // 已完结FY：取FY内指定月的月底
        const yr = fyRange.end.getFullYear();
        const jsMo = fyMo < 6 ? fyMo + 6 : fyMo - 6;
        mEnd = new Date(yr, jsMo + 1, 0);
      } else {
        // 当前FY：fyMo→JS月→判断是否已完结
        const jsMo = fyMo < 6 ? fyMo + 6 : fyMo - 6;
        const baseYr = fyRange.start.getFullYear() + (now.getMonth() >= 6 ? 0 : 0); // FY起始年
        const dt = new Date(baseYr, jsMo, 1);
        // 如果此月在当前月之后（尚未到来），返回0
        if (dt > now) return { total: 0, tAmt: 0, active: 0, aAmt: 0, completed: 0, cAmt: 0, delayed: 0, dAmt: 0, avgDelay: 0, onTimeRate: -1 };
        mEnd = new Date(baseYr, jsMo + 1, 0);
      }
      if (mEnd < fyRange.start) return { total: 0, tAmt: 0, active: 0, aAmt: 0, completed: 0, cAmt: 0, delayed: 0, dAmt: 0, avgDelay: 0, onTimeRate: -1, costDev: 0, costDevDenom: 0 };
      let tAmt = 0, aAmt = 0, cAmt = 0, dAmt = 0, tDelay = 0, dCnt = 0, onT = 0, tN = 0, costDevNumerator = 0, costDevDenominator = 0;
      let active = 0, completed = 0, delayed = 0, totalCount = 0;
      for (const p of fyFiltered) {
        if (new Date(p.createdAt) > mEnd) continue;
        totalCount++;
        const taxRate = loadQuotationGroups(p.quotationId).version?.taxRate ?? 0.13;
        const ex = Math.round(p.contractAmount / (1 + taxRate));
        tAmt += ex;
        const n15 = p.nodes.find(n => n.nodeNo === 15);
        const n15done = n15?.status === 'completed' && !!n15.actualDate && new Date(n15.actualDate) <= mEnd;
        if (n15done) { completed++; cAmt += ex; } else { active++; aAmt += ex; }
        if (p.status === '已延期') { delayed++; dAmt += ex; }
        const pd = calcProjDelay(p);
        if (pd != 0 && n15?.status === 'completed') { tDelay += pd; dCnt++; }
        for (const n of p.nodes) {
          if (n.status !== 'completed' && new Date(n.plannedEndDate) > mEnd) continue;
          tN++;
          if (n.status === 'completed' && n.actualDate && new Date(n.actualDate) <= new Date(n.plannedEndDate)) onT++;
        }
        // 成本偏差
        if (p.costStatus === 'approved' && p.totalActualCost != null) {
          const { groups, version } = loadQuotationGroups(p.quotationId);
          const { grandEstimated } = computeDeliveryEstGP3(p.contractAmount, groups, version);
          costDevNumerator += (p.totalActualCost - grandEstimated);
          costDevDenominator += grandEstimated;
        }
      }
      const costDevRate = costDevDenominator > 0 ? (costDevNumerator / costDevDenominator * 100) : 0;
      return { total: totalCount, tAmt, active, aAmt, completed, cAmt, delayed, dAmt, avgDelay: dCnt > 0 ? Math.round(tDelay / dCnt) : 0, onTimeRate: tN > 0 ? Math.round(onT / tN * 100) : -1, costDev: costDevRate, costDevDenom: costDevDenominator };
    };
    return [calcCum(11), calcCum(10), calcCum(9)]; // Jun, May, Apr
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fyFiltered, preloadReady, fyRange]);


  // ── 健康 KPI 卡片（使用财年截止到各月月底的累计值）──
  const overviewItems = useMemo((): KpiCard[] => {
    const mk = monthlyCumKpi;
    const main = mk[0]; // 截止到最近完整月（过去FY=Jun，当前FY可能为0）

    const fmtVal = (amt: number, cnt: number) => fmtK(amt) + ' / ' + cnt;
    const costShow = main.costDevDenom > 0 ? `${main.costDev > 0 ? '+' : ''}${main.costDev.toFixed(1)}%` : '—';
    const delayShow = main.avgDelay !== 0 || main.dCnt > 0 ? `${main.avgDelay}天` : '—';
    const onTimeShow = main.onTimeRate >= 0 ? `${main.onTimeRate}%` : '—';

    return [
      { label: '项目总数', value: fmtVal(main.tAmt, main.total), color: COLORS.primary, icon: '📊' },
      { label: '进行中项目', value: fmtVal(main.aAmt, main.active), color: COLORS.primary, icon: '🚧' },
      { label: '已完成项目', value: fmtVal(main.cAmt, main.completed), color: COLORS.success, icon: '✅' },
      { label: '延期项目', value: fmtVal(main.dAmt, main.delayed), color: main.delayed > 0 ? COLORS.danger : COLORS.success, icon: '🚨' },
      { label: '加权延期天数', value: delayShow, color: main.avgDelay > 0 ? COLORS.danger : COLORS.success, icon: '📅' },
      { label: '节点按时率', value: onTimeShow, color: main.onTimeRate >= 0 ? (main.onTimeRate >= 80 ? COLORS.success : main.onTimeRate >= 50 ? COLORS.warning : COLORS.danger) : COLORS.textLight, icon: '🎯' },
      { label: '成本偏差率', value: costShow, color: main.costDev <= 0 ? COLORS.success : COLORS.danger, icon: '💰' },
    ];
  }, [monthlyCumKpi]);

  // ── 财年累计KPI（按FY内月份累计）──
  // ── 甘特图数据（12个月时间线：前1个月 + 后10个月）──
  const ganttData = useMemo(() => {
    const now = new Date();
    const tlStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const tlEnd = new Date(now.getFullYear(), now.getMonth() + 10, 0);
    const DAY_MS = 1000 * 60 * 60 * 24;
    const totalDays = Math.round((tlEnd.getTime() - tlStart.getTime()) / DAY_MS);
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 1 + i, 1);
      return d.toLocaleString('en', { month: 'short' });
    });
    const todayPos = Math.round((now.getTime() - tlStart.getTime()) / DAY_MS);
    const projectRows = fyFiltered.filter(p => {
      const n15 = p.nodes.find(n => n.nodeNo === 15);
      if (n15 && n15.status === 'completed') {
        const doneDate = n15.actualDate ? new Date(n15.actualDate) : new Date(p.updatedAt);
        // 已完成项目仅在完成日期在时间线范围内时显示
        return doneDate >= tlStart;
      }
      return true;
    }).map(p => {
      // 仅保留计划时间与 12 月时间线有交集的节点，超出范围的节点不绘制
      const slots = p.nodes.filter(n => new Date(n.plannedEndDate) >= tlStart && new Date(n.plannedStartDate) <= tlEnd).map(n => {
        const startH = n.history.find(h => h.field === 'status' && h.newValue === 'in_progress');
        let start: Date, end: Date;
        // 节点条永远按最新计划时间显示位置和宽度；是否超期由上方延期标注(+Nd)和条颜色表达
        if (n.status === 'completed') {
          start = startH ? new Date(startH.changedAt) : new Date(n.plannedStartDate);
          end = n.actualDate ? new Date(n.actualDate) : new Date(n.plannedEndDate);
        } else {
          // pending / in_progress / delayed：一律使用最新计划时间
          start = new Date(n.plannedStartDate);
          end = new Date(n.plannedEndDate);
        }
        // 节点计划时间直接使用当前计划（调整后显示更新计划，未调整显示初始计划）
        // 基线日期仅用于 tooltip 延期计算，已在 calcNodeDelay 中处理
        return { nodeNo: n.nodeNo, startDate: start, endDate: end, status: n.status,
          name: n.name, plannedStartDate: new Date(n.plannedStartDate),
          plannedEndDate: new Date(n.plannedEndDate), actualDate: n.actualDate ? new Date(n.actualDate) : undefined,
          initEndDate: new Date(n.plannedEndDate),
          baselineDate: n.baselineEndDate || n.baselinePlannedEndDate ? new Date(n.baselineEndDate || n.baselinePlannedEndDate) : undefined };
      });
      return {
        name: compressNo(p.salesNo),
        slots,
        doneCount: p.nodes.filter(n => n.status === 'completed' || n.status === 'delayed').length,
        totalCount: p.nodes.length,
        status: p.status,
      };
    });
    return { tlStart, totalDays, months, todayPos, projectRows, DAY_MS };
  }, [fyFiltered]);

  // ── 各项目未税金额查找表（甘特图交付负荷按节点级计算时需要）──
  const projectExTaxLookup = useMemo(() => {
    return fyFiltered.map(p => {
      const est = projectEstimates.get(p.id);
      const exTax = est ? est.exTax : Math.round(p.contractAmount / (1 + (loadQuotationGroups(p.quotationId).version?.taxRate ?? 0.13)));
      return { projectId: compressNo(p.salesNo), exTax };
    });
  }, [fyFiltered, projectEstimates]);

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
        : now;
      const est = projectEstimates.get(p.id);
      const exTax = est ? est.exTax : Math.round(p.contractAmount / (1 + (loadQuotationGroups(p.quotationId).version?.taxRate ?? 0.13)));
      lifecycles.set(p.id, { start, end, exTax });
    }

    return completed.filter(p => {const n1 = p.nodes.find(n => n.nodeNo === 1); return n1 != null;}).map(p => {
      const lc = lifecycles.get(p.id); if (!lc) return null;
      // null items filtered below
      const projDuration = lc.end.getTime() - lc.start.getTime();

      const projDelay = calcProjDelay(p);
      const est = projectEstimates.get(p.id);
      const exTax = est ? est.exTax : Math.round(p.contractAmount / (1 + (loadQuotationGroups(p.quotationId).version?.taxRate ?? 0.13)));
      const estTotal = est ? est.grandEstimated : 0;
      const costDev = p.totalActualCost != null && estTotal > 0
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
        capacityPressure: capacityRaw / 10000,
      };
    }).filter(Boolean) as BubbleDataItem[];
  }, [fyFiltered, fyRange, projectEstimates]);

  // ── 布局常量 ──
  // 左列 3 张卡片（利润分析/延期天数/节点分析），每张高225px，间距16px
  const LEFT_COL_H = (2 + 30 + 225) * 3 + 16 * 2; // 803
  // 气泡图卡片内容区高度
  const BUBBLE_SVG_H = LEFT_COL_H - 2 - 37 - 25; // 739
  // 气泡图画布高度（含外部标注空间）
  const BUBBLE_CANVAS_H = LEFT_COL_H - 2 - 10 - 22 - 30 + 25; // 764
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark }}>交付分析</span>
        <FYSelector value={fySelect} onChange={setFySelect} />
      </div>


      <OverviewCards items={overviewItems.map((item, i) => {
            const mk = monthlyCumKpi;
            const val = (m: typeof mk[0], idx: number) => {
              const arr = [`${fmtK(m.tAmt)} / ${m.total}`, `${fmtK(m.aAmt)} / ${m.active}`, `${fmtK(m.cAmt)} / ${m.completed}`, `${fmtK(m.dAmt)} / ${m.delayed}`, m.avgDelay !== 0 ? m.avgDelay + '天' : '—', m.onTimeRate >= 0 ? m.onTimeRate + '%' : '—', m.costDevDenom > 0 ? (m.costDev > 0 ? '+' : '') + m.costDev.toFixed(1) + '%' : '—'];
              return arr[idx] || '—';
            };
            return { ...item, prevValues: [{ value: val(mk[1], i), color: item.color }, { value: val(mk[2], i), color: item.color }] };
          })} />

          <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: '0 0 calc(3 / 7 * (100% - 96px) + 32px)' }}>
              <ProfitChart data={profitChartData.items}
                height={225} chartWidth={702} contentOffset={40} />
              <VerticalBarChart title="延期天数" data={projectDelayDays}
                format="num" height={225} topN={15} barWidthRatio={0.75}
                maxBarWidth={40} chartWidth={702} contentOffset={40} hideAvgLine padTop={25} padBottom={35} barLabelGap={10} />
              <VerticalBarChart title="节点分析" data={nodeBottleneck}
                format="num" height={225} topN={15} barWidthRatio={0.75}
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
