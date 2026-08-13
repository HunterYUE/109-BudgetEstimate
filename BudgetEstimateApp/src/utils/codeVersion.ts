/** 物料编码版本号解析（⚠️ B16 修复：ItemTable 与 MaterialManagement 双份实现收敛单源） */

/** 解析编码尾部版本号 -V{版本}：V0.x 视为临时编码（isTemp=true，未发布正式版）
 *  返回 null 表示编码不含 -V{版本} 后缀（如历史编码）。 */
export function parseVersionFromCode(code?: string | null): { version: string; isTemp: boolean } | null {
  const m = code?.match(/-V(\d+\.\d+)$/);
  if (!m) return null;
  return { version: 'V' + m[1], isTemp: parseInt(m[1], 10) < 1 };
}
