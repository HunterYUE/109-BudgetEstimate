import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── 业务规则审计回归测试（2026-08-14 双应用业务逻辑/规则审计）──
// 覆盖：C1 工时管理员建号越级保护、C2 审批类型枚举白名单、C3/C4 交付节点输入防御（history 数组 + status 枚举）。
// 沿用 route-guards.test.ts / audit-fixes.test.ts 的「静态源码断言」模式（无 DB 连接，无 mock 数据）。

const src = (rel: string) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8');

describe('C1：工时管理员建号越级保护（director 不得铸 admin）', () => {
  const tr = src('routes/timerecording.ts');

  it('POST /admin/users 创建路径含 assertCanManage（与 reset-password 同级防线，防 director 铸 admin 号）', () => {
    const create = tr.slice(
      tr.indexOf("router.post('/admin/users'"),
      tr.indexOf("router.post('/admin/users/:id/reset-password'"),
    );
    expect(create).toMatch(/assertCanManage\(req\.user!\.role, ROLE_RANK\[role\] \?\? 0\)/);
  });
});

describe('C2：审批类型枚举白名单（PG 枚举非法值防 500）', () => {
  const a = src('routes/approvals.ts');

  it('创建前校验 approval_type ∈ [quotation, plan, cost, promote] → 非法值 400', () => {
    expect(a).toMatch(/\[\s*'quotation'\s*,\s*'plan'\s*,\s*'cost'\s*,\s*'promote'\s*\]/);
    expect(a).toMatch(/无效审批类型/);
  });
});

describe('C3+C4：交付节点输入防御（history 数组 + status 枚举）', () => {
  const d = src('routes/deliveries.ts');

  it('history 非数组 → 400 拒绝（防畸形 JSON 入库、渲染 .find/.map 崩溃）', () => {
    expect(d).toMatch(/!Array\.isArray\(node\.history\)/);
    expect(d).toMatch(/history 必须为数组/);
  });

  it('node.status 枚举白名单 → 400 拒绝（防 PG 枚举错误被 500 吞掉）', () => {
    expect(d).toMatch(/\[\s*'pending'\s*,\s*'in_progress'\s*,\s*'completed'\s*\]/);
    expect(d).toMatch(/状态非法/);
  });
});
