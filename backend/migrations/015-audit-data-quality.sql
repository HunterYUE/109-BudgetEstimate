-- 015-audit-data-quality.sql
-- 全量审计发现的数据质量问题修复（报价↔版本一致、版本内部自洽、客户悬挂销售员）
-- 均为"修正错误数据"，不新增记录。

-- A. 报价金额与版本折后价不一致
UPDATE quotations SET amount = 903000  WHERE sales_no='A2026-07-003-S' AND version_no='V1.2'; -- 900000 → 903000
UPDATE quotations SET amount = 2700000 WHERE sales_no='A2026-07-008-S' AND version_no='V1.2'; -- 2700001 → 2700000

-- B. 报价 profit_rate 与版本 gp3_profit_rate×100 不一致（以版本为准）
UPDATE quotations SET profit_rate = 17.44
WHERE sales_no='A2026-07-005-S' AND version_no IN ('V1.0','V1.1'); -- 16.52/18.12 → 17.44

-- C. 版本 gp3_profit_rate 与其自身 gp3_amount/discounted 矛盾（008 V1.1/V1.2 遗留 V1.0 的 33.38%）
UPDATE project_versions pv SET gp3_profit_rate = 0.2862
FROM projects p WHERE p.id=pv.project_id AND p.sales_no='A2026-07-008-S' AND pv.version_no='V1.1'; -- 801446/2800000
UPDATE project_versions pv SET gp3_profit_rate = 0.2598
FROM projects p WHERE p.id=pv.project_id AND p.sales_no='A2026-07-008-S' AND pv.version_no='V1.2'; -- 701446/2700000

-- D. 迁移 013 版本组件算术错误：total_direct_cost 修正，使 组件之和 = total_cost（gp3 目标不变）
UPDATE project_versions pv SET total_direct_cost = 1179503
FROM projects p WHERE p.id=pv.project_id AND p.sales_no='A2025-03-004-S' AND pv.version_no='V1.0'; -- 1185503→1179503, 组件和=1241150=total_cost
UPDATE project_versions pv SET total_direct_cost = 1569982
FROM projects p WHERE p.id=pv.project_id AND p.sales_no='A2024-11-005-S' AND pv.version_no='V1.0'; -- 1571982→1569982, 组件和=1635398=total_cost

-- E.（已撤销）客户销售员：南通威尔曼 保持 赵丰华（客户账户负责人），项目级机会仍由岳宏大跟进；
--    不修改 client.salesman。
