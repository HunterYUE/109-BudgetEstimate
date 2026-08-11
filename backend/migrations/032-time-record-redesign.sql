-- 032-time-record-redesign.sql
-- 工时填报改版配套迁移：
--   1. time_records 增加 submitted_at（提交时间戳，供「提交超过 1 个月不可撤回」判定），旧数据回填
--   2. 旧时段数据归一化：按 start_time 归入早/午/晚三个标准时段（08:00-12:00 / 13:00-17:00 / 18:00-20:30），
--      hours 改写为时段净时长，hour_type 按「晚时段 OR 周末 OR 法定节假日」重算
--      （旧数据均为测试数据，用户已确认可修改使其符合新规则）
--   3. notifications.type 检查约束增加 'reminder'（周日提交提醒）
--
-- 使用方式：
--   psql -h <host> -p <port> -U budget_app -d budget_estimate -f 032-time-record-redesign.sql

BEGIN;

-- ── 1. submitted_at 列 + 回填 ─────────────────────────────
ALTER TABLE timerecording.time_records ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
UPDATE timerecording.time_records
   SET submitted_at = COALESCE(submitted_at, updated_at, created_at)
 WHERE submitted_at IS NULL;

-- ── 2. 旧时段数据归一化 ───────────────────────────────────
--    跨时段/任意起止的记录按 start_time 落入的时段收拢到标准边界；
--    NULL start_time 归入早时段。法定节假日放假当天列表见下方（2025/2026）。
UPDATE timerecording.time_records tr
SET
  start_time = CASE
    WHEN tr.start_time >= TIME '18:00' THEN TIME '18:00'
    WHEN tr.start_time >= TIME '13:00' THEN TIME '13:00'
    ELSE TIME '08:00'
  END,
  end_time = CASE
    WHEN tr.start_time >= TIME '18:00' THEN TIME '20:30'
    WHEN tr.start_time >= TIME '13:00' THEN TIME '17:00'
    ELSE TIME '12:00'
  END,
  hours = CASE
    WHEN tr.start_time >= TIME '18:00' THEN 2.5
    WHEN tr.start_time >= TIME '13:00' THEN 4
    ELSE 4
  END,
  hour_type = CASE
    WHEN tr.start_time >= TIME '18:00'
      OR EXTRACT(ISODOW FROM tr.date) IN (6, 7)
      OR tr.date::text IN (
        -- 2026 法定节假日放假当天
        '2026-01-01','2026-01-02','2026-01-03',
        '2026-02-15','2026-02-16','2026-02-17','2026-02-18','2026-02-19',
        '2026-02-20','2026-02-21','2026-02-22','2026-02-23',
        '2026-04-04','2026-04-05','2026-04-06',
        '2026-05-01','2026-05-02','2026-05-03','2026-05-04','2026-05-05',
        '2026-06-19','2026-06-20','2026-06-21',
        '2026-09-25','2026-09-26','2026-09-27',
        '2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07',
        -- 2025 法定节假日放假当天
        '2025-01-01',
        '2025-01-28','2025-01-29','2025-01-30','2025-01-31','2025-02-01','2025-02-02','2025-02-03','2025-02-04',
        '2025-04-04','2025-04-05','2025-04-06',
        '2025-05-01','2025-05-02','2025-05-03','2025-05-04','2025-05-05',
        '2025-05-31','2025-06-01','2025-06-02',
        '2025-10-01','2025-10-02','2025-10-03','2025-10-04','2025-10-05','2025-10-06','2025-10-07','2025-10-08'
      )
    THEN 'overtime' ELSE 'normal'
  END;

-- ── 3. notifications.type 支持 reminder ────────────────────
ALTER TABLE timerecording.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE timerecording.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['approval','rejection','submission','task','task_feedback','reminder']));

COMMIT;
