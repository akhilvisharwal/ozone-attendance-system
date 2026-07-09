-- Temporary per-date attendance rule overrides (e.g. weather, emergencies).
CREATE TABLE IF NOT EXISTS attendance_daily_overrides (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  reason              VARCHAR(200) NOT NULL,
  office_start_time   VARCHAR(5),
  late_check_in_time  VARCHAR(5),
  half_day_cutoff     VARCHAR(5),
  office_closing_time VARCHAR(5),
  min_hours_present   NUMERIC(4, 2),
  min_hours_half_day  NUMERIC(4, 2),
  created_by          UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_daily_overrides_date_range CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_daily_overrides_range
  ON attendance_daily_overrides (start_date, end_date);
