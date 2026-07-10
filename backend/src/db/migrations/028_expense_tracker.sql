-- Expense tracker for Junior Admins (company expenses paid on behalf of the company).

CREATE TABLE IF NOT EXISTS expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  expense_date    DATE NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method  VARCHAR(40) NOT NULL,
  category        VARCHAR(40) NOT NULL,
  description     TEXT,
  receipt_path    TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_remarks   TEXT,
  reviewed_by     UUID REFERENCES employees(id),
  reviewed_at     TIMESTAMPTZ,
  week_start      DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_employee_week
  ON expenses (employee_id, week_start DESC, expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_status
  ON expenses (status);

CREATE INDEX IF NOT EXISTS idx_expenses_date
  ON expenses (expense_date DESC);

CREATE TABLE IF NOT EXISTS expense_week_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start    DATE NOT NULL,
  paid_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by       UUID REFERENCES employees(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_expense_week_payments_week
  ON expense_week_payments (week_start DESC);
