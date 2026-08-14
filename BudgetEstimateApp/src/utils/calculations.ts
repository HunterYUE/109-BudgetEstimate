import type { Group, GroupItem } from '../types';
import { TAX_RATE } from './constants';

/** 直接成本 = 物料成本×数量 + 设计工时×费率 + 装配工时×费率×数量 */
export function calcDirectCost(item: {
  unitCost?: number;
  qtyTotal?: number;
  designHours?: number;
  designHourRate?: number;
  assemblyHours?: number;
  assemblyHourRate?: number;
}): number {
  const materialCost = (item.unitCost || 0) * (item.qtyTotal ?? 1);
  const designCost = (item.designHours || 0) * (item.designHourRate || 0);
  const assemblyCost = (item.assemblyHours || 0) * (item.assemblyHourRate || 0) * (item.qtyTotal ?? 1);
  // 精确到个位（整数）
  return Math.round(materialCost + designCost + assemblyCost);
}

/** 计算售价（取整到个位）
 *  预期售价 = 直接成本 / (1 - 毛利率)
 *  例：成本100、毛利率35% → 100/(1-0.35) = 153.8 */
export function calcItemPrices(
  directCost: number,
  marginRate: number,
): { basicPrice: number; accountingPrice: number } {
  const denominator = 1 - marginRate;
  const basicPrice = denominator > 0 ? directCost / denominator : directCost;
  const accountingPrice = Math.round(basicPrice);
  return { basicPrice: basicPrice, accountingPrice: accountingPrice };
}

/** 计算组汇总 */
export function calcGroupSummary(items: GroupItem[]): {
  totalDirectCost: number;
  totalAccountingPrice: number;
} {
  let totalDirectCost = 0;
  let totalAccountingPrice = 0;
  for (const item of items) {
    totalDirectCost += item.directCost;
    totalAccountingPrice += item.accountingPrice;
  }
  return { totalDirectCost, totalAccountingPrice };
}

export interface ProjectSummary {
  totalDirectCost: number;
  warrantyBase: number;
  warrantyCost: number;
  riskCost: number;
  commercialCost: number;
  totalCost: number;
  totalAccountingPrice: number;
  discountedPrice: number;
  discountRate: number;
  gp3: number;
  gp3Amount: number;
  materialCost: number;
  laborCost: number;
  projectExpense: number;
}

/**
 * 成本构成共享计算：全部项次直接成本合计、质保基数、质保/风险/商业费用。
 * ⚠️ calcProjectSummary / computeDeliveryEstGP3 / buildCostLines 三处共用，防口径漂移（质保基数仅 EQUIPMENT/INTEGRATION 免质保项）。
 */
export function computeCostComponents(
  groups: Group[],
  version: { warrantyRate?: number; riskRate?: number; commercialCost?: number },
) {
  const totalDirectCost = groups.reduce((s, g) => s + g.items.reduce((si, i) => si + i.directCost, 0), 0);
  const warrantyBase = groups.reduce((s, g) =>
    (g.groupType === 'EQUIPMENT' || g.groupType === 'INTEGRATION')
      ? s + g.items.filter(i => !i.hasWarranty).reduce((si, i) => si + i.directCost, 0)
      : s, 0);
  const warrantyCost = Math.round(warrantyBase * (version.warrantyRate ?? 0));
  const riskCost = Math.round(totalDirectCost * (version.riskRate ?? 0));
  const commercialCost = version.commercialCost ?? 0;
  return { totalDirectCost, warrantyBase, warrantyCost, riskCost, commercialCost };
}

/** 计算版本汇总（含物料/人工/项目费用分解）
 *  ⚠️ discountedPrice 参数必须为未税值（内部使用），返回的 totalAccountingPrice/discountedPrice 为含税值
 */
export function calcProjectSummary(
  groups: Group[],
  version: {
    warrantyRate: number;
    riskRate: number;
    commercialCost: number;
    taxRate?: number;
  },
  discountedPriceUntaxed?: number
): ProjectSummary {
  // ⚠️ 质保基数/质保/风险/商业费用统一走 computeCostComponents（防与成本对比表口径漂移）
  const { totalDirectCost, warrantyBase, warrantyCost, riskCost, commercialCost } = computeCostComponents(groups, version);
  let totalAccountingPrice = 0;
  let materialCost = 0;
  let laborCost = 0;
  let projectExpense = 0;

  for (const group of groups) {
    for (const item of group.items) {
      totalAccountingPrice += item.accountingPrice;
      const mat = Math.round((item.unitCost || 0) * (item.qtyTotal ?? 1));
      const lab = item.directCost - mat;
      if (group.groupType === 'PROJECT_DELIVERY') {
        laborCost += item.directCost;
      } else if (group.groupType === 'PACKAGING_TRANSPORT' || group.groupType === 'IMPLEMENTATION_EXPENSE' || group.groupType === 'OTHER') {
        projectExpense += item.directCost;
      } else {
        if (mat > 0) materialCost += mat;
        if (lab > 0) laborCost += lab;
      }
    }
  }

  const discountedPriceV = (discountedPriceUntaxed && discountedPriceUntaxed > 0) ? discountedPriceUntaxed : totalAccountingPrice;
  const discountRate = totalAccountingPrice > 0
    ? (totalAccountingPrice - discountedPriceV) / totalAccountingPrice
    : 0;

  const taxRate = version.taxRate ?? TAX_RATE;
  const totalCost = totalDirectCost + warrantyCost + riskCost + commercialCost;

  // 输出含税值（总成本也需 × (1+税率) 才能与含税收入一致口径）
  const totalAccountingPriceTax = Math.round(totalAccountingPrice * (1 + taxRate));
  const discountedPriceTax = Math.round(discountedPriceV * (1 + taxRate));
  const totalCostTax = Math.round(totalCost * (1 + taxRate));
  const gp3 = discountedPriceTax > 0 ? (discountedPriceTax - totalCostTax) / discountedPriceTax : 0;

  return {
    totalDirectCost,
    warrantyBase,
    warrantyCost,
    riskCost,
    commercialCost,
    totalCost,
    totalAccountingPrice: totalAccountingPriceTax,
    discountedPrice: discountedPriceTax,
    discountRate,
    gp3,
    gp3Amount: Math.round(discountedPriceTax * gp3),
    materialCost,
    laborCost,
    projectExpense,
  };
}

/** 格式化金额（整数） */
export function formatMoney(value: number | undefined | null, locale = 'zh-CN'): string {
  const num = value ?? 0;
  return Math.round(num).toLocaleString(locale);
}

/** 费率（小数）→ 百分比数值（0.35 → 35）：各页散落 `Math.round(v * 10000) / 100` 收敛单源（F08 重复逻辑家族） */
export function rateToPercent(v: number): number {
  return Math.round(v * 10000) / 100;
}

/**
 * 计算交付项目的概算 GP3（不含实际成本）
 * 公式：
 *   exTax = contractAmount / (1 + taxRate)
 *   totalEstimated = Σ direct_cost
 *   warrantyCost = Σ(items WITHOUT warranty × direct_cost) × warranty_rate
 *   riskCost = totalEstimated * risk_rate
 *   grandEstimated = totalEstimated + riskCost + warrantyCost + commercialCost
 *   estGP3 = (exTax - grandEstimated) / exTax
 */
export function computeDeliveryEstGP3(
  contractAmount: number,
  groups: Group[],
  version?: { warrantyRate?: number; riskRate?: number; taxRate?: number; commercialCost?: number }
): { exTax: number; totalEstimated: number; warrantyCost: number; riskCost: number; commercialCost: number; grandEstimated: number; estGP3: number } {
  const taxRate = version?.taxRate ?? TAX_RATE;
  const exTax = Math.round(contractAmount / (1 + taxRate));

  // ⚠️ 质保/风险/商业费用统一走 computeCostComponents（防与 calcProjectSummary / buildCostLines 口径漂移）
  const { totalDirectCost: totalEstimated, warrantyCost, riskCost, commercialCost } = computeCostComponents(groups, version ?? {});

  const grandEstimated = totalEstimated + riskCost + warrantyCost + commercialCost;
  const estGP3 = exTax > 0 ? (exTax - grandEstimated) / exTax : 0;

  return { exTax, totalEstimated, warrantyCost, riskCost, commercialCost, grandEstimated, estGP3 };
}

