import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getCascadePrefixes } from '../src/utils/api';

// ── 审计应用层修复回归测试（2026-08-14 全量审计 Budget）──
// 覆盖：BU-1' 转交付金额口径、BU-2 报价财年口径、BU-3 重入守卫、BU-4 审批创建级联清缓存、
//       BU-5 物料审核本地伪造、BU-6 提交审批非原子回滚、BU-7 版本兜底、BU-9 提交人过滤器。
// 组件内 hooks 逻辑用静态源码断言（与后端 audit-fixes.test.ts 同模式）；可纯函数化的（BU-4）直测。

const src = (rel: string) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8');

describe('BU-4：POST /approvals 创建审批触发跨资源级联清缓存（plan/cost 改交付、promote 改机会）', () => {
  it('GET 无关路径不级联', () => {
    expect(getCascadePrefixes('/quotations/sync')).toEqual([]);
    expect(getCascadePrefixes('/projects/123')).toEqual([]);
  });
  it('project-versions / project-groups 改写项目计算字段 → 清 /projects', () => {
    expect(getCascadePrefixes('/project-versions')).toEqual(['/projects']);
    expect(getCascadePrefixes('/project-groups/123')).toEqual(['/projects']);
  });
  it('POST /approvals 创建（无 /records 后缀）→ 清报价/项目/交付/机会四资源', () => {
    expect(getCascadePrefixes('/approvals')).toEqual(['/quotations', '/projects', '/deliveries', '/opportunities']);
  });
  it('POST /approvals/:id/records 审批动作 → 同样清四资源（既有行为保持）', () => {
    expect(getCascadePrefixes('/approvals/abc/records')).toEqual(['/quotations', '/projects', '/deliveries', '/opportunities']);
  });
});

describe('BU-1\'：转交付金额取报价折后价（quotationAmount），与 UI 显示同口径', () => {
  const sol = src('pages/SalesOpportunityList.tsx');
  it('confirmDeliver 的 contractAmount 优先 quotationAmount', () => {
    expect(sol).toContain('contractAmount: opp.quotationAmount ?? opp.amount');
  });
});

describe('BU-2：报价列表财年归属仅按创建时间（编辑/同步不再把报价搬进新财年）', () => {
  const ql = src('pages/QuotationList.tsx');
  it('inFy 不再以 updatedAt 判定归属', () => {
    expect(ql).not.toMatch(/updated >= fyRange/);
    expect(ql).not.toContain('(updated >= fyRange.start && updated <= fyRange.end)');
  });
  it('inFy 仍以 createdAt 判定归属', () => {
    expect(ql).toContain('created >= fyRange.start && created <= fyRange.end');
  });
});

describe('BU-3：审批确认/交付提交加重入守卫（防双击并发）', () => {
  const al = src('pages/ApprovalList.tsx');
  it('ApprovalList confirmApproval 有提交中守卫', () => {
    expect(al).toMatch(/submittingRef|approvingRef|confirmingRef/);
    expect(al).toMatch(/if\s*\([^)]*(?:submittingRef|approvingRef)\.current\)\s*return/);
  });
  const dd = src('pages/DeliveryDetail.tsx');
  it('DeliveryDetail confirmSubmitPlan/handleSubmitCost 复用提交中锁', () => {
    expect(dd).toMatch(/const confirmSubmitPlan = useCallback\(async \(\) => \{[\s\S]*?if \(!project \|\| submittingApproval\) return/);
    expect(dd).toMatch(/const handleSubmitCost = useCallback\(async \(\) => \{[\s\S]*?if \(!project \|\| submittingApproval\) return/);
  });
});

describe('BU-5：物料审核失败不再本地伪造状态（与 saveEdit B7 同口径）', () => {
  const mm = src('pages/MaterialManagement.tsx');
  it('本地伪造状态模式（setMaterials map 覆盖 reviewStatus）已整体移除', () => {
    expect(mm).not.toMatch(/setMaterials\(prev => prev\.map\(c =>/);
  });
  it('审核失败仅提示错误，不静默', () => {
    expect(mm).toContain("'审核失败，请重试'");
    expect(mm).toContain("'驳回失败，请重试'");
  });
});

describe('BU-6：提交审批非原子——失败后回滚 pending 状态（防刷新锁死）', () => {
  const qp = src('pages/QuotationPage.tsx');
  it('handleSubmit catch 中把版本 reviewStatus 回滚为非 pending', () => {
    expect(qp).toMatch(/catch[\s\S]*?reviewStatus: (?:restoreStatus|priorVerStatus)/);
    expect(qp).toMatch(/reviewStatus: 'pending'[\s\S]*?reviewStatus: (?:restoreStatus|priorVerStatus)/);
  });
});

describe('BU-7：confirmPromote 不再回退到任意已审批版本（与后端按报价版本精确取数一致）', () => {
  const sol = src('pages/SalesOpportunityList.tsx');
  it('移除 find(v => v.reviewStatus === approved) 兜底', () => {
    expect(sol).not.toContain('projectData.versions?.find(v => v.reviewStatus === \'approved\')');
  });
});

describe('BU-9：审批「我的提交」过滤器与后端 submitter 兜底名对齐（BE-7）', () => {
  const al = src('pages/ApprovalList.tsx');
  it('displayName 空时回退审批申请人，而非空串（空串永不匹配落库名）', () => {
    expect(al).toContain("user?.displayName || '审批申请人'");
  });
});
