import { Router } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { crudRoutes } from './helpers.js';

const fields = [
  'id', 'time', 'user_name', 'action', 'module', 'detail', 'created_at',
];

const router = crudRoutes('audit_logs', fields, {
  orderBy: 'time DESC',
  searchFields: ['user_name', 'action', 'module', 'detail'],
  extra: (r) => {
    // 按模块统计
    r.get('/stats/module', async (_req, res, next) => {
      try {
        const result = await query(
          'SELECT module, COUNT(*) as cnt FROM audit_logs GROUP BY module ORDER BY cnt DESC'
        );
        res.json(result.rows);
      } catch (err) { next(err); }
    });
  },
});

export default router;
