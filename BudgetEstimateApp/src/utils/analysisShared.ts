import type { Group } from '../types';
import { projectService } from '../services/projectService';
import { api } from './api';

/** 格式化数字为千单位显示（如 1234 → "1K"） */
export const fmtK = (v: number) => Math.round(v / 1000).toLocaleString() + 'K';
/** 压缩销售编号：A2026-07-003-S → 2607003S */
export const compressNo = (sn: string | undefined | null): string => {
  const m = sn && sn.match(/^A(\d{4})-(\d{2})-(\d{3})-(.)(-.)?$/);
  if (m) return m[1].slice(2) + m[2] + m[3] + m[4] + (m[5] || '');
  return sn || '';
};

/** 财年选项列表 */
export const FY_OPTIONS = ['FY2425', 'FY2526', 'FY2627'] as const;

// 缓存已加载的项目数据，避免重复请求
const CACHE_MAX_SIZE = 200;
const projectCache = new Map<string, { groups: Group[]; version?: { warrantyRate: number; riskRate: number; taxRate: number; commercialCost: number } }>();

/**
 * 预加载报价数据到缓存（供同步 loadQuotationGroups 使用）
 * 流程：报价ID → 查 quotation → 取 project_id → 加载项目完整数据
 */
export async function preloadQuotationGroups(quotationId: string | undefined | null, noCache?: boolean): Promise<void> {
  if (!quotationId) return;
  if (projectCache.has(quotationId) && !noCache) return;
  try {
    // 1. 先查报价获取 project_id + version_no（api.get 自动注入 token、toCamel、错误处理）
    const quote = await api.get<Record<string, unknown>>(`/quotations/${quotationId}`, noCache ? { noCache: true } : undefined);
    const projectId = quote.projectId as string | undefined;
    if (!projectId) throw new Error('报价缺少 projectId');
    const quoteVerNo = quote.versionNo || '';

    // 2. 再加载项目完整数据
    const project = await projectService.getFull(projectId, noCache ? { noCache: true } : undefined);
    // ⚠️ 按版本过滤组数据，避免加载全量组导致成本对比表重复显示多条设备组
    const version = project.versions?.find((v: any) => v.versionNo === quoteVerNo) || project.versions?.[0];
    const versionId = version?.id || '';
    const versionGroups = (project.groups || []).filter((g: any) =>
      g.versionId === versionId
    );
    // 版本过滤未命中时回退全量组（兼容旧数据），避免成本对比表空白
    const finalGroups = versionGroups.length > 0 ? versionGroups : (project.groups || []);
    // 淘汰最旧条目
    if (projectCache.size > CACHE_MAX_SIZE) {
      const firstKey = projectCache.keys().next().value;
      if (firstKey) projectCache.delete(firstKey);
    }
    projectCache.set(quotationId, {
      groups: finalGroups.map((g: any) => ({
        ...g,
        items: (g.items || []).map((i: any) => ({ ...i })),
      })),
      version: version ? {
        warrantyRate: version.warrantyRate ?? 0,
        riskRate: version.riskRate ?? 0,
        taxRate: version.taxRate ?? 0.13,
        commercialCost: version.commercialCost ?? 0,
      } : undefined,
    });
  } catch (err) {
    console.warn('[preloadQuotationGroups] 加载报价数据失败:', quotationId, (err as Error).message);
    projectCache.set(quotationId, { groups: [], version: undefined });
  }
}

/**
 * 从缓存同步获取报价编制数据（保持与原有同步接口兼容）
 */
export function loadQuotationGroups(quotationId: string | undefined | null): {
  groups: Group[];
  version?: { warrantyRate: number; riskRate: number; taxRate: number; commercialCost: number };
} {
  if (!quotationId) return { groups: [], version: undefined };
  return projectCache.get(quotationId) || { groups: [], version: undefined };
}

/** 批量预加载（完成后递增版本号，触发 useMemo 重新计算） */
export async function preloadQuotationGroupsBatch(ids: string[], noCache?: boolean): Promise<void> {
  await Promise.all(ids.map(id => preloadQuotationGroups(id, noCache)));
  bumpPreloadVersion();
}

/** 缓存版本号（预加载完成后递增，用于触发 useMemo 重新计算） */
let _preloadVersion = 0;
export function getPreloadVersion(): number { return _preloadVersion; }
export function bumpPreloadVersion(): void { _preloadVersion++; }

/** 清除项目缓存（用于重新加载） */
export function clearQuotationCache() { projectCache.clear(); }
