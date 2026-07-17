import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { clearCache } from './api';

export interface UserInfo {
  id: string;
  email: string;
  displayName: string;
  title: string;
  role: string;
}

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = 'budget_token';
/** 登录时间戳，用于判断 token 是否即将过期（后端 JWT 有效期 24h） */
const TOKEN_TIME_KEY = 'budget_token_login_time';
const PROACTIVE_REFRESH_MS = 12 * 60 * 60 * 1000; // 超过 12h 主动刷新

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  /** 从 token 恢复用户信息 */
  const fetchMe = useCallback(async (jwt: string) => {
    const res = await fetch((import.meta.env.VITE_API_BASE || '/api/v1') + '/auth/me', {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) throw new Error('Token expired');
    return res.json() as Promise<UserInfo>;
  }, []);

  const refresh = useCallback(async () => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) { setLoading(false); return; }
    // 检查 token 是否已过半生命周期：过半则清除，让用户重新登录（避免操作中途 401）
    const loginTime = parseInt(localStorage.getItem(TOKEN_TIME_KEY) || '0', 10);
    if (loginTime > 0 && Date.now() - loginTime > PROACTIVE_REFRESH_MS) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_TIME_KEY);
      setToken(null);
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const userData = await fetchMe(saved);
      setUser(userData);
      setToken(saved);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_TIME_KEY);
      setToken(null);
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
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(TOKEN_TIME_KEY, String(Date.now()));
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_TIME_KEY);
    setToken(null);
    setUser(null);
    clearCache();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refresh }}>
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
