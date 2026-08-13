import { componentService } from './componentService';
import type { Component } from '../types';

// 组件目录缓存（模块级，避免重复加载）
// ⚠️ B2：加 5 分钟 TTL——物料库变更后报价页编码下拉/红!校验不再陈旧；
// MaterialManagement 保存/删除/审核后调用 invalidateCatalogCache() 主动失效，下次加载立即拉新。
const CACHE_TTL_MS = 5 * 60 * 1000;

let catalogCache: Component[] | null = null;
let catalogCacheAt = 0;
let catalogGen = 0;
let catalogLoading = false;
const catalogWaiters: Array<(data: Component[]) => void> = [];

/** 主动失效缓存（保存/删除/审核物料后调用） */
export function invalidateCatalogCache(): void {
  catalogCache = null;
  catalogGen++; // 使进行中的旧请求结果不再回写缓存，避免失效后仍被陈旧数据覆盖
}

export function loadCatalog(): Promise<Component[]> {
  const now = Date.now();
  if (catalogCache && now - catalogCacheAt < CACHE_TTL_MS) return Promise.resolve(catalogCache);
  if (catalogLoading) {
    return new Promise(resolve => { catalogWaiters.push(resolve); });
  }
  catalogLoading = true;
  const gen = catalogGen;
  // ⚠️ 传 limit:'1000'：物料目录是报价编码下拉唯一数据源，默认 100 会截断合法编码（与 QuotationPage 校验的 1000 条不一致）
  return componentService.list({ limit: '1000' }).then(data => {
    catalogLoading = false;
    catalogWaiters.forEach(r => r(data || []));
    catalogWaiters.length = 0;
    if (gen === catalogGen) {
      catalogCache = data || [];
      catalogCacheAt = Date.now();
    }
    return data || [];
  }).catch(() => {
    catalogLoading = false;
    catalogWaiters.forEach(r => r([]));
    catalogWaiters.length = 0;
    return [];
  });
}
