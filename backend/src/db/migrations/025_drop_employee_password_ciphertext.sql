-- Remove reversible password vault; passwords are bcrypt-hashed only.
ALTER TABLE employees DROP COLUMN IF EXISTS password_ciphertext;
