-- Tracks when an employee worked on a weekly off or company holiday.
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS special_day_status VARCHAR(30) NULL;

ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_special_day_status_check;

ALTER TABLE attendance
  ADD CONSTRAINT attendance_special_day_status_check
  CHECK (special_day_status IS NULL OR special_day_status IN ('weekly_off_worked', 'holiday_worked'));
