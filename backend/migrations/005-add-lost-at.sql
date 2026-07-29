-- 005-add-lost-at.sql
-- 销售机会表新增输单确认时间戳（确认终止时写入，后续编辑不覆盖）
-- 与 won_at 对称设计：赢单在转交付时采集，输单在确认终止时采集
ALTER TABLE sales_opportunities ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ;

COMMENT ON COLUMN sales_opportunities.lost_at IS '输单确认时间，与 won_at 对称。确认终止操作时写入，后续编辑不覆盖';
