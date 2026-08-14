-- 045-tr-makeup-workday-normal.sql
-- D2 决策 2026-08-14：补班日 = 工作日（补班日请休假，补班日出勤/请假均按正常工作日计，不再判加班）。
--
-- 回填：补班日（周六/周日上班）此前按周末判为 hour_type='overtime' 的存量记录，
--       口径改为 'normal'（晚时段 18:00-20:30 重叠的仍判加班，不受周末豁免影响）。
--   —— 加班统计（Dashboard/StatsAnalysis 按 hour_type==='overtime' 求和）随之不再含补班日。
--
-- 幂等：仅命中 hour_type='overtime' 的记录；重复执行无影响。
UPDATE timerecording.time_records
SET hour_type = 'normal'
WHERE hour_type = 'overtime'
  AND date::text IN (
    '2025-01-26','2025-02-08','2025-04-27','2025-09-28','2025-10-11', -- 2025 补班（与前端 MAKEUP_WORKDAYS 同步）
    '2026-01-04','2026-02-14','2026-02-28','2026-05-09','2026-09-20','2026-10-10' -- 2026 补班
  )
  AND NOT (start_time < TIME '20:30' AND end_time > TIME '18:00');
