-- 126: Plan percentage sale / discount (additive, non-destructive).
-- Original price_jod / stripe_checkout_amount_jod are never overwritten by a sale.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS sale_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS sale_percentage NUMERIC(5, 2) NULL;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS sale_reason TEXT NULL;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS sale_reason_en TEXT NULL;

COMMENT ON COLUMN plans.sale_enabled IS 'When true, public/checkout use percentage discount off payable base; base prices stay unchanged.';
COMMENT ON COLUMN plans.sale_percentage IS 'Discount percent when sale_enabled; must be > 0 and < 100.';
COMMENT ON COLUMN plans.sale_reason IS 'Arabic sale reason shown on public plan cards.';
COMMENT ON COLUMN plans.sale_reason_en IS 'English sale reason shown on public plan cards.';

INSERT INTO schema_migrations (version) VALUES ('126_plans_percentage_sale')
ON CONFLICT (version) DO NOTHING;
