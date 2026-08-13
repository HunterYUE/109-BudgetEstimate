/**
 * 全局 UUID 生成（⚠️ B38 修复：crypto.randomUUID 仅在安全上下文（HTTPS/localhost）且较新浏览器可用；
 *   HTTP 内网地址或旧浏览器下调用会直接抛错导致页面崩溃。此处统一入口：可用时优先原生，否则降级为
 *   RFC4122 格式的伪随机 UUID，保证各调用点（报价页行/组/版本 id、交付历史条目 id）格式一致且永不崩溃）。
 */

/** 生成 UUID v4 格式字符串（优先 crypto.randomUUID，失败/不可用时降级伪随机） */
export function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* 非安全上下文等场景降级 */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
