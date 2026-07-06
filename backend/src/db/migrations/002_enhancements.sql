-- Profile photo for employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile_photo_path TEXT;

-- Tasks: employees can self-assign or admin assigns
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  assigned_by     UUID REFERENCES employees(id),
  attendance_date DATE,
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  priority        VARCHAR(20) NOT NULL CHECK (priority IN ('low','medium','high')) DEFAULT 'medium',
  status          VARCHAR(20) NOT NULL CHECK (status IN ('pending','in_progress','completed','cancelled')) DEFAULT 'pending',
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_employee ON tasks (employee_id, attendance_date DESC);
CREATE INDEX idx_tasks_date ON tasks (attendance_date);

CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Incentives: admin awards to employees for good attendance/performance
CREATE TABLE incentives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES employees(id),
  period_month    CHAR(7) NOT NULL, -- e.g. '2026-07'
  reason          TEXT NOT NULL,
  amount          NUMERIC(10,2),
  awarded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incentives_employee ON incentives (employee_id, period_month DESC);
