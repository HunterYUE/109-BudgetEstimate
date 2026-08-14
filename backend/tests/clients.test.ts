import { describe, it, expect } from 'vitest';
import {
  normalizeContact,
  hasCascadeChange,
  buildContactCountMap,
} from '../src/routes/clients.js';

describe('normalizeContact 联系人参数归一化（name/position/phone/email/superior 空串兜底；decision_role 默认 "使用"）', () => {
  it('空对象 → 全默认', () => {
    expect(normalizeContact({})).toEqual({
      name: '', position: '', phone: '', email: '', decision_role: '使用', superior: '',
    });
  });
  it('已有值保留，缺省字段兜底', () => {
    expect(normalizeContact({ name: '王总', position: '采购', decision_role: '影响者' }))
      .toEqual({
        name: '王总', position: '采购', phone: '', email: '', decision_role: '影响者', superior: '',
      });
  });
});

describe('hasCascadeChange 级联变更判断（salesman/name 两处共用：新值已提供且不同才级联）', () => {
  it('新值未提供（undefined）→ 不级联', () => {
    expect(hasCascadeChange(undefined, '旧值')).toBe(false);
  });
  it('新值与旧值相同 → 不级联', () => {
    expect(hasCascadeChange('相同', '相同')).toBe(false);
  });
  it('新值已提供且不同 → 级联', () => {
    expect(hasCascadeChange('新值', '旧值')).toBe(true);
    expect(hasCascadeChange('张三', null)).toBe(true);
  });
});

describe('buildContactCountMap 联系人计数映射（client_id → cnt，/stats/contacts 与列表徽标共用）', () => {
  it('rows → 映射', () => {
    expect(buildContactCountMap([
      { client_id: 'c1', cnt: 3 },
      { client_id: 'c2', cnt: 1 },
    ])).toEqual({ c1: 3, c2: 1 });
  });
  it('空结果 → 空映射', () => {
    expect(buildContactCountMap([])).toEqual({});
  });
});
