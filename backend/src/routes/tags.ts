import { Router } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { crudRoutes } from './helpers.js';

const fields = [
  'id', 'name', 'description', 'parent_id', 'sort_order', 'created_at', 'updated_at',
];

const router = crudRoutes('tags', fields, {
  searchFields: ['name'],
  orderBy: 'sort_order ASC, name ASC',
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
