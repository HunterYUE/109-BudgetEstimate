-- 019-add-stage-at.sql
-- 新增"进入各阶段时间"：漏斗当期快照按历史阶段分桶（而非当前阶段）
-- lead_at(线索) / opportunity_at(机会,已有) / bid_at(投标) / negotiation_at(议价) / 中标=won_at / 信息=created_at
ALTER TABLE sales_opportunities ADD COLUMN IF NOT EXISTS lead_at timestamptz;
ALTER TABLE sales_opportunities ADD COLUMN IF NOT EXISTS bid_at timestamptz;
ALTER TABLE sales_opportunities ADD COLUMN IF NOT EXISTS negotiation_at timestamptz;

-- 回填：按 创建→结束(赢/输/now) 线性插值，模拟合理阶段推进（仅记录已到达的阶段）
-- 线索+
UPDATE sales_opportunities SET lead_at = created_at WHERE stage IN ('线索','机会','投标','议价','中标');
-- 机会+
UPDATE sales_opportunities
SET opportunity_at = created_at + ((COALESCE(won_at, lost_at, now()) - created_at) * 0.10)
WHERE stage IN ('机会','投标','议价','中标') AND opportunity_at IS NULL;
-- 投标+
UPDATE sales_opportunities
SET bid_at = created_at + ((COALESCE(won_at, lost_at, now()) - created_at) * 0.30)
WHERE stage IN ('投标','议价','中标');
-- 议价+
UPDATE sales_opportunities
SET negotiation_at = created_at + ((COALESCE(won_at, lost_at, now()) - created_at) * 0.55)
WHERE stage IN ('议价','中标');

-- MES：16个月过程项目，展示阶段推进（线索2025-03 → 机会2025-05 → 投标2026-07）
UPDATE sales_opportunities
SET stage = '投标',
    opportunity_at = '2025-05-01 10:00:00+08',
    bid_at = '2026-07-01 10:00:00+08'
WHERE sales_no = 'A2025-03-004-S';
