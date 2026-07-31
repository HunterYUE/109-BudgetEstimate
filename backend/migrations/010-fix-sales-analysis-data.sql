-- 010-fix-sales-analysis-data.sql
-- 修复销售分析测试数据（2026-07-30 批量回填造成的污染）
-- 目标：使机会/交付数据自洽，暴露并配合代码修复"订单/销售金额只归集一次"的规则

-- ============================================================
-- 1. （已移除）恢复 updated_at 为业务完结时间
--    原因：sales_opportunities 有 update_updated_at 触发器，任何 UPDATE 都会把
--    updated_at 覆盖为 now()，无法写入历史时间；且代码修复后销售分析改用
--    wonAt/lostAt 作为赢/输机会的"有效结束日期"，不再依赖 updated_at。
-- ============================================================

-- ============================================================
-- 2. 重指历史机会的 quotation_id 到真实 E-PROJ 报价
--    仅改当前指向占位项目(QUOTATION-BASE)报价的 6 条机会；
--    A2026-07 系列仍保留其 S-报价引用（gp3_amount 已真实）
-- ============================================================
UPDATE sales_opportunities
SET quotation_id = '7c0f3911-654c-4ece-b3bb-8615ec3cb5cd'
WHERE quotation_id = 'e1a9f48c-a976-4f7a-a318-d41581537fa7';  -- A2024-09-001-S 变压器

UPDATE sales_opportunities
SET quotation_id = '368b785d-4aef-4eed-a0a1-6dc57f875302'
WHERE quotation_id = 'bb48906d-8f92-43b7-a00e-cf5c0ed728f3';  -- A2025-02-002-S 激光切割

UPDATE sales_opportunities
SET quotation_id = '6496aad9-e4ab-400e-b317-e736f420aa57'
WHERE quotation_id = '648fbec7-5999-414b-9246-879c6b2e0ac5';  -- A2025-08-006-S 焊接

UPDATE sales_opportunities
SET quotation_id = '47cbcfd6-bac6-48a9-bbad-3843528e9c12'
WHERE quotation_id = 'bddaf355-11b8-4f64-9698-5c2e7388b14d';  -- A2025-10-007-S 钣金

UPDATE sales_opportunities
SET quotation_id = 'da605e3b-550b-459a-9c62-2d85553a147e'
WHERE quotation_id = '424dd616-4d24-40d0-8fe7-53d4518e4a1a';  -- A2026-03-008-S 电气柜

UPDATE sales_opportunities
SET quotation_id = '917f0a8f-bcc8-4411-9fc6-90daff31ffe2'
WHERE quotation_id = '59cc2427-85a0-4f39-83ea-e4b920ee8e44';  -- A2026-07-013-S 冲压

-- ============================================================
-- 3. 按成本结构重算 E-PROJ 版本的 GP3（与 calcProjectSummary 同口径）
--    warrantyBase = Σ(设备/集成组内 has_warranty=false 项次 direct_cost)
--    totalCost    = total_direct_cost + round(warrantyBase*warranty_rate)
--                    + round(total_direct_cost*risk_rate) + commercial_cost
--    gp3_amount   = round(discounted_price − round(totalCost*(1+tax_rate)))
--    gp3_profit_rate = gp3_amount / discounted_price
-- ============================================================
WITH eproj AS (
  SELECT
    pv.id AS vid,
    pv.discounted_price AS dp,
    pv.tax_rate AS tr,
    COALESCE((
      SELECT SUM(gi.direct_cost)
      FROM project_groups g
      JOIN group_items gi ON gi.group_id = g.id
      WHERE g.project_id = pv.project_id
        AND g.group_type IN ('EQUIPMENT','INTEGRATION')
        AND gi.has_warranty = false
    ), 0) AS wbase
  FROM project_versions pv
  JOIN projects p ON p.id = pv.project_id
  WHERE p.sales_no LIKE 'A%-E-PROJ'
),
computed AS (
  SELECT
    e.vid,
    ROUND((e.dp
      - ROUND((pv.total_direct_cost
        + ROUND(e.wbase * pv.warranty_rate)
        + ROUND(pv.total_direct_cost * pv.risk_rate)
        + pv.commercial_cost) * (1 + e.tr))
    )) AS gp3_amount,
    (e.dp
      - ROUND((pv.total_direct_cost
        + ROUND(e.wbase * pv.warranty_rate)
        + ROUND(pv.total_direct_cost * pv.risk_rate)
        + pv.commercial_cost) * (1 + e.tr))
    ) / e.dp AS gp3_profit_rate
  FROM eproj e
  JOIN project_versions pv ON pv.id = e.vid
  WHERE e.dp > 0
)
UPDATE project_versions pv
SET gp3_amount = c.gp3_amount,
    gp3_profit_rate = c.gp3_profit_rate
FROM computed c
WHERE c.vid = pv.id;

-- 同步 9 条 E-报价的 profit_rate 为该 GP3%（百分比），保持报价与版本一致
UPDATE quotations q
SET profit_rate = ROUND(pv.gp3_profit_rate * 100, 2)
FROM project_versions pv
WHERE pv.project_id = q.project_id AND pv.version_no = q.version_no
  AND pv.gp3_profit_rate > 0
  AND q.sales_no LIKE 'A%-E';

-- ============================================================
-- 4. 删除占位 QUOTATION-BASE 项目及其报价（重指后无任何引用）
--    quotations.project_id 为 NO ACTION，须先删报价再删项目；
--    项目的 project_versions / project_groups / group_items 由 CASCADE 删除
-- ============================================================
DELETE FROM quotations WHERE project_id = '2b4ab66a-f274-4a9a-9519-303ed1349f2e';
DELETE FROM projects    WHERE id         = '2b4ab66a-f274-4a9a-9519-303ed1349f2e';
