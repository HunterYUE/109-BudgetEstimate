import cron from 'node-cron';
import { query } from '../db/index.js';

/**
 * 周日晚 20:30（北京时间）向用户（除部门总监）推送「工时提交提醒」，显示在页面铃铛。
 *
 * 规则：
 * - 每周只发一次：按「本周起点后的 reminder 通知」去重，任务失败/服务重启重复触发也不会刷屏。
 * - 本周已提交/已通过的员工不打扰。
 * - 时段口径：EXTRACT(ISOYEAR/WEEK) 即 ISO 周，与前端 dayjs isoWeek 一致；周日属当周末尾，周号正确。
 */

const CRON_EXPR = '30 20 * * 0'; // 每周日 20:30
const BEIJING_OFFSET_MS = 8 * 3600 * 1000; // 中国无夏令时，固定 UTC+8

/** 北京时间「今日」的日历日期（YYYY-MM-DD） */
function beijingDateStr(): string {
  const bj = new Date(Date.now() + BEIJING_OFFSET_MS);
  const y = bj.getUTCFullYear();
  const m = String(bj.getUTCMonth() + 1).padStart(2, '0');
  const d = String(bj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 北京时间「今日 00:00」对应的 UTC 时间点（timestamptz 去重基准） */
function beijingMidnightUtc(): Date {
  const bj = new Date(Date.now() + BEIJING_OFFSET_MS);
  return new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()) - BEIJING_OFFSET_MS);
}

/** 执行一次推送，返回实际插入的通知条数 */
export async function runWeeklyReminder(): Promise<number> {
  const sundayDate = beijingDateStr();
  const sundayStart = beijingMidnightUtc();
  const result = await query(
    `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url)
     SELECT p.id, '工时提交提醒', '本周工时还未提交，请及时填写并提交', 'reminder', '/time-record'
     FROM timerecording.profiles p
     JOIN public.users u ON u.id = p.id
     WHERE p.is_active = true AND u.is_active = true AND u.role <> 'director'
       AND NOT EXISTS (
         SELECT 1 FROM timerecording.time_records tr
         WHERE tr.user_id = p.id
           AND tr.year = EXTRACT(ISOYEAR FROM $1::date)
           AND tr.week_number = EXTRACT(WEEK FROM $1::date)
           AND tr.status IN ('submitted', 'approved'))
       AND NOT EXISTS (
         SELECT 1 FROM timerecording.notifications n
         WHERE n.user_id = p.id AND n.type = 'reminder' AND n.created_at >= $2)`,
    [sundayDate, sundayStart]
  );
  return result.rowCount || 0;
}

/** 服务启动时挂载定时任务 */
export function startWeeklyReminder(): void {
  cron.schedule(CRON_EXPR, async () => {
    try {
      const n = await runWeeklyReminder();
      console.log(`[Reminder] 周日工时提交提醒已推送：${n} 条`);
    } catch (err) {
      console.error('[Reminder] 周日提醒推送失败:', err);
    }
  }, { timezone: 'Asia/Shanghai' });
  console.log('[Reminder] 周日 20:30 工时提交提醒任务已启动（Asia/Shanghai）');
}
