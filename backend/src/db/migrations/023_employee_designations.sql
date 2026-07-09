-- Job Role / Designation catalog (separate from auth role admin|employee)

CREATE TABLE IF NOT EXISTS employee_designations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_designations_name_lower
  ON employee_designations (LOWER(TRIM(name)));

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS designation_id UUID REFERENCES employee_designations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_designation_id ON employees (designation_id);

-- Seed default designations (idempotent)
INSERT INTO employee_designations (name, is_system)
SELECT v.name, true
FROM (VALUES
  ('Draftsman'),
  ('Supervisor'),
  ('Site Worker'),
  ('Service Incharge'),
  ('Junior Site Engineer')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM employee_designations d WHERE LOWER(TRIM(d.name)) = LOWER(TRIM(v.name))
);
