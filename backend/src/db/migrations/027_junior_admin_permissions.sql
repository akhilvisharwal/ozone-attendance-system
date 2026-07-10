-- Junior Admin role + granular permission flags (JSONB).
-- Master Admin remains role = 'admin' with implicit full access.

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees
  ADD CONSTRAINT employees_role_check
  CHECK (role IN ('admin', 'junior_admin', 'employee'));

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS admin_permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_employees_role_active
  ON employees (role, is_active)
  WHERE deleted_at IS NULL;
