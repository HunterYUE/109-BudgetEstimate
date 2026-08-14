import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── 业务规则审计回归测试（2026-08-14 双应用业务逻辑/规则审计，Budget 侧）──
// 覆盖：A2 Dashboard 节点按时率无基线不判定、B5 节点15完成门禁、B1/A1 qtyTotal 合法 0 不被吞。
// 纯函数逻辑已在 calculations.test.ts / analysisShared.test.ts 直测；此处静态断言组件/工具
// 确实引用共享函数（防回退为内联的旧缺陷实现），沿用 auditAppFixes.test.ts 的源码断言模式。

const src = (rel: string) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8');

describe('A2：Dashboard 节点按时率引用共享函数（无基线不判定，与 DeliveryAnalysis 口径一致）', () => {
  const dash = src('pages/Dashboard.tsx');
  it('使用 computeProjectOnTimeRate 而非内联 `node.actualDate || delay.delayed` 过滤', () => {
    expect(dash).toContain('computeProjectOnTimeRate');
    expect(dash).not.toMatch(/scheduled = due\.filter\(\(\{ node, delay \}\) => node\.actualDate \|\| delay\.delayed\)/);
  });
});

describe('B5：DeliveryDetail 节点15完成门禁（成本审批 + 其余全部节点）', () => {
  const dd = src('pages/DeliveryDetail.tsx');
  it('节点15 切换 completed 时调用 projectCompletionGate（不再仅校验 costStatus）', () => {
    expect(dd).toContain('projectCompletionGate');
    expect(dd).not.toMatch(/targetNode\.nodeNo === 15 && project\.costStatus !== 'approved'/);
  });
  it('「完成项目」按钮同样走 projectCompletionGate（全部节点 + 成本）', () => {
    expect(dd).toMatch(/projectCompletionGate\(project\.nodes, project\.costStatus\)\.ok/);
  });
});

describe('B1/A1：qtyTotal 合法 0 不被 `|| 1` 吞（成本计算用 `?? 1` 保留 0）', () => {
  it('calculations.ts 无 `qtyTotal || 1` 残留', () => {
    expect(src('utils/calculations.ts')).not.toContain('item.qtyTotal || 1');
    expect(src('utils/calculations.ts')).toContain('item.qtyTotal ?? 1');
  });
  it('costBreakdown.ts 无 `qtyTotal || 1` 残留', () => {
    expect(src('utils/costBreakdown.ts')).not.toContain('item.qtyTotal || 1');
  });
});
