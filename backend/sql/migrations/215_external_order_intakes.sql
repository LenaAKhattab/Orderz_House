-- 215_external_order_intakes
-- External (WhatsApp) order intake: a freelancer submits ONLY an external Order ID; an Admin /
-- Super Admin verifies it, sets the price and approves. Approval creates the canonical, already
-- assigned internal order (orders.source_type stays admin_created / super_admin_created) and links
-- it here. An intake is a PRE-ORDER record: it never carries earnings, wallet or ledger effects.
--
-- States: pending_review -> approved | rejected (terminal). The real order status lives on orders.
--
-- Additive only. Rollback (ops manual, only while no intake is approved): remove the two new
-- tables (events first) and clear schema_migrations row version 215_external_order_intakes.

BEGIN;

CREATE TABLE IF NOT EXISTS external_order_intakes (
  id BIGSERIAL PRIMARY KEY,
  -- Source-agnostic: today only WhatsApp; future sources add a value here.
  source VARCHAR(32) NOT NULL DEFAULT 'whatsapp',
  -- As typed by the freelancer (after trimming / invisible-character cleanup).
  external_order_id VARCHAR(64) NOT NULL,
  -- Canonical duplicate key (NFKC, ASCII digits, upper-case). "C" collation = plain byte order,
  -- so the btree also serves prefix search (LIKE 'ABC%').
  external_order_id_normalized VARCHAR(64) COLLATE "C" NOT NULL,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending_review',
  approved_order_id BIGINT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  -- Same unit as orders.budget (NUMERIC(12,2) JOD). Copied from the canonical order at approval.
  approved_price NUMERIC(12,2) NULL,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'JOD',
  reviewed_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_role VARCHAR(20) NULL,
  -- Freelancer-visible, from a fixed list (localized in the UI). Never free text.
  rejection_reason_code VARCHAR(40) NULL,
  -- Admin-only note. Never returned by freelancer APIs.
  internal_note TEXT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT external_order_intakes_source_chk CHECK (source IN ('whatsapp')),
  CONSTRAINT external_order_intakes_status_chk CHECK (
    status IN ('pending_review', 'approved', 'rejected')
  ),
  CONSTRAINT external_order_intakes_currency_chk CHECK (currency_code = 'JOD'),
  CONSTRAINT external_order_intakes_id_chk CHECK (
    length(external_order_id) BETWEEN 1 AND 64
    AND external_order_id_normalized ~ '^[A-Z0-9][A-Z0-9._/#-]{0,63}$'
  ),
  CONSTRAINT external_order_intakes_reviewer_role_chk CHECK (
    reviewed_by_role IS NULL OR reviewed_by_role IN ('admin', 'super_admin')
  ),
  CONSTRAINT external_order_intakes_reason_chk CHECK (
    rejection_reason_code IS NULL
    OR rejection_reason_code IN ('invalid_id', 'duplicate', 'not_assigned_to_you', 'cancelled_externally', 'other')
  ),
  CONSTRAINT external_order_intakes_note_len_chk CHECK (
    internal_note IS NULL OR length(internal_note) <= 1000
  ),
  -- State consistency: an order and a price exist ONLY for approved intakes.
  CONSTRAINT external_order_intakes_state_chk CHECK (
    (status = 'pending_review'
      AND approved_order_id IS NULL AND approved_price IS NULL
      AND reviewed_at IS NULL AND rejection_reason_code IS NULL)
    OR (status = 'approved'
      AND approved_order_id IS NOT NULL AND approved_price > 0
      AND reviewed_at IS NOT NULL AND rejection_reason_code IS NULL)
    OR (status = 'rejected'
      AND approved_order_id IS NULL AND approved_price IS NULL
      AND reviewed_at IS NOT NULL AND rejection_reason_code IS NOT NULL)
  )
);

-- One canonical order per intake, and one intake per canonical order.
CREATE UNIQUE INDEX IF NOT EXISTS external_order_intakes_order_uidx
  ON external_order_intakes (approved_order_id)
  WHERE approved_order_id IS NOT NULL;

-- Global duplicate protection: at most ONE live (pending or approved) intake per external ID.
-- A rejected intake frees the ID (e.g. submitted by the wrong freelancer).
CREATE UNIQUE INDEX IF NOT EXISTS external_order_intakes_live_id_uidx
  ON external_order_intakes (external_order_id_normalized)
  WHERE status IN ('pending_review', 'approved');

-- Freelancer history (own intakes, newest first).
CREATE INDEX IF NOT EXISTS external_order_intakes_freelancer_idx
  ON external_order_intakes (freelancer_user_id, submitted_at DESC, id DESC);

-- Admin queue (status filter, newest first) + pending count.
CREATE INDEX IF NOT EXISTS external_order_intakes_status_idx
  ON external_order_intakes (status, submitted_at DESC, id DESC);

-- Append-only audit trail (no PII: ids, actions, price, reason codes).
CREATE TABLE IF NOT EXISTS external_order_intake_events (
  id BIGSERIAL PRIMARY KEY,
  intake_id BIGINT NOT NULL REFERENCES external_order_intakes(id) ON DELETE CASCADE,
  action VARCHAR(40) NOT NULL,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(20) NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT external_order_intake_events_action_chk CHECK (
    action IN ('submitted', 'approved', 'order_created', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS external_order_intake_events_intake_idx
  ON external_order_intake_events (intake_id, created_at);

INSERT INTO schema_migrations (version)
VALUES ('215_external_order_intakes')
ON CONFLICT (version) DO NOTHING;

COMMIT;
