import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { clearCache } from './api';

export interface UserInfo {
  id: string;
  email: string;
  displayName: string;
  title: string;
  role: string;
  permissions?: string[];
}

interface AuthState {
  user: UserInfo | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  /** ⚠️ L6 修复：token 已迁移到 HttpOnly cookie（后端 login Set-Cookie），前端不再持有/发送 Bearer——
   *    /me 由浏览器自动携带 cookie 认证 */
  const fetchMe = useCallback(async (): Promise<UserInfo> => {
    const res = await fetch((import.meta.env.VITE_API_BASE || '/api/v1') + '/auth/me');
    if (!res.ok) throw new Error('Session expired');
    return res.json() as Promise<UserInfo>;
  }, []);

  const refresh = useCallback(async () => {
    // ⚠️ L6：无 cookie → /me 返回 401 → 登出态。无需 localStorage 预检与 12h 主动刷新
    //   （cookie 随 JWT 24h 过期，过期后请求 401 → api.ts 跳登录，自愈）
    try {
      const userData = await fetchMe();
      setUser(userData);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [fetchMe]);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch((import.meta.env.VITE_API_BASE || '/api/v1') + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '登录失败' }));
      throw new Error(err.error || '登录失败');
    }
    const data = await res.json();
    // ⚠️ L6：token 由后端 Set-Cookie（HttpOnly），login 响应体不再含 token，只用 user
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    // ⚠️ L6：HttpOnly cookie 只有服务端能清——先调后端 logout（best-effort），再清本地状态
    fetch((import.meta.env.VITE_API_BASE || '/api/v1') + '/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    clearCache();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
