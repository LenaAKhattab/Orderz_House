-- Financial claims system for Freelancer + Super Admin

CREATE TABLE IF NOT EXISTS financial_claims (
  id BIGSERIAL PRIMARY KEY,
  freelancer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_id BIGINT NULL REFERENCES orders(id) ON DELETE SET NULL,
  order_number VARCHAR(120) NOT NULL,
  request_title VARCHAR(255) NOT NULL,
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
  actual_completion_date DATE NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  payout_status VARCHAR(50) NOT NULL DEFAULT 'missing_completion_date',
  total_price_snapshot NUMERIC(12, 2) NULL,
  user_percentage_snapshot NUMERIC(5, 2) NULL,
  company_percentage_snapshot NUMERIC(5, 2) NULL,
  user_amount_snapshot NUMERIC(12, 2) NULL,
  company_amount_snapshot NUMERIC(12, 2) NULL,
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  remaining_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (remaining_amount >= 0),
  freelancer_note TEXT NULL,
  admin_note TEXT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ NULL,
  reviewed_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT financial_claims_status_check CHECK (
    status IN ('pending', 'accepted', 'rejected', 'frozen', 'requires_in_person_review', 'paid')
  ),
  CONSTRAINT financial_claims_payout_status_check CHECK (
    payout_status IN ('missing_completion_date', 'not_due_yet', 'within_payout_window', 'late_after_payout_window', 'paid')
  ),
  CONSTRAINT financial_claims_total_price_check CHECK (total_price_snapshot IS NULL OR total_price_snapshot >= 0),
  CONSTRAINT financial_claims_user_pct_check CHECK (
    user_percentage_snapshot IS NULL OR (user_percentage_snapshot >= 0 AND user_percentage_snapshot <= 100)
  ),
  CONSTRAINT financial_claims_company_pct_check CHECK (
    company_percentage_snapshot IS NULL OR (company_percentage_snapshot >= 0 AND company_percentage_snapshot <= 100)
  ),
  CONSTRAINT financial_claims_pct_sum_check CHECK (
    (user_percentage_snapshot IS NULL AND company_percentage_snapshot IS NULL)
    OR (
      user_percentage_snapshot IS NOT NULL
      AND company_percentage_snapshot IS NOT NULL
      AND ROUND(user_percentage_snapshot + company_percentage_snapshot, 2) = 100.00
    )
  ),
  CONSTRAINT financial_claims_amounts_check CHECK (
    (user_amount_snapshot IS NULL OR user_amount_snapshot >= 0)
    AND (company_amount_snapshot IS NULL OR company_amount_snapshot >= 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_financial_claims_freelancer_order_number
  ON financial_claims (freelancer_id, order_number);

CREATE UNIQUE INDEX IF NOT EXISTS ux_financial_claims_freelancer_project
  ON financial_claims (freelancer_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_financial_claims_status ON financial_claims(status);
CREATE INDEX IF NOT EXISTS ix_financial_claims_payout_status ON financial_claims(payout_status);
CREATE INDEX IF NOT EXISTS ix_financial_claims_submitted_at ON financial_claims(submitted_at DESC);
CREATE INDEX IF NOT EXISTS ix_financial_claims_freelancer_id ON financial_claims(freelancer_id);

CREATE TABLE IF NOT EXISTS financial_claim_status_history (
  id BIGSERIAL PRIMARY KEY,
  claim_id BIGINT NOT NULL REFERENCES financial_claims(id) ON DELETE CASCADE,
  old_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NOT NULL,
  changed_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_note TEXT NULL,
  CONSTRAINT financial_claim_status_history_new_status_check CHECK (
    new_status IN ('pending', 'accepted', 'rejected', 'frozen', 'requires_in_person_review', 'paid')
  ),
  CONSTRAINT financial_claim_status_history_old_status_check CHECK (
    old_status IS NULL OR old_status IN ('pending', 'accepted', 'rejected', 'frozen', 'requires_in_person_review', 'paid')
  )
);

CREATE INDEX IF NOT EXISTS ix_financial_claim_status_history_claim
  ON financial_claim_status_history (claim_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS financial_freelancer_payments (
  id BIGSERIAL PRIMARY KEY,
  freelancer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
  payment_method VARCHAR(80) NOT NULL,
  payment_reference VARCHAR(255) NULL,
  paid_at TIMESTAMPTZ NOT NULL,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT financial_freelancer_payments_status_check CHECK (status IN ('completed'))
);

CREATE INDEX IF NOT EXISTS ix_financial_freelancer_payments_freelancer
  ON financial_freelancer_payments (freelancer_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS financial_freelancer_payment_allocations (
  id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT NOT NULL REFERENCES financial_freelancer_payments(id) ON DELETE CASCADE,
  claim_id BIGINT NOT NULL REFERENCES financial_claims(id) ON DELETE RESTRICT,
  amount_paid NUMERIC(12, 2) NOT NULL CHECK (amount_paid > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_financial_freelancer_payment_allocations_claim
  ON financial_freelancer_payment_allocations (claim_id);

CREATE INDEX IF NOT EXISTS ix_financial_freelancer_payment_allocations_payment
  ON financial_freelancer_payment_allocations (payment_id);
