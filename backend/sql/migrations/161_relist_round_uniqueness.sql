-- 161: Relist-round uniqueness for Mini Bid Article and Pantry House.
-- FILE ONLY in Phase 4A — do not apply until explicit review.
-- Preserves data. No table rebuild. No row deletes.
-- Explicitly drops old per-opportunity freelancer UNIQUE constraints so the same
-- freelancer can apply/bid again in a new collection round after minimum_not_met.
-- Duplicate apply/bid inside the same round remains blocked.

BEGIN;

-- =========================================================
-- Backfill collection_round_id (legacy NULL rows)
-- =========================================================
UPDATE marketplace_article_applications a
   SET collection_round_id = m.current_bid_collection_round_id
  FROM marketplace_articles m
 WHERE a.article_id = m.id
   AND a.collection_round_id IS NULL
   AND m.current_bid_collection_round_id IS NOT NULL;

UPDATE pantry_bids b
   SET collection_round_id = p.current_bid_collection_round_id
  FROM pantry_requests p
 WHERE b.pantry_request_id = p.id
   AND b.collection_round_id IS NULL
   AND p.current_bid_collection_round_id IS NOT NULL;

-- =========================================================
-- Article applications: uniqueness per round
-- Drops: marketplace_article_applications_article_fl_uidx
--        UNIQUE (article_id, freelancer_user_id)
-- =========================================================
ALTER TABLE marketplace_article_applications
  DROP CONSTRAINT IF EXISTS marketplace_article_applications_article_fl_uidx;

DROP INDEX IF EXISTS marketplace_article_applications_article_fl_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_article_applications_article_fl_round_uidx
  ON marketplace_article_applications (article_id, freelancer_user_id, collection_round_id)
  WHERE collection_round_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_article_applications_article_fl_legacy_null_uidx
  ON marketplace_article_applications (article_id, freelancer_user_id)
  WHERE collection_round_id IS NULL;

-- =========================================================
-- Article bid-credit economics: keep UNIQUE(article_application_id);
-- drop pair unique that would block a new application row's economics.
-- Drops: marketplace_article_app_bid_econ_article_fl_uidx
-- =========================================================
ALTER TABLE marketplace_article_application_bid_credit_economics
  DROP CONSTRAINT IF EXISTS marketplace_article_app_bid_econ_article_fl_uidx;

DROP INDEX IF EXISTS marketplace_article_app_bid_econ_article_fl_uidx;

-- =========================================================
-- Pantry bids: uniqueness per round
-- Drops: pantry_bids_pantry_request_id_freelancer_id_key
--        UNIQUE (pantry_request_id, freelancer_id)
-- Keeps the existing partial unique that allows only one accepted bid per pantry request.
-- =========================================================
ALTER TABLE pantry_bids
  DROP CONSTRAINT IF EXISTS pantry_bids_pantry_request_id_freelancer_id_key;

DROP INDEX IF EXISTS pantry_bids_pantry_request_id_freelancer_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS pantry_bids_request_fl_round_uidx
  ON pantry_bids (pantry_request_id, freelancer_id, collection_round_id)
  WHERE collection_round_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pantry_bids_request_fl_legacy_null_uidx
  ON pantry_bids (pantry_request_id, freelancer_id)
  WHERE collection_round_id IS NULL;

-- =========================================================
-- Pantry bid-credit economics: unique per bid row (not per request+freelancer)
-- Drops: pantry_application_bid_credit_pantry_request_id_freelancer__key
-- =========================================================
ALTER TABLE pantry_application_bid_credit_economics
  DROP CONSTRAINT IF EXISTS pantry_application_bid_credit_pantry_request_id_freelancer__key;

DROP INDEX IF EXISTS pantry_application_bid_credit_pantry_request_id_freelancer__key;

CREATE UNIQUE INDEX IF NOT EXISTS pantry_application_bid_credit_economics_pantry_bid_uidx
  ON pantry_application_bid_credit_economics (pantry_bid_id);

COMMIT;
