-- ============================================================
-- 028-project-groups-unique.sql
-- 数据库审计 F12 修复：版本隔离下 (version_id, group_no) 应唯一，
-- 防止前端跨版本保存未同步组 id 时对同一版本重复插入同号组。
-- 先清理已有重复组（保留最早创建的，其后重复者级联删除明细），再加唯一约束。
-- ⚠️ 幂等：唯一约束用 DO 块判断；重复清理可安全重复执行。
-- ============================================================

BEGIN;

-- 1. 清理同版本下相同 group_no 的重复组（保留 created_at 最早者；group_items 经外键 CASCADE 随删）
DELETE FROM project_groups pg
WHERE EXISTS (
  SELECT 1 FROM project_groups pg2
  WHERE pg2.version_id = pg.version_id
    AND pg2.group_no = pg.group_no
    AND (pg2.created_at < pg.created_at
         OR (pg2.created_at = pg.created_at AND pg2.id < pg.id))
);

-- 2. 加唯一约束（幂等）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_project_groups_version_no') THEN
    ALTER TABLE project_groups ADD CONSTRAINT uq_project_groups_version_no UNIQUE (version_id, group_no);
  END IF;
END $$;

COMMIT;
