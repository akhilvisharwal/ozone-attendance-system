-- Allow 'cancelled' as a work status on attendance check-out.
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_work_status_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_work_status_check
  CHECK (work_status IN ('completed', 'in_progress', 'pending', 'on_hold', 'cancelled'));
