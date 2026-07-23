import { Router } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { crudRoutes } from './helpers.js';

const fields = [
  'id', 'time', 'user_name', 'action', 'module', 'detail', 'created_at',
];

const router = Router();

// 自定义列表查询：LEFT JOIN users 获取显示名
router.get('/', async (req, res, next) => {
  try {
    const { search, limit = '100', offset = '0' } = req.query as Record<string, string>;
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 100));
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    let sql = `SELECT al.*, u.display_name FROM audit_logs al
      LEFT JOIN users u ON u.email = al.user_name`;
    const params: any[] = [];
    if (search) {
      sql += ` WHERE (al.user_name::text ILIKE $1 OR al.action::text ILIKE $1 OR al.module::text ILIKE $1 OR al.detail::text ILIKE $1 OR u.display_name::text ILIKE $1)`;
      params.push(`%${search}%`);
    }
    sql += ` ORDER BY al.time DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// 标准 CRUD 路由
const crudRouter = crudRoutes('audit_logs', fields, {
  searchFields: ['user_name', 'action', 'module', 'detail'],
  orderBy: 'time DESC',
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

router.use(crudRouter);

export default router;
