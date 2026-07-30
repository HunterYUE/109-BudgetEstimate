import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Card, Spin, message } from 'antd';
import type { SalesOpportunity, QuotationSummary, DeliveryProject } from '../types';
import { parseReasons, REASON_TAXONOMY } from '../reasonTaxonomy';
import { SalesFunnel, VerticalBarChart, type BarItem } from '../components/charts/SalesCharts';
import { opportunityService } from '../services/opportunityService';
import { quotationService } from '../services/quotationService';
import { deliveryService } from '../services/deliveryService';
import { COLORS } from '../styles/colors';
import { computeDeliveryEstGP3 } from '../utils/calculations';
import { parseFY, FYSelector } from '../utils/fiscalYear';
import { fmtK, loadQuotationGroups, preloadQuotationGroupsBatch } from '../utils/analysisShared';
import { settingsService } from '../services/settingsService';

/* ============================================================
   常量
   ============================================================ */
const stageColors: Record<string, string> = {
  信息: COLORS.textLight, 线索: COLORS.primary, 机会: COLORS.purple,
  投标: COLORS.warning, 议价: COLORS.amber, 中标: COLORS.success,
};
const STAGES = ['信息', '线索', '机会', '投标', '议价', '中标'] as const;

// localStorage 输入的 parseInt 保护
const safeParseInt = (val: string | undefined | null): number => {
  const n = parseInt(val ?? '', 10);
  return isNaN(n) ? 0 : n;
};
/** 含税→未税（统一使用未税口径） */
const exAmt = (o: SalesOpportunity) => Math.round(o.amount / (1 + (o.taxRate ?? 0.13)));

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
      const effectiveEnd = (o.status === '过程中' || o.status === '冻结')
        ? new Date()
        : new Date(o.updatedAt);
      return created <= fyRange.end && effectiveEnd >= fyRange.start;
    });
  }, [allOpps, fy]);
}

/* ============================================================
   子组件 — 概览卡片
   ============================================================ */
interface KpiCard {
  label: string; value: string; color: string; icon: string;
  prevValues?: { value: string; color: string }[];
}
const OverviewCards: React.FC<{ items: KpiCard[] }> = ({ items }) => (
  <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
    {items.map((item, i) => (
      <Card key={i} size="small"
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
        <div style={{ fontSize: 22, fontWeight: 700, color: item.color, lineHeight: 1.2 }}>
          {item.value}
        </div>
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


const SalesAnalysis: React.FC = () => {
  const [msg, ctx] = message.useMessage();
  const [allOpps, setAllOpps] = useState<SalesOpportunity[]>([]);
  const [quotationSummaries, setQuotationSummaries] = useState<QuotationSummary[]>([]);
  const [deliveryProjects, setDeliveryProjects] = useState<DeliveryProject[]>([]);
  const [loading, setLoading] = useState(true);
  const defaultFy = `FY${String(new Date().getFullYear() % 100).padStart(2,'0')}${String((new Date().getFullYear() + 1) % 100).padStart(2,'0')}`;
  const [fySelect, setFySelect] = useState(defaultFy);

  const loadAll = useCallback(async () => {
    try {
      const [opps, qs, dps] = await Promise.all([
        opportunityService.list(),
        quotationService.list(),
        deliveryService.list(),
      ]);
      setAllOpps(opps);
      setQuotationSummaries(qs);
      setDeliveryProjects(dps);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      msg.error('加载销售分析数据失败：' + errMsg);
      setAllOpps([]);
      setQuotationSummaries([]);
      setDeliveryProjects([]);
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const [preloadReady, setPreloadReady] = useState(0);
  useEffect(() => {
    const ids = (deliveryProjects||[]).filter(p => p.quotationId).map(p => p.quotationId);
    if (ids.length > 0) preloadQuotationGroupsBatch(ids).then(() => setPreloadReady(v => v + 1));
  }, [deliveryProjects]);

  // ── 报价估算缓存（避免重复调用 loadQuotationGroups）──
  const projectEstimates = useMemo(() => {
    void preloadReady;
    const map = new Map<string, ReturnType<typeof computeDeliveryEstGP3>>();
    for (const p of (deliveryProjects||[])) {
      if (!p.quotationId) continue;
      if (p.nodes.length === 0) continue; // 只缓存有节点数据的项目
      const { groups, version } = loadQuotationGroups(p.quotationId);
      map.set(p.id, computeDeliveryEstGP3(p.contractAmount, groups, version));
    }
    return map;
  }, [deliveryProjects, preloadReady]);

  const fyFiltered = useFyFiltered(allOpps, fySelect);

  // ── 年度订单指标 + 目标GP3 ──
  const [annualTargetInput, setAnnualTargetInput] = useState(() => { try { return localStorage.getItem('saAnnualTarget') || ''; } catch { return ''; } });
  const [targetEditing, setTargetEditing] = useState(false);
  const targetRef = React.useRef<HTMLInputElement>(null);
  const [gp3Input, setGp3Input] = useState(() => { try { return localStorage.getItem('saTargetGP3') || ''; } catch { return ''; } });
  const [orderGp3Editing, setOrderGp3Editing] = useState(false);
  const orderGp3Ref = React.useRef<HTMLInputElement>(null);
  const [salesGp3Editing, setSalesGp3Editing] = useState(false);
  const salesGp3Ref = React.useRef<HTMLInputElement>(null);
  // ── 月度销售指标 ──
  const [annualSalesTarget, setAnnualSalesTarget] = useState(() => { try { return localStorage.getItem('saAnnualSalesTarget') || ''; } catch { return ''; } });
  const [salesTargetEditing, setSalesTargetEditing] = useState(false);
  const salesTargetRef = React.useRef<HTMLInputElement>(null);
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ── 从服务端加载用户设置（必须在所有 setState 声明之后）──
  useEffect(() => {
    if (loading) return;
    settingsService.get().then(settings => {
      if (settings.saAnnualTarget) setAnnualTargetInput(settings.saAnnualTarget);
      if (settings.saTargetGP3) setGp3Input(settings.saTargetGP3);
      if (settings.saAnnualSalesTarget) setAnnualSalesTarget(settings.saAnnualSalesTarget);
    }).catch(() => {});
  }, [loading]);

  // 保存到 localStorage + 服务端持久化
  const settingsRef = useRef({ annualTargetInput: '', gp3Input: '', annualSalesTarget: '' });
  useEffect(() => { settingsRef.current = { annualTargetInput, gp3Input, annualSalesTarget }; });

  const saveToServer = useCallback(() => {
    const cur = settingsRef.current;
    const payload: Record<string, string> = {};
    if (cur.annualTargetInput) payload.saAnnualTarget = cur.annualTargetInput;
    if (cur.gp3Input) payload.saTargetGP3 = cur.gp3Input;
    if (cur.annualSalesTarget) payload.saAnnualSalesTarget = cur.annualSalesTarget;
    if (Object.keys(payload).length > 0) {
      settingsService.save(payload).catch(e => console.warn('[Settings] 保存到服务端失败:', e));
    }
  }, []); // 空依赖：通过 ref 读取最新值

  const saveSalesTarget = (v: string) => {
    setAnnualSalesTarget(v);
    try { localStorage.setItem('saAnnualSalesTarget', v); } catch (e) { console.warn('[SalesAnalysis] 保存销售指标失败:', e); };
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(saveToServer, 3000);
  };

  const saveAnnualTarget = (v: string) => {
    setAnnualTargetInput(v);
    try { localStorage.setItem('saAnnualTarget', v); } catch (e) { console.warn('[SalesAnalysis] 保存年度订单目标失败:', e); };
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(saveToServer, 3000);
  };
  const saveGp3 = (v: string) => {
    setGp3Input(v);
    try { localStorage.setItem('saTargetGP3', v); } catch (e) { console.warn('[SalesAnalysis] 保存GP3目标失败:', e); };
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(saveToServer, 3000);
  };

  // ── 预解析目标输入值（避免渲染中重复 parseInt）──
  const parsedAnnualTarget = useMemo(() => safeParseInt(annualTargetInput), [annualTargetInput]);
  const parsedSalesTarget = useMemo(() => safeParseInt(annualSalesTarget), [annualSalesTarget]);
  const parsedGp3 = useMemo(() => parseFloat(gp3Input) || 0, [gp3Input]);

  // ── 判断交付项目是否属于某财年（创建、活动、完成任一环节落入则属之）──
  const isProjActiveInFy = (p: DeliveryProject, fyR: { start: Date; end: Date }): boolean => {
    const created = new Date(p.createdAt);
    if (created > fyR.end) return false;
    const node15 = (p.nodes||[]).find((n: any) => n.nodeNo === 15);
    let effEnd: Date;
    if (node15?.actualDate) {
      effEnd = new Date(node15.actualDate);
    } else if (p.status === '已完成' || p.status === '已延期') {
      effEnd = new Date(p.updatedAt);
    } else {
      effEnd = new Date();
    }
    return effEnd >= fyR.start;
  };

  // ── 月度订单数据（当月转交付项目的合同金额之和，按财年月汇总）──
  const monthlyOrderData = useMemo(() => {
    const fyRange = parseFY(fySelect);
    const inFy = (deliveryProjects||[]).filter(p => isProjActiveInFy(p, fyRange));
    const byMonth = new Map<number, { amount: number; profit: number }>();
    for (const p of inFy) {
      const d = new Date(p.createdAt);
      const fyMonth = d.getMonth() < 6 ? d.getMonth() + 6 : d.getMonth() - 6;
      const prev = byMonth.get(fyMonth) || { amount: 0, profit: 0 };
      const est = projectEstimates.get(p.id);
      const exTax = est ? est.exTax : Math.round(p.contractAmount / (1 + (loadQuotationGroups(p.quotationId).version?.taxRate ?? 0.13)));
      const estProfit = est ? (exTax - est.grandEstimated) : 0;
      byMonth.set(fyMonth, { amount: prev.amount + exTax, profit: prev.profit + estProfit });
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
  // deliveryProjects 变化通过 projectEstimates 捕获
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fySelect, projectEstimates]);

  // ── 月度销售数据（已完成项目总结的交付项目按月汇总）──
  const monthlySalesData = useMemo(() => {
    const fyRange = parseFY(fySelect);
    const MONTH_LABELS = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];
    const byMonth = new Map<number, { amount: number; profit: number }>();
    for (const p of deliveryProjects) {
      const node15 = (p.nodes||[]).find(n => n.nodeNo === 15);
      if (!node15 || (node15.status !== 'completed' && node15.status !== 'delayed')) continue;
      const completionDate = node15.actualDate || p.updatedAt;
      const d = new Date(completionDate);
      if (d < fyRange.start || d > fyRange.end) continue;
      const fyMonth = d.getMonth() < 6 ? d.getMonth() + 6 : d.getMonth() - 6;
      const prev = byMonth.get(fyMonth) || { amount: 0, profit: 0 };
      const est = projectEstimates.get(p.id);
      const exTax = est ? est.exTax : Math.round(p.contractAmount / (1 + (loadQuotationGroups(p.quotationId).version?.taxRate ?? 0.13)));
      const actualProfit = p.totalActualCost != null ? (exTax - p.totalActualCost) : Math.round(exTax * 0.20);
      byMonth.set(fyMonth, { amount: prev.amount + exTax, profit: prev.profit + actualProfit });
    }
    return Array.from({ length: 12 }, (_, i) => {
      const m = byMonth.get(i);
      return { name: MONTH_LABELS[i], value: m ? m.amount : 0, subValue: m ? m.profit : undefined };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fySelect, projectEstimates]);

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

  // ── 当前活跃管道（不过滤财年，仅 status='过程中'）──
  const currentPipeline = useMemo(() =>
    allOpps.filter(o => o.status === '过程中'),
  [allOpps]);

  // ── 漏斗：当前快照 ──
  const funnelSnapshot = useMemo(() => {
    const byStage = new Map<string, { count: number; amount: number }>();
    for (const s of STAGES) byStage.set(s, { count: 0, amount: 0 });
    for (const o of currentPipeline) {
      const entry = byStage.get(o.stage);
      if (entry) { entry.count++; entry.amount += exAmt(o); }
    }
    return STAGES.map(stage => ({
      stage,
      count: byStage.get(stage)!.count,
      amount: byStage.get(stage)!.amount,
      color: stageColors[stage] || COLORS.textLight,
    }));
  }, [currentPipeline]);

  // ── 中标（按转交付时间 wonAt 归入财年，与其他卡片赢单标准一致）──
  const fyWonByTime = useMemo(() => {
    const fyRange = parseFY(fySelect);
    return allOpps.filter(o => {
      if (!o.wonAt) return false;
      const d = new Date(o.wonAt);
      return d >= fyRange.start && d <= fyRange.end;
    });
  }, [fySelect, allOpps]);

  // ── 订单加权 GP3（财年内交付项目的加权平均 GP3，取自交付管理概算 GP3）──
  const orderWeightedGP3 = useMemo(() => {
    const fyRange = parseFY(fySelect);
    const inFy = (deliveryProjects||[]).filter(p => isProjActiveInFy(p, fyRange));
    if (inFy.length === 0) return 0;
    let totalAmt = 0, weighted = 0;
    for (const p of inFy) {
      const est = projectEstimates.get(p.id);
      if (!est) continue;
      totalAmt += p.contractAmount;
      weighted += p.contractAmount * est.estGP3;
    }
    return totalAmt > 0 ? (weighted / totalAmt * 100) : 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fySelect, projectEstimates]);

  // ── 已交付项目实际 GP3（已完成项目总结且成本审批通过的项目的加权平均实际 GP3）──
  const deliveredActualGP3 = useMemo(() => {
    const fyRange = parseFY(fySelect);
    const delivered = (deliveryProjects||[]).filter(p => {
      if (!isProjActiveInFy(p, fyRange)) return false;
      const node15 = (p.nodes||[]).find((n: any) => n.nodeNo === 15);
      if (!node15 || (node15.status !== 'completed' && node15.status !== 'delayed')) return false;
      if (p.costStatus !== 'approved' || p.totalActualCost == null) return false;
      return true;
    });
    if (delivered.length === 0) return 0;
    let totalAmt = 0, weighted = 0;
    for (const p of delivered) {
      const est = projectEstimates.get(p.id);
      const exTax = est ? est.exTax : Math.round(p.contractAmount / (1 + (loadQuotationGroups(p.quotationId).version?.taxRate ?? 0.13)));
      totalAmt += exTax;
      const actProfit = exTax - p.totalActualCost!;
      const actGP3 = exTax > 0 ? actProfit / exTax : 0;
      weighted += exTax * actGP3;
    }
    return totalAmt > 0 ? (weighted / totalAmt * 100) : 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fySelect, projectEstimates]);

  // ── 漏斗右侧 FY 累计用 ──
  const fyWon = useMemo(() => ({
    count: fyWonByTime.length,
    amount: fyWonByTime.reduce((s, o) => s + exAmt(o), 0),
  }), [fyWonByTime]);

  // ── 输单（按输单时间 updatedAt 归入财年）──
  const fyLostByTime = useMemo(() => {
    const fyRange = parseFY(fySelect);
    return allOpps.filter(o => {
      if (o.status !== '输') return false;
      const d = new Date(o.lostAt || o.updatedAt);
      return d >= fyRange.start && d <= fyRange.end;
    });
  }, [fySelect, allOpps]);

  // ── 财年各阶段汇总（用于漏斗右侧 FY 累计显示）──
  const fyInfo = useMemo(() => {
    const inFy = allOpps.filter(o => {
      const fyRange = parseFY(fySelect);
      const created = new Date(o.createdAt);
      const updated = new Date(o.updatedAt);
      const effectiveEnd = (o.status === '过程中' || o.status === '冻结') ? new Date() : updated;
      return created <= fyRange.end && effectiveEnd >= fyRange.start;
    });
    return { count: inFy.length, amount: inFy.reduce((s, o) => s + exAmt(o), 0) };
  }, [fySelect, allOpps]);

  const fyLead = useMemo(() => {
    const items = fyFiltered.filter(o => stageIdx(o.stage) >= stageIdx('线索') || o.wonAt);
    return { count: items.length, amount: items.reduce((s, o) => s + exAmt(o), 0) };
  }, [fyFiltered]);

  const fyOpp = useMemo(() => {
    const items = fyFiltered.filter(o => stageIdx(o.stage) >= stageIdx('机会') || o.wonAt);
    return { count: items.length, amount: items.reduce((s, o) => s + exAmt(o), 0) };
  }, [fyFiltered]);

  // ── 滚动12个月指标（销售周期、赢单转化率，用于概览卡片）──
  const rolling12mKpi = useMemo(() => {
    const now = new Date();
    const calcWindow = (offset: number) => {
      // 12个月窗口：结束于 offset 个月前最后一天
      const wEnd = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
      const wStart = new Date(wEnd);
      wStart.setFullYear(wStart.getFullYear() - 1);
      wStart.setDate(1);
      const won = allOpps.filter(o =>
        o.wonAt && new Date(o.wonAt) >= wStart && new Date(o.wonAt) <= wEnd
      );
      const lost = allOpps.filter(o =>
        o.status === '输' && new Date(o.lostAt || o.updatedAt) >= wStart && new Date(o.lostAt || o.updatedAt) <= wEnd
      );
      const cycle = won.length > 0 ? Math.round(won.reduce((s, o) => {
        return s + Math.round((new Date(o.wonAt).getTime() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      }, 0) / won.length) : 0;
      const total = won.length + lost.length;
      return { salesCycle: cycle, leadToWonRate: total > 0 ? won.length / total * 100 : 0, wonDecided: total };
    };
    return [calcWindow(1), calcWindow(2), calcWindow(3)];
  }, [allOpps]);

  // ── 按月 KPI（最近3个完整月） ──
  const monthlyKpi = useMemo(() => {
    const now = new Date();
    const calcMonth = (offset: number) => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const activeOpps = allOpps.filter(o => {
        const created = new Date(o.createdAt);
        const effectiveEnd = (o.status === '过程中' || o.status === '冻结') ? new Date() : new Date(o.updatedAt);
        return created <= monthEnd && effectiveEnd >= monthStart;
      });
      const wonOpps = activeOpps.filter(o => o.wonAt && new Date(o.wonAt) >= monthStart && new Date(o.wonAt) <= monthEnd);
      const lostOpps = activeOpps.filter(o => o.status === '输' && new Date(o.lostAt || o.updatedAt) >= monthStart && new Date(o.lostAt || o.updatedAt) <= monthEnd);
      const pipelineOpps = activeOpps.filter(o => (o.status === '过程中' || o.status === '冻结') && stageIdx(o.stage) >= stageIdx('机会'));
      let weighted = 0, profit = 0;
      for (const o of pipelineOpps) {
        const w = Math.round(exAmt(o) * o.winRate / 100);
        weighted += w;
        const q = o.quotationId ? (quotationSummaries||[]).find(q => q.id === o.quotationId) : undefined;
        profit += Math.round(w * (q ? (q.profitRate ?? 0) / 100 : 0.15));
      }
      const cycle = wonOpps.length > 0 ? Math.round(wonOpps.reduce((s, o) => {
        return s + Math.round((new Date(o.wonAt).getTime() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      }, 0) / wonOpps.length) : 0;
      const total = wonOpps.length + lostOpps.length;
      const convRate = total > 0 ? wonOpps.length / total * 100 : 0;
      return { weightedPipeline: weighted, weightedProfit: profit, weightedProfitRate: weighted > 0 ? profit / weighted * 100 : 0, salesCycle: cycle, leadToWonRate: convRate, wonDecided: total };
    };
    return [calcMonth(1), calcMonth(2), calcMonth(3)];
  }, [allOpps, quotationSummaries]);

  // ── 输单原因柱状图（按输单时间归入财年）──
  /** 抽取指定分组的原因统计柱状图数据 */
  function useDimReasons(groupLabel: string): BarItem[] {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fyLostByTime]);
  }
  const dimLossReasons = useDimReasons('竞对');
  const dimCancelReasons = useDimReasons('取消');
  const dimAbandonReasons = useDimReasons('放弃');

  // ── 销售员统一统计 ──
  const salesmenStats = useMemo(() => {
    const map = new Map<string, {
      name: string; wins: number; orderAmount: number; totalAmount: number;
      pipelinePotential: number; profitTotal: number; totalCount: number;
    }>();
    // 订单金额/利润：财年赢单（按 time 归入）
    for (const o of fyWonByTime) {
      if (!o.salesman) continue;
      let s = map.get(o.salesman);
      if (!s) { s = { name: o.salesman, wins: 0, orderAmount: 0, totalAmount: 0, pipelinePotential: 0, profitTotal: 0, totalCount: 0 }; map.set(o.salesman, s); }
      s.wins++;
      s.orderAmount += exAmt(o);
    }
    for (const o of fyFiltered) {
      if (!o.salesman) continue;
      let s = map.get(o.salesman);
      if (!s) { s = { name: o.salesman, wins: 0, orderAmount: 0, totalAmount: 0, pipelinePotential: 0, profitTotal: 0, totalCount: 0 }; map.set(o.salesman, s); }
      s.totalAmount += exAmt(o);
      s.totalCount++;
      // 利润：GP3 利润金额（报价 gp3Amount 已是未税口径），fallback 用未税金额 × 15%
      if (o.wonAt && o.quotationId) {
        const q = (quotationSummaries||[]).find(q => q.id === o.quotationId);
        s.profitTotal += q?.gp3Amount != null ? Math.round(q.gp3Amount) : Math.round(exAmt(o) * 0.15);
      }
    }
    // 管道潜力：当前活跃管道（不过滤财年）
    for (const o of currentPipeline) {
      if (!o.salesman) continue;
      let s = map.get(o.salesman);
      if (!s) { s = { name: o.salesman, wins: 0, orderAmount: 0, totalAmount: 0, pipelinePotential: 0, profitTotal: 0, totalCount: 0 }; map.set(o.salesman, s); }
      const idx = stageIdx(o.stage);
      if (idx >= stageIdx('机会')) {
        s.pipelinePotential += Math.round(exAmt(o) * o.winRate / 100);
      }
    }
        return [...map.values()].map(s => ({
      ...s,
      avgOrderAmount: s.wins > 0 ? Math.round(s.orderAmount / s.wins) : 0,
      conversionEff: s.totalCount > 0 ? s.wins / s.totalCount * 100 : 0,
    }));
  }, [fyWonByTime, currentPipeline, quotationSummaries, fyFiltered]);

  // ── 4 个维度提取（图表通过 topN=10 自动排序取前10名）──
  const dimEfficiency: BarItem[] = salesmenStats.map(s => ({ name: s.name, value: Math.round(s.conversionEff * 10) / 10 }));
  const dimOrderAmount: BarItem[] = salesmenStats.map(s => ({ name: s.name, value: s.orderAmount }));
  const dimPipeline: BarItem[] = salesmenStats.map(s => ({ name: s.name, value: s.pipelinePotential }));
  const dimProfit: BarItem[] = salesmenStats.map(s => ({ name: s.name, value: s.profitTotal }));

  // 概览卡片（按月数据）
  const overviewItems = [
    { label: '加权管道', value: `¥${fmtK(monthlyKpi[0].weightedPipeline)}`,
      color: COLORS.primary, icon: '📊',
      prevValues: [
        { value: `¥${fmtK(monthlyKpi[1].weightedPipeline)}`, color: COLORS.primary },
        { value: `¥${fmtK(monthlyKpi[2].weightedPipeline)}`, color: COLORS.primary },
      ] },
    { label: '加权利润', value: `¥${fmtK(monthlyKpi[0].weightedProfit)}`,
      color: COLORS.purple, icon: '💰',
      prevValues: [
        { value: `¥${fmtK(monthlyKpi[1].weightedProfit)}`, color: COLORS.purple },
        { value: `¥${fmtK(monthlyKpi[2].weightedProfit)}`, color: COLORS.purple },
      ] },
    { label: '加权利润率', value: `${monthlyKpi[0].weightedProfitRate.toFixed(1)}%`,
      color: monthlyKpi[0].weightedProfitRate >= 15 ? COLORS.success : COLORS.warning, icon: '📈',
      prevValues: [
        { value: `${monthlyKpi[1].weightedProfitRate.toFixed(1)}%`, color: monthlyKpi[1].weightedProfitRate >= 15 ? COLORS.success : COLORS.warning },
        { value: `${monthlyKpi[2].weightedProfitRate.toFixed(1)}%`, color: monthlyKpi[2].weightedProfitRate >= 15 ? COLORS.success : COLORS.warning },
      ] },
    { label: '销售周期',
      value: rolling12mKpi[0].salesCycle > 0 ? `${rolling12mKpi[0].salesCycle} 天` : '—',
      color: rolling12mKpi[0].salesCycle > 0 ? (rolling12mKpi[0].salesCycle <= 120 ? COLORS.success : COLORS.warning) : COLORS.textLight, icon: '⏱️',
      prevValues: [
        { value: rolling12mKpi[1].salesCycle > 0 ? `${rolling12mKpi[1].salesCycle} 天` : '—',
          color: rolling12mKpi[1].salesCycle > 0 ? (rolling12mKpi[1].salesCycle <= 120 ? COLORS.success : COLORS.warning) : COLORS.textLight },
        { value: rolling12mKpi[2].salesCycle > 0 ? `${rolling12mKpi[2].salesCycle} 天` : '—',
          color: rolling12mKpi[2].salesCycle > 0 ? (rolling12mKpi[2].salesCycle <= 120 ? COLORS.success : COLORS.warning) : COLORS.textLight },
      ] },
    { label: '赢单转化率',
      value: rolling12mKpi[0].wonDecided > 0 ? `${rolling12mKpi[0].leadToWonRate.toFixed(1)}%` : '—',
      color: rolling12mKpi[0].wonDecided > 0 ? (rolling12mKpi[0].leadToWonRate >= 20 ? COLORS.success : COLORS.warning) : COLORS.textLight, icon: '🎯',
      prevValues: [
        { value: rolling12mKpi[1].wonDecided > 0 ? `${rolling12mKpi[1].leadToWonRate.toFixed(1)}%` : '—',
          color: rolling12mKpi[1].wonDecided > 0 ? (rolling12mKpi[1].leadToWonRate >= 20 ? COLORS.success : COLORS.warning) : COLORS.textLight },
        { value: rolling12mKpi[2].wonDecided > 0 ? `${rolling12mKpi[2].leadToWonRate.toFixed(1)}%` : '—',
          color: rolling12mKpi[2].wonDecided > 0 ? (rolling12mKpi[2].leadToWonRate >= 20 ? COLORS.success : COLORS.warning) : COLORS.textLight },
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
          <VerticalBarChart title="" data={monthlyOrderData} format="K" height={260} topN={12} barWidthRatio={0.6} maxBarWidth={120} contentOffset={0} chartWidth={620} disableSort padTop={12} cardBorder={false}
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
            fyInfo={fyInfo} fyLead={fyLead} fyOpp={fyOpp} fyWon={fyWon}
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
          <VerticalBarChart title="" data={monthlySalesData} format="K" height={260} topN={12} barWidthRatio={0.6} maxBarWidth={120} contentOffset={0} chartWidth={620} disableSort padTop={12} cardBorder={false}
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
