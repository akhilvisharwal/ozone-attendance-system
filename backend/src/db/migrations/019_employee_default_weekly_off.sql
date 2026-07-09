-- Track whether an employee follows the company default weekly off (resolved at runtime)
-- or uses a custom schedule stored in weekly_off_days.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS uses_default_weekly_off BOOLEAN NOT NULL DEFAULT true;

-- Existing employees inherit the current company default until given a custom schedule.
UPDATE employees
   SET uses_default_weekly_off = true
 WHERE role = 'employee';
