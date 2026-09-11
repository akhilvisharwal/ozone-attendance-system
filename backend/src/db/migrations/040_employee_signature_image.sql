-- Private saved signature for admin / junior-admin PDF authorization.
-- Files live under uploads/signatures/{employee_code}/ and are served only via
-- authenticated /api/files (never as public static assets).
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS signature_image_path TEXT;
