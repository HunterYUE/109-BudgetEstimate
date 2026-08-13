import type { ComponentType } from 'react';

/**
 * 页面懒加载映射（B9：App.tsx 路由与 AppLayout 悬停预加载的单一来源）
 * App.tsx 用它构造 lazy 组件，AppLayout 用它在菜单悬停时预取对应 chunk，
 * 避免两处各自维护 import 映射导致增删页面时漏改。
 */
export const pageLoaders: Record<string, () => Promise<{ default: ComponentType }>> = {
  '/': () => import('../pages/Dashboard'),
  '/analysis': () => import('../pages/SalesAnalysis'),
  '/opportunities': () => import('../pages/SalesOpportunityList'),
  '/quotations': () => import('../pages/QuotationList'),
  '/quotations/:id': () => import('../pages/QuotationPage'),
  '/approval': () => import('../pages/ApprovalList'),
  '/delivery': () => import('../pages/DeliveryManagement'),
  '/delivery/:id': () => import('../pages/DeliveryDetail'),
  '/delivery-analysis': () => import('../pages/DeliveryAnalysis'),
  '/tags': () => import('../pages/TagManagement'),
  '/materials': () => import('../pages/MaterialManagement'),
  '/clients': () => import('../pages/ClientManagement'),
  '/settings': () => import('../pages/SystemManagement'),
};
