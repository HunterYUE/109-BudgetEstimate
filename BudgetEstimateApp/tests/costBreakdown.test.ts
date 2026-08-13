import { describe, it, expect } from 'vitest';
import type { Group } from '../src/types';
import { buildCostLines, type CostLine } from '../src/utils/costBreakdown';

/**
 * 8 行 fixture（与 computeCostComponents 口径自洽）：
 *   EQUIPMENT a1(直成本200, 免质保) + INTEGRATION b1(直成本200, 免质保) → 质保基数 400 → 质保 8(×2%)
 *   PROJECT_DELIVERY c1/c2 设计装配 + OTHER d1 → 总直成本 4320 → 风险 216(×5%)；商业 100
 */
function fixture(): Group[] {
  return [
    {
      id: 'g1', name: '设备组1', groupType: 'EQUIPMENT', sortOrder: 0,
      items: [{ id: 'a1', code: 'EQ-001', description: '设备一', qtyTotal: 2, unitCost: 100, directCost: 200, hasWarranty: false }],
    },
    {
      id: 'g2', name: '集成', groupType: 'INTEGRATION', sortOrder: 1,
      items: [{ id: 'b1', code: 'INT-001', description: '集成一', qtyTotal: 1, unitCost: 200, directCost: 200, hasWarranty: false }],
    },
    {
      id: 'g3', name: '交付服务', groupType: 'PROJECT_DELIVERY', sortOrder: 2,
      items: [
        { id: 'c1', code: 'SV-DESIGN-000000-V1.0', description: '设计会签', qtyTotal: 18, directCost: 2200 },
        { id: 'c2', code: 'SV-INSASS-000000-V1.0', description: '装配调试', qtyTotal: 14, directCost: 1520 },
      ],
    },
    {
      id: 'g4', name: '项目费用', groupType: 'OTHER', sortOrder: 3,
      items: [{ id: 'd1', code: 'TR-001', description: '运输费', qtyTotal: 1, directCost: 200 }],
    },
  ] as any;
}

const version = { riskRate: 0.05, warrantyRate: 0.02, commercialCost: 100 };

describe('buildCostLines 成本对比行（ItemCostTable / handleExportCost 单一数字来源）', () => {
  it('行顺序：材料 → 人工 → 项目费用 → 风险 → 商业 → 质保', () => {
    const lines = buildCostLines(fixture(), {}, version);
    expect(lines.map(l => l.key)).toEqual(['a1', 'b1', '_sv_design', '_assy_debug', 'd1', '_risk', '_commercial', '_warranty']);
  });
  it('材料行：estimated=单价×数量，qty=数量', () => {
    const [a1, b1] = buildCostLines(fixture(), {}, version);
    expect(a1).toMatchObject({ category: '设备组1', code: 'EQ-001', detail: '设备一', qty: 2, estimated: 200 });
    expect(b1).toMatchObject({ category: '集成开发', code: 'INT-001', qty: 1, estimated: 200 });
  });
  it('设计/装配人工：qty=工时合计、estimated=直接成本合计（不乘数量——口径与 calcDirectCost 一致）', () => {
    const [, , svDesign, assy] = buildCostLines(fixture(), {}, version);
    expect(svDesign).toMatchObject({ key: '_sv_design', category: '人工成本', qty: 18, estimated: 2200 });
    expect(assy).toMatchObject({ key: '_assy_debug', category: '人工成本', qty: 14, estimated: 1520 });
  });
  it('项目费用行：直成本计入', () => {
    const lines = buildCostLines(fixture(), {}, version);
    const d1 = lines.find(l => l.key === 'd1')!;
    expect(d1).toMatchObject({ category: '项目费用', code: 'TR-001', qty: 1, estimated: 200 });
  });
  it('风险/商业/质保行金额与 computeCostComponents 同口径（风险=总直成本×5%、质保=免质保基数×2%）', () => {
    const lines = buildCostLines(fixture(), {}, version);
    const risk = lines.find(l => l.key === '_risk')!;
    const commercial = lines.find(l => l.key === '_commercial')!;
    const warranty = lines.find(l => l.key === '_warranty')!;
    expect(risk).toMatchObject({ category: '风险费用', estimated: 216 });   // 4320×0.05
    expect(commercial).toMatchObject({ category: '商业费用', estimated: 100 });
    expect(warranty).toMatchObject({ category: '质保费用', estimated: 8, actual: 8, readonly: true }); // 400×0.02
  });
  it('actual 取实际成本映射；缺失键 → 0', () => {
    const lines = buildCostLines(fixture(), { a1: 210, _sv_design: 2000, _risk: 50 }, version);
    const byKey = new Map(lines.map(l => [l.key, l]));
    expect(byKey.get('a1')!.actual).toBe(210);
    expect(byKey.get('_sv_design')!.actual).toBe(2000);
    expect(byKey.get('_risk')!.actual).toBe(50);
    expect(byKey.get('b1')!.actual).toBe(0);
  });
  it('无 version → 不产生风险/商业/质保行', () => {
    const lines = buildCostLines(fixture(), {});
    expect(lines.map(l => l.key)).toEqual(['a1', 'b1', '_sv_design', '_assy_debug', 'd1']);
  });
  it('费率 0 的行隐藏，商业行恒在', () => {
    const lines = buildCostLines(fixture(), {}, { riskRate: 0, warrantyRate: 0, commercialCost: 100 });
    const keys = lines.map(l => l.key);
    expect(keys).not.toContain('_risk');
    expect(keys).not.toContain('_warranty');
    expect(keys).toContain('_commercial');
  });
});
