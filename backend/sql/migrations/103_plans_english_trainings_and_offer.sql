-- 103: English trainings and offer label for plans (matches existing *_en column pattern).

BEGIN;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS trainings_en JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS offer_label_en TEXT NULL;

COMMENT ON COLUMN plans.trainings_en IS 'English training items included in the plan (public EN locale).';
COMMENT ON COLUMN plans.offer_label_en IS 'English special-offer label shown on public plan cards.';

INSERT INTO schema_migrations (version) VALUES ('103_plans_english_trainings_and_offer')
ON CONFLICT (version) DO NOTHING;

COMMIT;
