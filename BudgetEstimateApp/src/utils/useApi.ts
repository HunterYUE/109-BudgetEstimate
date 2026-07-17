import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

type Fetcher<T> = () => Promise<T>;

/**
 * 通用 API 数据加载 Hook
 * - 自动管理 loading/error 状态
 * - 竞态安全（请求取消）
 * - 支持手动刷新
 */
export function useApi<T>(fetcher: Fetcher<T>, deps: React.DependencyList = []) {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const counterRef = useRef(0);

  const execute = useCallback(() => {
    const id = ++counterRef.current;
    setState(s => ({ ...s, loading: true, error: null }));

    fetcher()
      .then(data => {
        if (id === counterRef.current) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((err: unknown) => {
        if (id === counterRef.current) {
          setState({ data: null, loading: false, error: err instanceof Error ? err.message : String(err) });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { execute(); }, [execute]);

  return { ...state, refresh: execute };
}

/**
 * 用于提交数据的 Hook（POST/PUT/DELETE）
 */
export function useMutate<T = void>() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async (fn: () => Promise<T>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      return result;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutate, loading, error };
}
