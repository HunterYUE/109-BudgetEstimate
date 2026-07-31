-- 013-add-pipeline-quotes.sql
-- 为无报价的管道机会补齐报价编制表数据（折扣价格/折扣率/项目利润/利润率）
-- 背景：FY2526/FY2627 加权管道中 MES/数字化车间/冻结 3 个机会没有报价编制表，
--       加权利润/利润率按 0 处理（管理信号）。补齐报价后利润率来自报价真实数据。
-- 机会：A2025-03-004-S(MES, gp3 15%)、A2026-04-011-S(数字化车间, 18%)、A2024-11-005-S(冻结, 12%)
-- 口径：折后报价(含税)=机会金额；折扣率 5%；总成本=折后未税×(1-gp3)；成本结构自洽。

-- 1. 创建报价编制表项目（sales_no 用机会编号，无冲突）
INSERT INTO projects (id, sales_no, client_name, project_name, created_at, updated_at) VALUES
  (gen_random_uuid(), 'A2025-03-004-S', '思源中压',   'MES系统集成',       now(), now()),
  (gen_random_uuid(), 'A2026-04-011-S', '思源中压',   '数字化车间改造',     now(), now()),
  (gen_random_uuid(), 'A2024-11-005-S', '南通威尔曼', '自动化检测线',       now(), now());

-- 2. 创建版本 V1.0（折扣价格=机会金额含税；折扣率5%；目标利润率 15%/18%/12%）
INSERT INTO project_versions (
  id, project_id, version_no, eur_rate, tax_rate, rounding_digits,
  warranty_rate, risk_rate, commercial_cost,
  total_direct_cost, total_accounting_price, discounted_price, discount_rate,
  total_cost, warranty_cost, risk_cost,
  gp3_profit_rate, gp3_amount, review_status, created_at, updated_at
)
SELECT gen_random_uuid(), p.id, 'V1.0', 7.8, 0.13, 0, 0.02, 0.02, v.commercial,
  v.direct, v.accounting, v.discounted, v.discount_rate,
  v.total_cost, v.warranty, v.risk,
  v.gp3, v.gp3_amount, 'approved', now(), now()
FROM projects p
JOIN (
  VALUES
    ('A2025-03-004-S', 1185503, 12412, 24823, 12412, 1241150, 1736842, 1650000, 0.05, 0.15, 247500),
    ('A2026-04-011-S', 1532601, 15965, 31929, 15965, 1596460, 2315790, 2200000, 0.05, 0.18, 396000),
    ('A2024-11-005-S', 1571982, 16354, 32708, 16354, 1635398, 2210526, 2100000, 0.05, 0.12, 252000)
) AS v(sales_no, direct, warranty, risk, commercial, total_cost, accounting, discounted, discount_rate, gp3, gp3_amount)
  ON v.sales_no = p.sales_no;

-- 3. 创建报价（profit_rate=gp3×100；关联机会）
INSERT INTO quotations (
  id, project_id, version_no, sales_no, client_name, project_name,
  status, amount, total_cost, profit_rate, opportunity_id, created_at, updated_at
)
SELECT gen_random_uuid(), p.id, pv.version_no, p.sales_no, p.client_name, p.project_name,
  'approved', pv.discounted_price, pv.total_cost, pv.gp3_profit_rate * 100, so.id, now(), now()
FROM projects p
JOIN project_versions pv ON pv.project_id = p.id AND pv.version_no = 'V1.0'
JOIN sales_opportunities so ON so.sales_no = p.sales_no
WHERE p.sales_no IN ('A2025-03-004-S','A2026-04-011-S','A2024-11-005-S');

-- 4. 回写机会 quotation_id
UPDATE sales_opportunities so
SET quotation_id = q.id
FROM quotations q
WHERE q.opportunity_id = so.id AND so.quotation_id IS NULL;
