-- Standing per-employee attendance schedule: a permanent (not date-ranged) override
-- of the company-wide attendance timing settings, for employees whose expected
-- hours differ from the office default (e.g. site staff vs office staff).
--
-- Design mirrors two existing precedents:
--  - Per-employee config lives directly on `employees`, same as weekly_off_days /
--    uses_default_weekly_off (019_employee_default_weekly_off.sql).
--  - Each field is independently nullable, same as attendance_daily_overrides
--    (017/018): NULL means "inherit", not "zero". Unlike weekly_off_days (an
--    array, where NULL/empty is ambiguous with "no off days"), these are scalar
--    time/number fields, so NULL-means-inherit needs no separate boolean flag —
--    a plain NULL column already means "use the next tier down".
--
-- Resolution order (see attendanceRules.service.ts): a date-range override in
-- attendance_daily_overrides (if active today) wins over these standing fields,
-- which win over Settings -> Attendance (the global default).
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS standing_office_start_time   VARCHAR(5),
  ADD COLUMN IF NOT EXISTS standing_late_check_in_time  VARCHAR(5),
  ADD COLUMN IF NOT EXISTS standing_half_day_cutoff     VARCHAR(5),
  ADD COLUMN IF NOT EXISTS standing_office_closing_time VARCHAR(5),
  ADD COLUMN IF NOT EXISTS standing_min_hours_present   NUMERIC(4, 2),
  ADD COLUMN IF NOT EXISTS standing_min_hours_half_day  NUMERIC(4, 2);
