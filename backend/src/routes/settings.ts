import { Router } from 'express';
import { query, getClient } from '../db/index.js';
import { AppError } from '../middleware/index.js';

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
  let client: any;
  try {
    const userId = req.user!.userId;
    const body = req.body as Record<string, string>;
    if (!body || typeof body !== 'object') {
      throw new AppError(400, '请求体必须为对象');
    }

    // ⚠️ F16 修复：批量 upsert 放入同一事务，中途失败不会部分写入
    client = await getClient();
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'string') continue;
      await client.query(
        `INSERT INTO user_settings (user_id, key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [userId, key, value]
      );
    }
    await client.query('COMMIT');

    res.json({ success: true });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

export default router;
