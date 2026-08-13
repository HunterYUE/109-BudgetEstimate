-- 043-add-search-indexes.sql
-- 全量审计 A11/A12：补齐高频查询索引（2026-08-13）
--   A11：users / timerecording.profiles 登录、密码重置、用户列表按 LOWER(email) 查询，
--        此前无表达式索引全表扫；建 LOWER(email) 表达式索引（查询 WHERE LOWER(u.email)=$1 命中）。
--        users.email 原值唯一约束不变，表达式索引独立存在。
--   A12：delivery_projects.sales_no 高频等值/LIKE 查询（成本中心校验、质保同步）此前无索引。
--
-- 使用方式：
--   cat 043-add-search-indexes.sql | ssh tencent-budget 'su - postgres -c "psql -v ON_ERROR_STOP=1 -d budget_estimate"'

BEGIN;

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON public.users ((LOWER(email)));
CREATE INDEX IF NOT EXISTS idx_tr_profiles_email_lower ON timerecording.profiles ((LOWER(email)));
CREATE INDEX IF NOT EXISTS idx_delivery_projects_sales_no ON delivery_projects (sales_no);

COMMIT;
