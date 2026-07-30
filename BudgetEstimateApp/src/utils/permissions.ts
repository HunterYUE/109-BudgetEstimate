/* ============================================================
   权限系统 — 角色 → 页面可见性映射
   用途：路由守卫、侧边栏过滤、按钮显隐
   ============================================================ */

/** 路由路径 → 允许访问的角色列表 */
export const ROUTE_PERMISSIONS: Record<string, string[]> = {
  // 所有登录用户可见
  '/':              ['user', 'manager', 'admin', 'director'],
  // 销售分析
  '/analysis':      ['user', 'manager', 'admin', 'director'],
  // 销售管理
  '/opportunities': ['user', 'manager', 'admin', 'director'],
  // 报价列表 & 报价编制
  '/quotations':    ['user', 'manager', 'admin', 'director'],
  // 交付分析
  '/delivery-analysis': ['manager', 'admin', 'director'],
  // 交付管理 & 交付详情
  '/delivery':      ['manager', 'admin', 'director'],
  // 审批管理
  '/approval':      ['admin', 'director'],
  // 标签管理
  '/tags':          ['manager', 'admin', 'director'],
  // 物料管理
  '/materials':     ['manager', 'admin', 'director'],
  // 客户管理
  '/clients':       ['user', 'manager', 'admin', 'director'],
  // 系统管理
  '/settings':      ['admin', 'director'],
};

/** 侧边栏菜单项对应的路由 key → 角色列表（与菜单结构一一对应） */
export const MENU_ROLES: Record<string, string[]> = {
  '/':                  ['user', 'manager', 'admin', 'director'],
  '/analysis':          ['user', 'manager', 'admin', 'director'],
  '/opportunities':     ['user', 'manager', 'admin', 'director'],
  '/quotations':        ['user', 'manager', 'admin', 'director'],
  '/delivery-analysis': ['manager', 'admin', 'director'],
  '/delivery':          ['manager', 'admin', 'director'],
  '/approval':          ['admin', 'director'],
  '/tags':              ['manager', 'admin', 'director'],
  '/materials':         ['manager', 'admin', 'director'],
  '/clients':           ['user', 'manager', 'admin', 'director'],
  '/settings':          ['admin', 'director'],
};

/** 检查某角色是否有权限访问指定路由 */
export function canAccessRoute(role: string | undefined, path: string): boolean {
  if (!role) return false;
  // 精确匹配
  if (ROUTE_PERMISSIONS[path]) return ROUTE_PERMISSIONS[path].includes(role);
  // 前缀匹配（如 /delivery/xxx, /quotations/xxx）
  const prefix = '/' + path.split('/')[1];
  if (ROUTE_PERMISSIONS[prefix]) return ROUTE_PERMISSIONS[prefix].includes(role);
  // 默认允许（兜底）
  return true;
}

/** 检查某角色是否有权限查看侧边栏菜单项 */
export function canSeeMenu(role: string | undefined, menuKey: string): boolean {
  if (!role) return false;
  const allowed = MENU_ROLES[menuKey];
  return allowed ? allowed.includes(role) : true;
}
