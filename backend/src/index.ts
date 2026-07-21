import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import { errorHandler } from './middleware/index.js';
import { pool } from './db/index.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
  console.error('[FATAL] 无效的 PORT 配置:', process.env.PORT);
  process.exit(1);
}

// CORS — 必须配置允许的来源
const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin) {
  console.error('[FATAL] CORS_ORIGIN 环境变量未设置！');
  process.exit(1);
}
app.use(cors({
  origin: corsOrigin.split(',').map(s => s.trim()),
}));
app.use(express.json({ limit: '20mb' }));

// 健康检查（含数据库状态）
app.get('/api/health', async (_req, res) => {
  try {
    const dbResult = await pool.query('SELECT 1 AS ok');
    const dbOk = dbResult.rows[0]?.ok === 1;
    res.json({
      status: 'ok',
      database: dbOk ? 'connected' : 'error',
      time: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      database: 'disconnected',
      time: new Date().toISOString(),
    });
  }
});

// API 路由
app.use('/api/v1', routes);

// 错误处理
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`[API] Budget Estimate API running on port ${PORT}`);
  console.log(`[API] Health: http://localhost:${PORT}/api/health`);
  console.log(`[API] Docs: http://localhost:${PORT}/api/v1/*`);
});

// 优雅关闭
async function gracefulShutdown(signal: string) {
  console.log(`\n[API] 收到 ${signal}，开始优雅关闭...`);
  server.close(() => {
    console.log('[API] HTTP 服务器已关闭');
  });
  try {
    await pool.end();
    console.log('[API] 数据库连接池已释放');
    process.exit(0);
  } catch (err) {
    console.error('[API] 关闭数据库连接失败:', err);
    process.exit(1);
  }
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
