-- 044：外键清理（A112）——删除与命名外键重复的内联 NO ACTION 外键；交付报价外键 SET NULL → NO ACTION
--
-- 背景：从零建库的 schema.sql 在建表内联 REFERENCES（隐式 NO ACTION 约束）之外，又在外键补齐段
-- ALTER ADD 了同名列的命名外键（ON DELETE SET NULL）。同一列挂两条外键动作冲突（NO ACTION vs SET NULL），
-- 且隐式约束名随 PG 自动生成不可预期。此处删除内联的 NO ACTION 隐式约束，保留语义明确的命名 SET NULL 外键。
--
-- 另：delivery_projects.quotation_id 为 NOT NULL，原 fk_delivery_quotation 为 ON DELETE SET NULL——
-- 删除被引用的报价会先尝试置 NULL，撞 NOT NULL 抛 23502（非空）而非明确的 23503（外键）。改为 NO ACTION
-- 让删除报价带引用时报出清晰的"存在关联数据"。

-- ① quotations.opportunity_id：内联隐式外键（NO ACTION）与 fk_quotations_opportunity（SET NULL）重复
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'quotations_opportunity_id_fkey' AND conrelid = 'quotations'::regclass) THEN
    ALTER TABLE quotations DROP CONSTRAINT quotations_opportunity_id_fkey;
  END IF;
END $$;

-- ② group_items.component_id：内联隐式外键（NO ACTION）与 fk_group_items_component（SET NULL）重复
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'group_items_component_id_fkey' AND conrelid = 'group_items'::regclass) THEN
    ALTER TABLE group_items DROP CONSTRAINT group_items_component_id_fkey;
  END IF;
END $$;

-- ③ fk_delivery_quotation：SET NULL → NO ACTION（quotation_id NOT NULL，SET NULL 撞 23502）
ALTER TABLE delivery_projects DROP CONSTRAINT IF EXISTS fk_delivery_quotation;
ALTER TABLE delivery_projects ADD CONSTRAINT fk_delivery_quotation FOREIGN KEY (quotation_id) REFERENCES quotations(id);
