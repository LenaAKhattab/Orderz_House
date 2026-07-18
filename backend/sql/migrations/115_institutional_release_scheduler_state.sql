-- Migration 115: institutional release scheduler state + schedule edit support indexes

BEGIN;

CREATE TABLE IF NOT EXISTS institutional_release_scheduler_state (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  last_tick_at TIMESTAMPTZ NULL,
  last_tick_status VARCHAR(20) NULL
    CHECK (last_tick_status IS NULL OR last_tick_status IN ('success', 'failed', 'skipped_lock')),
  last_tick_error TEXT NULL,
  last_success_at TIMESTAMPTZ NULL,
  last_failure_at TIMESTAMPTZ NULL,
  last_result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO institutional_release_scheduler_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('115_institutional_release_scheduler_state')
ON CONFLICT (version) DO NOTHING;
