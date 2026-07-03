import type { Group, GroupItem } from '../types';

/** 直接成本 = 物料成本×数量 + 设计工时×费率 + 装配工时×费率×数量 */
export function calcDirectCost(item: {
  unit_cost: number;
  qty_total: number;
  design_hours: number;
  design_hour_rate: number;
  assembly_hours: number;
  assembly_hour_rate: number;
}): number {
  const materialCost = item.unit_cost * item.qty_total;
  const designCost = item.design_hours * item.design_hour_rate;
  const assemblyCost = item.assembly_hours * item.assembly_hour_rate * item.qty_total;
  // 精确到个位（整数）
  return Math.round(materialCost + designCost + assemblyCost);
}

/** 计算售价（取整到个位） */
export function calcItemPrices(
  directCost: number,
  marginRate: number,
): { basic_price: number; accounting_price: number } {
  const basicPrice = directCost * (1 + marginRate);
  const accountingPrice = Math.round(basicPrice);
  return { basic_price: basicPrice, accounting_price: accountingPrice };
}

/** 计算组汇总 */
export function calcGroupSummary(items: GroupItem[]): {
  total_direct_cost: number;
  total_accounting_price: number;
} {
  let total_direct_cost = 0;
  let total_accounting_price = 0;
  for (const item of items) {
    total_direct_cost += item.direct_cost;
    total_accounting_price += item.accounting_price;
  }
  return { total_direct_cost, total_accounting_price };
}

/** 计算版本汇总 */
export function calcProjectSummary(
  groups: Group[],
  version: {
    warranty_rate: number;
    risk_rate: number;
    commercial_cost: number;
  },
  discountedPrice?: number
) {
  let total_direct_cost = 0;
  let warranty_base = 0;
  let total_accounting_price = 0;

  for (const group of groups) {
    for (const item of group.items) {
      total_direct_cost += item.direct_cost;
      total_accounting_price += item.accounting_price;
      if (!item.has_warranty) {
        warranty_base += item.accounting_price;
      }
    }
  }

  const discounted_price = discountedPrice ?? total_accounting_price;
  const discount_rate = total_accounting_price > 0
    ? (total_accounting_price - discounted_price) / total_accounting_price
    : 0;

  // 质保基数按折扣率调整后×质保费率
  const warranty_base_discounted = Math.round(warranty_base * (1 - discount_rate));
  const warranty_cost = Math.round(warranty_base_discounted * version.warranty_rate);
  const risk_cost = Math.round(total_direct_cost * version.risk_rate);
  const commercial_cost = version.commercial_cost;
  const total_cost = total_direct_cost + warranty_cost + risk_cost + commercial_cost;

  const rp1 = discounted_price > 0 ? (discounted_price - total_direct_cost) / discounted_price : 0;
  const gp3 = discounted_price > 0 ? (discounted_price - total_cost) / discounted_price : 0;

  return {
    total_direct_cost,
    warranty_base: warranty_base_discounted,
    warranty_cost,
    risk_cost,
    commercial_cost,
    total_cost,
    total_accounting_price,
    discounted_price,
    discount_rate,
    rp1,
    gp3,
  };
}

/** 格式化金额（整数） */
export function formatMoney(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

/**
 * 计算交付项目的概算 GP3（不含实际成本）
 * 公式与 DeliveryDetail 保持一致：
 *   exTax = contractAmount / 1.13
 *   totalEstimated = Σ direct_cost
 *   warrantyCost = Σ(warranty items' unit_cost * qty_total) * warranty_rate
 *   riskCost = totalEstimated * risk_rate
 *   grandEstimated = totalEstimated + riskCost + warrantyCost
 *   estGP3 = (exTax - grandEstimated) / exTax
 */
export function computeDeliveryEstGP3(
  contractAmount: number,
  groups: Group[],
  version?: { warranty_rate: number; risk_rate: number }
): { exTax: number; totalEstimated: number; warrantyCost: number; riskCost: number; grandEstimated: number; estGP3: number } {
  const TAX_RATE = 0.13;
  const exTax = Math.round(contractAmount / (1 + TAX_RATE));

  const totalEstimated = groups.reduce((s, g) => s + g.items.reduce((si, i) => si + i.direct_cost, 0), 0);

  const warrantyCost = version
    ? Math.round(
        groups.reduce((s, g) =>
          s + g.items.filter(i => i.has_warranty).reduce((si, i) => si + Math.round(i.unit_cost * i.qty_total), 0), 0
        ) * version.warranty_rate
      )
    : 0;

  const riskCost = version ? Math.round(totalEstimated * version.risk_rate) : 0;

  const grandEstimated = totalEstimated + riskCost + warrantyCost;
  const estGP3 = exTax > 0 ? (exTax - grandEstimated) / exTax : 0;

  return { exTax, totalEstimated, warrantyCost, riskCost, grandEstimated, estGP3 };
}

