-- 003-add-actual-costs.sql
-- 交付管理：为逐项实际成本添加持久化字段
-- 将 per-item actualCosts 以 JSONB 格式存储

ALTER TABLE delivery_projects
  ADD COLUMN IF NOT EXISTS actual_costs JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN delivery_projects.actual_costs IS '逐项实际成本 JSON: { itemId: number }';
