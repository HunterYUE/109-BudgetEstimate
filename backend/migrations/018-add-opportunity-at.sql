-- 018-add-opportunity-at.sql
-- 新增"进入机会时间"字段：销售周期口径改为 [成为机会 → 转交付]
-- opportunity_at = 项目被创建为机会 或 从线索晋升为机会 的时间
-- 信息/线索阶段为 NULL（尚未成为机会）；创建/晋升时由后端写入
ALTER TABLE sales_opportunities ADD COLUMN IF NOT EXISTS opportunity_at timestamptz;

-- 回填：现有"机会+"阶段的机会，进入机会时间 ≈ 创建时间（测试数据均创建于机会+ 或晋升≈创建）
UPDATE sales_opportunities SET opportunity_at = created_at
WHERE stage IN ('机会','投标','议价','中标') AND opportunity_at IS NULL;
