-- Migration 118: Institution detail read indexes (additive only).
BEGIN;

CREATE INDEX IF NOT EXISTS idx_institution_members_institution_status
  ON institution_members (institution_id, status);

COMMIT;
