import { Router } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { parsePagination } from './helpers.js';

const router = Router();

// ⚠️ M6 修复：审计日志为只读资源（仅 GET 列表 / 单条 / 统计），移除 crudRoutes 的 POST/PUT/DELETE，
//   防止审计记录被伪造、篡改、删除。审计写入只经后端 logAudit() 追加。

// 自定义列表查询：LEFT JOIN users 获取显示名
router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    let sql = `SELECT al.*, u.display_name FROM audit_logs al
      LEFT JOIN users u ON u.email = al.user_name`;
    const params: any[] = [];
    if (search) {
      // ⚠️ A10 修复：通配符转义统一口径（%/_/\ 转义），与 buildSearchWhere 一致；u.display_name 跨表别名无法走共享构造
      const escaped = String(search).replace(/[%_\\]/g, '\\$&');
      sql += ` WHERE (al.user_name::text ILIKE $1 OR al.action::text ILIKE $1 OR al.module::text ILIKE $1 OR al.detail::text ILIKE $1 OR u.display_name::text ILIKE $1)`;
      params.push(`%${escaped}%`);
    }
    const { limit, offset } = parsePagination(req.query);
    sql += ` ORDER BY al.time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const result = await query(sql, [...params, limit, offset]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// 按模块统计（须在 /:id 之前注册，否则被 :id 捕获）
router.get('/stats/module', async (_req, res, next) => {
  try {
    const result = await query(
      'SELECT module, COUNT(*) as cnt FROM audit_logs GROUP BY module ORDER BY cnt DESC'
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// 单条审计日志
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM audit_logs WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) throw new AppError(404, '日志不存在');
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

export default router;
