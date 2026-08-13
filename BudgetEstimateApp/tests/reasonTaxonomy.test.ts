import { describe, it, expect } from 'vitest';
import { REASON_TAXONOMY, formatReasons, parseReasons } from '../src/reasonTaxonomy';

describe('formatReasons 原因存储格式（大类:子类:具体;...）', () => {
  it('带具体原因 + 无具体原因混合', () => {
    expect(formatReasons('竞对', [
      { subLabel: '价格', detailItems: ['主机成本低', '解决方案成本低'] },
      { subLabel: '客户关系', detailItems: [] },
    ])).toBe('竞对:价格:主机成本低,解决方案成本低;竞对:客户关系');
  });
  it('无选择 → 空串', () => {
    expect(formatReasons('竞对', [])).toBe('');
  });
});

describe('parseReasons 解析存储串', () => {
  it('空/空串 → []', () => {
    expect(parseReasons('')).toEqual([]);
    expect(parseReasons(null)).toEqual([]);
  });
  it('完整解析；缺具体原因 → detailItems 空', () => {
    expect(parseReasons('竞对:价格:主机成本低,解决方案成本低;竞对:客户关系')).toEqual([
      { groupLabel: '竞对', subLabel: '价格', detailItems: ['主机成本低', '解决方案成本低'] },
      { groupLabel: '竞对', subLabel: '客户关系', detailItems: [] },
    ]);
  });
  it('round-trip：format → parse 复原', () => {
    const raw = formatReasons('取消', [{ subLabel: '预算缩减', detailItems: ['年度预算冻结'] }]);
    expect(parseReasons(raw)).toEqual([{ groupLabel: '取消', subLabel: '预算缩减', detailItems: ['年度预算冻结'] }]);
  });
  it('多冒号：仅取第三段为具体原因（seg[2]，后续丢弃）——契约文档化', () => {
    expect(parseReasons('a:b:c:d')).toEqual([{ groupLabel: 'a', subLabel: 'b', detailItems: ['c'] }]);
  });
  it('REASON_TAXONOMY 覆盖 win/loss/freeze', () => {
    expect(Object.keys(REASON_TAXONOMY)).toEqual(['win', 'loss', 'freeze']);
    expect(REASON_TAXONOMY.win.label).toBe('赢');
    expect(REASON_TAXONOMY.loss.label).toBe('输');
    expect(REASON_TAXONOMY.freeze.label).toBe('冻结');
  });
});
