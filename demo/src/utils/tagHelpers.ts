import type { TagNode } from '../types';

// ── 内部工具函数 ──

function cloneTree(nodes: TagNode[]): TagNode[] {
  return nodes.map(n => ({ ...n, children: n.children ? cloneTree(n.children) : undefined }));
}

function uid(): string {
  return 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5);
}

function findPath(nodes: TagNode[], id: string): number[] | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return [i];
    if (nodes[i].children) {
      const sub = findPath(nodes[i].children!, id);
      if (sub) return [i, ...sub];
    }
  }
  return null;
}

function getNodeByPath(nodes: TagNode[], path: number[]): TagNode | null {
  let cur: TagNode[] = nodes;
  let node: TagNode | null = null;
  for (const idx of path) {
    if (idx < 0 || idx >= cur.length) return null;
    node = cur[idx];
    cur = node.children || [];
  }
  return node;
}

// ── 导出工具函数 ──

export function collectTagPaths(nodes: TagNode[], parentPath: string[] = []): { id: string; path: string[] }[] {
  const result: { id: string; path: string[] }[] = [];
  for (const n of nodes) {
    const current = [...parentPath, n.name];
    result.push({ id: n.id, path: current });
    if (n.children) result.push(...collectTagPaths(n.children, current));
  }
  return result;
}

export function collectDescendantIds(nodes: TagNode[], targetId: string): string[] {
  const path = findPath(nodes, targetId);
  if (!path) return [];
  const node = getNodeByPath(nodes, path);
  if (!node) return [];
  const ids: string[] = [node.id];
  function walk(n: TagNode) {
    if (n.children) for (const c of n.children) { ids.push(c.id); walk(c); }
  }
  walk(node);
  return ids;
}

/** 展平树为行列表（用于表格渲染），含连线信息 */
export function flattenTree(nodes: TagNode[], level: number = 0, parentIsLast: boolean[] = []): {
  node: TagNode; level: number; isLast: boolean; connector: boolean[];
}[] {
  const result: { node: TagNode; level: number; isLast: boolean; connector: boolean[] }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const isLast = i === nodes.length - 1;
    result.push({ node: nodes[i], level, isLast, connector: [...parentIsLast, isLast] });
    if (nodes[i].children) result.push(...flattenTree(nodes[i].children, level + 1, [...parentIsLast, isLast]));
  }
  return result;
}

export { cloneTree, findPath, getNodeByPath, uid };
