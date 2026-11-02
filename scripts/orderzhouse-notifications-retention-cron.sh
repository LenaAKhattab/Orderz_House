#!/usr/bin/env bash
# Daily automatic notification retention (R1C) — wrapper around backend/scripts/notificationsRetention.js
# (the canonical tool, run inside the backend container, which owns the Production configuration).
# Founder-approved policy lives in the tool: discovery 30 days; transactional/moderation/system 365 days;
# financial, security and unknown types are never deleted.
#
# Bounded: 5,000-row batches (one short transaction each), 250 ms pause, at most 100,000 rows per run,
# stop at the first DB error. Per-target cursors persist in $STATE_FILE so each run starts where the last
# one stopped instead of re-walking deleted-but-unvacuumed index entries; losing the file is safe (slower).
# Pre-check (container running + read-only eligibility count) must pass or nothing is deleted.
#
# VPS install:
#   /etc/cron.d/orderzhouse-notifications-retention
#     MAILTO=""
#     15 3 * * * root bash /root/Orderz_House/scripts/orderzhouse-notifications-retention-cron.sh >/dev/null 2>&1
#   /etc/logrotate.d/orderzhouse-notifications-retention  →  /var/log/orderzhouse/notifications-retention.log
# Read results: tail /var/log/orderzhouse/notifications-retention.log ; journalctl -t orderzhouse-notification-retention
# Exit: 0 complete, 1 max rows reached (backlog continues next run), 2 deletion stopped on error, 3 pre-check failed.
set -uo pipefail

BATCH_SIZE=5000
SLEEP_MS=250
MAX_ROWS=100000
C=orderzhouse-backend
TAG=orderzhouse-notification-retention
LOG_DIR=/var/log/orderzhouse
LOG_FILE="$LOG_DIR/notifications-retention.log"
STATE_DIR=/var/lib/orderzhouse
STATE_FILE="$STATE_DIR/notifications-retention-state.json"
CONTAINER_STATE=/tmp/notifications-retention-state.json
LOCK_FILE=/run/orderzhouse-notifications-retention.lock
TOOL="node scripts/notificationsRetention.js"

install -d -m 750 "$LOG_DIR" "$STATE_DIR"
log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG_FILE"
  chmod 640 "$LOG_FILE"
}
finish() {
  local rc=$1 msg=$2 priority
  case "$rc" in
    0) priority=user.info ;;
    1) priority=user.warning ;;
    *) priority=user.err ;;
  esac
  log "exit=$rc $msg"
  logger -t "$TAG" -p "$priority" -- "exit=$rc $msg"
  exit "$rc"
}
count_total() {
  docker exec "$C" $TOOL --count --state-file="$CONTAINER_STATE" 2>&1 \
    | grep '^NOTIFICATIONS_RETENTION_COUNT ' | grep -o '"total":[0-9]*' | cut -d: -f2
}

exec 9>"$LOCK_FILE"
flock -n 9 || finish 3 "precheck_failed=already_running"
log "run_started batch_size=$BATCH_SIZE sleep_ms=$SLEEP_MS max_rows=$MAX_ROWS"

# Pre-check 1: backend container running.
[ "$(docker inspect -f '{{.State.Running}}' "$C" 2>/dev/null)" = "true" ] || finish 3 "precheck_failed=container_not_running"

# Stored cursors into the container (none → the tool starts at the oldest row).
if [ -s "$STATE_FILE" ]; then
  docker cp "$STATE_FILE" "$C:$CONTAINER_STATE" >/dev/null 2>&1 || finish 3 "precheck_failed=state_copy_in"
else
  docker exec "$C" rm -f "$CONTAINER_STATE" >/dev/null 2>&1
fi

# Pre-check 2: database reachable and the policy classification query runs (read-only).
BEFORE=$(count_total)
[ -n "$BEFORE" ] || finish 3 "precheck_failed=count_query"
log "eligible_before=$BEFORE"

OUT=$(docker exec -e ALLOW_PRODUCTION_NOTIFICATION_RETENTION=1 "$C" $TOOL --apply \
  --confirm=DELETE_EXPIRED_NOTIFICATIONS --batch-size="$BATCH_SIZE" --sleep-ms="$SLEEP_MS" --max-rows="$MAX_ROWS" \
  --state-file="$CONTAINER_STATE" 2>&1)
APPLY_RC=$?
SUMMARY=$(printf '%s\n' "$OUT" | grep '^NOTIFICATIONS_RETENTION_SUMMARY ' | tail -n 1 | cut -d' ' -f2-)

# Cursors back to the host (also after a stopped run: they cover the rows already deleted).
if docker cp "$C:$CONTAINER_STATE" "$STATE_FILE.tmp" >/dev/null 2>&1; then
  chmod 640 "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
fi

AFTER=$(count_total)
log "${SUMMARY:-summary=missing} remaining_eligible=${AFTER:-unknown}"
RESULT="eligible_before=$BEFORE ${SUMMARY:-summary=missing} remaining_eligible=${AFTER:-unknown}"

if [ "$APPLY_RC" -ne 0 ] || [ -z "$SUMMARY" ]; then
  finish 2 "deletion_stopped $RESULT"
fi
case "$SUMMARY" in
  *stoppedAt=max_rows*) finish 1 "max_rows_reached $RESULT" ;;
esac
[ -n "$AFTER" ] || finish 1 "post_count_failed $RESULT"
finish 0 "complete $RESULT"
