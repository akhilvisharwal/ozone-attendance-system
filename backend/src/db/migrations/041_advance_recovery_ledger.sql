-- Recovery metadata on the existing advances ledger. Each repayment, salary
-- deduction, or balance adjustment is a new 'returned' row — nothing is
-- overwritten or deleted. Additive only.

ALTER TABLE employee_advances
  ADD COLUMN IF NOT EXISTS recovery_kind VARCHAR(20)
    CHECK (recovery_kind IS NULL OR recovery_kind IN ('repayment', 'salary_deduction', 'adjustment')),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)
    CHECK (
      payment_method IS NULL
      OR payment_method IN ('cash', 'upi', 'bank_transfer', 'card', 'salary', 'other')
    );

CREATE INDEX IF NOT EXISTS idx_employee_advances_recovery_kind
  ON employee_advances (employee_id, recovery_kind)
  WHERE recovery_kind IS NOT NULL;
