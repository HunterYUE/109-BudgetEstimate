/**
 * 成本分解共享逻辑回归守卫
 * 运行：node scripts/verify-cost-breakdown.ts（Node ≥23.6 原生 TS 类型剥离，无需编译）
 *
 * 校验 buildCostLines（src/utils/costBreakdown.ts）的财务口径：
 *   1. Σ estimated === 独立计算的 grandEstimated（Σ directCost + 风险 + 质保 + 商业）
 *   2. 设计工时=总量（不乘数量）、装配工时=单件×数量
 *   3. 质保基数仅统计 EQUIPMENT/INTEGRATION 的免质保项，质保行 readonly
 *   4. 全部行 key ∈ {item.id, _sv_design, _assy_debug, _risk, _commercial}，_warranty 只读
 *   5. actual 正确映射 actualCosts（质保行恒等于估算值，不读 actualCosts）
 *   6. 表格结构：按 category 边界重构后 header 数、每 header 求和一致
 */
import { buildCostLines, type CostLine } from '../src/utils/costBreakdown.ts';
import type { Group, GroupItem } from '../src/types.ts';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { console.log('  ok  ' + msg); }
  else { console.error('  FAIL ' + msg); failures++; }
}

// ── fixture ──
const mkItem = (o: Partial<GroupItem> & { id: string; code: string }): GroupItem => ({
  id: o.id, itemNo: 0, itemType: 'COMPONENT', componentId: '', code: o.code,
  description: o.description ?? '', qtyTotal: 1, unit: '套',
  sourcingType: 'SELF_MANUFACTURED', unitCost: 0, designHours: 0, assemblyHours: 0,
  designHourRate: 175, assemblyHourRate: 85, directCost: 0, marginRate: 0.15,
  basicPrice: 0, accountingPrice: 0, hasWarranty: false, note: '',
  ...o,
});

// 设备组：eq1a 含设计/装配工时（hasWarranty=true 排除出质保基数）；eq1b 免质保
const eq1a = mkItem({ id: 'eq1a', code: 'CP-A', description: '物料A', qtyTotal: 2, unitCost: 1000, designHours: 4, assemblyHours: 3, directCost: 3210, hasWarranty: true });
const eq1b = mkItem({ id: 'eq1b', code: 'CP-B', description: '物料B', qtyTotal: 1, unitCost: 500, directCost: 500, hasWarranty: false });
// 集成组：int1 含工时、免质保
const int1 = mkItem({ id: 'int1', code: 'CP-C', description: '物料C', qtyTotal: 1, unitCost: 2000, designHours: 2, assemblyHours: 1, directCost: 2435, hasWarranty: false });
// 项目交付：SV-DESIGN(10h×175) / SV-INSASS(5h×85) / 项目管理服务
const pd1 = mkItem({ id: 'pd1', code: 'SV-DESIGN-000000-V1.0', qtyTotal: 10, unitCost: 175, directCost: 1750 });
const pd2 = mkItem({ id: 'pd2', code: 'SV-INSASS-000000-V1.0', qtyTotal: 5, unitCost: 85, directCost: 425 });
const pd3 = mkItem({ id: 'pd3', code: 'SV-PROMAN-000000-V1.0', qtyTotal: 1, unitCost: 240, directCost: 240 });
// 包装运输（项目费用）
const exp1 = mkItem({ id: 'exp1', code: 'SV-PAKAGE-000000-V1.0', qtyTotal: 1, unitCost: 1000, directCost: 1000 });

const groups: Group[] = [
  { id: 'g-eq', groupNo: 1, groupType: 'EQUIPMENT', name: '设备组 #1', isFixed: false, items: [eq1a, eq1b] },
  { id: 'g-int', groupNo: 2, groupType: 'INTEGRATION', name: '集成控制', isFixed: true, items: [int1] },
  { id: 'g-pd', groupNo: 3, groupType: 'PROJECT_DELIVERY', name: '项目交付', isFixed: true, items: [pd1, pd2, pd3] },
  { id: 'g-exp', groupNo: 4, groupType: 'PACKAGING_TRANSPORT', name: '包装运输', isFixed: true, items: [exp1] },
];

const version = { riskRate: 0.03, warrantyRate: 0.01, commercialCost: 500 };
const laborRates = { design: 175, assembly: 85 };

// 独立计算期望（与 computeDeliveryEstGP3 同公式：grandEstimated = ΣdirectCost + risk + warranty + commercial）
const totalDirect = groups.reduce((s, g) => s + g.items.reduce((si, i) => si + i.directCost, 0), 0);
const expectedRisk = Math.round(totalDirect * version.riskRate);         // round(9560*0.03)=287
const warrantyBase = groups.reduce((s, g) =>
  (g.groupType === 'EQUIPMENT' || g.groupType === 'INTEGRATION')
    ? s + g.items.filter(i => !i.hasWarranty).reduce((si, i) => si + i.directCost, 0) : s, 0); // eq1b 500 + int1 2435 = 2935
const expectedWarranty = Math.round(warrantyBase * version.warrantyRate); // round(29.35)=29
const expectedGrand = totalDirect + expectedRisk + expectedWarranty + version.commercialCost; // 10376

const actualCosts: Record<string, number> = {
  eq1a: 2100, _sv_design: 2900, _assy_debug: 1200, pd3: 250, exp1: 1100, _risk: 300, _commercial: 520, _warranty: 999 /* 应被忽略 */,
};

console.log('== buildCostLines 断言 ==');
const lines = buildCostLines(groups, actualCosts, version, laborRates);

// 1. 估算合计与独立公式一致
const sumEst = lines.reduce((s, l) => s + l.estimated, 0);
assert(sumEst === expectedGrand, `Σ estimated ${sumEst} === grandEstimated ${expectedGrand}`);
assert(sumEst === 10376, `Σ estimated 具体值 10376`);

// 2. 设计=总量、装配=单件×数量
const design = lines.find(l => l.key === '_sv_design')!;
const assy = lines.find(l => l.key === '_assy_debug')!;
assert(design.qty === 16 && design.estimated === 2800, `设计 qty=${design.qty}(16) est=${design.estimated}(2800) —— 不乘数量`);
assert(assy.qty === 12 && assy.estimated === 1020, `装配 qty=${assy.qty}(12) est=${assy.estimated}(1020) —— 单件×数量`);

// 3. 质保口径 + readonly
const w = lines.find(l => l.key === '_warranty')!;
assert(w.estimated === expectedWarranty && w.estimated === 29, `质保 est=${w.estimated}(29) 基数仅免质保项`);
assert(w.readonly === true, `质保行 readonly=true`);
assert(w.actual === 29, `质保 actual=29（不读 actualCosts['_warranty']）`);

// 4. 行 key 合法 + 可编辑性
const allowedKeys = new Set(['eq1a', 'eq1b', 'int1', '_sv_design', '_assy_debug', 'pd3', 'exp1', '_risk', '_commercial', '_warranty']);
for (const l of lines) assert(allowedKeys.has(l.key), `key 合法: ${l.key}`);
const editableKeys = lines.filter(l => !l.readonly).map(l => l.key);
for (const k of editableKeys) assert(!['_warranty'].includes(k), `可编辑行不含 _warranty: ${k}`);

// 5. actual 映射
assert(lines.find(l => l.key === 'eq1a')!.actual === 2100, `eq1a actual=2100`);
assert(lines.find(l => l.key === '_risk')!.actual === 300, `_risk actual=300`);
assert(lines.find(l => l.key === '_commercial')!.actual === 520, `_commercial actual=520`);

// 6. 表格结构重构（与 ItemCostTable rows useMemo 相同的 category 边界逻辑）
console.log('== 表格结构断言 ==');
interface FlatRow { _type: 'header' | 'item'; category: string; estimated: number; actual: number; key: string; }
const rows: FlatRow[] = [];
let i = 0;
while (i < lines.length) {
  const cat = lines[i].category;
  const group: CostLine[] = [];
  while (i < lines.length && lines[i].category === cat) group.push(lines[i++]);
  const est = group.reduce((s, l) => s + l.estimated, 0);
  const act = group.reduce((s, l) => s + l.actual, 0);
  rows.push({ _type: 'header', category: cat, estimated: est, actual: act, key: 'h-' + cat });
  for (const l of group) rows.push({ _type: 'item', category: l.category, estimated: l.estimated, actual: l.actual, key: l.key });
}
const headers = rows.filter(r => r._type === 'header');
assert(headers.length === 7, `header 数=7（设备组#1/集成开发/人工/费用/风险/商业/质保） 实际=${headers.length}`);
assert(headers[0].category === '设备组 #1' && headers[0].estimated === 2500, `设备组#1 header est=2500`);
assert(headers[1].category === '集成开发' && headers[1].estimated === 2000, `集成开发 header est=2000`);
assert(headers[2].category === '人工成本' && headers[2].estimated === 4060, `人工成本 header est=4060（2800+1020+240）`);
assert(headers[3].category === '项目费用' && headers[3].estimated === 1000, `项目费用 header est=1000`);
assert(headers[4].category === '风险费用' && headers[4].estimated === 287, `风险费用 header est=287`);
assert(headers[5].category === '商业费用' && headers[5].estimated === 500, `商业费用 header est=500`);
assert(headers[6].category === '质保费用' && headers[6].estimated === 29, `质保费用 header est=29`);
assert(rows.filter(r => r._type === 'item').length === 10, `item 行数=10`);

console.log('');
if (failures === 0) console.log('ALL PASS');
else { console.error(`${failures} FAILURES`); process.exit(1); }
