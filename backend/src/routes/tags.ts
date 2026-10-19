import { Router } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { crudRoutes } from './helpers.js';

const fields = [
  'id', 'name', 'description', 'parent_id', 'sort_order', 'created_at', 'updated_at',
];

/** 同级重名校验（parent_id 可空，IS NOT DISTINCT FROM 统一 null 比较） */
async function assertNoSiblingName(name: unknown, parentId: unknown, excludeId?: string): Promise<void> {
  if (typeof name !== 'string' || !name.trim()) return;
  const dup = (await query(
    `SELECT 1 FROM tags WHERE name = $1 AND parent_id IS NOT DISTINCT FROM $2
     ${excludeId ? 'AND id <> $3' : ''}`,
    excludeId ? [name, parentId ?? null, excludeId] : [name, parentId ?? null]
  )).rows[0];
  if (dup) throw new AppError(409, '同级已存在同名标签');
}

/** 成环校验：不能把标签挂到自身或自己的后代下（否则该子树从 /tree/all 中静默消失） */
async function assertNoCycle(id: string, parentId: unknown): Promise<void> {
  if (!parentId) return;
  if (parentId === id) throw new AppError(400, '标签不能以自身为父级');
  const cycle = (await query(
    `WITH RECURSIVE sub AS (
       SELECT id FROM tags WHERE id = $1
       UNION ALL
       SELECT t.id FROM tags t JOIN sub s ON t.parent_id = s.id
     ) SELECT 1 FROM sub WHERE id = $2 LIMIT 1`,
    [id, parentId]
  )).rows[0];
  if (cycle) throw new AppError(400, '不能把标签移动到自己的子标签下');
}

const router = crudRoutes('tags', fields, {
  searchFields: ['name'],
  orderBy: 'sort_order ASC, name ASC',
  beforeCreate: async (snakeBody) => {
    await assertNoSiblingName(snakeBody.name, snakeBody.parent_id);
  },
  beforeUpdate: async (_req, id, snakeBody) => {
    if (snakeBody.name !== undefined || snakeBody.parent_id !== undefined) {
      const current = (await query('SELECT name, parent_id FROM tags WHERE id = $1', [id])).rows[0];
      const name = snakeBody.name !== undefined ? snakeBody.name : current?.name;
      const parentId = snakeBody.parent_id !== undefined ? snakeBody.parent_id : current?.parent_id;
      await assertNoSiblingName(name, parentId, id);
      await assertNoCycle(id, parentId);
    }
  },
  extra: (r) => {
    // 标签树（完整层级）
    r.get('/tree/all', async (_req, res, next) => {
      try {
        const all = (await query('SELECT * FROM tags ORDER BY sort_order, name')).rows;

        // 在内存中构建树
        const map = new Map<string, any>();
        const roots: any[] = [];
        for (const tag of all) {
          map.set(tag.id, { ...tag, children: [] });
        }
        for (const tag of all) {
          const node = map.get(tag.id)!;
          if (tag.parent_id && map.has(tag.parent_id)) {
            map.get(tag.parent_id)!.children.push(node);
          } else {
            roots.push(node);
          }
        }
        res.json(roots);
      } catch (err) { next(err); }
    });
  },
});

export default router;
