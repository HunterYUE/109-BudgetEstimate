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

