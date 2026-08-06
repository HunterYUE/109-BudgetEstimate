/**
 * 核心纯函数单元测试（Node 原生 TS）
 * 覆盖：calculations / blueTableCalculation / analysisShared
 * 运行：node scripts/verify-core.ts
 */
import { calcDirectCost, calcItemPrices, calcProjectSummary, computeCostComponents, computeDeliveryEstGP3 } from '../src/utils/calculations.ts';
import { calcBlueTableWinRate } from '../src/utils/blueTableCalculation.ts';
import { exAmount, compressNo, chartLabel, monthEndOf, oppEffectiveEnd, stageAsOf, getNodeDelay, isProjectDelivered } from '../src/utils/analysisShared.ts';
import type { Group, GroupItem, SalesOpportunity, DeliveryNode } from '../src/types.ts';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ok  ' + msg);
  else { console.error('  FAIL ' + msg); failures++; }
}

const mkItem = (o: Partial<GroupItem> & { id: string }): GroupItem => ({
  id: o.id, itemNo: 0, itemType: 'COMPONENT', componentId: '', code: '', description: '',
  qtyTotal: 1, unit: '套', sourcingType: 'SELF_MANUFACTURED', unitCost: 0,
  designHours: 0, assemblyHours: 0, designHourRate: 175, assemblyHourRate: 85,
  directCost: 0, marginRate: 0.15, basicPrice: 0, accountingPrice: 0,
  hasWarranty: false, note: '', ...o,
});

const groups: Group[] = [
  { id: 'g1', groupNo: 1, groupType: 'EQUIPMENT', name: '设备组', isFixed: false, items: [
    mkItem({ id: 'a', code: 'CP-A', unitCost: 1000, qtyTotal: 2, designHours: 4, assemblyHours: 3, directCost: 3210, hasWarranty: true }),
    mkItem({ id: 'b', code: 'CP-B', unitCost: 500, qtyTotal: 1, directCost: 500, hasWarranty: false }),
  ]},
  { id: 'g2', groupNo: 2, groupType: 'INTEGRATION', name: '集成', isFixed: true, items: [
    mkItem({ id: 'c', code: 'CP-C', unitCost: 2000, qtyTotal: 1, designHours: 2, assemblyHours: 1, directCost: 2435, hasWarranty: false }),
  ]},
  { id: 'g3', groupNo: 3, groupType: 'PROJECT_DELIVERY', name: '交付', isFixed: true, items: [
    mkItem({ id: 'd', code: 'SV-DESIGN-000000-V1.0', qtyTotal: 10, unitCost: 175, directCost: 1750 }),
    mkItem({ id: 'e', code: 'SV-PROMAN-000000-V1.0', qtyTotal: 1, directCost: 240 }),
  ]},
  { id: 'g4', groupNo: 4, groupType: 'PACKAGING_TRANSPORT', name: '包装', isFixed: true, items: [
    mkItem({ id: 'f', code: 'SV-PAKAGE-000000-V1.0', directCost: 1000 }),
  ]},
];

console.log('== calcDirectCost（工时口径）==');
assert(calcDirectCost({ unitCost: 100, qtyTotal: 2 }) === 200, '物料×数量');
assert(calcDirectCost({ unitCost: 100, qtyTotal: 2, designHours: 10, designHourRate: 50 }) === 700, '设计=总量（10×50，不乘数量）');
assert(calcDirectCost({ unitCost: 100, qtyTotal: 2, assemblyHours: 10, assemblyHourRate: 50 }) === 1200, '装配=单件×数量（10×50×2）');
assert(calcDirectCost({ unitCost: 100.4, qtyTotal: 2 }) === 201, '取整');

console.log('== calcItemPrices ==');
const p = calcItemPrices(100, 0.35);
assert(p.accountingPrice === 154, '成本100 毛利率35% → 售价153.8取整154');

console.log('== computeCostComponents（质保/风险/商业）==');
const v = { warrantyRate: 0.01, riskRate: 0.03, commercialCost: 500 };
const cc = computeCostComponents(groups, v);
assert(cc.totalDirectCost === 9135, `全部项次 directCost 合计 9135 (实际 ${cc.totalDirectCost})`);
assert(cc.warrantyBase === 2935, `质保基数仅免质保项 2935 (实际 ${cc.warrantyBase})`);
assert(cc.warrantyCost === 29, `质保 29 (实际 ${cc.warrantyCost})`);
assert(cc.riskCost === 274, `风险 round(9135×0.03)=274 (实际 ${cc.riskCost})`);
assert(cc.commercialCost === 500, `商业 500`);

console.log('== calcProjectSummary ==');
const s = calcProjectSummary(groups, { warrantyRate: 0.01, riskRate: 0.03, commercialCost: 500, taxRate: 0.13 });
assert(s.totalDirectCost === 9135, 'totalDirectCost');
assert(s.warrantyBase === 2935 && s.warrantyCost === 29, '质保');
assert(s.totalCost === 9135 + 29 + 274 + 500, 'totalCost = 9135+29+274+500');
assert(s.materialCost > 0 && s.laborCost > 0, '材料/人工分解');

console.log('== computeDeliveryEstGP3 ==');
const gp3 = computeDeliveryEstGP3(100000, groups, v);
assert(gp3.exTax === Math.round(100000 / 1.13), 'exTax');
assert(gp3.grandEstimated === 9135 + 29 + 274 + 500, 'grandEstimated');

console.log('== calcBlueTableWinRate（蓝表赢率）==');
const btBase = {
  vetoBudget: 'ok' as const, timelinePlan: 'x', timelineOption: 'optimistic' as const,
  pricing: 'neutral' as const, positioning: 5, reactionMode: 'G' as const, strategy: '', targets: [],
  roles: [
    { id: 'r1', roleType: 'EB' as const, name: '王', influence: 'high' as const, influenceWeight: 10, support: 5, demandFit: 5, relationship: 5 },
    { id: 'r2', roleType: 'COACH' as const, name: '李', influence: 'medium' as const, influenceWeight: 3, support: 3, demandFit: 4, relationship: 4 },
  ],
};
const veto = calcBlueTableWinRate({ ...btBase, vetoBudget: 'failed' });
assert(veto.vetoed && veto.finalRate === 0, '预算不足 → 否决 0%');
const empty = calcBlueTableWinRate({ ...btBase, roles: [] });
assert(empty.finalRate === 0, '无角色 → 0%');
const noEB = calcBlueTableWinRate({ ...btBase, roles: [{ ...btBase.roles[1] }] });
assert(noEB.missingEB && noEB.rolePenalty === 0.5, '仅缺 EB（决策者）→ ×0.5');
const noCoach = calcBlueTableWinRate({ ...btBase, roles: [{ ...btBase.roles[0] }] });
assert(noCoach.missingCoach && noCoach.rolePenalty === 0.85, '仅缺 Coach → ×0.85');
const noBoth = calcBlueTableWinRate({ ...btBase, roles: [{ ...btBase.roles[0], roleType: 'UB' as const }] });
assert(noBoth.missingEB && noBoth.missingCoach && noBoth.rolePenalty === 0.4, '缺 EB+Coach → ×0.4');
const oc = calcBlueTableWinRate({ ...btBase, reactionMode: 'OC' });
assert(oc.reactionFactor === 0.8, 'OC 反应 → ×0.8');
// 满分封顶：支持度全满 → base 100 → ×1×1 → clamp 90
const perfect = calcBlueTableWinRate({ ...btBase, roles: btBase.roles.map(r => ({ ...r, support: 5 })) });
assert(perfect.finalRate <= 90, `封顶 90% (实际 ${perfect.finalRate})`);
const strong = calcBlueTableWinRate({ ...btBase, pricing: 'very_strong' });
assert(strong.pricingAdjustment === 15, '价格很强 → +15');

console.log('== analysisShared ==');
assert(exAmount(1130, 0.13) === 1000, 'exAmount 1130@13% → 1000');
assert(compressNo('A2026-07-003-S') === '2607003S', 'compressNo');
assert(chartLabel('A2026-07-003-S') === '2607\n003S', 'chartLabel 超4位插换行');
const m = monthEndOf(2026, 6);
assert(m.getFullYear() === 2026 && m.getMonth() === 6 && m.getDate() === 31 && m.getHours() === 23, 'monthEndOf 6月31日 23:59:59.999');
// oppEffectiveEnd：赢+转交付 → wonAt
const won = oppEffectiveEnd({ status: '赢', terminated: true, wonAt: '2026-07-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' } as unknown as SalesOpportunity);
assert(won.toISOString().startsWith('2026-07-01'), '赢单转交付 → wonAt');
const lost = oppEffectiveEnd({ status: '输', lostAt: '2026-06-15T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' } as unknown as SalesOpportunity);
assert(lost.toISOString().startsWith('2026-06-15'), '输单 → lostAt');
// stageAsOf：机会阶段
const opp = {
  createdAt: '2026-01-01', updatedAt: '2026-08-01', status: '过程中', terminated: false,
  opportunityAt: '2026-03-01T00:00:00Z', bidAt: '2026-05-01T00:00:00Z', leadAt: '2026-01-01T00:00:00Z',
} as unknown as SalesOpportunity;
assert(stageAsOf(opp, new Date('2026-04-01')) === '机会', '4月 → 机会');
assert(stageAsOf(opp, new Date('2026-06-01')) === '投标', '6月 → 投标');

// 议价阶段（negotiationAt 最高优先）
const opp2 = { ...opp, negotiationAt: '2026-07-01T00:00:00Z' } as unknown as SalesOpportunity;
assert(stageAsOf(opp2, new Date('2026-08-01')) === '议价', '8月(有议价) → 议价');

console.log('== getNodeDelay（事实延期）==');
const baseNode = (o: Partial<DeliveryNode> & { nodeNo: number }): DeliveryNode => ({
  id: 'n1', nodeNo: o.nodeNo, name: 'n', status: 'pending', plannedStartDate: '', plannedEndDate: '',
  actualDate: undefined, actualEndDate: undefined, baselinePlannedEndDate: undefined, baselinePlannedEndDate: undefined,
  ...o,
});
const noBase = getNodeDelay(baseNode({ nodeNo: 1 }));
assert(!noBase.hasBaseline && !noBase.delayed && noBase.days === 0, '无基线不判延期');
const late = getNodeDelay(baseNode({ nodeNo: 2, status: 'completed', baselinePlannedEndDate: '2026-08-01', actualDate: '2026-08-10' }), new Date('2026-08-15'));
assert(late.hasBaseline && late.delayed && late.days === 9, '实际晚基线9天 → 延期9天');
const early = getNodeDelay(baseNode({ nodeNo: 3, status: 'completed', baselinePlannedEndDate: '2026-08-01', actualDate: '2026-07-20' }), new Date('2026-08-15'));
assert(early.delayed === false && early.days === -12, '提前12天 → 不延期');
const inProgress = getNodeDelay(baseNode({ nodeNo: 4, status: 'in_progress', baselinePlannedEndDate: '2026-08-01' }), new Date('2026-08-10'));
assert(inProgress.delayed && inProgress.days === 9, '未完成且超期 → 临时延期9天');
const notYet = getNodeDelay(baseNode({ nodeNo: 5, status: 'in_progress', baselinePlannedEndDate: '2026-08-20' }), new Date('2026-08-10'));
assert(notYet.delayed === false, '未到期 → 不延期');

console.log('== isProjectDelivered ==');
assert(isProjectDelivered({ status: '已完成', nodes: [] } as unknown as DeliveryProject), '状态已完成 → 交付完结');
assert(isProjectDelivered({ status: '进行中', nodes: [baseNode({ nodeNo: 15, status: 'completed' })] } as unknown as DeliveryProject), '节点15完成 → 交付完结');
assert(!isProjectDelivered({ status: '进行中', nodes: [baseNode({ nodeNo: 14, status: 'completed' })] } as unknown as DeliveryProject), '仅节点14完成 → 未完结');

console.log();
if (failures === 0) { console.log('ALL PASS'); process.exit(0); }
else { console.error(failures + ' 个断言失败'); process.exit(1); }
