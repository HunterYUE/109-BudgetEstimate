import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Card, Spin, message } from 'antd';
import type { SalesOpportunity, QuotationSummary, DeliveryProject } from '../types';
import { parseReasons, REASON_TAXONOMY } from '../reasonTaxonomy';
import { SalesFunnel, VerticalBarChart, type BarItem } from '../components/charts/SalesCharts';
import { OverviewCards } from '../components/shared/OverviewCards';
import { opportunityService } from '../services/opportunityService';
import { quotationService } from '../services/quotationService';
import { deliveryService } from '../services/deliveryService';
import { COLORS } from '../styles/colors';
import { parseFY, FYSelector, fiscalYearLabel } from '../utils/fiscalYear';
import { fmtK, oppEffectiveEnd, isRealWin, monthEndOf, exAmount, stageAsOf, getProjectDoneDate, fyMonthWindows, FY_MONTH_LABELS, projectMonthlySales, deliverySalesProfit, quoteProfitExTax, buildQuoteInfoMap, deliveryExTax } from '../utils/analysisShared';
import { settingsService, type UserSettings } from '../services/settingsService';

/* ============================================================
   常量
   ============================================================ */
const stageColors: Record<string, string> = {
  信息: COLORS.textLight, 线索: COLORS.primary, 机会: COLORS.purple,
  投标: COLORS.warning, 议价: COLORS.amber, 中标: COLORS.success,
};
// ⚠️ '中标' 为占位桶：stageAsOf 只到'议价'（无中标阶段时间戳），该桶恒 0；赢单累计由 won 折线展示，勿据此推断缺陷
const STAGES = ['信息', '线索', '机会', '投标', '议价', '中标'] as const;

// localStorage 输入的 parseInt 保护
const safeParseInt = (val: string | undefined | null): number => {
  const n = parseInt(val ?? '', 10);
  return isNaN(n) ? 0 : n;
};
/** 含税→未税（统一使用未税口径） */
const exAmt = (o: SalesOpportunity) => exAmount(o.amount, o.taxRate);

const stageIdx = (s: string) => STAGES.indexOf(s as typeof STAGES[number]);

/** 编辑输入框共用样式 */
const EDIT_INPUT_STYLE: React.CSSProperties = {
  border: 'none', borderRadius: 0, padding: 0, margin: 0,
  boxSizing: 'content-box', fontSize: 12, outline: 'none',
  textAlign: 'right', background: 'transparent',
  fontFamily: 'inherit', fontWeight: 700, height: 18,
};

/** 根据财年过滤机会列表 */
function useFyFiltered(allOpps: SalesOpportunity[], fy: string) {
  return useMemo(() => {
    const fyRange = parseFY(fy);
    return allOpps.filter(o => {
      const created = new Date(o.createdAt);
      // 机会按活跃期归属财年：创建 ≤ 财年末 && 有效结束（赢→wonAt/输→lostAt/活跃→至今）≥ 财年初
      return created <= fyRange.end && oppEffectiveEnd(o) >= fyRange.start;
    });
  }, [allOpps, fy]);
}

/** 抽取指定分组（竞对/取消/放弃）的输单原因统计柱状图数据（模块级 hook，参数化输单列表） */
function useDimReasons(fyLostByTime: SalesOpportunity[], groupLabel: string): BarItem[] {
  return useMemo(() => {
    const grp = REASON_TAXONOMY.loss.groups.find(g => g.groupLabel === groupLabel);
    const allReasons: string[] = [];
    if (grp) {
      for (const item of grp.items) {
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
        if (r.groupLabel !== groupLabel) continue;
        if (r.detailItems.length > 0) {
          for (const item of r.detailItems) { if (countMap.has(item)) countMap.set(item, countMap.get(item)! + 1); }
        } else {
          if (countMap.has(r.subLabel)) countMap.set(r.subLabel, countMap.get(r.subLabel)! + 1);
        }
      }
    }
    return allReasons.map((name, i) => ({ name, value: countMap.get(name) || 0, color: i % 2 === 0 ? COLORS.primary : COLORS.purple }));
  }, [fyLostByTime, groupLabel]);
}

const SalesAnalysis: React.FC = () => {
  const [msg, ctx] = message.useMessage();
  const [allOpps, setAllOpps] = useState<SalesOpportunity[]>([]);
  const [quotationSummaries, setQuotationSummaries] = useState<QuotationSummary[]>([]);
  const [deliveryProjects, setDeliveryProjects] = useState<DeliveryProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [fySelect, setFySelect] = useState(() => fiscalYearLabel(new Date()));

  // ⚠️ 财年范围缓存一次复用（原每个 useMemo 内各自 parseFY）
  const fyRange = useMemo(() => parseFY(fySelect), [fySelect]);

  const aliveRef = useRef(true);
  const loadAll = useCallback(async () => {
    // ⚠️ allSettled：单个接口失败不拖垮整页；全部传 limit:'1000' 避免后端默认 limit=100 静默截断
    const [opps, qs, dps] = await Promise.allSettled([
      opportunityService.list({ limit: '1000' }),
      quotationService.list({ limit: '1000' }),
      deliveryService.list({ limit: '1000' }),
    ]);
    if (!aliveRef.current) return;
    if (opps.status === 'fulfilled') setAllOpps(opps.value);
    if (qs.status === 'fulfilled') setQuotationSummaries(qs.value);
    if (dps.status === 'fulfilled') setDeliveryProjects(dps.value);
    const failed = [opps, qs, dps].filter(r => r.status === 'rejected').length;
    if (failed > 0) msg.warning(`有 ${failed} 项数据加载失败，已显示可用数据`);
    setLoading(false);
  }, [msg]);

  useEffect(() => {
    aliveRef.current = true;
    loadAll();
    return () => { aliveRef.current = false; };
  }, [loadAll]);

  // ── 报价按 id 建索引（避免 find O(N×M)），供 deliveryQuoteInfo 与月度 KPI 复用 ──
  const quotationById = useMemo(() => new Map(quotationSummaries.map(q => [q.id, q])), [quotationSummaries]);
  // ── 交付关联报价（按交付项目 id 索引，与 DeliveryAnalysis 同口径）：税率/折后报价/概算利润/利润率 ──
  // ⚠️ 税率一律取交付项目自身 quotationId（不再经机会反查），消除跨页税率分叉
  const deliveryQuoteInfo = useMemo(
    () => buildQuoteInfoMap(deliveryProjects, qid => quotationById.get(qid)),
    [deliveryProjects, quotationById],
  );

  const fyFiltered = useFyFiltered(allOpps, fySelect);

  // ── 年度订单指标 + 目标GP3 ──
  // ── 年度目标/利润率指标按财年隔离：键 = 基础键 + _财年；历史无后缀键作为所有财年兜底 ──
  // 财年订单指标=saAnnualTarget_财年；财年订单/销售利润率=saTargetGP3_财年；财年销售额=saAnnualSalesTarget_财年
  const fyTargetKey = (base: string) => `${base}_${fySelect}`;
  const LEGACY_TARGET_KEYS = { order: 'saAnnualTarget', gp3: 'saTargetGP3', sales: 'saAnnualSalesTarget' } as const;

  const [annualTargetInput, setAnnualTargetInput] = useState(() => { try { return localStorage.getItem(LEGACY_TARGET_KEYS.order) || ''; } catch { return ''; } });
  const [targetEditing, setTargetEditing] = useState(false);
  const targetRef = React.useRef<HTMLInputElement>(null);
  const [gp3Input, setGp3Input] = useState(() => { try { return localStorage.getItem(LEGACY_TARGET_KEYS.gp3) || ''; } catch { return ''; } });
  const [orderGp3Editing, setOrderGp3Editing] = useState(false);
  const orderGp3Ref = React.useRef<HTMLInputElement>(null);
  const [salesGp3Editing, setSalesGp3Editing] = useState(false);
  const salesGp3Ref = React.useRef<HTMLInputElement>(null);
  // ── 月度销售指标 ──
  const [annualSalesTarget, setAnnualSalesTarget] = useState(() => { try { return localStorage.getItem(LEGACY_TARGET_KEYS.sales) || ''; } catch { return ''; } });
  const [salesTargetEditing, setSalesTargetEditing] = useState(false);
  const salesTargetRef = React.useRef<HTMLInputElement>(null);
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── 从服务端加载用户设置（必须在所有 setState 声明之后）──
  const [serverTargets, setServerTargets] = useState<UserSettings>({});
  useEffect(() => {
    if (loading) return;
    settingsService.get().then(setServerTargets).catch(() => {});
  }, [loading]);

  // 财年切换/服务端设置就绪时，加载当前财年的目标值（服务端优先，本地兜底；无后缀键兜底）
  useEffect(() => {
    const serverVal = (key: string) => serverTargets[key] ?? '';
    const read = (base: string, legacy: string): string => {
      const local = (() => { try { return localStorage.getItem(fyTargetKey(base)) ?? localStorage.getItem(legacy) ?? ''; } catch { return ''; } })();
      return serverVal(fyTargetKey(base)) || serverVal(legacy) || local;
    };
    setAnnualTargetInput(read('saAnnualTarget', LEGACY_TARGET_KEYS.order));
    setGp3Input(read('saTargetGP3', LEGACY_TARGET_KEYS.gp3));
    setAnnualSalesTarget(read('saAnnualSalesTarget', LEGACY_TARGET_KEYS.sales));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fySelect, serverTargets]);

  // 保存：本地立即写（按财年键）；服务端累计待提交，3s 防抖提交（捕获编辑时的财年键）
  const pendingServerSave = useRef<Record<string, string>>({});
  const flushServerSave = useCallback(() => {
    const payload = pendingServerSave.current;
    pendingServerSave.current = {};
    if (Object.keys(payload).length > 0) {
      settingsService.save(payload)
        .then(() => setServerTargets(prev => ({ ...prev, ...payload }))) // 同步回本地状态，避免切财年读到旧值
        .catch(e => console.warn('[Settings] 保存到服务端失败:', e));
    }
  }, []);
  const scheduleServerSave = (key: string, value: string) => {
    pendingServerSave.current[key] = value;
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(flushServerSave, 3000);
  };

  // 三个目标保存器：写 state + 本地持久化（按财年键）+ 服务端防抖提交（直接函数，避免工厂模式触发 react-hooks/refs）
  const saveSalesTarget = (v: string) => {
    setAnnualSalesTarget(v);
    const key = fyTargetKey('saAnnualSalesTarget');
    try { localStorage.setItem(key, v); } catch (e) { console.warn('[SalesAnalysis] 保存销售指标失败:', e); }
    scheduleServerSave(key, v);
  };
  const saveAnnualTarget = (v: string) => {
    setAnnualTargetInput(v);
    const key = fyTargetKey('saAnnualTarget');
    try { localStorage.setItem(key, v); } catch (e) { console.warn('[SalesAnalysis] 保存年度订单目标失败:', e); }
    scheduleServerSave(key, v);
  };
  const saveGp3 = (v: string) => {
    setGp3Input(v);
    const key = fyTargetKey('saTargetGP3');
    try { localStorage.setItem(key, v); } catch (e) { console.warn('[SalesAnalysis] 保存GP3目标失败:', e); }
    scheduleServerSave(key, v);
  };

  // ── 预解析目标输入值（避免渲染中重复 parseInt）──
  const parsedAnnualTarget = useMemo(() => safeParseInt(annualTargetInput), [annualTargetInput]);
  const parsedSalesTarget = useMemo(() => safeParseInt(annualSalesTarget), [annualSalesTarget]);
  const parsedGp3 = useMemo(() => parseFloat(gp3Input) || 0, [gp3Input]);

  // ── 月度订单数据（当月转交付项目的合同金额与订单利润之和，按财年月汇总）──
  // 复用共享归集 projectMonthlySales：订单金额 = orderAmt，订单利润 = orderProfit（报价概算利润未税）
  const monthlyOrderData = useMemo(() => {
    return fyMonthWindows(fyRange).map((w, i) => {
      let amount = 0, profit = 0;
      for (const p of deliveryProjects) {
        const info = deliveryQuoteInfo.get(p.id);
        const pt = projectMonthlySales(p, w.start, w.end, info?.taxRate, info?.gp3Amt);
        amount += pt.orderAmt;
        profit += pt.orderProfit;
      }
      return { name: FY_MONTH_LABELS[i], value: amount, subValue: profit || undefined };
    });
  }, [fyRange, deliveryQuoteInfo, deliveryProjects]);

  // ── 月度销售数据（当月完成交付项目的销售金额与销售利润之和，按财年月汇总）──
  // 复用共享归集 projectMonthlySales：销售金额 = salesAmt，销售利润 = salesProfit（未税 − 实际成本）
  // ⚠️ 某月任一完成交付项目无成本数据 → 该月销售利润为无值（undefined），提示成本缺失
  const monthlySalesData = useMemo(() => {
    return fyMonthWindows(fyRange).map((w, i) => {
      let amount = 0, profit = 0, incomplete = false;
      for (const p of deliveryProjects) {
        const info = deliveryQuoteInfo.get(p.id);
        const pt = projectMonthlySales(p, w.start, w.end, info?.taxRate, info?.gp3Amt);
        amount += pt.salesAmt;
        if (pt.salesProfit !== undefined) profit += pt.salesProfit;
        else incomplete = true;
      }
      return { name: FY_MONTH_LABELS[i], value: amount, subValue: incomplete ? undefined : profit || undefined };
    });
  }, [fyRange, deliveryQuoteInfo, deliveryProjects]);

  // ── 共享：财年已过月数 ──
  const elapsedMonths = useMemo(() => {
    const now = new Date();
    if (now > fyRange.end) return 12;
    if (now < fyRange.start) return 0;
    const jsMonth = now.getMonth();
    return (jsMonth >= 6 ? jsMonth - 6 : jsMonth + 6) + 1;
  }, [fyRange]);

  // ── 销售累计 ──
  const salesCumulative = useMemo(() => {
    const cumulative = monthlySalesData.slice(0, elapsedMonths).reduce((s, m) => s + m.value, 0);
    const profitCumulative = monthlySalesData.slice(0, elapsedMonths).reduce((s, m) => s + (m.subValue || 0), 0);
    const avgMonthly = parsedSalesTarget ? Math.round(parsedSalesTarget * 1000 / 12) : 0;
    const expectedCumulative = avgMonthly * elapsedMonths;
    const annualProfitTarget = parsedSalesTarget && parsedGp3 ? Math.round(parsedSalesTarget * parsedGp3 / 100) : 0;
    const avgMonthlyProfit = annualProfitTarget ? Math.round(annualProfitTarget * 1000 / 12) : 0;
    const expectedProfitCumulative = avgMonthlyProfit * elapsedMonths;
    return { cumulative, expectedCumulative, profitCumulative, expectedProfitCumulative, annualProfitTarget };
  }, [monthlySalesData, parsedSalesTarget, parsedGp3, elapsedMonths]);

  // ── 月度订单累计 + 利润累计 ──
  const monthlyCumulative = useMemo(() => {
    const cumulative = monthlyOrderData.slice(0, elapsedMonths).reduce((s, m) => s + m.value, 0);
    const profitCumulative = monthlyOrderData.slice(0, elapsedMonths).reduce((s, m) => s + (m.subValue || 0), 0);
    const avgMonthly = parsedAnnualTarget ? Math.round(parsedAnnualTarget * 1000 / 12) : 0;
    const expectedCumulative = avgMonthly * elapsedMonths;
    const annualProfitTarget = parsedAnnualTarget && parsedGp3 ? Math.round(parsedAnnualTarget * parsedGp3 / 100) : 0;
    const avgMonthlyProfit = annualProfitTarget ? Math.round(annualProfitTarget * 1000 / 12) : 0;
    const expectedProfitCumulative = avgMonthlyProfit * elapsedMonths;
    return { cumulative, expectedCumulative, profitCumulative, expectedProfitCumulative, elapsedMonths, annualProfitTarget, gp3: parsedGp3 };
  }, [monthlyOrderData, parsedAnnualTarget, parsedGp3, elapsedMonths]);

  // ── 当前活跃管道（不过滤财年；含未转交付的手动标赢，仍当作机会）──
  const currentPipeline = useMemo(() =>
    allOpps.filter(o => o.status === '过程中' || (o.status === '赢' && !isRealWin(o))),
  [allOpps]);

  // ── 漏斗：财年内的管道快照（仅统计在所选财年内活跃的过程机会，按"该财年结束时的历史阶段"分桶）──
  const funnelSnapshot = useMemo(() => {
    const byStage = new Map<string, { count: number; amount: number }>();
    for (const s of STAGES) byStage.set(s, { count: 0, amount: 0 });
    for (const o of currentPipeline) {
      // 财年隔断：机会活跃期 [createdAt, 有效结束] 与所选财年有交集才计入
      if (new Date(o.createdAt) > fyRange.end) continue;
      if (oppEffectiveEnd(o) < fyRange.start) continue;
      // 用"进入各阶段时间"确定该财年结束时的阶段（而非当前阶段），还原历史漏斗
      const stage = stageAsOf(o, fyRange.end);
      const entry = byStage.get(stage);
      if (entry) { entry.count++; entry.amount += exAmt(o); }
    }
    return STAGES.map(stage => ({
      stage,
      count: byStage.get(stage)!.count,
      amount: byStage.get(stage)!.amount,
      color: stageColors[stage] || COLORS.textLight,
    }));
  }, [currentPipeline, fyRange]);

  // ── 中标（按转交付时间 wonAt 归入财年；赢单以「转交付 terminated」为终极确认）──
  const fyWonByTime = useMemo(() => {
    return allOpps.filter(o => {
      // ⚠️ 全局规则：手动标赢未转交付不计赢单
      if (!isRealWin(o) || !o.wonAt) return false;
      const d = new Date(o.wonAt);
      return d >= fyRange.start && d <= fyRange.end;
    });
  }, [fyRange, allOpps]);

  // ── 订单加权 GP3（财年内获得订单的交付项目加权平均 GP3，取自最新版本报价编制表概算利润）──
  const orderWeightedGP3 = useMemo(() => {
    // 订单按获得（转交付 createdAt）时间归入财年，与「月度订单」同口径
    const inFy = deliveryProjects.filter(p => {
      const created = new Date(p.createdAt);
      return created >= fyRange.start && created <= fyRange.end;
    });
    if (inFy.length === 0) return 0;
    let totalAmt = 0, weighted = 0;
    for (const p of inFy) {
      const oppProfit = deliveryQuoteInfo.get(p.id);
      if (!oppProfit || oppProfit.discounted <= 0) continue;
      // ⚠️ 权重用未税金额（与月度订单/未税口径一致），而非含税 contractAmount
      const ex = deliveryExTax(p, deliveryQuoteInfo);
      totalAmt += ex;
      weighted += ex * oppProfit.rate;
    }
    return totalAmt > 0 ? (weighted / totalAmt * 100) : 0;
  }, [fyRange, deliveryQuoteInfo, deliveryProjects]);

  // ── 已交付项目实际 GP3（已完成项目总结且成本审批通过的项目的加权平均实际 GP3）──
  const deliveredActualGP3 = useMemo(() => {
    // 与「月度销售」同口径：节点15完成且完成日 ∈ 财年（销售金额只归集到完成月/财年，不可跨年重复）
    const delivered = deliveryProjects.filter(p => {
      // 已完成交付判定：节点15实际完成日或 updatedAt 回退（统一共享口径）
      const doneDate = getProjectDoneDate(p);
      if (!doneDate) return false;
      if (doneDate < fyRange.start || doneDate > fyRange.end) return false;
      if (p.costStatus !== 'approved' || p.totalActualCost == null) return false;
      return true;
    });
    if (delivered.length === 0) return 0;
    let totalAmt = 0, weighted = 0;
    for (const p of delivered) {
      const exTax = deliveryExTax(p, deliveryQuoteInfo);
      totalAmt += exTax;
      // 实际销售利润（共享 deliverySalesProfit：未税 − 实际成本；成本已被过滤保证非空）
      const actProfit = deliverySalesProfit(exTax, p.totalActualCost);
      const actGP3 = exTax > 0 && actProfit != null ? actProfit / exTax : 0;
      weighted += exTax * actGP3;
    }
    return totalAmt > 0 ? (weighted / totalAmt * 100) : 0;
  }, [fyRange, deliveryQuoteInfo, deliveryProjects]);

  // ── 漏斗右侧 FY 累计用 ──
  const fyWon = useMemo(() => ({
    count: fyWonByTime.length,
    amount: fyWonByTime.reduce((s, o) => s + exAmt(o), 0),
  }), [fyWonByTime]);

  // ── 输单（按输单时间 updatedAt 归入财年）──
  const fyLostByTime = useMemo(() => {
    return allOpps.filter(o => {
      if (o.status !== '输') return false;
      const d = new Date(o.lostAt || o.updatedAt);
      return d >= fyRange.start && d <= fyRange.end;
    });
  }, [fyRange, allOpps]);
  // 财年"机会+"阶段输单（漏斗中标转化率分母 = 赢 + 机会+输单；剔除线索/信息阶段输单——它们未进入机会阶段）
  const fyOppLost = useMemo(() => {
    const oppLost = fyLostByTime.filter(o => stageIdx(o.stage) >= stageIdx('机会'));
    return { count: oppLost.length, amount: oppLost.reduce((s, o) => s + exAmt(o), 0) };
  }, [fyLostByTime]);

  // ── 财年各阶段汇总（用于漏斗右侧 FY 累计显示；过滤逻辑与 useFyFiltered 相同，直接复用 fyFiltered）──
  const fyInfo = useMemo(() => ({
    count: fyFiltered.length,
    amount: fyFiltered.reduce((s, o) => s + exAmt(o), 0),
  }), [fyFiltered]);

  const fyLead = useMemo(() => {
    const items = fyFiltered.filter(o => stageIdx(o.stage) >= stageIdx('线索') || o.wonAt);
    return { count: items.length, amount: items.reduce((s, o) => s + exAmt(o), 0) };
  }, [fyFiltered]);

  const fyOpp = useMemo(() => {
    const items = fyFiltered.filter(o => stageIdx(o.stage) >= stageIdx('机会') || o.wonAt);
    return { count: items.length, amount: items.reduce((s, o) => s + exAmt(o), 0) };
  }, [fyFiltered]);

  // ── 概览卡片主/副参考月（3 个，按所选财年锚定）──
  // 已结束财年 → 财年最后三个月（6月/5月/4月）；当前财年 → 最近3个完整月
  // （新财年初自动继承前一财年 6/5/4 月的管道与滚动数据，避免从 0 开始）；未来财年 → 全null
  const overviewRefMonths = useMemo<(Date | null)[]>(() => {
    const now = new Date();
    if (now > fyRange.end) {
      const y2 = fyRange.end.getFullYear();
      return [monthEndOf(y2, 5), monthEndOf(y2, 4), monthEndOf(y2, 3)]; // 6月/5月/4月
    }
    if (now < fyRange.start) return [null, null, null]; // 未来财年无数据
    const cur = new Date(now.getFullYear(), now.getMonth(), 1);
    return [
      monthEndOf(cur.getFullYear(), cur.getMonth() - 1),
      monthEndOf(cur.getFullYear(), cur.getMonth() - 2),
      monthEndOf(cur.getFullYear(), cur.getMonth() - 3),
    ];
  }, [fyRange]);

  // ── 按财年锚定的月度 KPI（加权管道/加权利润/加权利润率）──
  // 销售周期/赢单转化率已由 rolling12mKpi 负责，此处仅输出管道三项
  const monthlyKpi = useMemo(() => {
    const calcMonth = (refEnd: Date | null) => {
      if (!refEnd) return { weightedPipeline: 0, weightedProfit: 0, weightedProfitRate: 0, valid: false };
      const monthStart = new Date(refEnd.getFullYear(), refEnd.getMonth(), 1);
      const monthEnd = refEnd;
      const activeOpps = allOpps.filter(o => {
        const created = new Date(o.createdAt);
        // 冻结机会不属于活跃（全页面统一口径），不计入管道
        return created <= monthEnd && oppEffectiveEnd(o) >= monthStart && o.status !== '冻结';
      });
      // 管道基数 = 该月活跃（过程中/未转交付标赢；冻结已排除）且阶段≥机会的项目；
      // 已转交付的赢单不计入管道；终止（输）后经 oppEffectiveEnd 不再计入后续月份
      // ⚠️ 用参考月历史阶段 stageAsOf 而非当前阶段：已推进到议价的机会不应计入早前月份的管道（与漏斗/仪表盘口径一致）
      const pipelineOpps = activeOpps.filter(o => !isRealWin(o) && stageIdx(stageAsOf(o, monthEnd)) >= stageIdx('机会'));
      let weighted = 0, profit = 0;
      for (const o of pipelineOpps) {
        const w = Math.round(exAmt(o) * o.winRate / 100);
        weighted += w;
        const q = o.quotationId ? quotationById.get(o.quotationId) : undefined;
        // 机会必须编制报价；无报价的机会利润率为 0（不假定 15%），低利润率可暴露管理问题
        profit += Math.round(w * (q ? (q.profitRate ?? 0) / 100 : 0));
      }
      return { weightedPipeline: weighted, weightedProfit: profit, weightedProfitRate: weighted > 0 ? profit / weighted * 100 : 0, valid: true };
    };
    return overviewRefMonths.map(calcMonth);
  }, [allOpps, quotationById, overviewRefMonths]);

  // ── 机会 → 转交付时间（交付项目创建时间），销售周期终点 ──
  const deliveryCreatedByOpp = useMemo(() => {
    const map = new Map<string, Date>();
    for (const p of deliveryProjects) {
      if (p.opportunityId) map.set(p.opportunityId, new Date(p.createdAt));
    }
    return map;
  }, [deliveryProjects]);

  // ── 按财年锚定的滚动12个月指标（销售周期、赢单转化率，用于概览卡片）──
  // 销售周期 = 转交付时间(交付项目创建) − 进入机会时间(opportunityAt；回退 createdAt)；仅统计已转交付的赢单
  const rolling12mKpi = useMemo(() => {
    const calcWindow = (refEnd: Date | null) => {
      if (!refEnd) return { salesCycle: 0, decidedWinRate: 0, wonDecided: 0, valid: false };
      const wEnd = refEnd;
      // 真正的12个月窗口：起点 = 参考月往前推11个月的首日（如参考6月 → 去年7月1日）
      const wStart = new Date(wEnd.getFullYear(), wEnd.getMonth() - 11, 1);
      // 以"机会"为锚点：赢单转化率/销售周期只统计达到机会阶段的项目（信息/线索质量不稳定，作基线波动大）
      // ⚠️ 全局规则：赢单以转交付（terminated）为终极确认，手动标赢未转交付不计赢单
      const won = allOpps.filter(o =>
        isRealWin(o) && o.wonAt && new Date(o.wonAt) >= wStart && new Date(o.wonAt) <= wEnd
      );
      const lost = allOpps.filter(o =>
        o.status === '输' && stageIdx(o.stage) >= stageIdx('机会') &&
        new Date(o.lostAt || o.updatedAt) >= wStart && new Date(o.lostAt || o.updatedAt) <= wEnd
      );
      const cycles = won.filter(o => deliveryCreatedByOpp.has(o.id)).map(o => {
        const start = new Date(o.opportunityAt || o.createdAt);
        const end = deliveryCreatedByOpp.get(o.id)!;
        return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      });
      const cycle = cycles.length > 0 ? Math.round(cycles.reduce((s, d) => s + d, 0) / cycles.length) : 0;
      const total = won.length + lost.length;
      // decidedWinRate = 中标转化率（赢 / (赢+机会+输)）：仅已决出的机会+项目，与销售漏斗最终转化率同公式、异窗口（此处为滚动12个月）
      return { salesCycle: cycle, decidedWinRate: total > 0 ? won.length / total * 100 : 0, wonDecided: total, valid: true };
    };
    return overviewRefMonths.map(calcWindow);
  }, [allOpps, overviewRefMonths, deliveryCreatedByOpp]);

  // ── 输单原因柱状图（按输单时间归入财年）──
  const dimLossReasons = useDimReasons(fyLostByTime, '竞对');
  const dimCancelReasons = useDimReasons(fyLostByTime, '取消');
  const dimAbandonReasons = useDimReasons(fyLostByTime, '放弃');

  // ── 销售员统一统计 ──
  const salesmenStats = useMemo(() => {
    const map = new Map<string, {
      name: string; wins: number; orderAmount: number;
      pipelinePotential: number; profitTotal: number; totalCount: number;
    }>();
    const newEntry = (name: string) => ({ name, wins: 0, orderAmount: 0, pipelinePotential: 0, profitTotal: 0, totalCount: 0 });

    // 赢单数量（转化效率分子，按 wonAt 归入财年）
    for (const o of fyWonByTime) {
      if (!o.salesman) continue;
      let s = map.get(o.salesman);
      if (!s) { s = newEntry(o.salesman); map.set(o.salesman, s); }
      s.wins++;
    }
    // 转化效率分母：机会+ 已决出（赢+输），排除进行中/冻结/未转交付标赢与线索/信息，与漏斗赢单率口径一致
    for (const o of fyFiltered) {
      if (!o.salesman) continue;
      if (o.status === '过程中' || o.status === '冻结' || (o.status === '赢' && !isRealWin(o))) continue;
      if (stageIdx(o.stage) < stageIdx('机会')) continue;
      let s = map.get(o.salesman);
      if (!s) { s = newEntry(o.salesman); map.set(o.salesman, s); }
      s.totalCount++;
    }
    // 订单金额/订单利润：财年内转交付的交付项目合同金额（未税，与「月度订单」同口径），经机会关联销售员
    const oppById = new Map(allOpps.map(o => [o.id, o]));
    for (const p of deliveryProjects) {
      const created = new Date(p.createdAt);
      if (created < fyRange.start || created > fyRange.end) continue; // 财年隔断：转交付时间
      if (!p.opportunityId) continue;
      const opp = oppById.get(p.opportunityId);
      if (!opp?.salesman) continue;
      let s = map.get(opp.salesman);
      if (!s) { s = newEntry(opp.salesman); map.set(opp.salesman, s); }
      const exTax = deliveryExTax(p, deliveryQuoteInfo);
      s.orderAmount += exTax;
      // 订单利润：报价编制表概算利润转未税（共享 quoteProfitExTax）
      const oppProfit = deliveryQuoteInfo.get(p.id);
      s.profitTotal += quoteProfitExTax(oppProfit?.gp3Amt, oppProfit?.taxRate);
    }
    // 管道潜力：与「加权管道」同源（财年活跃期 + 机会锚点 + 已转交付赢单不计入），原始金额（不含赢率加权）
    for (const o of fyFiltered) {
      if (!o.salesman) continue;
      if (isRealWin(o) || o.status === '冻结') continue; // 冻结机会不计入管道（全页面统一口径）
      if (stageIdx(o.stage) < stageIdx('机会')) continue;
      let s = map.get(o.salesman);
      if (!s) { s = newEntry(o.salesman); map.set(o.salesman, s); }
      s.pipelinePotential += exAmt(o);
    }
    return [...map.values()].map(s => ({
      ...s,
      conversionEff: s.totalCount > 0 ? s.wins / s.totalCount * 100 : 0,
    }));
  }, [fyWonByTime, fyFiltered, fyRange, deliveryProjects, allOpps, deliveryQuoteInfo]);

  // ── 4 个维度提取（图表通过 topN=10 自动排序取前10名）──
  const dimEfficiency: BarItem[] = salesmenStats.map(s => ({ name: s.name, value: Math.round(s.conversionEff * 10) / 10 }));
  const dimOrderAmount: BarItem[] = salesmenStats.map(s => ({ name: s.name, value: s.orderAmount }));
  const dimPipeline: BarItem[] = salesmenStats.map(s => ({ name: s.name, value: s.pipelinePotential }));
  const dimProfit: BarItem[] = salesmenStats.map(s => ({ name: s.name, value: s.profitTotal }));

  // 概览卡片值/颜色格式化：无效（未来财年）显示 —，避免重复 valid 三元
  const kpiCell = (valid: boolean, value: number, fmt: (n: number) => string, color: string): { value: string; color: string } =>
    valid ? { value: fmt(value), color } : { value: '—', color: COLORS.textLight };

  // 概览卡片（按月数据）
  const overviewItems = [
    { label: '加权管道',
      ...kpiCell(monthlyKpi[0].valid, monthlyKpi[0].weightedPipeline, v => `¥${fmtK(v)}`, COLORS.primary), icon: '📊',
      prevValues: [
        kpiCell(monthlyKpi[1].valid, monthlyKpi[1].weightedPipeline, v => `¥${fmtK(v)}`, COLORS.primary),
        kpiCell(monthlyKpi[2].valid, monthlyKpi[2].weightedPipeline, v => `¥${fmtK(v)}`, COLORS.primary),
      ] },
    { label: '加权利润',
      ...kpiCell(monthlyKpi[0].valid, monthlyKpi[0].weightedProfit, v => `¥${fmtK(v)}`, COLORS.purple), icon: '💰',
      prevValues: [
        kpiCell(monthlyKpi[1].valid, monthlyKpi[1].weightedProfit, v => `¥${fmtK(v)}`, COLORS.purple),
        kpiCell(monthlyKpi[2].valid, monthlyKpi[2].weightedProfit, v => `¥${fmtK(v)}`, COLORS.purple),
      ] },
    { label: '加权利润率',
      ...kpiCell(monthlyKpi[0].valid, monthlyKpi[0].weightedProfitRate, v => `${v.toFixed(1)}%`, monthlyKpi[0].weightedProfitRate >= 15 ? COLORS.success : COLORS.warning), icon: '📈',
      prevValues: [
        kpiCell(monthlyKpi[1].valid, monthlyKpi[1].weightedProfitRate, v => `${v.toFixed(1)}%`, monthlyKpi[1].weightedProfitRate >= 15 ? COLORS.success : COLORS.warning),
        kpiCell(monthlyKpi[2].valid, monthlyKpi[2].weightedProfitRate, v => `${v.toFixed(1)}%`, monthlyKpi[2].weightedProfitRate >= 15 ? COLORS.success : COLORS.warning),
      ] },
    { label: '销售周期',
      ...kpiCell(rolling12mKpi[0].salesCycle > 0, rolling12mKpi[0].salesCycle, v => `${v} 天`, rolling12mKpi[0].salesCycle <= 120 ? COLORS.success : COLORS.warning), icon: '⏱️',
      prevValues: [
        kpiCell(rolling12mKpi[1].salesCycle > 0, rolling12mKpi[1].salesCycle, v => `${v} 天`, rolling12mKpi[1].salesCycle <= 120 ? COLORS.success : COLORS.warning),
        kpiCell(rolling12mKpi[2].salesCycle > 0, rolling12mKpi[2].salesCycle, v => `${v} 天`, rolling12mKpi[2].salesCycle <= 120 ? COLORS.success : COLORS.warning),
      ] },
    { label: '赢单转化率',
      ...kpiCell(rolling12mKpi[0].wonDecided > 0, rolling12mKpi[0].decidedWinRate, v => `${v.toFixed(1)}%`, rolling12mKpi[0].decidedWinRate >= 20 ? COLORS.success : COLORS.warning), icon: '🎯',
      prevValues: [
        kpiCell(rolling12mKpi[1].wonDecided > 0, rolling12mKpi[1].decidedWinRate, v => `${v.toFixed(1)}%`, rolling12mKpi[1].decidedWinRate >= 20 ? COLORS.success : COLORS.warning),
        kpiCell(rolling12mKpi[2].wonDecided > 0, rolling12mKpi[2].decidedWinRate, v => `${v.toFixed(1)}%`, rolling12mKpi[2].decidedWinRate >= 20 ? COLORS.success : COLORS.warning),
      ] },
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
  }
  return (
    <div>
      {ctx}
      {/* 标题行 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark }}>销售分析</span>
        <FYSelector value={fySelect} onChange={setFySelect} />
      </div>

      {/* Row 1: 概览卡片 */}
      <OverviewCards items={overviewItems} />

      {/* Row 2: 漏斗 | 赢单原因 | 输单原因 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <Card size="small"
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>月度订单</span>}
          style={{ flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '8px 12px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 1, minHeight: 14 }}>
            {targetEditing ? (
              <input type="number" min={0} ref={targetRef}
                value={annualTargetInput}
                onChange={e => saveAnnualTarget(e.target.value.replace(/\D/g, '').slice(0, 10))}
                onBlur={() => setTargetEditing(false)}
                onKeyDown={e => { if (e.key === 'Enter') setTargetEditing(false); }}
                style={{ ...EDIT_INPUT_STYLE, color: COLORS.primary, minWidth: '14ch', width: `${Math.max(annualTargetInput.length || 1, 1)}ch` }}
                autoFocus
              />
            ) : (
              <span style={{ fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700 }}
                onClick={() => { setTargetEditing(true); setTimeout(() => targetRef.current?.focus(), 0); }}>
                <span style={{ color: COLORS.primary }}>{annualTargetInput ? `${parsedAnnualTarget.toLocaleString()}K` : '—'}</span>
                {annualTargetInput ? (
                  <span style={{ color: monthlyCumulative.cumulative >= monthlyCumulative.expectedCumulative ? COLORS.primary : COLORS.danger, fontSize: 10 }}>
                    {`(${Math.round(monthlyCumulative.cumulative / 1000).toLocaleString()}K)`}
                  </span>
                ) : null}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 1, minHeight: 14 }}>
            <span style={{ fontSize: 10, whiteSpace: 'nowrap', fontWeight: 700 }}>
              <span style={{ color: COLORS.purple }}>
                {annualTargetInput && gp3Input ? `${monthlyCumulative.annualProfitTarget.toLocaleString()}K` : '—'}
              </span>
              {annualTargetInput && gp3Input ? (
                <span style={{ color: monthlyCumulative.profitCumulative >= monthlyCumulative.expectedProfitCumulative ? COLORS.purple : COLORS.danger, fontSize: 10 }}>
                  {`(${Math.round(monthlyCumulative.profitCumulative / 1000).toLocaleString()}K)`}
                </span>
              ) : null}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 1, minHeight: 14 }}>
            {orderGp3Editing ? (
              <input type="number" min={0} max={100} ref={orderGp3Ref}
                value={gp3Input}
                onChange={e => saveGp3(e.target.value.replace(/[^\d.]/g, '').replace(/(\.\d).*/, '$1').slice(0, 5))}
                onBlur={() => setOrderGp3Editing(false)}
                onKeyDown={e => { if (e.key === 'Enter') setOrderGp3Editing(false); }}
                style={{ ...EDIT_INPUT_STYLE, fontSize: 10, color: COLORS.purple, minWidth: '4ch', width: `${Math.max(gp3Input.length || 1, 1)}ch` }}
                autoFocus
              />
            ) : (
              <span style={{ fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700 }}
                onClick={() => { setOrderGp3Editing(true); setTimeout(() => orderGp3Ref.current?.focus(), 0); }}>
                <span style={{ color: COLORS.purple }}>
                  {gp3Input || '—'}
                </span>
              </span>
            )}
            <span style={{ fontSize: 10, color: COLORS.purple, fontWeight: 700, marginLeft: 4 }}>
              ({orderWeightedGP3 > 0 ? orderWeightedGP3.toFixed(1) : '—'})
            </span>
          </div>
          <VerticalBarChart title="" data={monthlyOrderData} format="K" height={260} topN={12} barWidthRatio={0.6} maxBarWidth={120} contentOffset={0} chartWidth={620} disableSort padTop={30} cardBorder={false}
            targetValue={annualTargetInput ? Math.round(parsedAnnualTarget * 1000 / 12) : undefined}
          />
        </Card>

        <Card size="small"
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>销售漏斗</span>}
          style={{ flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '8px 12px' } }}
        >
          <SalesFunnel
            funnelData={funnelSnapshot}
            fyInfo={fyInfo} fyLead={fyLead} fyOpp={fyOpp} fyWon={fyWon} fyOppLost={fyOppLost}
          />
        </Card>


        <Card size="small"
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>月度销售</span>}
          style={{ flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '8px 12px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 1, minHeight: 14 }}>
            {salesTargetEditing ? (
              <input type="number" min={0} ref={salesTargetRef}
                value={annualSalesTarget}
                onChange={e => saveSalesTarget(e.target.value.replace(/\D/g, '').slice(0, 10))}
                onBlur={() => setSalesTargetEditing(false)}
                onKeyDown={e => { if (e.key === 'Enter') setSalesTargetEditing(false); }}
                style={{ ...EDIT_INPUT_STYLE, color: COLORS.success, minWidth: '14ch', width: `${Math.max(annualSalesTarget.length || 1, 1)}ch` }}
                autoFocus
              />
            ) : (
              <span style={{ fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700 }}
                onClick={() => { setSalesTargetEditing(true); setTimeout(() => salesTargetRef.current?.focus(), 0); }}>
                <span style={{ color: COLORS.success }}>{annualSalesTarget ? `${parsedSalesTarget.toLocaleString()}K` : '—'}</span>
                {annualSalesTarget ? (
                  <span style={{ color: salesCumulative.cumulative >= salesCumulative.expectedCumulative ? COLORS.success : COLORS.danger, fontSize: 10 }}>
                    {`(${Math.round(salesCumulative.cumulative / 1000).toLocaleString()}K)`}
                  </span>
                ) : null}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 1, minHeight: 14 }}>
            <span style={{ fontSize: 10, whiteSpace: 'nowrap', fontWeight: 700 }}>
              <span style={{ color: COLORS.purple }}>
                {annualSalesTarget && gp3Input ? `${salesCumulative.annualProfitTarget.toLocaleString()}K` : '—'}
              </span>
              {annualSalesTarget && gp3Input ? (
                <span style={{ color: salesCumulative.profitCumulative >= salesCumulative.expectedProfitCumulative ? COLORS.purple : COLORS.danger, fontSize: 10 }}>
                  {`(${Math.round(salesCumulative.profitCumulative / 1000).toLocaleString()}K)`}
                </span>
              ) : null}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 1, minHeight: 14 }}>
            {salesGp3Editing ? (
              <input type="number" min={0} max={100} ref={salesGp3Ref}
                value={gp3Input}
                onChange={e => saveGp3(e.target.value.replace(/[^\d.]/g, '').replace(/(\.\d).*/, '$1').slice(0, 5))}
                onBlur={() => setSalesGp3Editing(false)}
                onKeyDown={e => { if (e.key === 'Enter') setSalesGp3Editing(false); }}
                style={{ ...EDIT_INPUT_STYLE, fontSize: 10, color: COLORS.danger, minWidth: '4ch', width: `${Math.max(gp3Input.length || 1, 1)}ch` }}
                autoFocus
              />
            ) : (
              <span style={{ fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700 }}
                onClick={() => { setSalesGp3Editing(true); setTimeout(() => salesGp3Ref.current?.focus(), 0); }}>
                <span style={{ color: COLORS.danger }}>
                  {gp3Input || '—'}
                </span>
              </span>
            )}
            <span style={{ fontSize: 10, color: COLORS.danger, fontWeight: 700, marginLeft: 4 }}>
              ({deliveredActualGP3 > 0 ? deliveredActualGP3.toFixed(1) : '—'})
            </span>
          </div>
          <VerticalBarChart title="" data={monthlySalesData} format="K" height={260} topN={12} barWidthRatio={0.6} maxBarWidth={120} contentOffset={0} chartWidth={620} disableSort padTop={30} cardBorder={false}
            targetValue={annualSalesTarget ? Math.round(parsedSalesTarget * 1000 / 12) : undefined}
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginTop: 15, gridAutoRows: 250 }}>
          <div style={{ overflow: 'hidden' }}><VerticalBarChart title="订单金额" data={dimOrderAmount} format="K" contentOffset={35} /></div>
          <div style={{ overflow: 'hidden' }}><VerticalBarChart title="订单利润" data={dimProfit} format="K" contentOffset={35} /></div>
          <div style={{ overflow: 'hidden' }}><VerticalBarChart title="转化效率" data={dimEfficiency} format="%" contentOffset={35} /></div>
          <div style={{ overflow: 'hidden' }}><VerticalBarChart title="管道潜力" data={dimPipeline} format="K" contentOffset={35} /></div>
        </div>
      </div>
    </div>
  );
};

export default SalesAnalysis;
