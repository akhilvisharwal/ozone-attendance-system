-- Allow extended manual attendance statuses for full calendar editing.
ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_admin_mark_status_check;

ALTER TABLE attendance
  ADD CONSTRAINT attendance_admin_mark_status_check
  CHECK (
    admin_mark_status IS NULL
    OR admin_mark_status IN (
      'present',
      'half_day',
      'absent',
      'leave',
      'holiday',
      'weekly_off',
      'holiday_worked',
      'weekly_off_worked',
      'not_applicable'
    )
  );
