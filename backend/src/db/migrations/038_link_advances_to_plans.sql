-- Links employee_advances ledger rows to the plan/installment they belong to, so a
-- plan's principal ("taken") and its repayments ("returned") are still ordinary
-- ledger entries — Monthly Attendance's existing Adv Taken / Adv Ret / Balance
-- columns keep working unchanged for both legacy loose entries and new plan-linked
-- ones. Both columns are nullable: legacy rows created before this migration (and
-- any future one-off entry not tied to a plan) simply have NULL here.
--
-- Additive only: two new nullable columns on an existing table, no data touched,
-- no existing column altered or dropped.

ALTER TABLE employee_advances
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES employee_advance_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installment_id UUID REFERENCES employee_advance_installments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employee_advances_plan
  ON employee_advances (plan_id) WHERE plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employee_advances_installment
  ON employee_advances (installment_id) WHERE installment_id IS NOT NULL;
