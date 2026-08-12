-- 041-tr-schema-sync.sql
-- 工时系统：schema.sql 与生产库同步（2026-08-12 复核）
--   生产库此前存在「无迁移记录的手工 DDL」，导致从零建库（schema.sql）/ 迁移回放环境与生产不一致：
--   1. 删除死列 notifications.is_read、time_records.prev_status（周锁定功能未上线即弃用；生产已手工 DROP）
--   2. 删除随 is_read 列自动消失的 idx_tr_notifications_unread（显式声明，防重建环境残留死索引）
--   3. 补建生产已手工创建的索引 idx_tr_notifications_task_id、idx_tr_notifications_user_created
--      （task_id 供删任务级联清理通知；user_created 供 weeklyReminder 的 NOT EXISTS 去重子查询）
--   4. task_assignments.created_by 置空（生产已 DROP NOT NULL；删除用户路由先置 NULL 再删 profile，必须可空）
--
-- 全部幂等（IF EXISTS / IF NOT EXISTS / DROP NOT NULL），生产执行应无行数变化（no-op），
-- 其他环境回放可收敛到与生产一致。
--
-- 使用方式：
--   cat 041-tr-schema-sync.sql | ssh tencent-budget 'su - postgres -c "psql -v ON_ERROR_STOP=1 -d budget_estimate"'

BEGIN;

-- ── 1. 死列清理（生产已删，此处为迁移链补记；无列时跳过） ──────────
ALTER TABLE timerecording.notifications DROP COLUMN IF EXISTS is_read;
ALTER TABLE timerecording.time_records DROP COLUMN IF EXISTS prev_status;
DROP INDEX IF EXISTS timerecording.idx_tr_notifications_unread;

-- ── 2. 生产已有的通知索引（从零建库/旧迁移环境补齐） ───────────────
CREATE INDEX IF NOT EXISTS idx_tr_notifications_task_id
  ON timerecording.notifications (task_id);
CREATE INDEX IF NOT EXISTS idx_tr_notifications_user_created
  ON timerecording.notifications (user_id, created_at);

-- ── 3. 删号前置：task_assignments.created_by 必须可空 ─────────────
ALTER TABLE timerecording.task_assignments ALTER COLUMN created_by DROP NOT NULL;

COMMIT;
