import { Router } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { withTransaction } from './helpers.js';

const router = Router();

// 所有接口需要登录
/** GET /api/settings - 获取当前用户的所有设置 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await query(
      'SELECT key, value FROM user_settings WHERE user_id = $1',
      [userId]
    );
    const settings: Record<string, string> = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (err) { next(err); }
});

/** PUT /api/settings - 批量保存当前用户的设置 */
router.put('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = req.body as Record<string, string>;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new AppError(400, '请求体必须为对象');
    }
    // 边界防御：设置键来自前端固定集合，限制条数/键长/值长，防任意登录用户用大请求灌表
    const entries = Object.entries(body).filter(([, v]) => typeof v === 'string');
    if (entries.length > 200) throw new AppError(400, '设置项过多（最多 200 项）');
    for (const [key, value] of entries) {
      if (!key || key.length > 100) throw new AppError(400, '设置键名无效或过长');
      if ((value as string).length > 10000) throw new AppError(400, `设置项 ${key} 的值过长`);
    }

    // ⚠️ F16 修复：批量 upsert 放入同一事务，中途失败不会部分写入
    // ⚠️ A15：事务样板收敛为 withTransaction
    await withTransaction(async (client) => {
      for (const [key, value] of Object.entries(body)) {
        if (typeof value !== 'string') continue;
        await client.query(
          `INSERT INTO user_settings (user_id, key, value)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [userId, key, value]
        );
      }
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
