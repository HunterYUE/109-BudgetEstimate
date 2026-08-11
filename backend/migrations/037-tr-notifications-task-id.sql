-- 037: notifications 增加 task_id（软关联被删除任务）
-- 任务删除后，其「您有新任务 / 任务更新 / 任务反馈」通知若无关联会成为孤儿（指向已删除任务）。
-- 加 task_id 供 DELETE /task-assignments 时按任务清理关联通知。无 FK（软引用，手动清理）。
-- 需以 postgres 超级用户执行（budget_app 无 DDL 权限）。
ALTER TABLE timerecording.notifications
  ADD COLUMN IF NOT EXISTS task_id uuid;
