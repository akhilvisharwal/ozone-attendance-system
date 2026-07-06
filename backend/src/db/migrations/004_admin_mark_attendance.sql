-- Allow 'absent' as an explicit status that admin can set
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('checked_in', 'checked_out', 'absent'));

-- Admin manual-marking metadata
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS is_admin_marked   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_marked_by   UUID    REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS admin_mark_reason TEXT;
