ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

UPDATE employees
   SET password_changed_at = COALESCE(updated_at, created_at)
 WHERE password_changed_at IS NULL;

ALTER TABLE employees
  ALTER COLUMN password_changed_at SET DEFAULT now();
