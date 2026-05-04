-- 050_order_submission_history
-- Persistent freelancer submission + revision request timeline (no overwriting notes).

BEGIN;

CREATE TABLE IF NOT EXISTS order_submissions (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id),
  submission_number INT NOT NULL,
  message TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'submitted',
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_submissions_status_chk CHECK (
    status IN ('submitted', 'revision_requested', 'accepted', 'superseded')
  ),
  CONSTRAINT order_submissions_order_number_unique UNIQUE (order_id, submission_number)
);

CREATE INDEX IF NOT EXISTS idx_order_submissions_order_id ON order_submissions(order_id);
CREATE INDEX IF NOT EXISTS idx_order_submissions_order_current ON order_submissions(order_id) WHERE is_current = TRUE;

CREATE TABLE IF NOT EXISTS order_revision_requests (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  submission_id BIGINT NOT NULL REFERENCES order_submissions(id) ON DELETE CASCADE,
  requested_by_user_id BIGINT NULL REFERENCES users(id),
  requested_by_role VARCHAR(30) NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_revision_requests_order ON order_revision_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_order_revision_requests_submission ON order_revision_requests(submission_id);

ALTER TABLE order_files ADD COLUMN IF NOT EXISTS submission_id BIGINT NULL REFERENCES order_submissions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_files_submission_id ON order_files(submission_id);

-- Backfill: one synthetic submission per order that already has delivery files.
INSERT INTO order_submissions (
  order_id,
  freelancer_user_id,
  submission_number,
  message,
  status,
  is_current,
  submitted_at
)
SELECT
  o.id,
  u.uid::bigint,
  1,
  NULL,
  CASE
    WHEN o.order_status = 'completed' THEN 'accepted'
    WHEN o.order_status = 'pending_client_review' THEN 'submitted'
    WHEN o.client_revision_note IS NOT NULL
      AND TRIM(o.client_revision_note) <> ''
      AND o.order_status IN ('in_progress', 'ready_for_work')
      THEN 'revision_requested'
    ELSE 'submitted'
  END,
  TRUE,
  COALESCE(
    (SELECT MIN(f.uploaded_at) FROM order_files f WHERE f.order_id = o.id AND f.purpose = 'delivery'),
    o.updated_at,
    NOW()
  )
FROM orders o
CROSS JOIN LATERAL (
  SELECT COALESCE(
    o.assigned_freelancer_id,
    (SELECT f2.uploaded_by_user_id
     FROM order_files f2
     WHERE f2.order_id = o.id AND f2.purpose = 'delivery' AND f2.uploaded_by_user_id IS NOT NULL
     ORDER BY f2.id
     LIMIT 1)
  ) AS uid
) u
WHERE EXISTS (SELECT 1 FROM order_files fx WHERE fx.order_id = o.id AND fx.purpose = 'delivery')
  AND u.uid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM order_submissions s WHERE s.order_id = o.id);

UPDATE order_files f
SET submission_id = s.id
FROM order_submissions s
WHERE f.order_id = s.order_id
  AND f.purpose = 'delivery'
  AND s.submission_number = 1
  AND f.submission_id IS NULL;

INSERT INTO order_revision_requests (
  order_id,
  submission_id,
  requested_by_user_id,
  requested_by_role,
  note,
  created_at
)
SELECT
  o.id,
  s.id,
  NULL,
  CASE
    WHEN o.source_type = 'super_admin_created' THEN 'super_admin'
    WHEN o.source_type IN ('admin_created') THEN 'admin'
    ELSE 'client'
  END,
  TRIM(o.client_revision_note),
  o.updated_at
FROM orders o
JOIN order_submissions s ON s.order_id = o.id AND s.submission_number = 1
WHERE o.client_revision_note IS NOT NULL
  AND TRIM(o.client_revision_note) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM order_revision_requests r WHERE r.submission_id = s.id
  );

INSERT INTO schema_migrations (version)
VALUES ('050_order_submission_history')
ON CONFLICT (version) DO NOTHING;

COMMIT;
