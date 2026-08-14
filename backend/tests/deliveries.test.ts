import { describe, it, expect } from 'vitest';
import {
  normalizeNodeInsertParams,
  isValidNodeStatus,
  NODE_STATUS_WHITELIST,
  sanitizeFileName,
  FILE_TYPES,
} from '../src/routes/deliveries.js';

describe('sanitizeFileName 上传文件名净化（/ \\ : → _，防路径穿越/非法文件名）', () => {
  it('替换 Windows/URL 非法字符', () => {
    expect(sanitizeFileName('a/b\\c:d.pdf')).toBe('a_b_c_d.pdf');
    expect(sanitizeFileName('报价 单:2026.pdf')).toBe('报价 单_2026.pdf');
  });
  it('无非法字符原样返回', () => {
    expect(sanitizeFileName('合同.pdf')).toBe('合同.pdf');
    expect(sanitizeFileName('plain-file-v2.pdf')).toBe('plain-file-v2.pdf');
  });
});

describe('NODE_STATUS_WHITELIST / isValidNodeStatus 节点状态枚举（C4 预校验，防 PG 枚举错误 500）', () => {
  it('白名单三态', () => {
    expect(NODE_STATUS_WHITELIST).toEqual(['pending', 'in_progress', 'completed']);
  });
  it("合法态 + undefined（走路由 'pending' 兜底）通过", () => {
    expect(isValidNodeStatus('pending')).toBe(true);
    expect(isValidNodeStatus('in_progress')).toBe(true);
    expect(isValidNodeStatus('completed')).toBe(true);
    expect(isValidNodeStatus(undefined)).toBe(true);
  });
  it('非法态拒绝', () => {
    expect(isValidNodeStatus('cancelled')).toBe(false);
    expect(isValidNodeStatus('approved')).toBe(false);
    expect(isValidNodeStatus('')).toBe(false);
  });
});

describe('FILE_TYPES 附件类型白名单（与前端 ATTACHMENT_TYPES 4 类一一对应）', () => {
  it('rfq/techPlan/techAgreement/contract', () => {
    expect(FILE_TYPES).toEqual(['rfq', 'techPlan', 'techAgreement', 'contract']);
  });
});

describe('normalizeNodeInsertParams 节点 INSERT 参数归一化（空串兜底/status 默认 pending/history JSON.stringify）', () => {
  it('完整节点 → 各字段按值透传，history JSON 序列化，baseline 直传', () => {
    const node = {
      node_no: 'N1', name: '设计', planned_start_date: '2026-08-01', planned_end_date: '2026-08-10',
      actual_date: '2026-08-11', actual_start_date: '2026-08-01', actual_end_date: '2026-08-11',
      status: 'completed', comments: 'ok', history: [{ at: '2026-08-01', text: '启动' }],
    };
    expect(normalizeNodeInsertParams(node, '2026-08-10')).toEqual([
      'N1', '设计', '2026-08-01', '2026-08-10', '2026-08-11', '2026-08-01', '2026-08-11',
      '2026-08-10', 'completed', 'ok', '[{"at":"2026-08-01","text":"启动"}]',
    ]);
  });
  it('空节点 → 全默认（planned 空串/actual null/status pending/comments 空串/history "[]"/baseline null）', () => {
    expect(normalizeNodeInsertParams({}, null)).toEqual([
      undefined, undefined, '', '', null, null, null,
      null, 'pending', '', '[]',
    ]);
  });
  it('history 非数组按实际值序列化（C3 路由层已挡，此处保真传递）', () => {
    const params = normalizeNodeInsertParams({ history: 'x' }, null);
    expect(params[10]).toBe('"x"');
  });
});
