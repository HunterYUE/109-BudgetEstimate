/** 导出 HTML 表格为 .xls 文件（Excel 可打开） */

/**
 * ⚠️ B36 修复：HTML 转义用户可控文本——客户/项目/物料名/备注等含 `& < > " '` 会破坏导出表格结构
 *   或注入多余标记；未转义即拼接还会被恶意文本利用。所有注入 HTML 的字符串必须经此函数。
 */
/** ⚠️ 审计修复 U7：导出文件名清洗——非法字符 + Windows 保留名/尾随点空格（此前只清非法字符，
 *   `CON`/`PRN`/`COM1` 等保留名与尾随 `.`/空格在 Windows 下载失败或静默改名）。纯函数便于单测。 */
export function sanitizeExportFilename(filename: string): string {
  return filename
    .replace(/[\\/:*?"<>|]/g, '_')           // 非法字符（B36 既有）
    .replace(/[. ]+$/, '')                    // 尾随点/空格（Windows 忽略扩展名前的尾随点）
    .replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, '_$1') // 保留设备名（加前缀防被当设备）
    || 'export';                              // 清洗后为空（全非法字符）兜底
}

export function escapeHtml(s: string | number | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function exportHtmlTable(filename: string, htmlContent: string) {
  const fullHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  td, th { padding: 6px 10px; border: 1px solid #ccc; font-size: 12px; }
  th { background: #f0f4ff; font-weight: 700; }
  .section-title { font-size: 14px; font-weight: 700; background: #e8edf4; }
  .amount { text-align: right; }
</style>
</head><body>${htmlContent}</body></html>`;

  // ⚠️ B36 + 审计修复 U7：文件名清洗非法字符（Windows 不允许 \ / : * ? " < > |）、保留名与尾随点
  const safeFilename = sanitizeExportFilename(filename);

  const blob = new Blob([fullHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
