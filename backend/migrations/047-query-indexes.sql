-- 047: 高频列表查询索引（2026-10 全量审计）
-- 背景：审批/交付列表按 updated_at DESC 排序；工时按 user_id + date 范围读取。
-- 全部 IF NOT EXISTS，可重复执行。

BEGIN;

CREATE INDEX IF NOT EXISTS idx_approval_requests_updated_at ON approval_requests (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_projects_updated_at ON delivery_projects (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tr_time_records_user_date ON timerecording.time_records (user_id, date DESC);

COMMIT;
