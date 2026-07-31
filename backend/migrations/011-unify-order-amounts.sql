-- 011-unify-order-amounts.sql
-- 统一"赢单金额 = 合同金额 = 转交付金额 = 最新版本报价折后报价（含税）"
-- 背景：模拟数据人为制造了 5% 差异（历史机会金额偏高、2026-07 交付合同偏低），
--       导致月度订单与销售员订单金额不一致。正确口径：三者同源于机会关联报价的
--       最新版本 discounted_price（含税），差异仅含税/未税。
-- 修复：机会金额 amount 与交付合同金额 contract_amount 都设为该折后报价。

-- 机会金额 = 机会关联报价的最新版本折后报价（含税）
WITH win_quote AS (
  SELECT
    so.id AS opp_id,
    pv.discounted_price AS dprice
  FROM sales_opportunities so
  JOIN quotations q ON q.id = so.quotation_id
  JOIN project_versions pv ON pv.project_id = q.project_id AND pv.version_no = q.version_no
  WHERE so.status = '赢' AND so.won_at IS NOT NULL
    AND pv.discounted_price IS NOT NULL AND pv.discounted_price > 0
)
UPDATE sales_opportunities so
SET amount = w.dprice
FROM win_quote w
WHERE w.opp_id = so.id;

-- 交付合同金额 = 同一折后报价（经机会 opportunity_id 关联）
WITH win_quote AS (
  SELECT
    so.id AS opp_id,
    pv.discounted_price AS dprice
  FROM sales_opportunities so
  JOIN quotations q ON q.id = so.quotation_id
  JOIN project_versions pv ON pv.project_id = q.project_id AND pv.version_no = q.version_no
  WHERE so.status = '赢' AND so.won_at IS NOT NULL
    AND pv.discounted_price IS NOT NULL AND pv.discounted_price > 0
)
UPDATE delivery_projects dp
SET contract_amount = w.dprice
FROM win_quote w
WHERE w.opp_id = dp.opportunity_id;
