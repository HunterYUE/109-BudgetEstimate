-- 033-time-record-cost-centers.sql
-- 工时系统：成本中心码表（warranty / department / personal 三类持久化）
--   1. 建 timerecording.cost_centers 表（warranty/department/personal 由工时应用自动维护）
--   2. 回填质保成本中心：delivery_projects 中「节点15完成」的项目 → sales_no 去 -E 加 -W
--   3. 回填部门/个人成本中心：FY2627 / FY2526 / FY2425 各一
--   4. time_records.hours 加宽 numeric(3,1) → numeric(4,2)（15 分钟步进会产生 0.25 增量）
--
-- 使用方式：
--   psql -h <host> -p <port> -U <owner/superuser> -d budget_estimate -f 033-time-record-cost-centers.sql
--   ⚠️ 生产库表 owner 为 postgres，budget_app 只可 DML；DDL 需以 postgres 角色执行。

BEGIN;

-- ── 1. 建表 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timerecording.cost_centers (
  id         uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL DEFAULT '',
  type       text NOT NULL,
  fy         text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT cost_centers_type_check CHECK (type = ANY (ARRAY['warranty','department','personal']))
);

CREATE INDEX IF NOT EXISTS idx_tr_cost_centers_type_fy
  ON timerecording.cost_centers(type, fy);

-- updated_at 触发器（复用 timerecording.handle_updated_at，schema.sql 已定义）
DO $$ BEGIN
  CREATE TRIGGER trg_tr_cost_centers_updated_at
    BEFORE UPDATE ON timerecording.cost_centers
    FOR EACH ROW EXECUTE FUNCTION timerecording.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. 回填质保成本中心（节点15完成即建 -W） ─────────────
INSERT INTO timerecording.cost_centers (code, name, type, fy)
SELECT regexp_replace(dp.sales_no, '-E$', '-W'), dp.project_name, 'warranty', NULL
FROM delivery_projects dp
WHERE dp.sales_no LIKE 'A%-E'
  AND EXISTS (
    SELECT 1 FROM delivery_nodes dn
    WHERE dn.delivery_project_id = dp.id
      AND dn.node_no = 15 AND dn.status = 'completed'
  )
ON CONFLICT (code) DO NOTHING;

-- ── 3. 回填部门/个人成本中心（近三财年） ────────────────
INSERT INTO timerecording.cost_centers (code, name, type, fy)
SELECT 'A' || substr(s.fy, 3, 4) || '-DE-000', '部门成本中心', 'department', s.fy
FROM (VALUES ('FY2627'), ('FY2526'), ('FY2425')) AS s(fy)
ON CONFLICT (code) DO NOTHING;

INSERT INTO timerecording.cost_centers (code, name, type, fy)
SELECT 'A' || substr(s.fy, 3, 4) || '-00-000', '个人成本中心', 'personal', s.fy
FROM (VALUES ('FY2627'), ('FY2526'), ('FY2425')) AS s(fy)
ON CONFLICT (code) DO NOTHING;

-- ── 4. 15 分钟步进下的工时精度 ──────────────────────────
ALTER TABLE timerecording.time_records
  ALTER COLUMN hours TYPE numeric(4,2);

COMMIT;
