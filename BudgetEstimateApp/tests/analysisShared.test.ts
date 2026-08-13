import { describe, it, expect } from 'vitest';
import type { DeliveryNode, DeliveryProject, SalesOpportunity } from '../src/types';
import {
  fmtKBase, fmtK, compressNo, chartLabel, isRealWin, oppEffectiveEnd,
  monthEndOf, exAmount, stageAsOf, getNodeDelay,
  isProjectDelivered, getProjectDoneDate, quoteProfitExTax, deliverySalesProfit,
  buildQuoteInfoMap, deliveryExTax, projectMonthlySales, fyMonthWindows, getProjectDelay,
  FY_MONTH_LABELS,
} from '../src/utils/analysisShared';

describe('fmtK / fmtKBase（含负值）', () => {
  it('1234 → "1K"；999 → "1K"？不——999/1000=0.999 → round=1', () => {
    expect(fmtKBase(1234)).toBe('1');
    expect(fmtK(1234)).toBe('1K');
    expect(fmtK(-1234)).toBe('-1K');
    expect(fmtKBase(999)).toBe('1'); // 四舍五入
  });
});

describe('compressNo 销售号压缩契约', () => {
  it('A2026-07-003-S → 2607003S', () => {
    expect(compressNo('A2026-07-003-S')).toBe('2607003S');
  });
  it('带尾缀 -B：A2026-07-003-S-B → 2607003S-B', () => {
    expect(compressNo('A2026-07-003-S-B')).toBe('2607003S-B');
  });
  it('非标准格式原样返回；空 → 空串', () => {
    expect(compressNo('XYZ')).toBe('XYZ');
    expect(compressNo('')).toBe('');
    expect(compressNo(null)).toBe('');
    expect(compressNo(undefined)).toBe('');
  });
});

describe('chartLabel 超 4 位换行', () => {
  it('2607003S → "2607\\n003S"', () => {
    expect(chartLabel('A2026-07-003-S')).toBe('2607\n003S');
  });
  it('短号不换行', () => {
    expect(chartLabel('A2026-07-001-S')).toBe('2607\n001S'); // 7 位仍换行
    expect(chartLabel('AB')).toBe('AB');
  });
});

describe('isRealWin 赢单确认（赢 + 已转交付）', () => {
  it('两条件缺一不可', () => {
    expect(isRealWin({ status: '赢', terminated: true } as any)).toBe(true);
    expect(isRealWin({ status: '赢', terminated: false } as any)).toBe(false);
    expect(isRealWin({ status: '输', terminated: true } as any)).toBe(false);
  });
});

describe('oppEffectiveEnd 机会有效结束', () => {
  it('已转交付赢 → wonAt（缺失回退 updatedAt）', () => {
    const won = oppEffectiveEnd({ status: '赢', terminated: true, wonAt: '2026-05-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z' } as any);
    expect(won.getTime()).toBe(new Date('2026-05-01T00:00:00Z').getTime());
    const fallback = oppEffectiveEnd({ status: '赢', terminated: true, updatedAt: '2026-04-01T00:00:00Z' } as any);
    expect(fallback.getTime()).toBe(new Date('2026-04-01T00:00:00Z').getTime());
  });
  it('输 → lostAt', () => {
    const lost = oppEffectiveEnd({ status: '输', lostAt: '2026-06-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' } as any);
    expect(lost.getTime()).toBe(new Date('2026-06-01T00:00:00Z').getTime());
  });
  it('未转交付赢 / 过程中 / 冻结 → 当前时间（now 依赖，仅断言返回 Date 且非解析时间）', () => {
    const inProg = oppEffectiveEnd({ status: '过程中', updatedAt: '2026-03-01T00:00:00Z' } as any);
    expect(inProg).toBeInstanceOf(Date);
    expect(inProg.getTime()).toBeGreaterThan(new Date('2026-07-01').getTime()); // 断言明显晚于 2026-07-01
  });
});

describe('monthEndOf 月末排他边界（23:59:59.999）', () => {
  it('平年 2 月 / 闰年 2 月 / 31 天月', () => {
    const feb2026 = monthEndOf(2026, 1); // 2026 非闰
    expect(feb2026.getDate()).toBe(28);
    expect(feb2026.getHours()).toBe(23);
    expect(feb2026.getMilliseconds()).toBe(999);
    expect(monthEndOf(2024, 1).getDate()).toBe(29); // 闰年
    expect(monthEndOf(2026, 6).getDate()).toBe(31); // 7 月
  });
});

describe('exAmount 未税换算（含税 ÷ (1+税率)，缺省 13%）', () => {
  it('113 → 100（13%）；缺省税率同', () => {
    expect(exAmount(113, 0.13)).toBe(100);
    expect(exAmount(113)).toBe(100);
    expect(exAmount(100, 0.13)).toBe(88); // round(88.49)
  });
});

describe('stageAsOf 阶段时间点还原（议价>投标>机会>线索>信息）', () => {
  const o: SalesOpportunity = {
    negotiationAt: '2026-06-01', bidAt: '2026-05-01', opportunityAt: '2026-04-01', leadAt: '2026-03-01',
  } as any;
  it('按判定时点取最高已进入阶段', () => {
    expect(stageAsOf(o, new Date(2026, 5, 15))).toBe('议价'); // 6 月中
    expect(stageAsOf(o, new Date(2026, 4, 15))).toBe('投标'); // 5 月中
    expect(stageAsOf(o, new Date(2026, 3, 15))).toBe('机会'); // 4 月中
    expect(stageAsOf(o, new Date(2026, 2, 15))).toBe('线索'); // 3 月中
    expect(stageAsOf(o, new Date(2026, 1, 15))).toBe('信息'); // 2 月中
  });
});

describe('getNodeDelay 统一节点延期判定（事实延期，asOf 注入避免 now 依赖）', () => {
  const node = (over: Partial<DeliveryNode>): DeliveryNode => ({ nodeNo: 1, name: 'n', status: 'pending', ...over } as any);
  it('无基线不判延期', () => {
    expect(getNodeDelay(node({}), new Date(2026, 6, 10))).toEqual({ hasBaseline: false, delayed: false, days: 0 });
  });
  it('已完成：实际完成日 vs 基线（永久）', () => {
    const done = node({ status: 'completed', actualDate: '2026-07-05', baselinePlannedEndDate: '2026-06-30' });
    expect(getNodeDelay(done, new Date(2026, 6, 20))).toEqual({ hasBaseline: true, delayed: true, days: 5 });
    const early = node({ status: 'completed', actualDate: '2026-06-25', baselinePlannedEndDate: '2026-06-30' });
    expect(getNodeDelay(early, new Date(2026, 6, 20))).toEqual({ hasBaseline: true, delayed: false, days: -5 });
  });
  it('未完成：判定时点 vs 基线（临时）', () => {
    const pending = node({ status: 'pending', baselinePlannedEndDate: '2026-06-30' });
    expect(getNodeDelay(pending, new Date(2026, 6, 10))).toEqual({ hasBaseline: true, delayed: true, days: 10 });
    expect(getNodeDelay(pending, new Date(2026, 5, 25))).toEqual({ hasBaseline: true, delayed: false, days: -5 });
  });
});

describe('isProjectDelivered / getProjectDoneDate 交付完结判定', () => {
  const proj = (over: Partial<DeliveryProject>): DeliveryProject => ({ id: 'p1', nodes: [], status: '进行中', updatedAt: '2026-04-01T00:00:00Z', ...over } as any);
  it('节点15 completed → 已完结；实际日优先', () => {
    const done = proj({ nodes: [{ nodeNo: 15, status: 'completed', actualDate: '2026-05-20' }] });
    expect(isProjectDelivered(done)).toBe(true);
    expect(getProjectDoneDate(done)!.getTime()).toBe(new Date('2026-05-20').getTime());
  });
  it('项目状态已完成但节点15缺实际日 → updatedAt 兜底（防御分支）', () => {
    const p = proj({ status: '已完成', nodes: [] });
    expect(getProjectDoneDate(p)!.getTime()).toBe(new Date('2026-04-01T00:00:00Z').getTime());
  });
  it('未完结 → null', () => {
    const p = proj({ nodes: [{ nodeNo: 15, status: 'pending' }] });
    expect(isProjectDelivered(p)).toBe(false);
    expect(getProjectDoneDate(p)).toBeNull();
  });
});

describe('quoteProfitExTax / deliverySalesProfit', () => {
  it('概算利润转未税；undefined → 0；负值如实保留', () => {
    expect(quoteProfitExTax(1130, 0.13)).toBe(1000);
    expect(quoteProfitExTax(undefined)).toBe(0);
    expect(quoteProfitExTax(-113, 0.13)).toBe(-100);
  });
  it('实际利润 = 未税 − 实际成本；无成本 → undefined（不设假利润）', () => {
    expect(deliverySalesProfit(1000, 800)).toBe(200);
    expect(deliverySalesProfit(1000, undefined)).toBeUndefined();
  });
});

describe('buildQuoteInfoMap / deliveryExTax 报价关联与交付未税', () => {
  const quoteById = (id: string) => (id === 'q1' ? { taxRate: 0.13, discountedPrice: 1130, gp3Amount: 100 } : undefined);
  it('构建 entityId → 报价摘要映射（rate = gp3/discounted）', () => {
    const map = buildQuoteInfoMap([{ id: 'e1', quotationId: 'q1' }, { id: 'e2', quotationId: 'none' }, { id: 'e3' }], quoteById);
    expect(map.size).toBe(1);
    expect(map.get('e1')).toMatchObject({ taxRate: 0.13, discounted: 1130, gp3Amt: 100 });
    expect(map.get('e1')!.rate).toBeCloseTo(100 / 1130, 5);
  });
  it('deliveryExTax 按关联报价税率转未税', () => {
    const map = buildQuoteInfoMap([{ id: 'p1', quotationId: 'q1' }], quoteById);
    expect(deliveryExTax({ id: 'p1', contractAmount: 11300 } as any, map)).toBe(10000);
  });
});

describe('projectMonthlySales 单项目月归集（订单按转交付月、销售按完成月）', () => {
  const p = (over: Partial<DeliveryProject>): DeliveryProject => ({
    id: 'p1', contractAmount: 11300, createdAt: '2026-03-15T00:00:00', updatedAt: '2026-04-01T00:00:00Z',
    nodes: [{ nodeNo: 15, status: 'completed', actualDate: '2026-03-20' }], ...over,
  } as any);
  const win = { start: new Date(2026, 2, 1), end: new Date(2026, 2, 31, 23, 59, 59, 999) };
  it('同月内订单+销售均归集；exTax=10000', () => {
    const s = projectMonthlySales(p({}), win.start, win.end, 0.13, 1130);
    expect(s.orderAmt).toBe(10000);
    expect(s.orderProfit).toBe(1000); // quoteProfitExTax(1130, 0.13)
    expect(s.salesAmt).toBe(10000);
    expect(s.salesProfit).toBeUndefined(); // 无实际成本
  });
  it('月外项目 → 全 0', () => {
    const s = projectMonthlySales(p({}), new Date(2026, 0, 1), new Date(2026, 0, 31, 23, 59, 59, 999), 0.13);
    expect(s).toEqual({ orderAmt: 0, orderProfit: 0, salesAmt: 0, salesProfit: 0 });
  });
});

describe('fyMonthWindows 财年 12 月窗口（index 0 = 7 月）', () => {
  it('FY2526 → Jul2025 起、Jun2026 止', () => {
    const wins = fyMonthWindows({ start: new Date(2025, 6, 1), end: new Date(2026, 5, 30, 23, 59, 59, 999) });
    expect(wins).toHaveLength(12);
    expect(wins[0].start.getFullYear()).toBe(2025);
    expect(wins[0].start.getMonth()).toBe(6);
    expect(wins[0].end.getDate()).toBe(31);
    expect(wins[6].start.getFullYear()).toBe(2026); // 1 月
    expect(wins[11].start.getMonth()).toBe(5);      // 6 月
  });
});

describe('getProjectDelay 统一项目延期判定（节点15为准）', () => {
  it('无节点15 / 无基线不判延期', () => {
    expect(getProjectDelay({ id: 'p1', nodes: [] } as any, new Date(2026, 6, 10))).toEqual({ hasBaseline: false, delayed: false, days: 0 });
  });
  it('节点15 已完成超基线 → 永久延期', () => {
    const p = {
      id: 'p1', status: '已完成',
      nodes: [{ nodeNo: 15, status: 'completed', actualDate: '2026-07-05', baselinePlannedEndDate: '2026-06-30' }],
    } as any;
    expect(getProjectDelay(p, new Date(2026, 6, 20))).toEqual({ hasBaseline: true, delayed: true, days: 5 });
  });
});

describe('FY_MONTH_LABELS 财年 12 月标签（index0=7月 → 11=6月）', () => {
  it('顺序 Jul→Jun 共 12 个', () => {
    expect(FY_MONTH_LABELS).toHaveLength(12);
    expect(FY_MONTH_LABELS[0]).toBe('Jul');
    expect(FY_MONTH_LABELS[5]).toBe('Dec');
    expect(FY_MONTH_LABELS[6]).toBe('Jan');
    expect(FY_MONTH_LABELS[11]).toBe('Jun');
  });
});
