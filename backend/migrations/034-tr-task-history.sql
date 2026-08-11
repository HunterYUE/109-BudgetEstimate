-- 034: task_assignments 增加 history 列（编辑历史快照，jsonb 数组）
-- 前端编辑任务时把旧版本快照追加进 history，弹窗展示「当前版本 + 历史版本」。
-- 需以 postgres 超级用户执行（budget_app 无 DDL 权限）。
ALTER TABLE timerecording.task_assignments
  ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb;
