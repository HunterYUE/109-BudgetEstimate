-- 042-password-change-revocation.sql
-- 工时系统 L3：密码变更吊销旧 JWT（2026-08-12）
--   背景：JWT 有效期 24h 且改密后旧 token 仍可用（无吊销机制）。
--   修复：users 表新增 password_changed_at，创建/重置密码时写 now()；
--         requireAuth 比对 token 的 iat 与 password_changed_at，改密后旧 token 立即失效。
--   说明：老用户该列为 NULL（无改密事件），既有 token 不受影响、仅按 24h 过期正常失效。
--         users 为预算应用共享表（public schema），预算应用登录/改密同样获得该保护。
--
-- 使用方式：
--   cat 042-password-change-revocation.sql | ssh tencent-budget 'su - postgres -c "psql -v ON_ERROR_STOP=1 -d budget_estimate"'

BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

-- 注：通知索引 L2 已由 041 的 idx_tr_notifications_user_created (user_id, created_at) 覆盖
--     （GET /notifications 按 user_id 排序、weeklyReminder NOT EXISTS 去重均命中）；
--     清理 DELETE 仅按 created_at 全表扫，但表受 90 天保留期约束规模有界，每半月一次可接受，不再加裸 created_at 索引。

COMMIT;
