/**
 * API 基础客户端 - 封装 fetch，统一处理错误、环境配置
 *
 * 命名规范边界：这是前后端 camelCase/snake_case 的转换层。
 * GET 响应自动 toCamel() 转驼峰，POST/PUT body 自动 toSnake() 转蛇形。
 * 所有 API 通信必须走此客户端，禁止直接 fetch()。
 * 详见 memory/naming-convention-standard.md
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';

// ── GET 请求缓存（30 秒 TTL，避免页面切换重复请求） ──
const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 30_000;

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

/** 从 localStorage 获取 JWT token */
function getToken(): string | null {
  try { return localStorage.getItem('budget_token'); } catch { return null; }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const cacheKey = path;

  // GET 请求优先走缓存
  if (!options || options.method === undefined || options.method === 'GET') {
    const cached = getCached(cacheKey);
    if (cached !== undefined) return cached as T;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: options?.method,
      body: options?.body,
      headers: { ...headers, ...(options?.headers as Record<string, string> || {}) },
    });
  } catch (err) {
    throw new ApiError(0, '网络请求失败：' + (err instanceof Error ? err.message : '未知错误'));
  }

  // 401 token 过期 → 清除登录状态并跳转
  if (res.status === 401) {
    localStorage.removeItem('budget_token');
    window.location.href = import.meta.env.BASE_URL + 'login';
    throw new ApiError(401, '登录已过期，请重新登录');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || `Request failed (${res.status})`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const data = await res.json();
  const result = toCamel(data) as T;

  // GET 请求写入缓存
  if (!options || options.method === undefined || options.method === 'GET') {
    setCache(cacheKey, result);
  } else {
    // 非 GET 请求（POST/PUT/DELETE）清除相关前缀缓存
    const resourcePrefix = path.split('?')[0].split('/')[1] || '';
    if (!resourcePrefix) return result;
    clearCache('/' + resourcePrefix);
  }

  return result;
}

/** 清除缓存（用于数据变更后强制刷新） */
export function clearCache(resourcePrefix?: string) {
  if (resourcePrefix) {
    for (const key of cache.keys()) {
      if (key.startsWith(resourcePrefix)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(toSnake(body)) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(toSnake(body)) }),
  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};

