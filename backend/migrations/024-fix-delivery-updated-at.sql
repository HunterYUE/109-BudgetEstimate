-- 024-fix-delivery-updated-at.sql
-- 修复交付项目 updated_at 被 update_updated_at 触发器批量覆盖为 now() 的问题
-- 现象：所有交付项目 updated_at 都被刷到同一天（如 2026-07-31），
--       导致已完成项目被误算进当前财年（甘特图 6 vs 延期天数卡片 9 等不一致）
-- 处理：已完成项目 updated_at 回填为节点15实际完成日（交付完结时间），
--       与交付分析代码「已完成项目有效结束 = 节点15实际完成日」一致
-- ⚠️ delivery_projects 有 BEFORE UPDATE 触发器 trg_delivery_projects_updated_at，
--    直接 UPDATE updated_at 会被覆盖为 now()，需先临时禁用、更新后再启用
-- ⚠️ delivery_nodes.actual_date 为 character varying，需 ::timestamp 转换；
--    仅处理符合日期格式的值，异常值跳过（保持现状）

BEGIN;

ALTER TABLE delivery_projects DISABLE TRIGGER trg_delivery_projects_updated_at;

UPDATE delivery_projects dp
SET updated_at = dn.actual_date::timestamp
FROM delivery_nodes dn
WHERE dn.delivery_project_id = dp.id
  AND dn.node_no = 15
  AND dn.actual_date IS NOT NULL
  AND dn.actual_date <> ''
  AND dn.actual_date ~ '^\d{4}-\d{2}-\d{2}'
  AND dp.status = '已完成';

ALTER TABLE delivery_projects ENABLE TRIGGER trg_delivery_projects_updated_at;

COMMIT;
