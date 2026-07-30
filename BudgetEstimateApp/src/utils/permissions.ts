/* ============================================================
   权限系统 — 按人员分配的可调权限
   每个用户有自己的 permissions[]，可随时在系统管理中调整
   ============================================================ */

/** 路由路径 → 所需的权限（满足其一即可） */
const ROUTE_REQUIRED_PERMS: Record<string, string[]> = {
  '/':                ['仪表盘查看'],
  '/analysis':        ['销售分析', '全部查看权限'],
  '/opportunities':   ['销售机会管理', '全部查看权限'],
  '/quotations':      ['报价列表查看', '报价编制', '全部查看权限'],
  '/delivery-analysis': ['交付分析', '全部查看权限'],
  '/delivery':        ['交付管理', '全部查看权限'],
  '/approval':        ['审批管理', '全部查看权限'],
  '/tags':            ['新建标签', '全部查看权限'],
  '/materials':       ['物料管理', '全部查看权限'],
  '/clients':         ['客户管理', '全部查看权限'],
  '/settings':        ['用户管理', '系统配置', '全部查看权限'],
};

/** 侧边栏菜单项 → 所需的权限（与 ROUTE_REQUIRED_PERMS 一致） */
const MENU_REQUIRED_PERMS: Record<string, string[]> = ROUTE_REQUIRED_PERMS;

/**
 * 检查用户的权限数组是否有权访问指定路由
 * @param permissions 用户的权限列表（从 user.permissions 获取）
 * @param path 请求的路由路径
 */
export function canAccessRoute(permissions: string[] | undefined, path: string): boolean {
  if (!permissions || permissions.length === 0) return false;
  // 精确匹配
  if (ROUTE_REQUIRED_PERMS[path]) {
    return ROUTE_REQUIRED_PERMS[path].some(p => permissions.includes(p));
  }
  // 前缀匹配（如 /delivery/xxx, /quotations/xxx）
  const prefix = '/' + path.split('/')[1];
  const required = ROUTE_REQUIRED_PERMS[prefix];
  if (required) return required.some(p => permissions.includes(p));
  // 兜底：未知路径默认放行
  return true;
}

/**
 * 检查用户是否有权限查看侧边栏菜单项
 */
export function canSeeMenu(permissions: string[] | undefined, menuKey: string): boolean {
  if (!permissions || permissions.length === 0) return false;
  const required = MENU_REQUIRED_PERMS[menuKey];
  if (!required) return true;
  return required.some(p => permissions.includes(p));
}
