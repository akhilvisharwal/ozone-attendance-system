-- Track last user activity per refresh token for inactivity-based session expiry.
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_last_activity
  ON refresh_tokens (employee_id, last_activity_at DESC);
