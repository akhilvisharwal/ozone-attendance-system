-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE employees (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code     VARCHAR(20) NOT NULL UNIQUE,
  name              VARCHAR(150) NOT NULL,
  email             VARCHAR(150) UNIQUE,
  phone             VARCHAR(20),
  password_hash     VARCHAR(255) NOT NULL,
  role              VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'employee')) DEFAULT 'employee',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_by        UUID REFERENCES employees(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sites (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(150) NOT NULL,
  type           VARCHAR(20) NOT NULL CHECK (type IN ('office', 'project')) DEFAULT 'project',
  address        TEXT,
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  radius_meters  INTEGER DEFAULT 200,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     UUID REFERENCES employees(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attendance (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id            UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date        DATE NOT NULL,

  check_in_time          TIMESTAMPTZ,
  check_in_latitude      DOUBLE PRECISION,
  check_in_longitude     DOUBLE PRECISION,
  check_in_address       TEXT,
  check_in_selfie_path   TEXT,
  check_in_device_info   TEXT,

  check_out_time         TIMESTAMPTZ,
  check_out_latitude     DOUBLE PRECISION,
  check_out_longitude    DOUBLE PRECISION,
  check_out_address      TEXT,

  site_id                UUID REFERENCES sites(id),
  work_summary           TEXT,
  work_status            VARCHAR(20) CHECK (work_status IN ('completed', 'in_progress', 'pending', 'on_hold')),
  remarks                TEXT,
  site_photo_paths       JSONB NOT NULL DEFAULT '[]',

  total_minutes          INTEGER,
  status                 VARCHAR(20) NOT NULL CHECK (status IN ('checked_in', 'checked_out')) DEFAULT 'checked_in',

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (employee_id, attendance_date)
);

CREATE INDEX idx_attendance_employee_date ON attendance (employee_id, attendance_date DESC);
CREATE INDEX idx_attendance_date ON attendance (attendance_date);
CREATE INDEX idx_attendance_status ON attendance (status);

CREATE TABLE refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token_hash   VARCHAR(255) NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_employee ON refresh_tokens (employee_id);

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES employees(id),
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id   UUID,
  metadata    JSONB NOT NULL DEFAULT '{}',
  ip_address  VARCHAR(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);

-- Keep updated_at fresh automatically
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sites_updated_at BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_attendance_updated_at BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
