-- Employee advances: money the company lends to an employee ("taken") and the
-- employee's repayments ("returned"). The amount currently owed is derived on read
-- as SUM(taken) - SUM(returned); no running balance is stored, so entries can be
-- edited or deleted without leaving a stale total behind.
--
-- Additive only: creates one new table plus its indexes. Nothing existing is altered.

CREATE TABLE IF NOT EXISTS employee_advances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  entry_date   DATE NOT NULL,
  amount       NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  entry_type   VARCHAR(10) NOT NULL CHECK (entry_type IN ('taken', 'returned')),
  note         TEXT,
  created_by   UUID REFERENCES employees(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary access pattern: per-employee ledger and per-employee-per-month aggregation.
CREATE INDEX IF NOT EXISTS idx_employee_advances_employee_date
  ON employee_advances (employee_id, entry_date DESC);

-- Month-wide aggregation across all employees (Monthly Attendance grid / exports).
CREATE INDEX IF NOT EXISTS idx_employee_advances_date
  ON employee_advances (entry_date DESC);
