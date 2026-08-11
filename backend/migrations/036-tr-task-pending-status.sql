-- 036: task_assignments 状态增加 pending（待开始）+ 结束日期允许与开始同日
-- 1) 前端状态栏新增「待开始」选项 → status CHECK 需允许 'pending'。
-- 2) chk_end_after_start 原为 end_datetime > start_datetime（严格大于），
--    与前端「最短 1 天（起止同日）」的校验相矛盾：前端放行、后端拒绝（静默死功能）。
--    放宽为 >=，与前端口径一致。
-- 需以 postgres 超级用户执行（budget_app 无 DDL 权限）。
ALTER TABLE timerecording.task_assignments
  DROP CONSTRAINT IF EXISTS task_assignments_status_check,
  ADD CONSTRAINT task_assignments_status_check
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'postponed', 'delayed'));

ALTER TABLE timerecording.task_assignments
  DROP CONSTRAINT IF EXISTS chk_end_after_start,
  ADD CONSTRAINT chk_end_after_start CHECK (end_datetime >= start_datetime);
