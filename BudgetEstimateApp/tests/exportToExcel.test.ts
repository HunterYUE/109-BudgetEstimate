import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeExportFilename } from '../src/utils/exportToExcel';

describe('escapeHtml 导出 HTML 转义（B36 防注入/防结构破坏）', () => {
  it('& < > " \' 全部转义', () => {
    expect(escapeHtml('<a href="x&y">\'z\'</a>')).toBe('&lt;a href=&quot;x&amp;y&quot;&gt;&#39;z&#39;&lt;/a&gt;');
  });
  it('null/undefined → 空串；0 → "0"（非 null 走 String）', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(123)).toBe('123');
    expect(escapeHtml('')).toBe('');
  });
  it('纯中文/数字文本原样保留', () => {
    expect(escapeHtml('张三-2026-07')).toBe('张三-2026-07');
  });
  it('Excel 公式注入：以 = + - @ 开头的文本加单引号前缀', () => {
    expect(escapeHtml('=HYPERLINK("http://evil","x")'))
      .toBe('&#39;=HYPERLINK(&quot;http://evil&quot;,&quot;x&quot;)');
    expect(escapeHtml('+1+1')).toBe('&#39;+1+1');
    expect(escapeHtml('-1+1')).toBe('&#39;-1+1');
    expect(escapeHtml('@SUM(A1)')).toBe('&#39;@SUM(A1)');
    // 正常文本不受影响
    expect(escapeHtml('A-1')).toBe('A-1');
  });
});

describe('sanitizeExportFilename Windows 文件名清洗', () => {
  it('非法字符替换 + 尾随点空格去除', () => {
    expect(sanitizeExportFilename('a/b:c*d?e"f<g>h|i')).toBe('a_b_c_d_e_f_g_h_i');
    expect(sanitizeExportFilename('report.  ')).toBe('report');
  });
  it('保留设备名（含带后缀形式）加前缀', () => {
    expect(sanitizeExportFilename('CON')).toBe('_CON');
    expect(sanitizeExportFilename('CON.2026')).toBe('_CON.2026');
    expect(sanitizeExportFilename('com1.xls')).toBe('_com1.xls');
  });
  it('清洗后为空 → export', () => {
    expect(sanitizeExportFilename('')).toBe('export');
    expect(sanitizeExportFilename('...')).toBe('export'); // 尾随点全部去除
  });
});
