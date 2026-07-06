-- Soft delete for employees: preserves historical attendance/leave/task records
-- while removing the account from active lists, dropdowns, and stats.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_employees_deleted_at ON employees (deleted_at);

-- Sites: soft delete + a profile/site image.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS image_path TEXT;
CREATE INDEX IF NOT EXISTS idx_sites_deleted_at ON sites (deleted_at);
