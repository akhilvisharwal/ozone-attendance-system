-- Enforce unique employee full names (case-insensitive, trimmed) among active employees.
-- Soft-deleted and non-employee accounts are excluded from the constraint.

-- Resolve existing collisions by appending the employee code to later duplicates
-- (oldest created keeps the original name).
WITH ranked AS (
  SELECT
    id,
    name,
    employee_code,
    ROW_NUMBER() OVER (
      PARTITION BY lower(btrim(name))
      ORDER BY created_at ASC, employee_code ASC
    ) AS rn
  FROM employees
  WHERE deleted_at IS NULL
    AND role = 'employee'
)
UPDATE employees e
   SET name = btrim(e.name) || ' (' || e.employee_code || ')',
       updated_at = now()
  FROM ranked r
 WHERE e.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_unique_name_active
  ON employees (lower(btrim(name)))
  WHERE deleted_at IS NULL
    AND role = 'employee';
