-- Extended manual attendance metadata for admin-entered records on any date.
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS admin_mark_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS admin_approved_by UUID REFERENCES employees(id);

ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_admin_mark_status_check;

ALTER TABLE attendance
  ADD CONSTRAINT attendance_admin_mark_status_check
  CHECK (
    admin_mark_status IS NULL
    OR admin_mark_status IN ('present', 'half_day', 'absent', 'leave', 'holiday', 'weekly_off')
  );
