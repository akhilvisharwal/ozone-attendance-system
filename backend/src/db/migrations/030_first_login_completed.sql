ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS first_login_completed BOOLEAN NOT NULL DEFAULT false;

-- Users who already cleared the legacy must_change_password flag have finished first login.
UPDATE employees
   SET first_login_completed = true
 WHERE must_change_password = false;

UPDATE employees
   SET first_login_completed = false
 WHERE must_change_password = true;
