import type { SalesOpportunity, DeliveryNode, DeliveryProject } from '../types';

/** 格式化数字为千单位显示（如 1234 → "1K"） */
export const fmtK = (v: number) => Math.round(v / 1000).toLocaleString() + 'K';
/** 压缩销售编号：A2026-07-003-S → 2607003S */
export const compressNo = (sn: string | undefined | null): string => {
  const m = sn && sn.match(/^A(\d{4})-(\d{2})-(\d{3})-(.)(-.)?$/);
  if (m) return m[1].slice(2) + m[2] + m[3] + m[4] + (m[5] || '');
  return sn || '';
};

/** 机会是否已确认为真正的赢单：需先标记为赢（status='赢'）再转交付（terminated=true），两者缺一不可 */
export const isRealWin = (o: SalesOpportunity): boolean =>
  o.status === '赢' && o.terminated === true;

/** 机会的有效结束日期：过程中/冻结/未转交付标赢→至今；已转交付赢→wonAt；输→lostAt；缺失回退 updatedAt */
export const oppEffectiveEnd = (o: SalesOpportunity): Date => {
  if (o.status === '过程中' || o.status === '冻结') return new Date();
  if (o.status === '赢' && o.terminated && o.wonAt) return new Date(o.wonAt);
  if (o.status === '赢') return new Date();
  if (o.status === '输' && o.lostAt) return new Date(o.lostAt);
  return new Date(o.updatedAt);
};

/** 取某月最后一天 23:59:59.999（月末排他边界，含最后一天数据；勿用 new Date(y,m+1,0) 的 00:00 漏数） */
export const monthEndOf = (year: number, month: number): Date =>
  new Date(year, month + 1, 0, 23, 59, 59, 999);

/** 未税金额：含税 ÷ (1+税率)，缺省 13%（全应用统一未税口径） */
export const exAmount = (v: number, taxRate?: number): number =>
  Math.round(v / (1 + (taxRate ?? 0.13)));

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
export const getNode15 = (nodes: DeliveryNode[] | undefined): DeliveryNode | undefined =>
  (nodes || []).find(n => n.nodeNo === 15);

/** 节点15是否已完成（交付完成判定；执行状态三态，完成=completed；延期中为派生维度） */
export const isNode15Done = (node: DeliveryNode | undefined): boolean =>
  !!node && node.status === 'completed';

/** 节点初始审批基线结束日（审批通过的实施计划；无审批基线则无参考，不判延期） */
export const getNodeBaseline = (node: DeliveryNode | undefined): string | undefined =>
  node?.baselineEndDate || node?.baselinePlannedEndDate;

/* ============================================================
   统一延期判定（全应用共享）
   规则：基线 = 初始审批实施计划完成日；无审批基线不判延期。
   延期是派生维度，完成前为临时状态，完成后按实际完成日重算为永久状态：
   - 已完成（实际完成日 ≤ 判定时点）→ 实际完成日 vs 基线
     · 实际 > 基线 → 永久延期，天数 = 实际 − 基线
     · 实际 ≤ 基线 → 正常（可能提前），提前 = 基线 − 实际
   - 未完成 → max(更新计划完成日, 判定时点) vs 基线（计划排后或已超期 → 临时延期中）
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
 * 统一节点延期判定。
 * - 已完成（实际完成日 ≤ 判定时点）→ 实际完成日 vs 基线，结果永久
 * - 未完成 → max(更新计划完成日, 判定时点) vs 基线，结果临时
 * - asOf = 判定时点（仪表盘历史月回溯传该月月底），默认当前日期
 */
export const getNodeDelay = (node: DeliveryNode | undefined, asOf?: Date): NodeDelayInfo => {
  if (!node) return { hasBaseline: false, delayed: false, days: 0 };
  const baseline = getNodeBaseline(node);
  if (!baseline) return { hasBaseline: false, delayed: false, days: 0 };
  const t = asOf ?? new Date();
  const baselineD = new Date(baseline);
  // 实际完成日期（actualDate 优先，兼容旧数据 actualEndDate）
  const actualEnd = node.actualDate || node.actualEndDate;
  // 判定时点的完成状态：completed 且实际完成日 ≤ 时点
  const doneByAsOf = node.status === 'completed' && !!actualEnd && new Date(actualEnd) <= t;
  // 参考完成日：已完成→实际完成日；未完成→max(更新计划完成日, 判定时点)
  const end = doneByAsOf
    ? new Date(actualEnd!)
    : (node.plannedEndDate && new Date(node.plannedEndDate) > t ? new Date(node.plannedEndDate) : t);
  const days = Math.round((end.getTime() - baselineD.getTime()) / DAY_MS);
  return { hasBaseline: true, delayed: days > 0, days };
};

/** 交付项目是否已完结交付：节点15完成 或 项目状态已完成（执行状态三态，延期中为派生维度） */
export const isProjectDelivered = (p: DeliveryProject): boolean => {
  const node15 = getNode15(p.nodes);
  return !!node15 && (node15.status === 'completed' || p.status === '已完成');
};

/**
 * 交付项目实际完成日期。
 * - 节点15实际完成日优先（actualDate，兼容旧数据 actualEndDate）
 * - 项目已完成但节点无实际日 → 状态切到已完成的时刻（updatedAt）
 * - 未完结 → null
 */
export const getProjectDoneDate = (p: DeliveryProject): Date | null => {
  const node15 = getNode15(p.nodes);
  const actualEnd = node15?.actualDate || node15?.actualEndDate;
  if (actualEnd) return new Date(actualEnd);
  if (p.status === '已完成') return new Date(p.updatedAt);
  return null;
};

/**
 * 统一项目延期判定（以节点15为准，与节点同口径）。
 * 完成前为临时状态（更新计划或当前日期超出基线）；完成后按实际完成日重算为永久状态。
 */
export const getProjectDelay = (p: DeliveryProject, asOf?: Date): NodeDelayInfo => {
  const node15 = getNode15(p.nodes);
  if (!node15) return { hasBaseline: false, delayed: false, days: 0 };
  const baseline = getNodeBaseline(node15);
  if (!baseline) return { hasBaseline: false, delayed: false, days: 0 };
  const t = asOf ?? new Date();
  const baselineD = new Date(baseline);
  // 实际完成日期：已完成项目 → 实际完成日（节点日或 updatedAt 回退）
  const doneDate = isProjectDelivered(p) ? getProjectDoneDate(p) : null;
  const doneByAsOf = !!doneDate && doneDate <= t;
  // 参考完成日：已完成→实际完成日；未完成→max(更新计划完成日, 判定时点)
  const end = doneByAsOf
    ? doneDate!
    : (node15.plannedEndDate && new Date(node15.plannedEndDate) > t ? new Date(node15.plannedEndDate) : t);
  const days = Math.round((end.getTime() - baselineD.getTime()) / DAY_MS);
  return { hasBaseline: true, delayed: days > 0, days };
};
