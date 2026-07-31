-- 025-fix-opp-quotation-alignment.sql
-- 测试数据修复：已赢单机会的 quotation_id 与交付关联报价对齐
-- 根因：测试期手动造数据时机会仍指向旧的 -S 报价（V1.7/V1.3/V1.4，gp3 较低），
--       交付指向新的 -E 报价，导致销售分析（读机会报价 gp3）与交付分析（读交付报价 gp3）
--       对同一订单的概算利润不一致（如 A2026-07-002：156,965 vs 390,555）。
-- 修复：机会 quotation_id 重指向交付关联的报价。这与应用转交付逻辑一致
--       （confirmDeliver 中 delivery.quotationId = opp.quotationId，二者本就该指向同一报价）。
-- ⚠️ 纯数据 UPDATE，无 schema 变更，schema.sql 无需同步。
-- ⚠️ 机会表有 updated_at 触发器，更新会刷新 updated_at（不影响财年归属：赢单用 wonAt 判定）。

UPDATE sales_opportunities o
SET quotation_id = d.quotation_id
FROM delivery_projects d
WHERE d.opportunity_id = o.id
  AND o.status = '赢'
  AND o.quotation_id IS DISTINCT FROM d.quotation_id;
