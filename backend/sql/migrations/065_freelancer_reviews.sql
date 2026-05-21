-- 065_freelancer_reviews.sql
-- Client reviews for freelancers after completed real orders.

BEGIN;

CREATE TABLE IF NOT EXISTS freelancer_reviews (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  freelancer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT NULL,
  professionalism_rating SMALLINT NULL CHECK (professionalism_rating IS NULL OR (professionalism_rating >= 1 AND professionalism_rating <= 5)),
  communication_rating SMALLINT NULL CHECK (communication_rating IS NULL OR (communication_rating >= 1 AND communication_rating <= 5)),
  delivery_rating SMALLINT NULL CHECK (delivery_rating IS NULL OR (delivery_rating >= 1 AND delivery_rating <= 5)),
  would_recommend BOOLEAN NOT NULL DEFAULT TRUE,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_freelancer_reviews_order UNIQUE (order_id),
  CONSTRAINT chk_freelancer_reviews_not_self CHECK (freelancer_id <> client_id)
);

CREATE INDEX IF NOT EXISTS idx_freelancer_reviews_freelancer_visible
  ON freelancer_reviews(freelancer_id, is_visible, created_at DESC)
  WHERE is_visible = TRUE AND is_verified = TRUE;

CREATE INDEX IF NOT EXISTS idx_freelancer_reviews_client
  ON freelancer_reviews(client_id, created_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('065_freelancer_reviews')
ON CONFLICT (version) DO NOTHING;

COMMIT;
