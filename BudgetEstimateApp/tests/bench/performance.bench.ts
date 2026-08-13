import { describe, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { buildCostLines } from '../../src/utils/costBreakdown';
import { computeCostComponents } from '../../src/utils/calculations';
import type { Group } from '../../src/types';

// ── Budget 成本核算纯函数性能基准（真实形状大样本，测量工具、无断言）──
// 运行：npm run bench（vitest.bench.config.ts，不进默认 build 门禁）
// 目标：报价编制表/成本对比的批量核算耗时基线，防灾难级回归。

interface BenchRow { fn: string; median_ms: string; mean_ms: string; ops_per_s: number }

function measure(fn: () => unknown, iterations: number): Omit<BenchRow, 'fn'> {
  fn(); // 预热
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const mean = times.reduce((s, t) => s + t, 0) / iterations;
  return { median_ms: median.toFixed(2), mean_ms: mean.toFixed(2), ops_per_s: Math.round(1000 / mean) };
}

const GT = ['EQUIPMENT', 'INTEGRATION', 'PROJECT_DELIVERY', 'OTHER'];
const GROUPS = 200;
const ITEMS = 10;
const version = { riskRate: 0.05, warrantyRate: 0.02, commercialCost: 100 };

const groups: Group[] = [];
for (let g = 0; g < GROUPS; g++) {
  const items = [];
  for (let i = 0; i < ITEMS; i++) {
    items.push({
      id: `g${g}i${i}`, code: `C-${g}-${i}`, description: '物料项',
      qtyTotal: 2, unitCost: 100, directCost: 200, hasWarranty: i % 3 === 0,
    });
  }
  groups.push({ id: `g${g}`, name: `组${g}`, groupType: GT[g % GT.length], sortOrder: g, items } as Group);
}

describe('Budget 成本核算纯函数基准（真实形状 200 组 × 10 项 = 2000 行）', () => {
  it('输出各函数中位数耗时与吞吐（测量工具，无断言）', () => {
    const rows: BenchRow[] = [
      { fn: 'buildCostLines(成本对比行)', ...measure(() => buildCostLines(groups, {}, version), 20) },
      { fn: 'computeCostComponents(成本汇总)', ...measure(() => computeCostComponents(groups, version), 20) },
    ];
    console.table(rows);
  });
});
