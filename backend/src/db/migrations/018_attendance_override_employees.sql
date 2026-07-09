-- Extend daily overrides: enable/disable, employee assignment scope, junction table.
ALTER TABLE attendance_daily_overrides
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS apply_to_all BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS attendance_daily_override_employees (
  override_id  UUID NOT NULL REFERENCES attendance_daily_overrides(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (override_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_daily_override_employees_employee
  ON attendance_daily_override_employees (employee_id);

CREATE INDEX IF NOT EXISTS idx_attendance_daily_overrides_enabled_range
  ON attendance_daily_overrides (start_date, end_date)
  WHERE is_enabled = true;
