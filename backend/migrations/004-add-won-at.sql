-- 004-add-won-at.sql
-- 销售机会表新增赢单时间戳（转交付时写入，后续编辑不覆盖）
ALTER TABLE sales_opportunities ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ;
