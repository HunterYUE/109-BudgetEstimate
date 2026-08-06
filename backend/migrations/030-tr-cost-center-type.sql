-- ============================================================
-- 030-tr-cost-center-type.sql
-- 工时系统：成本中心类型 + 周锁定原状态保留
--   1. time_records 增加 cost_center_type（销售/项目/质保/部门/个人）
--   2. time_records 增加 prev_status（周锁定前状态，解锁时恢复）
--   3. 按编号格式回填存量 cost_center_type
-- ============================================================

-- 成本中心类型列（sales/project/warranty/department/personal）
ALTER TABLE timerecording.time_records
  ADD COLUMN IF NOT EXISTS cost_center_type TEXT;

-- 周锁定前状态（lock-week 保存、unlock 恢复，避免解锁后丢失 submitted 状态）
ALTER TABLE timerecording.time_records
  ADD COLUMN IF NOT EXISTS prev_status TEXT;

-- 回填存量数据：按 cost_center 编号格式推断类型
--   销售 A2026-07-003-S / 项目 A2026-07-003-E / 质保 A2026-07-003-W
--   部门 A2627-De-000 / 个人 A2627-00-000
UPDATE timerecording.time_records
SET cost_center_type = CASE
  WHEN cost_center LIKE 'A%-De-%' THEN 'department'
  WHEN cost_center LIKE 'A%-00-%' THEN 'personal'
  WHEN cost_center LIKE 'A%-S' THEN 'sales'
  WHEN cost_center LIKE 'A%-E' THEN 'project'
  WHEN cost_center LIKE 'A%-W' THEN 'warranty'
  ELSE NULL
END
WHERE cost_center_type IS NULL AND cost_center IS NOT NULL AND cost_center != '';

-- 查询索引：按类型/编号聚合统计
CREATE INDEX IF NOT EXISTS idx_tr_time_records_cost_type
  ON timerecording.time_records(cost_center_type, cost_center);

-- ============================================================
-- 通知类型扩展：任务推送(task) / 任务完成反馈(task_feedback)
-- ============================================================
ALTER TABLE timerecording.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE timerecording.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('approval', 'rejection', 'submission', 'task', 'task_feedback'));
