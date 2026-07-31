-- 026-rename-customer-quotes-to-S.sql
-- 数据修正：客户报价（报价编制表）的销售编号应使用销售项目号（-S 结尾），
-- 而非交付项目号（-E）。-E 是转交付后由销售编号派生出的交付项目编号
-- （delivery_projects.sales_no）。机会与交付都关联同一个 -S 客户报价。
-- 修复：把被机会引用的 -E 报价重命名为对应机会的 -S 销售编号。
-- ⚠️ 纯数据 UPDATE，无 schema 变更，schema.sql 无需同步。
-- ⚠️ 报价表有 updated_at 触发器，更新会刷新 updated_at（正常编辑行为）。

UPDATE quotations q
SET sales_no = o.sales_no
FROM sales_opportunities o
WHERE o.quotation_id = q.id
  AND q.sales_no LIKE '%-E'
  AND q.sales_no <> o.sales_no;
