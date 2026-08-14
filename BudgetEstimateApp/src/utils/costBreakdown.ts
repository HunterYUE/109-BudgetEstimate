import type { Group } from '../types.ts';
import { DEFAULT_DESIGN_HOURLY_RATE, DEFAULT_ASSEMBLY_HOURLY_RATE } from './constants.ts';
import { computeCostComponents } from './calculations.ts';

/** 成本对比所需的版本财务参数 */
export interface CostBreakdownVersion {
  riskRate?: number;
  warrantyRate?: number;
  commercialCost?: number;
}

/** 工时费率兜底 */
export interface CostBreakdownLaborRates {
  design: number;
  assembly: number;
}

/** 成本对比单条明细行（共享给成本表 ItemCostTable 与交付详情导出 handleExportCost） */
export interface CostLine {
  /** 唯一键 = 实际成本写入键（item.id 或聚合键 _sv_design/_assy_debug/_risk/_commercial/_warranty） */
  key: string;
  /** 成本类别（设备组名 / 集成开发 / 人工成本 / 项目费用 / 风险费用 / 商业费用 / 质保费用） */
  category: string;
  code: string;
  detail: string;
  qty: number;
  estimated: number;
  actual: number;
  /** 是否只读（质保行不可编辑） */
  readonly?: boolean;
}

/**
 * 汇总报价组 → 成本对比行（ItemCostTable 与 handleExportCost 的单一数字来源）。
 * 顺序与旧实现一致：EQUIPMENT 材料（按组）→ INTEGRATION 材料 → 设计/装配人工 →
 * 交付服务（除 SV-DESIGN/INSASS）→ 项目费用 → 风险 → 商业 → 质保。
 *
 * ⚠️ 口径与 calcDirectCost 一致（不可单独改动，否则两处漂移）：
 *   - 设计工时 = 整行总工时（设计只发生一次），不乘数量
 *   - 装配工时 = 单件工时 × 数量
 *   - 质保基数仅统计 EQUIPMENT/INTEGRATION 的免质保项
 *   - 风险基数 = 全部项次 directCost 之和
 */
export function buildCostLines(
  groups: Group[],
  actualCosts: Record<string, number>,
  version?: CostBreakdownVersion,
  laborRates?: CostBreakdownLaborRates,
): CostLine[] {
  const lines: CostLine[] = [];
  const act = (k: string): number => actualCosts[k] ?? 0;
  const itemLine = (item: { id: string; code: string; description: string; qtyTotal: number }, category: string, estimated: number): CostLine => ({
    key: item.id,
    category,
    code: item.code || '—',
    detail: item.description || '—',
    qty: Math.round(item.qtyTotal || 1),
    estimated,
    actual: act(item.id),
  });

  // ── 1. EQUIPMENT 材料部分 ──
  for (const g of groups) {
    if (g.groupType !== 'EQUIPMENT') continue;
    for (const item of g.items) {
      lines.push(itemLine(item, g.name, Math.round((item.unitCost || 0) * (item.qtyTotal || 1))));
    }
  }

  // ── 2. INTEGRATION 材料部分 ──
  const integGroup = groups.find(g => g.groupType === 'INTEGRATION');
  if (integGroup) {
    for (const item of integGroup.items) {
      lines.push(itemLine(item, '集成开发', Math.round((item.unitCost || 0) * (item.qtyTotal || 1))));
    }
  }

  // ── 3. 人工成本：设计/装配汇总 ──
  // 仅限 EQUIPMENT/INTEGRATION 工时 + PROJECT_DELIVERY 的 SV-DESIGN/SV-INSASS 服务项
  let totalDesignHours = 0, totalDesignCost = 0;
  let totalAssemblyHours = 0, totalAssemblyCost = 0;
  for (const g of groups) {
    if (g.groupType === 'EQUIPMENT' || g.groupType === 'INTEGRATION') {
      for (const item of g.items) {
        if (item.designHours) {
          totalDesignHours += item.designHours;
          totalDesignCost += Math.round(item.designHours * (item.designHourRate || (laborRates?.design ?? DEFAULT_DESIGN_HOURLY_RATE)));
        }
        if (item.assemblyHours) {
          totalAssemblyHours += item.assemblyHours * (item.qtyTotal || 1);
          totalAssemblyCost += Math.round(item.assemblyHours * (item.assemblyHourRate || (laborRates?.assembly ?? DEFAULT_ASSEMBLY_HOURLY_RATE)) * (item.qtyTotal || 1));
        }
      }
    }
    if (g.groupType === 'PROJECT_DELIVERY') {
      for (const item of g.items) {
        if (item.code === 'SV-DESIGN-000000-V1.0') {
          totalDesignHours += item.qtyTotal || 0;
          totalDesignCost += item.directCost || 0;
        }
        if (item.code === 'SV-INSASS-000000-V1.0') {
          totalAssemblyHours += item.qtyTotal || 0;
          totalAssemblyCost += item.directCost || 0;
        }
      }
    }
  }
  if (totalDesignCost > 0) {
    lines.push({ key: '_sv_design', category: '人工成本', code: 'SV-DESIGN-000000-V1.0', detail: '设计会签', qty: Math.round(totalDesignHours), estimated: totalDesignCost, actual: act('_sv_design') });
  }
  if (totalAssemblyCost > 0) {
    lines.push({ key: '_assy_debug', category: '人工成本', code: 'SV-INSASS-000000-V1.0', detail: '装配调试', qty: Math.round(totalAssemblyHours), estimated: totalAssemblyCost, actual: act('_assy_debug') });
  }

  // ── 4. PROJECT_DELIVERY 其他服务项（排除已汇总到设计/装配的项） ──
  const deliveryGroup = groups.find(g => g.groupType === 'PROJECT_DELIVERY');
  if (deliveryGroup) {
    for (const item of deliveryGroup.items) {
      if (item.code === 'SV-DESIGN-000000-V1.0' || item.code === 'SV-INSASS-000000-V1.0') continue;
      lines.push(itemLine(item, '人工成本', item.directCost));
    }
  }

  // ── 5. 项目费用 ──
  for (const g of groups) {
    if (g.groupType === 'PACKAGING_TRANSPORT' || g.groupType === 'IMPLEMENTATION_EXPENSE' || g.groupType === 'OTHER') {
      for (const item of g.items) {
        lines.push(itemLine(item, '项目费用', item.directCost));
      }
    }
  }

  // ── 6. 风险 / 商业 / 质保 ──
  if (version) {
    // ⚠️ 质保基数/风险/商业费用统一走 computeCostComponents（与 calcProjectSummary / computeDeliveryEstGP3 同口径）
    const { riskCost, commercialCost, warrantyCost } = computeCostComponents(groups, version);
    // 行显隐按费率判断（与原始实现一致），金额用共享计算值
    if ((version.riskRate ?? 0) > 0) {
      lines.push({ key: '_risk', category: '风险费用', code: 'R-RISKCOST', detail: '审批使用', qty: 0, estimated: riskCost, actual: act('_risk') });
    }
    lines.push({ key: '_commercial', category: '商业费用', code: 'C-COMMERCIAL', detail: '商业费用', qty: 0, estimated: commercialCost, actual: act('_commercial') });
    if ((version.warrantyRate ?? 0) > 0) {
      lines.push({ key: '_warranty', category: '质保费用', code: 'W-WARRANTY', detail: '不可使用', qty: 0, estimated: warrantyCost, actual: warrantyCost, readonly: true });
    }
  }

  return lines;
}
