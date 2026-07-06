import React from 'react';

/**
 * 轻量级 Mock 数据响应式存储
 * 解决多个页面直接修改模块级数组导致的数据不一致问题
 */

const listeners = new Set<() => void>();
let version = 0;

/** 通知所有订阅者数据已变更 */
export function notifyMockUpdate() {
  version++;
  listeners.forEach(fn => fn());
}

/** 订阅 mock 数据变更，返回当前版本号 */
export function subscribeMockUpdate(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React Hook：监听 mock 数据变更，触发组件重渲染 */
export function useMockVersion(): number {
  const [v, setV] = React.useState(version);
  React.useEffect(() => {
    const unsub = subscribeMockUpdate(() => setV(version));
    return unsub;
  }, []);
  return v;
}
