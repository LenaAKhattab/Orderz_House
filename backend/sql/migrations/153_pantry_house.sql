-- 153: بيت المونة (Pantry House) — internal pre-stock work system.
-- Additive only. Does NOT touch orders, fake_orders, Stripe, or FAZAT.
-- Numbered 153 because production already recorded 152_admin_bid_distribution_pools.
-- Fields mirror client-order basics (category/pricing/duration/skills) without payment.

BEGIN;

CREATE TABLE IF NOT EXISTS pantry_requests (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id BIGINT NULL,
  subcategory_id BIGINT NULL,
  sub_subcategory_id BIGINT NULL,
  pricing_type TEXT NOT NULL DEFAULT 'fixed'
    CHECK (pricing_type IN ('fixed', 'bidding')),
  budget_min NUMERIC(12, 2) NULL,
  budget_max NUMERIC(12, 2) NULL,
  fixed_budget NUMERIC(12, 2) NULL,
  delivery_days INTEGER NULL CHECK (delivery_days IS NULL OR delivery_days > 0),
  duration_unit TEXT NOT NULL DEFAULT 'days'
    CHECK (duration_unit IN ('days', 'hours', 'weeks')),
  deadline TIMESTAMPTZ NULL,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  requirements TEXT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'open_for_bids',
      'assigned',
      'in_progress',
      'submitted',
      'revision_requested',
      'approved',
      'archived'
    )),
  created_by_admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_freelancer_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  accepted_bid_id BIGINT NULL,
  internal_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pantry_requests_status ON pantry_requests (status);
CREATE INDEX IF NOT EXISTS idx_pantry_requests_assigned ON pantry_requests (assigned_freelancer_id)
  WHERE assigned_freelancer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pantry_requests_created_at ON pantry_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pantry_requests_pricing ON pantry_requests (pricing_type);

CREATE TABLE IF NOT EXISTS pantry_bids (
  id BIGSERIAL PRIMARY KEY,
  pantry_request_id BIGINT NOT NULL REFERENCES pantry_requests(id) ON DELETE CASCADE,
  freelancer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  duration_days INTEGER NULL CHECK (duration_days IS NULL OR duration_days > 0),
  message TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pantry_request_id, freelancer_id)
);

CREATE INDEX IF NOT EXISTS idx_pantry_bids_request ON pantry_bids (pantry_request_id, status);
CREATE INDEX IF NOT EXISTS idx_pantry_bids_freelancer ON pantry_bids (freelancer_id);

-- At most one accepted bid per pantry request (application layer also enforces).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pantry_bids_one_accepted_per_request
  ON pantry_bids (pantry_request_id)
  WHERE status = 'accepted';

-- Accepted bid FK after pantry_bids exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pantry_requests_accepted_bid_id_fkey'
  ) THEN
    ALTER TABLE pantry_requests
      ADD CONSTRAINT pantry_requests_accepted_bid_id_fkey
      FOREIGN KEY (accepted_bid_id) REFERENCES pantry_bids(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pantry_deliveries (
  id BIGSERIAL PRIMARY KEY,
  pantry_request_id BIGINT NOT NULL REFERENCES pantry_requests(id) ON DELETE CASCADE,
  freelancer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'revision_requested', 'approved', 'archived')),
  admin_feedback TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pantry_deliveries_request ON pantry_deliveries (pantry_request_id, status);
CREATE INDEX IF NOT EXISTS idx_pantry_deliveries_status ON pantry_deliveries (status, created_at DESC);

CREATE TABLE IF NOT EXISTS pantry_delivery_files (
  id BIGSERIAL PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES pantry_deliveries(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NULL,
  size_bytes BIGINT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pantry_delivery_files_delivery ON pantry_delivery_files (delivery_id);

INSERT INTO permissions (key, module, display_name, description)
VALUES
  (
    'dashboard.super_admin.pantry',
    'dashboard',
    'المدير الأعلى — بيت المونة',
    'إدارة طلبات ومنجزات بيت المونة الداخلية.'
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key = 'dashboard.super_admin.pantry'
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('153_pantry_house')
ON CONFLICT (version) DO NOTHING;
