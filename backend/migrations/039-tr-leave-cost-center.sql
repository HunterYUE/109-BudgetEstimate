-- 039-tr-leave-cost-center.sql
-- 新增「个人请休假」成本中心类型（type = 'leave'，编码 A{财年}-LE-000，如 A2627-LE-000）：
--   1. cost_centers.type CHECK 约束加入 'leave'（此前仅 warranty/department/personal）
--   2. 当前+近三年财年补建 A{前缀}-LE-000 请休假中心（正式生成由 costCenterSync 每小时同步负责，此为安全网）
--   3. 未标注类型的存量记录按 A%-LE-% 回填 cost_center_type = 'leave'
--
-- 使用方式：
--   cat 039-tr-leave-cost-center.sql | ssh tencent-budget 'su - postgres -c "psql -v ON_ERROR_STOP=1 -d budget_estimate"'

BEGIN;

-- 1. cost_centers.type CHECK 约束加入 'leave'
ALTER TABLE timerecording.cost_centers DROP CONSTRAINT IF EXISTS cost_centers_type_check;
ALTER TABLE timerecording.cost_centers
  ADD CONSTRAINT cost_centers_type_check
  CHECK (type = ANY (ARRAY['warranty','department','personal','leave']));

-- 2. 安全网：当前财年 + 近两个老财年补建请休假中心（幂等；costCenterSync 启动/每小时同步也会建）
INSERT INTO timerecording.cost_centers (code, name, type, fy)
SELECT 'A' || substr(s.fy, 3, 4) || '-LE-000', '请休假成本中心', 'leave', s.fy
FROM (VALUES ('FY2627'), ('FY2526'), ('FY2425')) AS s(fy)
ON CONFLICT (code) DO NOTHING;

-- 3. 回填未标注类型的存量记录（A%-LE-% 分支置于 A%-00-% 前，防御性——LE 码不含 '-00-'）
UPDATE timerecording.time_records
SET cost_center_type = CASE
  WHEN cost_center LIKE 'A%-LE-%' THEN 'leave'
  WHEN cost_center LIKE 'A%-DE-%' THEN 'department'
  WHEN cost_center LIKE 'A%-00-%' THEN 'personal'
  WHEN cost_center LIKE 'A%-S' THEN 'sales'
  WHEN cost_center LIKE 'A%-E' THEN 'project'
  WHEN cost_center LIKE 'A%-W' THEN 'warranty'
  ELSE NULL
END
WHERE cost_center_type IS NULL AND cost_center IS NOT NULL AND cost_center != '';

COMMIT;
