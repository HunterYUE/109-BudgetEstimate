-- 040-tr-notification-withdraw-type.sql
-- 撤回已通过（approved）周工时后需通知原审核人（其已做出的审批被撤回，须知情）：
--   notifications.type CHECK 约束加入 'withdraw'（此前仅 approval/rejection/submission/task/task_feedback/reminder）
--
-- 使用方式：
--   cat 040-tr-notification-withdraw-type.sql | ssh tencent-budget 'su - postgres -c "psql -v ON_ERROR_STOP=1 -d budget_estimate"'

BEGIN;

ALTER TABLE timerecording.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE timerecording.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['approval','rejection','submission','task','task_feedback','reminder','withdraw']));

COMMIT;
