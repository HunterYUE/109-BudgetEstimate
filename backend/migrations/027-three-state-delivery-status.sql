-- ============================================================
-- 027 交付状态三态化
-- 节点执行状态删除 delayed：延期改为派生维度（analysisShared.getNodeDelay）
-- 项目执行状态改 未开始/进行中/已完成：删除 已延期（延期改派生 getProjectDelay）
-- ⚠️ 改结构迁移，须同步 database/schema.sql（类型定义 + 默认值）
-- ============================================================

-- 1. 节点 delayed → 有实际完成日 completed / 否则 in_progress（延期中为派生维度）
UPDATE delivery_nodes
SET status = (CASE
  WHEN actual_date IS NOT NULL AND actual_date <> '' THEN 'completed'
  ELSE 'in_progress'
END)::node_status
WHERE status = 'delayed';

-- 2. 项目 已延期 → 节点15已完成 已完成 / 否则 进行中（延期中为派生维度）
UPDATE delivery_projects dp
SET status = (CASE
  WHEN EXISTS (
    SELECT 1 FROM delivery_nodes dn
    WHERE dn.delivery_project_id = dp.id AND dn.node_no = 15 AND dn.status = 'completed'
  ) THEN '已完成' ELSE '进行中'
END)::delivery_status
WHERE dp.status = '已延期';

-- 3. 节点枚举重建为三态（删除 delayed；rename+recreate 避免 DROP VALUE 兼容问题）
--    列默认值需先 DROP 再 SET（类型切换时默认值不能自动转型）
ALTER TYPE node_status RENAME TO node_status_old;
CREATE TYPE node_status AS ENUM ('pending', 'in_progress', 'completed');
ALTER TABLE delivery_nodes ALTER COLUMN status DROP DEFAULT;
ALTER TABLE delivery_nodes ALTER COLUMN status TYPE node_status USING status::text::node_status;
ALTER TABLE delivery_nodes ALTER COLUMN status SET DEFAULT 'pending';
DROP TYPE node_status_old;

-- 4. 项目枚举重建为三态（未开始/进行中/已完成；删除 已延期）
ALTER TYPE delivery_status RENAME TO delivery_status_old;
CREATE TYPE delivery_status AS ENUM ('未开始', '进行中', '已完成');
ALTER TABLE delivery_projects ALTER COLUMN status DROP DEFAULT;
ALTER TABLE delivery_projects ALTER COLUMN status TYPE delivery_status USING status::text::delivery_status;
ALTER TABLE delivery_projects ALTER COLUMN status SET DEFAULT '进行中';
DROP TYPE delivery_status_old;
