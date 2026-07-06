-- Optional department for employees (shown on reports when set).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department VARCHAR(100);

-- Company-wide holidays (all employees marked HO on these dates).
CREATE TABLE IF NOT EXISTS company_holidays (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL UNIQUE,
  name         VARCHAR(150) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_holidays_date ON company_holidays (holiday_date);
