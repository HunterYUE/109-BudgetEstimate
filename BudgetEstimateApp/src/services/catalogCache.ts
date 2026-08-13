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
// B2：waiter 记录注册时的 gen——失效后才加入的调用方不得被在途旧请求结果满足（否则拿到陈旧数据且缓存未写回，永不再刷新）
const catalogWaiters: Array<{ gen: number; resolve: (data: Component[]) => void }> = [];

/** 主动失效缓存（保存/删除/审核物料后调用） */
export function invalidateCatalogCache(): void {
  catalogCache = null;
  catalogGen++; // 使进行中的旧请求结果不再回写缓存，避免失效后仍被陈旧数据覆盖
}

export function loadCatalog(): Promise<Component[]> {
  const now = Date.now();
  if (catalogCache && now - catalogCacheAt < CACHE_TTL_MS) return Promise.resolve(catalogCache);
  if (catalogLoading) {
    const gen = catalogGen;
    return new Promise(resolve => { catalogWaiters.push({ gen, resolve }); });
  }
  return fetchCatalog(catalogGen);
}

function fetchCatalog(gen: number): Promise<Component[]> {
  catalogLoading = true;
  // ⚠️ 传 limit:'1000'：物料目录是报价编码下拉唯一数据源，默认 100 会截断合法编码（与 QuotationPage 校验的 1000 条不一致）
  return componentService.list({ limit: '1000' }).then(data => {
    catalogLoading = false;
    // 同代 waiter 用本次结果满足；失效后（gen 落后）的 waiter 不拿旧数据——经 loadCatalog() 重新发起新代加载
    const sameGen: Array<(d: Component[]) => void> = [];
    const staleGen: Array<(d: Component[]) => void> = [];
    for (const w of catalogWaiters) (w.gen === gen ? sameGen : staleGen).push(w.resolve);
    catalogWaiters.length = 0;
    if (gen === catalogGen) {
      catalogCache = data || [];
      catalogCacheAt = Date.now();
    }
    sameGen.forEach(r => r(data || []));
    // 失效后加入的 waiter 不拿旧数据——以当前代重新发起加载；仅首个真正发请求，其余挂到同一新请求上
    if (staleGen.length) {
      const fresh = fetchCatalog(catalogGen);
      staleGen.forEach(r => fresh.then(r));
    }
    return data || [];
  }).catch(() => {
    catalogLoading = false;
    catalogWaiters.forEach(w => w.resolve([]));
    catalogWaiters.length = 0;
    return [];
  });
}
