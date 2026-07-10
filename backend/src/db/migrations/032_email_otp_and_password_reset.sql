-- Email OTP challenges and admin password-reset tokens (Resend integration)

CREATE TABLE IF NOT EXISTS email_otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  actor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_otp_challenges_actor_purpose
  ON email_otp_challenges (actor_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_otp_challenges_expires
  ON email_otp_challenges (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  recipient_email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_employee
  ON password_reset_tokens (employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires
  ON password_reset_tokens (expires_at)
  WHERE consumed_at IS NULL;
