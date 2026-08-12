import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import routes from './routes/index.js';
import { errorHandler } from './middleware/index.js';
import { pool } from './db/index.js';
import { startWeeklyReminder } from './jobs/weeklyReminder.js';
import { startNotificationsCleanup } from './jobs/notificationsCleanup.js';
import { ensureCostCenters, startCostCenterSync } from './jobs/costCenterSync.js';

const app = express();
// ⚠️ 部署在 nginx 反代之后（nginx 已转发 X-Forwarded-For）：trust proxy 让 express-rate-limit
//   以真实客户端 IP 限速，否则所有请求都被视为 127.0.0.1，登录限速形同虚设
app.set('trust proxy', 1);
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
app.use(helmet());
// 登录接口限速：每IP每15分钟最多20次尝试
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: '登录尝试过于频繁，请15分钟后重试' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/v1/auth/login', loginLimiter);
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

// 周日晚 20:30 工时提交提醒（北京时间）
startWeeklyReminder();

// 过期通知清理（每月 1/16 日，删除 90 天前通知，封顶表规模）
startNotificationsCleanup();

// 成本中心码表：启动时补建 + 每小时同步（质保 -W 随交付节点15完成自动创建）
ensureCostCenters()
  .then(() => console.log('[CostCenter] 启动时成本中心码表已同步'))
  .catch(err => console.error('[CostCenter] 启动同步失败:', err));
startCostCenterSync();

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

// 未捕获的 Promise 拒绝兜底：记录日志而非让进程默认退出（有 logAudit 等未 await 的调用，防未来遗漏）
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});
