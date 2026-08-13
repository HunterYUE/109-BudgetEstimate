import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/utils/exportToExcel';

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
});
