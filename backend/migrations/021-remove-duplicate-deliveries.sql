-- 021-remove-duplicate-deliveries.sql
-- 删除测试转交付时误创建的重复交付项目：同一机会保留最早创建的原始交付
-- delivery_nodes / delivery_files 为 CASCADE，随项目一并删除
DELETE FROM delivery_projects dp
USING (
  SELECT d.id FROM delivery_projects d
  WHERE d.opportunity_id IS NOT NULL
    AND d.created_at > (
      SELECT MIN(created_at) FROM delivery_projects d2 WHERE d2.opportunity_id = d.opportunity_id
    )
) dup
WHERE dp.id = dup.id;
