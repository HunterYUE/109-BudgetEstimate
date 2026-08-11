-- 035: task_assignments 增加 cost_center 列（任务关联成本中心，供搜索与成本归属）
-- 任务规划页搜索框按成本中心过滤 + 分配弹窗可填成本中心。
-- 需以 postgres 超级用户执行（budget_app 无 DDL 权限）。
ALTER TABLE timerecording.task_assignments
  ADD COLUMN IF NOT EXISTS cost_center text;
