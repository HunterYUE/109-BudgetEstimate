-- 038-tr-cost-center-de-uppercase.sql
-- 部门成本中心编码规范：-De- → -DE-（如 A2627-De-000 → A2627-DE-000）
--   1. 工时记录 cost_center 大写（先改引用，再动码表，避免删码后留孤儿引用）
--   2. 任务分配 cost_center 大写（部门中心禁用于任务，此处一致性兜底）
--   3. 码表去重：新规则已并发补建的 A{前缀}-DE-000 与旧 A{前缀}-De-000 并存时，删旧 De 行（此时引用已全改 DE）
--   4. 码表剩余 -De- 行改 -DE-（无并发补建场景；去重后不会撞唯一键）
--   5. 未标注类型的存量记录按新规则 A%-DE-% 回填 cost_center_type
--
-- 使用方式：
--   cat 038-tr-cost-center-de-uppercase.sql | ssh tencent-budget 'su - postgres -c "psql -v ON_ERROR_STOP=1 -d budget_estimate"'

BEGIN;

-- 1. 工时记录：cost_center 同步大写
UPDATE timerecording.time_records
SET cost_center = replace(cost_center, '-De-', '-DE-')
WHERE cost_center LIKE '%-De-%';

-- 2. 任务分配：cost_center 同步大写
UPDATE timerecording.task_assignments
SET cost_center = replace(cost_center, '-De-', '-DE-')
WHERE cost_center LIKE '%-De-%';

-- 3. 码表去重：存在 -DE- 同码时删除旧的 -De- 行（引用已在上两步改完）
DELETE FROM timerecording.cost_centers a
WHERE a.code LIKE '%-De-%'
  AND EXISTS (SELECT 1 FROM timerecording.cost_centers b
              WHERE b.code = replace(a.code, '-De-', '-DE-'));

-- 4. 码表剩余 -De- 行改 -DE-（无并发补建的场景）
UPDATE timerecording.cost_centers
SET code = replace(code, '-De-', '-DE-')
WHERE code LIKE '%-De-%';

-- 5. 回填未标注类型的存量记录（新规则 A%-DE-%）
UPDATE timerecording.time_records
SET cost_center_type = CASE
  WHEN cost_center LIKE 'A%-DE-%' THEN 'department'
  WHEN cost_center LIKE 'A%-00-%' THEN 'personal'
  WHEN cost_center LIKE 'A%-S' THEN 'sales'
  WHEN cost_center LIKE 'A%-E' THEN 'project'
  WHEN cost_center LIKE 'A%-W' THEN 'warranty'
  ELSE NULL
END
WHERE cost_center_type IS NULL AND cost_center IS NOT NULL AND cost_center != '';

COMMIT;
