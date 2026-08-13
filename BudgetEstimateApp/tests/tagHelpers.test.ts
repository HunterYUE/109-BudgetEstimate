import { describe, it, expect } from 'vitest';
import type { TagNode } from '../src/types';
import {
  uid, collectTagPaths, collectDescendantIds, flattenTree, findPath, getNodeByPath,
} from '../src/utils/tagHelpers';

function node(id: string, name: string, children?: TagNode[]): TagNode {
  return { id, name, children } as any;
}
/** a → a1, a2(→a21)；b 叶子 */
const tree: TagNode[] = [
  node('a', 'A', [node('a1', 'A1'), node('a2', 'A2', [node('a21', 'A21')])]),
  node('b', 'B'),
];

describe('uid 唯一 ID 生成器', () => {
  it('格式 prefix-base36时间戳-随机3位；默认前缀 t', () => {
    expect(uid('mat')).toMatch(/^mat-[a-z0-9]+-[a-z0-9]{3}$/);
    expect(uid()).toMatch(/^t-[a-z0-9]+-[a-z0-9]{3}$/);
  });
  it('连续调用不重复', () => {
    expect(uid('mat')).not.toBe(uid('mat'));
  });
});

describe('collectTagPaths 路径展平（含祖先链，根为自身）', () => {
  it('深度优先全路径', () => {
    expect(collectTagPaths(tree)).toEqual([
      { id: 'a', path: ['A'] },
      { id: 'a1', path: ['A', 'A1'] },
      { id: 'a2', path: ['A', 'A2'] },
      { id: 'a21', path: ['A', 'A2', 'A21'] },
      { id: 'b', path: ['B'] },
    ]);
  });
  it('空树 → []', () => {
    expect(collectTagPaths([])).toEqual([]);
  });
});

describe('collectDescendantIds 自身+后代集合', () => {
  it('目标含子节点 → 含自身', () => {
    expect(collectDescendantIds(tree, 'a')).toEqual(['a', 'a1', 'a2', 'a21']);
    expect(collectDescendantIds(tree, 'a2')).toEqual(['a2', 'a21']);
  });
  it('叶子 → 仅自身；不存在 → []', () => {
    expect(collectDescendantIds(tree, 'b')).toEqual(['b']);
    expect(collectDescendantIds(tree, 'zz')).toEqual([]);
  });
});

describe('flattenTree 表格行 + 连线信息', () => {
  it('深度优先 + isLast/connector', () => {
    const rows = flattenTree(tree);
    expect(rows.map(r => r.node.id)).toEqual(['a', 'a1', 'a2', 'a21', 'b']);
    expect(rows[0]).toMatchObject({ level: 0, isLast: false, connector: [false] });
    expect(rows[3]).toMatchObject({ level: 2, isLast: true, connector: [false, true, true] });
    expect(rows[4]).toMatchObject({ level: 0, isLast: true, connector: [true] });
  });
});

describe('findPath / getNodeByPath', () => {
  it('findPath 返回索引路径；getNodeByPath 取回节点', () => {
    expect(findPath(tree, 'a21')).toEqual([0, 1, 0]);
    expect(getNodeByPath(tree, [0, 1, 0])?.id).toBe('a21');
    expect(findPath(tree, 'zz')).toBeNull();
  });
  it('getNodeByPath 越界 → null', () => {
    expect(getNodeByPath(tree, [0, 5])).toBeNull();
    expect(getNodeByPath(tree, [9])).toBeNull();
  });
});
