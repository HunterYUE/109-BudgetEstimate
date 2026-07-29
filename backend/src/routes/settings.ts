import { Router } from 'express';
import { query } from '../db/index.js';
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
  try {
    const userId = req.user!.userId;
    const body = req.body as Record<string, string>;
    if (!body || typeof body !== 'object') {
      throw new AppError(400, '请求体必须为对象');
    }

    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'string') continue;
      await query(
        `INSERT INTO user_settings (user_id, key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [userId, key, value]
      );
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
