// ── 权限守卫配置（F2/H1/A1 审计收敛）：全部路由守卫权限集唯一来源 ──
// routes/index.ts 引用本模块常量注册守卫；单测（tests/permissions.test.ts）锁定
// 「只读页面权限不得混入写守卫」不变量，防 A1 类配置漂移回归。

/** 万能权限（readGuard/writeGuard 通用兜底；写守卫须显式列入才生效） */
export const PERM_ALL = '全部查看权限';

/** 纯只读页面权限：只出现在 readGuard，绝不允许混入 writeGuard——
 *  否则 hasPermission 的 OR（任一命中）会让仅持页面查看权的用户也能增删改（越权写）。
 *  注：审批管理/销售机会管理 是模块级权限（分别含审批处理、转交付写能力），不在此列。 */
export const PAGE_VIEW_ONLY_PERMS = [
  '物料管理', '客户管理', '仪表盘查看', '销售分析', '交付分析', '报价列表查看',
] as const;

/** 各资源写守卫（非 GET 需满足任一）——A1 修复后只含写动作权限 + 万能权限 */
export const WRITE_GUARD: Record<string, string[]> = {
  components: ['新增物料', PERM_ALL],
  projects: ['报价编制', PERM_ALL],
  opportunities: ['编辑销售机会', '新建信息/线索/机会', '转线索/转机会', '销售蓝表编辑', PERM_ALL],
  quotations: ['报价编制', PERM_ALL],
  clients: ['新建客户', PERM_ALL],
  tags: ['新建标签', PERM_ALL],
  'project-versions': ['报价编制', PERM_ALL],
  'project-groups': ['报价编制', PERM_ALL],
};

/** 各资源读守卫（GET 需满足任一）——读取方并集：报价编制/交付管理/审批等跨资源读取必须纳入 */
export const READ_GUARD: Record<string, string[]> = {
  components: ['物料管理', '报价编制', '交付管理', PERM_ALL],
  projects: ['报价编制', '交付管理', '销售机会管理', PERM_ALL],
  opportunities: ['销售机会管理', '编辑销售机会', '报价编制', '仪表盘查看', '销售分析', PERM_ALL],
  quotations: ['报价列表查看', '报价编制', '交付管理', '销售机会管理', '仪表盘查看', '销售分析', '交付分析', '审批管理', PERM_ALL],
  deliveries: ['交付管理', '销售机会管理', '仪表盘查看', '销售分析', '交付分析', '审批管理', PERM_ALL],
  approvals: ['审批管理', PERM_ALL],
  clients: ['客户管理', '报价编制', '销售机会管理', PERM_ALL],
  'audit-logs': ['用户管理', '系统配置', PERM_ALL],
};

/** 审批写守卫（按 approval_type 拆分）：创建方须持对应模块写权限；无 type 走兜底审批管理 */
export const APPROVAL_WRITE: Record<string, string[]> = {
  quotation: ['报价编制', PERM_ALL],
  plan: ['交付管理', PERM_ALL],
  cost: ['交付管理', '成本录入', PERM_ALL],
  promote: ['转线索/转机会', PERM_ALL],
};
/** 审批通用写守卫（审批处理 POST /:id/records、通用 PUT/DELETE） */
export const APPROVAL_WRITE_FALLBACK = ['审批管理', PERM_ALL];

/** 交付写守卫按方法拆分：转交付链路（创建 POST + 节点保存 PUT /:id/nodes）允许销售机会管理，
 *  其余写操作（改成本/删交付/附件管理/改状态等）须交付管理 */
export const DELIVERY_CREATE_WRITE = ['交付管理', '销售机会管理', PERM_ALL];
export const DELIVERY_OTHER_WRITE = ['交付管理', PERM_ALL];

/** 检查写守卫列表是否混入纯只读页面权限（A1 配置漂移回归）。返回违规权限列表 */
export function findPageViewLeaks(
  writePerms: string[],
  pageViewOnly: readonly string[] = PAGE_VIEW_ONLY_PERMS,
): string[] {
  return pageViewOnly.filter(p => writePerms.includes(p));
}

/** 审批写守卫选择（routes/index.ts /approvals 挂载用）：
 *  按 approval_type 选对应模块写权限；无 type 或未知 type 走审批管理兜底（防未知类型空放行） */
export function selectApprovalPerms(approvalType: string | undefined): string[] {
  const perms = approvalType ? APPROVAL_WRITE[approvalType] : undefined;
  return perms || APPROVAL_WRITE_FALLBACK;
}

/** 交付写守卫选择（routes/index.ts /deliveries 挂载用）：
 *  转交付链路（创建 POST + 节点保存 PUT /:id/nodes）→ DELIVERY_CREATE_WRITE（允许销售机会管理），
 *  其余写操作（改成本/删交付/附件管理/改状态等）→ DELIVERY_OTHER_WRITE（须交付管理） */
export function selectDeliveryPerms(method: string, path: string): string[] {
  if (method === 'POST' || (method === 'PUT' && path.endsWith('/nodes'))) return DELIVERY_CREATE_WRITE;
  return DELIVERY_OTHER_WRITE;
}
