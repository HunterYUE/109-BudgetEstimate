import { describe, it, expect } from 'vitest';
import type { Group } from '../src/types';
import {
  calcDirectCost, calcItemPrices, calcGroupSummary, computeCostComponents,
  calcProjectSummary, computeDeliveryEstGP3, formatMoney,
} from '../src/utils/calculations';

// ── 构造最小 Group/GroupItem 夹具（GroupItem 其余字段测试不涉及时给零值）──
function item(over: Partial<Record<string, any>> & { id: string }): any {
  return {
    itemNo: 0, itemType: 'COMPONENT', componentId: '', code: '', description: '',
    qtyTotal: 1, unit: '个', sourcingType: 'SELF_MANUFACTURED', unitCost: 0,
    designHours: 0, assemblyHours: 0, designHourRate: 0, assemblyHourRate: 0,
    directCost: 0, marginRate: 0, basicPrice: 0, accountingPrice: 0,
    hasWarranty: false, note: '', ...over,
  };
}
function group(groupType: Group['groupType'], name: string, items: any[]): Group {
  return { id: 'g-' + name, groupNo: 1, groupType, name, isFixed: false, items };
}

describe('calcDirectCost 直接成本 = 物料×量 + 设计工时×费率 + 装配工时×费率×量', () => {
  it('取整到个位', () => {
    expect(calcDirectCost({ unitCost: 100, qtyTotal: 2, designHours: 10, designHourRate: 80, assemblyHours: 5, assemblyHourRate: 60 })).toBe(1600);
  });
  it('qtyTotal 缺省按 1；缺失字段按 0', () => {
    expect(calcDirectCost({ unitCost: 100 })).toBe(100);
    expect(calcDirectCost({})).toBe(0);
  });
});

describe('calcItemPrices 预期售价 = 成本 / (1 − 毛利率)', () => {
  it('成本 100、毛利 35% → 153.8，取整 154', () => {
    const { basicPrice, accountingPrice } = calcItemPrices(100, 0.35);
    expect(basicPrice).toBeCloseTo(153.85, 2);
    expect(accountingPrice).toBe(154);
  });
  it('负毛利率（加价出售）→ 成本/(1-负毛利) 即 成本/1.2', () => {
    const { basicPrice } = calcItemPrices(100, -0.2);
    expect(basicPrice).toBeCloseTo(83.33, 2); // 100/1.2
  });
  it('毛利率 ≥1 分母非正 → 回退成本原值', () => {
    const { basicPrice } = calcItemPrices(100, 1);
    expect(basicPrice).toBe(100);
  });
});

describe('calcGroupSummary 组汇总', () => {
  it('直接成本与售价求和', () => {
    const s = calcGroupSummary([{ directCost: 10, accountingPrice: 15 } as any, { directCost: 20, accountingPrice: 25 } as any]);
    expect(s).toEqual({ totalDirectCost: 30, totalAccountingPrice: 40 });
  });
});

describe('computeCostComponents 成本构成（质保基数仅 EQUIPMENT/INTEGRATION 免质保项）', () => {
  const groups = [
    group('EQUIPMENT', '设备组', [
      item({ id: 'a1', unitCost: 100, qtyTotal: 2, directCost: 1600, hasWarranty: false }), // 入质保基数
      item({ id: 'a2', unitCost: 50, qtyTotal: 1, directCost: 50, hasWarranty: true }),     // 含质保 → 排除
    ]),
    group('INTEGRATION', '集成', [item({ id: 'b1', directCost: 720, hasWarranty: false })]),
    group('PROJECT_DELIVERY', '交付服务', [item({ id: 'c1', directCost: 300 })]),          // 非 EQ/INT → 不入质保基数
  ];
  const v = { warrantyRate: 0.02, riskRate: 0.05, commercialCost: 100 };
  it('基数 = 1600 + 720 = 2320；质保 46；风险按全部直接成本 2670×5% = 134；商业 100', () => {
    const c = computeCostComponents(groups, v);
    expect(c.totalDirectCost).toBe(2670); // 1600+50+720+300
    expect(c.warrantyBase).toBe(2320);
    expect(c.warrantyCost).toBe(46);      // round(2320×0.02)
    expect(c.riskCost).toBe(134);         // round(2670×0.05)
    expect(c.commercialCost).toBe(100);
  });
  it('缺省费率按 0', () => {
    const c = computeCostComponents(groups, {});
    expect(c.warrantyCost).toBe(0);
    expect(c.riskCost).toBe(0);
  });
});

describe('calcProjectSummary 版本汇总（含税输出 / GP3 口径）', () => {
  const groups = [
    group('EQUIPMENT', '设备组', [
      item({ id: 'a1', unitCost: 100, qtyTotal: 2, designHours: 10, designHourRate: 80, assemblyHours: 5, assemblyHourRate: 60, directCost: 1600, accountingPrice: 2286, hasWarranty: false }),
      item({ id: 'a2', unitCost: 50, qtyTotal: 1, directCost: 50, accountingPrice: 71, hasWarranty: true }),
    ]),
    group('INTEGRATION', '集成', [item({ id: 'b1', unitCost: 200, qtyTotal: 1, designHours: 5, designHourRate: 80, assemblyHours: 2, assemblyHourRate: 60, directCost: 720, accountingPrice: 1029, hasWarranty: false })]),
    group('PROJECT_DELIVERY', '交付服务', [item({ id: 'c1', directCost: 300, accountingPrice: 400 })]),
    group('PACKAGING_TRANSPORT', '包装运输', [item({ id: 'd1', directCost: 200, accountingPrice: 250 })]),
  ];
  const version = { warrantyRate: 0.02, riskRate: 0.05, commercialCost: 0, taxRate: 0.13 };

  it('物料/人工/项目费用分解：EQUIPMENT+INTEGRATION 按 物料 vs 人工拆、PROJECT_DELIVERY 全人工、包装全项目费用', () => {
    const s = calcProjectSummary(groups, version);
    expect(s.materialCost).toBe(450);   // a1:200 + a2:50 + b1:200
    expect(s.laborCost).toBe(2220);     // a1:1400 + a2:0 + b1:520 + c1:300
    expect(s.projectExpense).toBe(200); // d1
  });
  it('含税输出：售价×1.13 取整；总成本=直接成本+质保+风险 再×1.13', () => {
    const s = calcProjectSummary(groups, version);
    // totalAccountingPrice 未税 = 2286+71+1029+400+250 = 4036 → ×1.13 = 4560.68 → 4561
    expect(s.totalAccountingPrice).toBe(4561);
    expect(s.discountedPrice).toBe(4561); // 未传折后未税 → 按原价
    // 总成本未税 = 2870+46+144 = 3060 → ×1.13 = 3457.8 → 3458
    expect(s.totalCost).toBe(3060);
    expect(s.gp3).toBeCloseTo((4561 - 3458) / 4561, 4); // ≈ 0.24183
    expect(s.gp3Amount).toBe(1103);
    expect(s.discountRate).toBe(0);
  });
  it('传折后未税 → 折后价含税输出 + 折扣率', () => {
    const s = calcProjectSummary(groups, version, 3000);
    expect(s.discountedPrice).toBe(Math.round(3000 * 1.13)); // 3390
    expect(s.discountRate).toBeCloseTo((4036 - 3000) / 4036, 4); // ≈ 0.25669
  });
  it('亏损报价（折后低于成本）GP3 为负且如实保留', () => {
    const s = calcProjectSummary(groups, version, 2000);
    expect(s.gp3).toBeLessThan(0);
  });
});

describe('computeDeliveryEstGP3 交付概算（不含实际成本）', () => {
  const groups = [
    group('EQUIPMENT', '设备组', [item({ id: 'a1', directCost: 1600, hasWarranty: false })]),
    group('INTEGRATION', '集成', [item({ id: 'b1', directCost: 720, hasWarranty: false })]),
  ];
  it('exTax 未税、grandEstimated = 直接成本+风险+质保+商业、estGP3', () => {
    const r = computeDeliveryEstGP3(11300, groups, { warrantyRate: 0.02, riskRate: 0.05, commercialCost: 100, taxRate: 0.13 });
    expect(r.exTax).toBe(Math.round(11300 / 1.13)); // 10000
    expect(r.totalEstimated).toBe(2320);
    expect(r.warrantyCost).toBe(46);  // round(2320×0.02)
    expect(r.riskCost).toBe(116);     // round(2320×0.05)
    expect(r.commercialCost).toBe(100);
    expect(r.grandEstimated).toBe(2320 + 116 + 46 + 100);
    expect(r.estGP3).toBeCloseTo((10000 - 2582) / 10000, 4);
  });
  it('无 version → 质保/风险/商业为 0', () => {
    const r = computeDeliveryEstGP3(11300, groups);
    expect(r.warrantyCost).toBe(0);
    expect(r.riskCost).toBe(0);
    expect(r.commercialCost).toBe(0);
  });
});

describe('formatMoney 金额格式化（取整到个位 + 千分位）', () => {
  it('千分位 + 四舍五入', () => {
    expect(formatMoney(1234)).toBe('1,234');
    expect(formatMoney(1234.5)).toBe('1,235');
    expect(formatMoney(1234567)).toBe('1,234,567');
    expect(formatMoney(-1234)).toBe('-1,234');
  });
  it('null/undefined → 0；数字 0 → "0"', () => {
    expect(formatMoney(null)).toBe('0');
    expect(formatMoney(undefined)).toBe('0');
    expect(formatMoney(0)).toBe('0');
  });
});
