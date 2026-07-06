-- Automatic daily attendance result computed from hours worked at check-out:
--   < 3h   → absent
--   3–8h   → half_day
--   >= 8h  → present
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS day_status VARCHAR(20)
  CHECK (day_status IN ('present', 'half_day', 'absent'));

CREATE INDEX IF NOT EXISTS idx_attendance_day_status ON attendance (day_status);

-- Backfill existing completed / absent records so history and reports stay consistent.
UPDATE attendance SET day_status = CASE
  WHEN status = 'absent' THEN 'absent'
  WHEN status = 'checked_out' AND total_minutes IS NOT NULL AND total_minutes >= 480 THEN 'present'
  WHEN status = 'checked_out' AND total_minutes IS NOT NULL AND total_minutes >= 180 THEN 'half_day'
  WHEN status = 'checked_out' THEN 'absent'
  ELSE day_status
END
WHERE day_status IS NULL AND status IN ('checked_out', 'absent');
