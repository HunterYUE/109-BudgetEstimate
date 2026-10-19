/**
 * API 基础客户端 - 封装 fetch，统一处理错误、环境配置
 *
 * 命名规范边界：这是前后端 camelCase/snake_case 的转换层。
 * GET 响应自动 toCamel() 转驼峰，POST/PUT body 自动 toSnake() 转蛇形。
 * 所有 API 通信必须走此客户端；认证接口（login/logout/me）因 HttpOnly cookie 需原生 fetch 除外。
 * 详见 memory/naming-convention-standard.md
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';

// ── GET 请求缓存（30 秒 TTL，避免页面切换重复请求） ──
const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 30_000;
/** 缓存代际：写请求清缓存时递增。慢 GET 响应只有在代际未变时才允许回写，
 *  否则「请求在途 → 写请求清缓存 → 旧响应返回」会把陈旧数据重新写回缓存 30 秒。 */
let cacheEpoch = 0;
/** 请求超时（毫秒）：网络半开/后端卡住时避免 loading 永久转圈 */
const REQUEST_TIMEOUT_MS = 30_000;

function getCached(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return undefined;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}

/** 将响应数据所有键从蛇形转换为驼峰（后端 snake_case → 前端 camelCase） */
export function toCamel(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map((item) => toCamel(item));
  const record = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    // ⚠️ 以下划线开头的键（如 _risk, _commercial）为内部标识符，不进行蛇形→驼峰转换
    result[key.startsWith('_') ? key : key.replace(/_([a-z])/g, (_, l) => l.toUpperCase())] = toCamel(record[key]);
  }
  return result;
}

/** 递归将请求数据所有键从驼峰转换为蛇形（前端 camelCase → 后端 snake_case） */
export function toSnake(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(item => toSnake(item));
  const record = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    result[key.replace(/[A-Z]/g, l => '_' + l.toLowerCase())] = toSnake(record[key]);
  }
  return result;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit, noCache?: boolean): Promise<T> {
  const url = `${API_BASE}${path}`;
  const cacheKey = path;
  const isGet = !options || options.method === undefined || options.method === 'GET';

  // GET 请求优先走缓存（noCache 时跳过缓存，直接请求最新数据）
  if (isGet && !noCache) {
    const cached = getCached(cacheKey);
    if (cached !== undefined) return cached as T;
  }

  // ⚠️ L6：token 在 HttpOnly cookie（后端 login Set-Cookie），fetch 同源自动携带（默认 credentials=same-origin），无需 Authorization header
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const startEpoch = cacheEpoch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: options?.method,
      body: options?.body,
      signal: controller.signal,
      headers: { ...headers, ...(options?.headers as Record<string, string> || {}) },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, '请求超时，请稍后重试');
    }
    throw new ApiError(0, '网络请求失败：' + (err instanceof Error ? err.message : '未知错误'));
  } finally {
    clearTimeout(timer);
  }

  // ⚠️ L6：401 = cookie 无效/过期（token 在 HttpOnly cookie，前端读不到也清不掉）——best-effort 调 logout 清服务端 cookie，再跳登录
  if (res.status === 401) {
    fetch(API_BASE + '/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = import.meta.env.BASE_URL + 'login';
    throw new ApiError(401, '登录已过期，请重新登录');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || `Request failed (${res.status})`);
  }

  // 非 GET 请求在响应成功后立即清缓存（不等 body 解析）：
  // 204/空 body 解析失败时也不能留下陈旧缓存
  if (!isGet) {
    const resourcePrefix = path.split('?')[0].split('/')[1] || '';
    if (resourcePrefix) clearCache('/' + resourcePrefix);
    // ⚠️ 跨资源级联写：清相关资源缓存，避免 30s 内读到陈旧数据（见 getCascadePrefixes）
    for (const p of getCascadePrefixes(path)) clearCache(p);
  }

  // 204 无内容 → 直接返回 undefined
  if (res.status === 204) return undefined as T;

  const data = await res.json();
  const result = toCamel(data) as T;

  // GET 请求写入缓存（noCache 时不写入）；仅当请求期间缓存代际未变（未被写请求清过）
  if (isGet && !noCache && startEpoch === cacheEpoch) setCache(cacheKey, result);

  return result;
}

/** 跨资源级联清缓存前缀（纯函数，便于单测）：非 GET 写请求按路径返回需清除的缓存前缀。
 *  ⚠️ 审计修复 BU-4：此前仅 POST /approvals/:id/records 触发级联；POST /approvals（创建审批）不触发——
 *  plan/cost 创建即改 delivery 状态、promote 创建即 promote_locked 机会，30s 内列表读到陈旧数据。
 *  放宽为 startsWith('/approvals') 同时覆盖创建与审批记录。 */
export function getCascadePrefixes(path: string): string[] {
  if (path.startsWith('/project-versions') || path.startsWith('/project-groups')) return ['/projects'];
  if (path.startsWith('/approvals')) return ['/quotations', '/projects', '/deliveries', '/opportunities'];
  return [];
}

/** 清除缓存（用于数据变更后强制刷新） */
export function clearCache(resourcePrefix?: string) {
  cacheEpoch++;
  if (resourcePrefix) {
    for (const key of cache.keys()) {
      if (key.startsWith(resourcePrefix)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}

export const api = {
  get: <T>(path: string, opts?: { noCache?: boolean }) => request<T>(path, undefined, opts?.noCache),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(toSnake(body)) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(toSnake(body)) }),
  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};

