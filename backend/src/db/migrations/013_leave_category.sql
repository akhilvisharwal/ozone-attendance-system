-- Leave category (Annual / Sick / Casual) separate from duration (full / half)
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS leave_category VARCHAR(50);

UPDATE leave_requests
SET leave_category = 'Annual'
WHERE leave_category IS NULL;

ALTER TABLE leave_requests
  ALTER COLUMN leave_category SET DEFAULT 'Annual';

ALTER TABLE leave_requests
  ALTER COLUMN leave_category SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leave_requests_category
  ON leave_requests (employee_id, leave_category, status);
