-- Reimbursement requests: formal submit → approve/reject → pay → archive workflow.

CREATE TABLE IF NOT EXISTS expense_reimbursement_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_type       VARCHAR(20) NOT NULL
                      CHECK (period_type IN ('weekly', 'monthly', 'custom')),
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  status            VARCHAR(30) NOT NULL DEFAULT 'pending_approval'
                      CHECK (status IN ('pending_approval', 'approved', 'rejected', 'paid', 'archived')),
  requested_amount  NUMERIC(12, 2) NOT NULL CHECK (requested_amount >= 0),
  approved_amount   NUMERIC(12, 2),
  admin_remarks     TEXT,
  reviewed_by       UUID REFERENCES employees(id),
  reviewed_at       TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  paid_by           UUID REFERENCES employees(id),
  payment_notes     TEXT,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_requests_employee_status
  ON expense_reimbursement_requests (employee_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_expense_requests_status_submitted
  ON expense_reimbursement_requests (status, submitted_at DESC);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES expense_reimbursement_requests(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_expenses_request_id
  ON expenses (request_id);

-- Expand expense status lifecycle: draft → pending (submitted) → approved/rejected → paid → archived
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'paid', 'archived'));

-- New expenses start as editable drafts until submitted in a reimbursement request.
ALTER TABLE expenses ALTER COLUMN status SET DEFAULT 'draft';

-- Legacy rows without a request become drafts so Junior Admins can re-submit formally.
UPDATE expenses
   SET status = 'draft'
 WHERE request_id IS NULL
   AND status = 'pending';
