-- Task Assignment module enhancements

-- Extend task statuses: not_started, in_progress, on_hold, completed
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
UPDATE tasks SET status = 'not_started' WHERE status = 'pending';
UPDATE tasks SET status = 'on_hold' WHERE status = 'cancelled';
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('not_started','in_progress','on_hold','completed'));
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'not_started';

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS extended_due_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS expected_duration_days INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_remarks TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS group_id UUID;

UPDATE tasks SET start_date = COALESCE(attendance_date, CURRENT_DATE) WHERE start_date IS NULL;
UPDATE tasks SET due_date = COALESCE(attendance_date, start_date, CURRENT_DATE) WHERE due_date IS NULL;
UPDATE tasks SET group_id = id WHERE group_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks (group_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_site ON tasks (site_id);

CREATE TABLE IF NOT EXISTS task_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_group_id   UUID NOT NULL,
  file_path       TEXT NOT NULL,
  file_name       VARCHAR(255) NOT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  file_size       INTEGER,
  uploaded_by     UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_group ON task_attachments (task_group_id);

CREATE TABLE IF NOT EXISTS task_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_group_id   UUID NOT NULL,
  author_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_group ON task_comments (task_group_id, created_at);

CREATE TABLE IF NOT EXISTS task_extension_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id             UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  requested_due_date  DATE NOT NULL,
  reason              TEXT NOT NULL,
  status              VARCHAR(20) NOT NULL CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  reviewed_by         UUID REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  admin_remarks       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_extensions_task ON task_extension_requests (task_id, status);

CREATE TRIGGER trg_task_extension_requests_updated_at BEFORE UPDATE ON task_extension_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS app_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type            VARCHAR(50) NOT NULL,
  title           VARCHAR(200) NOT NULL,
  body            TEXT,
  link_path       VARCHAR(500),
  entity_id       UUID,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_employee ON app_notifications (employee_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS task_reminder_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  reminder_type   VARCHAR(20) NOT NULL CHECK (reminder_type IN ('due_soon','due_today')),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, reminder_type)
);
