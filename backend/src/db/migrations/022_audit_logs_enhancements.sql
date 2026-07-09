-- Audit log enhancements: device/browser, success status, retention indexes

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS user_agent VARCHAR(512),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'success';

ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_status_check;

ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_status_check
  CHECK (status IN ('success', 'failed'));

CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs (status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs (target_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_status ON audit_logs (created_at DESC, status);
