-- ============================================================
-- 029-drop-duplicate-triggers.sql
-- 清理重复的 updated_at 触发器（迁移 006 遗留）：
-- sales_opportunities / blue_tables 各有 2 个相同功能的 BEFORE UPDATE 触发器
--   - trg_*_updated_at            → 基表触发器，用 update_updated_at()
--   - update_*_updated_at         → 迁移 006 补充的重复触发器，用 update_updated_at_column()
-- 保留基表 trg_*_updated_at，删除 update_*_updated_at 及孤儿函数 update_updated_at_column()。
-- ⚠️ 已实证：update_updated_at_column() 仅被这两个 update_* 触发器引用，删除安全。
-- ⚠️ 幂等：DROP ... IF EXISTS。
-- ============================================================

BEGIN;

-- 1. 删除迁移 006 补充的重复触发器（保留基表 trg_*_updated_at）
DROP TRIGGER IF EXISTS update_blue_tables_updated_at ON blue_tables;
DROP TRIGGER IF EXISTS update_sales_opportunities_updated_at ON sales_opportunities;

-- 2. 删除孤儿函数（已确认仅被上述两个触发器引用）
DROP FUNCTION IF EXISTS update_updated_at_column();

COMMIT;
