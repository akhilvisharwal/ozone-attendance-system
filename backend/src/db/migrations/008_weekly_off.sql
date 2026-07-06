-- Per-employee weekly off days (0=Sunday .. 6=Saturday). Default Sunday off.
-- Employees who work Sundays simply have Sunday removed from this array.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS weekly_off_days INTEGER[] NOT NULL DEFAULT '{0}';
