import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { errorHandler } from '../src/middleware/errorHandler.js';

// ── 审计修复回归测试（2026-08-14 全量审计）──
// 覆盖：BE-1 版本审批绕过、BE-2 交付创建敏感字段、BE-4 审批并发重复、BE-5 基线不可变、
//       BE-7 提交人服务端派生、BE-8 节点越权、DB-1 schema 缺列、BE-6 唯一约束 409 兜底。
// 沿用 route-guards.test.ts 的「静态源码断言 + 纯函数直测」模式（无 DB 连接，无 mock 数据）。

const src = (rel: string) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8');

describe('BE-1：POST /project-versions 审批终态禁直设（防 ON CONFLICT 绕过审批状态机）', () => {
  const idx = src('routes/index.ts');

  it('review_status 白名单收敛为 draft/pending（approved/rejected 只能经审批流）', () => {
    expect(idx).toContain("!['draft', 'pending'].includes(review_status)");
  });

  it('旧白名单（含终态）不得残留', () => {
    expect(idx).not.toContain("['draft', 'pending', 'approved', 'rejected']");
  });

  it('「已有版本可直设终态」的豁免逻辑必须移除', () => {
    expect(idx).not.toContain("!existingVer && ['approved', 'rejected'].includes(review_status)");
  });
});

describe('BE-2：POST /deliveries 创建禁直写实际成本/终止标记', () => {
  const d = src('routes/deliveries.ts');

  it('excludeOnCreate 含 total_actual_cost/actual_costs/terminated', () => {
    expect(d).toMatch(/excludeOnCreate:\s*\[[^\]]*'total_actual_cost'[^\]]*\]/);
    expect(d).toMatch(/excludeOnCreate:\s*\[[^\]]*'actual_costs'[^\]]*\]/);
    expect(d).toMatch(/excludeOnCreate:\s*\[[^\]]*'terminated'[^\]]*\]/);
  });

  it('status 仍可创建直写（转交付流程传「进行中」，不得误剔）', () => {
    const createLine = d.match(/excludeOnCreate:\s*\[([^\]]*)\]/)?.[1] || '';
    expect(createLine).not.toMatch(/'(?:^|, )status(?:,|')/);
  });
});

describe('BE-4：审批创建并发去重（父实体行 FOR UPDATE 串行化）', () => {
  const a = src('routes/approvals.ts');

  it('查重前先锁父实体行', () => {
    expect(a).toMatch(/SELECT 1 FROM \$\{parentTable\} WHERE id = \$1 FOR UPDATE/);
    expect(a).toContain('parentTable');
  });
});

describe('BE-5：节点基线不可覆盖（库中审批基线优先）', () => {
  const d = src('routes/deliveries.ts');

  it('baseline 以 baselineMap 优先，客户端值仅作无基线兜底', () => {
    expect(d).toContain('const baseline = baselineMap[node.node_no] || node.baseline_planned_end_date || null;');
    expect(d).not.toContain('const baseline = node.baseline_planned_end_date || baselineMap[node.node_no] || null;');
  });
});

describe('BE-7：审批提交人服务端派生（防客户端伪造）', () => {
  const a = src('routes/approvals.ts');

  it('submitter 排除出客户端可写字段', () => {
    expect(a).toMatch(/!\[[^\]]*'submitter'[^\]]*\]/);
  });

  it('submitter 从登录用户 display_name 派生', () => {
    expect(a).toContain("body.submitter = req.user?.display_name || '审批申请人';");
  });
});

describe('BE-8：已审批计划交付的节点修改须交付管理权限', () => {
  const d = src('routes/deliveries.ts');

  it('plan_status=approved 且无交付管理权限时拒绝', () => {
    expect(d).toContain("if (dp.plan_status === 'approved' && !req.user?.permissions?.includes('交付管理')) {");
    expect(d).toContain('throw new AppError(403');
  });
});

describe('DB-1：schema.sql users 表缺 password_changed_at（全新部署 auth 500）', () => {
  const schema = readFileSync(fileURLToPath(new URL('../../BudgetEstimateApp/database/schema.sql', import.meta.url)), 'utf8');

  it('users 表定义含 password_changed_at 列', () => {
    expect(schema).toContain('password_changed_at TIMESTAMPTZ');
  });
});

describe('BE-6：机会编号唯一约束冲突映射 409（A107 锁之外的兜底，钉住既有行为）', () => {
  it('errorHandler 把 PG 23505 映射为 409「数据已存在」', () => {
    const statusSpy = { code: 0 };
    const jsonBody: Record<string, unknown> = {};
    const mockRes = {
      headersSent: false,
      status(code: number) { statusSpy.code = code; return this; },
      json(body: Record<string, unknown>) { Object.assign(jsonBody, body); return this; },
    } as unknown as Parameters<typeof errorHandler>[2];
    const err = Object.assign(new Error('duplicate'), { code: '23505', severity: 'ERROR', message: 'duplicate key', detail: 'Key (sales_no)=(A2026-08-001-S) already exists' });
    errorHandler(err, {} as never, mockRes, (() => {}) as never);
    expect(statusSpy.code).toBe(409);
    expect(jsonBody.error).toBe('数据已存在');
  });

  it('错误信息不透传 DB detail（防 SQL 结构泄漏）', () => {
    const jsonBody: Record<string, unknown> = {};
    const mockRes = {
      headersSent: false,
      status() { return this; },
      json(body: Record<string, unknown>) { Object.assign(jsonBody, body); return this; },
    } as unknown as Parameters<typeof errorHandler>[2];
    const err = Object.assign(new Error('duplicate'), { code: '23505', severity: 'ERROR', message: 'duplicate key', detail: 'Key (sales_no)=(A2026-08-001-S) already exists' });
    errorHandler(err, {} as never, mockRes, (() => {}) as never);
    expect(JSON.stringify(jsonBody)).not.toContain('sales_no');
  });
});
