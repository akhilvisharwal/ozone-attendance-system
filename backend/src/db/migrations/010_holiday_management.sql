-- Extend holidays for admin management: description, recurring annual, and updates.
ALTER TABLE company_holidays ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE company_holidays ADD COLUMN IF NOT EXISTS holiday_type VARCHAR(20) NOT NULL DEFAULT 'one_time';
ALTER TABLE company_holidays ADD COLUMN IF NOT EXISTS recurring_month INTEGER;
ALTER TABLE company_holidays ADD COLUMN IF NOT EXISTS recurring_day INTEGER;
ALTER TABLE company_holidays ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE company_holidays DROP CONSTRAINT IF EXISTS company_holidays_holiday_date_key;
ALTER TABLE company_holidays ALTER COLUMN holiday_date DROP NOT NULL;

ALTER TABLE company_holidays DROP CONSTRAINT IF EXISTS company_holidays_holiday_type_check;
ALTER TABLE company_holidays ADD CONSTRAINT company_holidays_holiday_type_check
  CHECK (holiday_type IN ('one_time', 'recurring'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_holidays_one_time_date
  ON company_holidays (holiday_date) WHERE holiday_type = 'one_time';

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_holidays_recurring_pattern
  ON company_holidays (recurring_month, recurring_day, name) WHERE holiday_type = 'recurring';

CREATE TRIGGER trg_company_holidays_updated_at BEFORE UPDATE ON company_holidays
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
