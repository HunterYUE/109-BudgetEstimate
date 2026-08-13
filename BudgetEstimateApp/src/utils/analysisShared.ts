import type { SalesOpportunity, DeliveryNode, DeliveryProject } from '../types';
import { TAX_RATE } from './constants';

/** 千单位数字（不带 K 后缀）：1234 → "1"（⚠️ B18：DeliveryCharts 旧 fmtKNum 与本函数重复，收敛共用） */
export const fmtKBase = (v: number) => Math.round(v / 1000).toLocaleString();
/** 格式化数字为千单位显示（如 1234 → "1K"） */
export const fmtK = (v: number) => fmtKBase(v) + 'K';
/** 压缩销售编号：A2026-07-003-S → 2607003S */
export const compressNo = (sn: string | undefined | null): string => {
  const m = sn && sn.match(/^A(\d{4})-(\d{2})-(\d{3})-(.)(-.)?$/);
  if (m) return m[1].slice(2) + m[2] + m[3] + m[4] + (m[5] || '');
  return sn || '';
};

/** 图表标签：压缩销售编号 + 超 4 位换行（Dashboard / DeliveryAnalysis 共用，防重复实现） */
export const chartLabel = (salesNo: string | undefined | null): string => {
  const s = compressNo(salesNo);
  return s.length > 4 ? s.slice(0, 4) + '\n' + s.slice(4) : s;
};

/** 机会是否已确认为真正的赢单：需先标记为赢（status='赢'）再转交付（terminated=true），两者缺一不可 */
export const isRealWin = (o: SalesOpportunity): boolean =>
  o.status === '赢' && o.terminated === true;

/** 机会的有效结束日期：过程中/冻结/未转交付标赢→至今；已转交付赢→wonAt（缺失回退 updatedAt）；输→lostAt；其余回退 updatedAt */
export const oppEffectiveEnd = (o: SalesOpportunity): Date => {
  if (o.status === '过程中' || o.status === '冻结') return new Date();
  if (o.status === '赢' && o.terminated) return o.wonAt ? new Date(o.wonAt) : new Date(o.updatedAt);
  if (o.status === '赢') return new Date();
  if (o.status === '输' && o.lostAt) return new Date(o.lostAt);
  return new Date(o.updatedAt);
};

/** 取某月最后一天 23:59:59.999（月末排他边界，含最后一天数据；勿用 new Date(y,m+1,0) 的 00:00 漏数） */
export const monthEndOf = (year: number, month: number): Date =>
  new Date(year, month + 1, 0, 23, 59, 59, 999);

/** 未税金额：含税 ÷ (1+税率)，缺省 13%（全应用统一未税口径） */
export const exAmount = (v: number, taxRate?: number): number =>
  Math.round(v / (1 + (taxRate ?? TAX_RATE)));

/** 机会在指定时间点的阶段：取"进入阶段时间 ≤ 该时间"的最高阶段（议价→投标→机会→线索→信息） */
export const stageAsOf = (o: SalesOpportunity, date: Date): string => {
  const t = (v?: string) => (v ? new Date(v) : null);
  const neg = t(o.negotiationAt), bid = t(o.bidAt), opp = t(o.opportunityAt), lead = t(o.leadAt);
  if (neg && neg <= date) return '议价';
  if (bid && bid <= date) return '投标';
  if (opp && opp <= date) return '机会';
  if (lead && lead <= date) return '线索';
  return '信息';
};

/** 取交付项目第15节点（项目总结） */
const getNode15 = (nodes: DeliveryNode[] | undefined): DeliveryNode | undefined =>
  (nodes || []).find(n => n.nodeNo === 15);

/** 节点15是否已完成（交付完成判定；执行状态三态，完成=completed；延期中为派生维度） */
const isNode15Done = (node: DeliveryNode | undefined): boolean =>
  !!node && node.status === 'completed';

/** 节点初始审批基线结束日（审批通过的实施计划；无审批基线则无参考，不判延期） */
export const getNodeBaseline = (node: DeliveryNode | undefined): string | undefined =>
  node?.baselinePlannedEndDate;

/* ============================================================
   统一延期判定（全应用共享）
   规则：基线 = 初始审批实施计划完成日；无审批基线不判延期。
   延期是派生维度，完成前为临时状态，完成后按实际完成日重算为永久状态：
   - 已完成（实际完成日 ≤ 判定时点）→ 实际完成日 vs 基线
     · 实际 > 基线 → 永久延期，天数 = 实际 − 基线
     · 实际 ≤ 基线 → 正常（可能提前），提前 = 基线 − 实际
   - 未完成 → 判定时点（当前日期）vs 基线（仅已超期 → 临时延期中；更新计划排后不计）
   ============================================================ */
const DAY_MS = 1000 * 60 * 60 * 24;

/** 延期判定结果 */
export interface NodeDelayInfo {
  /** 是否存在审批基线（无基线不判延期） */
  hasBaseline: boolean;
  /** 是否延期（完成前=临时延期中，完成后=永久延期；纯派生，不依赖 status 标记） */
  delayed: boolean;
  /** 延期天数（正=延后，负=提前；无基线为 0） */
  days: number;
}

/**
 * 统一延期判定内核（节点/项目共用）：以基线为准，参考完成日（actualEnd ?? 判定时点）与基线相差的天数。
 * - 实际完成日 ≤ 判定时点 → 用实际完成日（结果永久）
 * - 否则 → 判定时点（未完成，仅已超期判延期，结果临时）
 */
const delayOf = (baseline: string, actualEnd: Date | null, asOf: Date): { delayed: boolean; days: number } => {
  const baselineD = new Date(baseline);
  // 参考完成日：已完成→实际完成日；未完成→判定时点
  const end = actualEnd ?? asOf;
  const days = Math.round((end.getTime() - baselineD.getTime()) / DAY_MS);
  return { delayed: days > 0, days };
};

/**
 * 统一节点延期判定（事实延期口径）。
 * - 已完成（实际完成日 ≤ 判定时点）→ 实际完成日 vs 基线，结果永久
 * - 未完成 → 判定时点（当前日期）vs 基线，仅已超期判延期，结果临时
 * - asOf = 判定时点（仪表盘历史月回溯传该月月底），默认当前日期
 */
export const getNodeDelay = (node: DeliveryNode | undefined, asOf?: Date): NodeDelayInfo => {
  if (!node) return { hasBaseline: false, delayed: false, days: 0 };
  const baseline = getNodeBaseline(node);
  if (!baseline) return { hasBaseline: false, delayed: false, days: 0 };
  const t = asOf ?? new Date();
  // 实际完成日期（actualDate 优先，兼容旧数据 actualEndDate）
  const actualEnd = node.actualDate || node.actualEndDate;
  // 判定时点的完成状态：completed 且实际完成日 ≤ 时点 → 用实际完成日，否则用判定时点
  const doneByAsOf = node.status === 'completed' && !!actualEnd && new Date(actualEnd) <= t;
  const { delayed, days } = delayOf(baseline, doneByAsOf ? new Date(actualEnd!) : null, t);
  return { hasBaseline: true, delayed, days };
};

/** 交付项目是否已完结交付：节点15完成 或 项目状态已完成（执行状态三态，延期中为派生维度） */
export const isProjectDelivered = (p: DeliveryProject): boolean =>
  isNode15Done(getNode15(p.nodes)) || p.status === '已完成';

/**
 * 交付项目实际完成日期。
 * - 节点15完成且填实际日 → 实际完成日（actualDate，兼容旧数据 actualEndDate）【正常路径】
 * - 项目 status='已完成' 但节点15无实际日 → updatedAt 兜底【防御分支，正常流程不可达】
 * - 未完结 → null
 *
 * ⚠️ 业务不变量：节点15决定项目完成（DeliveryDetail「完成项目」按钮仅在全部节点 completed
 * 且成本审批通过时可用，line ~670）；节点切 completed 必写 actualDate/actualEndDate
 * （handleNodeStatusClick，line ~227）。故「项目已完成但节点15缺实际日」在正常流程中不存在；
 * 该 updatedAt 分支仅为异常/历史数据留的代码安全兜底——用最后修改时间近似完成时间，
 * 避免把已完结项目误判为未完结而在后续财年长期算活跃。
 */
export const getProjectDoneDate = (p: DeliveryProject): Date | null => {
  const node15 = getNode15(p.nodes);
  const actualEnd = node15?.actualDate || node15?.actualEndDate;
  if (isNode15Done(node15) && actualEnd) return new Date(actualEnd);
  if (p.status === '已完成') return new Date(p.updatedAt);
  return null;
};

/* ============================================================
   月度订单/销售归集（销售分析月度订单/月度销售、仪表盘利润概览共用）
   ============================================================ */
/** 报价概算利润转未税：gp3_amount（含税）÷ (1+税率)，缺省 13%；无概算利润为 0，负值（亏损报价）如实保留 */
export const quoteProfitExTax = (gp3Amt: number | undefined, taxRate?: number): number =>
  gp3Amt != null ? exAmount(gp3Amt, taxRate) : 0;

/**
 * 交付实际销售利润（未税）：未税金额 − 实际总成本。
 * 无成本数据返回 undefined —— 不设 20% 假利润，避免误导，同时提示成本数据缺失。
 */
export const deliverySalesProfit = (exTax: number, totalActualCost?: number): number | undefined =>
  totalActualCost != null ? (exTax - totalActualCost) : undefined;

/** 报价关联信息（按 quotationId 关联后，entityId → 报价数据） */
export interface QuoteRefInfo {
  /** 税率（缺省 13%） */
  taxRate: number;
  /** 折后报价（含税） */
  discounted: number;
  /** 概算利润金额（含税 gp3_amount） */
  gp3Amt: number;
  /** 概算利润率 = gp3Amt / discounted（discounted 为 0 时为 0） */
  rate: number;
}

/**
 * 按 entity.quotationId 关联报价摘要，构建 entityId → 报价信息 的映射。
 * DeliveryAnalysis（交付项目→quotationId→quoteMap）与 SalesAnalysis（机会→quotationId→quotationSummaries）
 * 共用同一遍历/兜底/rate 计算，消除两处重复。
 */
export const buildQuoteInfoMap = <T extends { id: string; quotationId?: string }>(
  entities: T[],
  quoteById: (quotationId: string) => { taxRate?: number; discountedPrice?: number; gp3Amount?: number } | undefined,
): Map<string, QuoteRefInfo> => {
  const map = new Map<string, QuoteRefInfo>();
  for (const e of entities) {
    if (!e.quotationId) continue;
    const q = quoteById(e.quotationId);
    if (!q) continue;
    const taxRate = q.taxRate ?? TAX_RATE;
    const discounted = q.discountedPrice ?? 0;
    const gp3Amt = q.gp3Amount ?? 0;
    map.set(e.id, { taxRate, discounted, gp3Amt, rate: discounted > 0 ? gp3Amt / discounted : 0 });
  }
  return map;
};

/**
 * 交付未税金额 = 合同金额 ÷ (1+报价税率)。
 * 税率一律取自「交付项目自身 quotationId」关联的报价（SalesAnalysis/DeliveryAnalysis 共用），
 * 消除此前三页分别按机会 quotationId / 交付 id / 报价 id 查找导致的口径分叉。
 */
export const deliveryExTax = (p: DeliveryProject, info: Map<string, QuoteRefInfo>): number =>
  exAmount(p.contractAmount, info.get(p.id)?.taxRate);

/** 单个项目在月窗口内的订单/销售金额与利润（未税口径） */
export interface MonthlySalesPoint {
  /** 订单金额（转交付月 createdAt 归集） */
  orderAmt: number;
  /** 订单利润（报价概算利润未税） */
  orderProfit: number;
  /** 销售金额（完成交付月 doneDate 归集） */
  salesAmt: number;
  /** 销售利润（实际利润；无成本数据为 undefined，提示成本缺失） */
  salesProfit: number | undefined;
}

/** 交付项目在指定月窗口内的订单/销售归集（与销售分析月度订单/月度销售同源） */
export const projectMonthlySales = (
  p: DeliveryProject,
  monthStart: Date,
  monthEnd: Date,
  taxRate?: number,
  gp3Amt?: number,
): MonthlySalesPoint => {
  const exTax = exAmount(p.contractAmount, taxRate);
  const created = new Date(p.createdAt);
  const doneDate = getProjectDoneDate(p);
  const orderIn = created >= monthStart && created <= monthEnd;
  const salesIn = !!doneDate && doneDate >= monthStart && doneDate <= monthEnd;
  return {
    orderAmt: orderIn ? exTax : 0,
    orderProfit: orderIn ? quoteProfitExTax(gp3Amt, taxRate) : 0,
    salesAmt: salesIn ? exTax : 0,
    salesProfit: salesIn ? deliverySalesProfit(exTax, p.totalActualCost) : 0,
  };
};

/** 财年 12 个月的标签（index 0 = 7月，与 fyMonthWindows 对齐） */
export const FY_MONTH_LABELS = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'] as const;

/** 财年 12 个月的起止窗口（index 0 = 7月，与 FY_MONTH_LABELS 对齐） */
export const fyMonthWindows = (fyRange: { start: Date; end: Date }): { start: Date; end: Date }[] =>
  Array.from({ length: 12 }, (_, i) => {
    const m = (6 + i) % 12;
    const y = m < 6 ? fyRange.end.getFullYear() : fyRange.start.getFullYear();
    return { start: new Date(y, m, 1), end: monthEndOf(y, m) };
  });

/**
 * 统一项目延期判定（以节点15为准，与节点同口径，事实延期）。
 * 完成前为临时状态（仅当前日期超基线判延期）；完成后按实际完成日重算为永久状态。
 */
export const getProjectDelay = (p: DeliveryProject, asOf?: Date): NodeDelayInfo => {
  const node15 = getNode15(p.nodes);
  if (!node15) return { hasBaseline: false, delayed: false, days: 0 };
  const baseline = getNodeBaseline(node15);
  if (!baseline) return { hasBaseline: false, delayed: false, days: 0 };
  const t = asOf ?? new Date();
  // 实际完成日期：已完成项目 → 实际完成日（节点日或 updatedAt 回退）
  const doneDate = isProjectDelivered(p) ? getProjectDoneDate(p) : null;
  const doneByAsOf = !!doneDate && doneDate <= t;
  const { delayed, days } = delayOf(baseline, doneByAsOf ? doneDate : null, t);
  return { hasBaseline: true, delayed, days };
};
