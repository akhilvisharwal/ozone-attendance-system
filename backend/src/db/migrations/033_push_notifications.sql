-- Push notification device tokens (FCM) and per-user notification preferences.

CREATE TABLE IF NOT EXISTS push_device_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token           TEXT NOT NULL,
  platform        VARCHAR(32) NOT NULL DEFAULT 'web',
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_device_tokens_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_push_device_tokens_employee
  ON push_device_tokens (employee_id);

CREATE TABLE IF NOT EXISTS employee_notification_preferences (
  employee_id              UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  sound_enabled            BOOLEAN NOT NULL DEFAULT true,
  vibration_enabled        BOOLEAN NOT NULL DEFAULT true,
  attendance_reminders     BOOLEAN NOT NULL DEFAULT true,
  task_notifications       BOOLEAN NOT NULL DEFAULT true,
  leave_notifications      BOOLEAN NOT NULL DEFAULT true,
  expense_notifications    BOOLEAN NOT NULL DEFAULT true,
  -- Security / OTP alerts are always delivered and cannot be disabled in the UI.
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deduplicate FCM sends for the same in-app notification id.
CREATE TABLE IF NOT EXISTS push_delivery_log (
  notification_id UUID PRIMARY KEY REFERENCES app_notifications(id) ON DELETE CASCADE,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
