import { useState, useEffect } from 'react';

/** 响应式媒体查询 hook（对齐工时应用 utils/useMediaQuery）：统一「监听窗口尺寸→更新布尔」逻辑。
 *  KPI 概览卡片桌面/窄屏换行切换等共用，避免各页自行挂 resize 监听。 */
export default function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    // 挂载后窗口可能已变化（或 matchMedia 初始值与回调路径不一致），先同步对齐一次
    // 初始同步传 mql（MediaQueryList，非 Event），监听回调传 MediaQueryListEvent——两者均含 matches
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => setMatches(e.matches);
    onChange(mql);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
