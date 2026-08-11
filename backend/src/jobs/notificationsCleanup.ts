import cron from 'node-cron';
import { query } from '../db/index.js';

/**
 * 通知清理：每月 1/16 日 04:10（Asia/Shanghai）删除 90 天前的通知。
 *
 * 通知是可消费的指针（用户点击即删、删任务级联清），无人消费则持续留存；
 * 定时清理封顶表规模，防止 GET /notifications 排序与 weeklyReminder 的
 * NOT EXISTS 子查询随表增长逐年变慢。保留 90 天足以覆盖审批/驳回/提醒回溯窗口。
 */

const CRON_EXPR = '10 4 1,16 * *';

/** 执行一次清理，返回删除条数 */
export async function runNotificationsCleanup(): Promise<number> {
  const result = await query(
    `DELETE FROM timerecording.notifications WHERE created_at < now() - interval '90 days' RETURNING id`
  );
  return result.rowCount || 0;
}

/** 服务启动时挂载定时任务 */
export function startNotificationsCleanup(): void {
  cron.schedule(CRON_EXPR, async () => {
    try {
      const n = await runNotificationsCleanup();
      if (n) console.log(`[NotifyCleanup] 已清理 ${n} 条过期通知`);
    } catch (err) {
      console.error('[NotifyCleanup] 通知清理失败:', err);
    }
  }, { timezone: 'Asia/Shanghai' });
  console.log('[NotifyCleanup] 过期通知清理任务已启动（Asia/Shanghai）');
}
