-- 016-audit-followup.sql
-- 015 遗漏/修正：
-- 1. MES 版本 direct_cost 修正错误（应为 1191503，使组件之和=total_cost=1241150）
-- 2. A2026-07-002-S 中间版本 V1.0-V1.5 只有价格无成本、且状态为 approved → 标记 draft（未完成），
--    gp3_amount 归零（避免 gp3_amount=discounted 造成的"100%利润率"矛盾）

-- 1. MES direct_cost 修正
UPDATE project_versions pv SET total_direct_cost = 1191503
FROM projects p WHERE p.id=pv.project_id AND p.sales_no='A2025-03-004-S' AND pv.version_no='V1.0';

-- 2. A2026-07-002-S 中间版本标记 draft + gp3_amount 归零（V1.0 本为 0）
UPDATE project_versions pv SET review_status = 'draft', gp3_amount = 0
FROM projects p WHERE p.id=pv.project_id AND p.sales_no='A2026-07-002-S' AND pv.version_no IN ('V1.1','V1.2','V1.3','V1.4','V1.5');
UPDATE project_versions pv SET review_status = 'draft'
FROM projects p WHERE p.id=pv.project_id AND p.sales_no='A2026-07-002-S' AND pv.version_no = 'V1.0';

-- 对应报价标记 draft
UPDATE quotations q SET status = 'draft'
FROM projects p WHERE p.id=q.project_id AND p.sales_no='A2026-07-002-S' AND q.version_no IN ('V1.0','V1.1','V1.2','V1.3','V1.4','V1.5');
