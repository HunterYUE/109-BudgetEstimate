-- 012-align-eproj-quote.sql
-- 交付 E-PROJ 报价与合同对齐（011 改了合同金额，此迁移同步 E-PROJ 报价编制表）
-- E-PROJ 版本 discounted_price = 交付合同金额，并按成本结构重算 gp3_amount/gp3_profit_rate；
-- E-报价 amount / profit_rate 同步。

-- 1. E-PROJ 版本 discounted_price = 对应交付合同金额（折后报价=合同）
UPDATE project_versions pv
SET discounted_price = dp.contract_amount
FROM delivery_projects dp
JOIN quotations q ON q.id = dp.quotation_id
WHERE q.project_id = pv.project_id AND q.version_no = pv.version_no
  AND pv.discounted_price <> dp.contract_amount;

-- 2. 重算 E-PROJ 版本 gp3_amount / gp3_profit_rate（与 010 同口径：discounted − 含税总成本）
WITH eproj AS (
  SELECT pv.id AS vid, pv.discounted_price AS dp, pv.tax_rate AS tr,
    COALESCE((SELECT SUM(gi.direct_cost) FROM project_groups g JOIN group_items gi ON gi.group_id=g.id
      WHERE g.project_id=pv.project_id AND g.group_type IN ('EQUIPMENT','INTEGRATION') AND gi.has_warranty=false),0) AS wbase
  FROM project_versions pv JOIN projects p ON p.id=pv.project_id WHERE p.sales_no LIKE 'A%-E-PROJ'
)
UPDATE project_versions pv SET
  gp3_amount = ROUND(e.dp - ROUND((pv.total_direct_cost + ROUND(e.wbase*pv.warranty_rate) + ROUND(pv.total_direct_cost*pv.risk_rate) + pv.commercial_cost)*(1+e.tr))),
  gp3_profit_rate = (e.dp - ROUND((pv.total_direct_cost + ROUND(e.wbase*pv.warranty_rate) + ROUND(pv.total_direct_cost*pv.risk_rate) + pv.commercial_cost)*(1+e.tr))) / e.dp
FROM eproj e WHERE e.vid = pv.id AND e.dp > 0;

-- 3. E-报价 amount / profit_rate 同步为版本折后报价与概算利润率
UPDATE quotations q
SET amount = pv.discounted_price,
    profit_rate = ROUND(pv.gp3_profit_rate * 100, 2)
FROM project_versions pv
WHERE pv.project_id = q.project_id AND pv.version_no = q.version_no
  AND q.sales_no LIKE 'A%-E';
