-- Check-in and check-out classification columns
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS check_in_status  VARCHAR(20)
    CHECK (check_in_status IN ('early', 'on_time', 'late', 'half_day'))
    DEFAULT 'on_time',
  ADD COLUMN IF NOT EXISTS is_half_day      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS check_out_status VARCHAR(20)
    CHECK (check_out_status IN ('early', 'on_time', 'overtime'));

-- Leave requests
CREATE TABLE leave_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_date   DATE NOT NULL,
  leave_type   VARCHAR(20) NOT NULL CHECK (leave_type IN ('full', 'half')) DEFAULT 'full',
  reason       TEXT NOT NULL,
  status       VARCHAR(20) NOT NULL
                 CHECK (status IN ('pending', 'approved', 'rejected'))
                 DEFAULT 'pending',
  reviewed_by  UUID REFERENCES employees(id),
  review_note  TEXT,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, leave_date)
);

CREATE INDEX idx_leave_requests_employee ON leave_requests (employee_id, leave_date DESC);
CREATE INDEX idx_leave_requests_status ON leave_requests (status, leave_date DESC);

CREATE TRIGGER trg_leave_requests_updated_at BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
