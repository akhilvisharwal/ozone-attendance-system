-- Encrypted password vault for authorized admin reveal (AES-256-GCM ciphertext).
-- Login still uses password_hash (bcrypt). Ciphertext is never returned in public employee APIs.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS password_ciphertext TEXT NULL;
