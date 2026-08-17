-- Repayment plans for employee advances: the plan is the loan and its terms;
-- installments are the schedule of how it's expected back. Additive only —
-- two new tables, no changes to any existing table (that's migration 038).

CREATE TABLE IF NOT EXISTS employee_advance_plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  principal_amount   NUMERIC(12, 2) NOT NULL CHECK (principal_amount > 0),
  start_date         DATE NOT NULL,
  plan_type          VARCHAR(20) NOT NULL CHECK (plan_type IN ('equal_installments', 'custom')),
  installment_count  INT NOT NULL CHECK (installment_count > 0),
  status             VARCHAR(20) NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'completed', 'cancelled')),
  note               TEXT,
  created_by         UUID REFERENCES employees(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advance_plans_employee
  ON employee_advance_plans (employee_id, status);

CREATE INDEX IF NOT EXISTS idx_advance_plans_status
  ON employee_advance_plans (status);

CREATE TABLE IF NOT EXISTS employee_advance_installments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           UUID NOT NULL REFERENCES employee_advance_plans(id) ON DELETE CASCADE,
  installment_no    INT NOT NULL,
  -- Always the 1st of a calendar month, so installments align cleanly with
  -- Monthly Attendance's month boundaries.
  due_date          DATE NOT NULL,
  scheduled_amount  NUMERIC(12, 2) NOT NULL CHECK (scheduled_amount >= 0),
  paid_amount       NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, installment_no)
);

CREATE INDEX IF NOT EXISTS idx_advance_installments_plan
  ON employee_advance_installments (plan_id, installment_no);

-- Month-wide "what's due this month across everyone" aggregation for Monthly Attendance.
CREATE INDEX IF NOT EXISTS idx_advance_installments_due_date
  ON employee_advance_installments (due_date);
