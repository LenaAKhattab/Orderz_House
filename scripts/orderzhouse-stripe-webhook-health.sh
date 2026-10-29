#!/usr/bin/env bash
# Read-only Stripe webhook health check for Orderz House on the VPS.
# Reports counts only (no event payloads, no customer data, no secrets):
#   - nginx: POST /api/webhooks/stripe by status, Stripe deliveries vs other callers
#   - backend logs: stripe_webhook outcomes (invalid_signature, failures, …)
#   - DB: stripe_webhook_events received/processed/failed in the window
# Usage: bash scripts/orderzhouse-stripe-webhook-health.sh [HOURS]   (default 24)
# Exit: 0 OK, 1 WARN, 2 ALERT, 3 check could not run.
# Daily run (VPS): /etc/cron.d/orderzhouse-stripe-webhook-health
#   15 6 * * * root bash /root/Orderz_House/scripts/orderzhouse-stripe-webhook-health.sh 24 >> /var/log/orderzhouse-stripe-webhook-health.log 2>&1
set -uo pipefail

HOURS="${1:-24}"
[[ "$HOURS" =~ ^[0-9]+$ ]] && (( HOURS >= 1 && HOURS <= 168 )) || { echo "usage: $0 [HOURS 1-168]"; exit 3; }
CONTAINER=orderzhouse-backend
SINCE_EPOCH=$(( $(date -u +%s) - HOURS * 3600 ))

echo "=== OrderzHouse Stripe webhook health (last ${HOURS}h) ==="
date -u

# 1 nginx access logs (current + previous rotation; gzip rotations when the window needs them)
nginx_lines() {
  local f
  for f in $(ls -1tr /var/log/nginx/access.log* 2>/dev/null); do
    if [[ "$f" == *.gz ]]; then
      (( HOURS > 24 )) && zcat -f "$f" 2>/dev/null
    else
      cat "$f" 2>/dev/null
    fi
  done
}
NGINX=$(nginx_lines | TZ=UTC gawk -v since="$SINCE_EPOCH" '
  BEGIN { split("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec", m, " "); for (i = 1; i <= 12; i++) mon[m[i]] = i }
  $6 == "\"POST" && index($7, "/api/webhooks/stripe") == 1 {
    split(substr($4, 2), a, /[\/:]/)
    t = mktime(a[3] " " mon[a[2]] " " a[1] " " a[4] " " a[5] " " a[6])
    if (t < since) next
    who = index($0, "Stripe/1.0") ? "stripe" : "other"
    cls = substr($9, 1, 1) "xx"
    n[who " " cls]++
  }
  END { for (k in n) print k, n[k] }' | sort)
count_of() { printf '%s\n' "$NGINX" | awk -v k="$1" '$1 " " $2 == k { print $3; f = 1 } END { if (!f) print 0 }'; }
S2=$(count_of "stripe 2xx"); S4=$(count_of "stripe 4xx"); S5=$(count_of "stripe 5xx")
O2=$(count_of "other 2xx"); O4=$(count_of "other 4xx"); O5=$(count_of "other 5xx")
echo "nginx stripe_deliveries 2xx=$S2 4xx=$S4 5xx=$S5 | other_callers 2xx=$O2 4xx=$O4 5xx=$O5"

# 2 backend structured webhook log outcomes
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "FAIL container $CONTAINER not running"
  echo "STRIPE_WEBHOOK_HEALTH UNKNOWN"
  exit 3
fi
OUTCOMES=$(docker logs --since "${HOURS}h" "$CONTAINER" 2>&1 \
  | grep -F '"component":"stripe_webhook"' \
  | grep -o '"outcome":"[a-z_]*"' | cut -d'"' -f4 | sort | uniq -c | awk '{ printf "%s=%s ", $2, $1 }')
INVALID_SIG=$(printf '%s' "$OUTCOMES" | grep -o 'invalid_signature=[0-9]*' | cut -d= -f2)
MISCONFIGURED=$(printf '%s' "$OUTCOMES" | grep -o 'misconfigured=[0-9]*' | cut -d= -f2)
echo "backend_outcomes ${OUTCOMES:-none}"

# 3 DB idempotency ledger (counts only)
DB=$(docker exec -i -e HOURS="$HOURS" "$CONTAINER" node - 2>/dev/null <<'NODE'
const { pool } = require("/app/src/config/db");
(async () => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE received_at >= NOW() - make_interval(hours => $1::int))::int AS received,
            COUNT(*) FILTER (WHERE received_at >= NOW() - make_interval(hours => $1::int) AND status = 'processed')::int AS processed,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_open,
            COUNT(*) FILTER (WHERE status = 'processing' AND received_at < NOW() - interval '15 minutes')::int AS stuck_processing,
            to_char(MAX(received_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') AS last_received
       FROM stripe_webhook_events`,
    [Number(process.env.HOURS)],
  );
  const r = rows[0];
  console.log(`total=${r.total} received=${r.received} processed=${r.processed} failed_open=${r.failed_open} stuck_processing=${r.stuck_processing} last_received=${r.last_received || "never"}`);
})()
  .catch((e) => { console.log(`db_error=${String(e.code || "query_failed")}`); process.exitCode = 1; })
  .finally(() => pool.end().catch(() => {}));
NODE
)
echo "db_events ${DB:-db_error=no_output}"
FAILED_OPEN=$(printf '%s' "$DB" | grep -o 'failed_open=[0-9]*' | cut -d= -f2)
STUCK=$(printf '%s' "$DB" | grep -o 'stuck_processing=[0-9]*' | cut -d= -f2)

# Verdict
LEVEL=OK
REASONS=()
if (( S4 + S5 > 0 )); then LEVEL=ALERT; REASONS+=("stripe deliveries rejected (4xx=$S4 5xx=$S5)"); fi
if [[ -n "${MISCONFIGURED:-}" ]]; then LEVEL=ALERT; REASONS+=("webhook secret missing (misconfigured=$MISCONFIGURED)"); fi
if [[ "$DB" == *db_error* || -z "$DB" ]]; then LEVEL=ALERT; REASONS+=("db ledger unreadable"); fi
if (( ${FAILED_OPEN:-0} > 0 )) && [[ "$LEVEL" == OK ]]; then LEVEL=WARN; REASONS+=("failed events awaiting Stripe retry ($FAILED_OPEN)"); fi
if (( ${STUCK:-0} > 0 )) && [[ "$LEVEL" == OK ]]; then LEVEL=WARN; REASONS+=("events stuck in processing ($STUCK)"); fi
if [[ -n "${INVALID_SIG:-}" ]] && (( S4 == 0 )) && [[ "$LEVEL" == OK ]]; then
  LEVEL=WARN; REASONS+=("invalid_signature=$INVALID_SIG from non-Stripe callers (probes)")
fi
if (( S2 + S4 + S5 == 0 )) && [[ "$LEVEL" == OK ]]; then LEVEL=WARN; REASONS+=("no Stripe deliveries in window"); fi

DETAIL=""
(( ${#REASONS[@]} > 0 )) && DETAIL=" — $(printf '%s; ' "${REASONS[@]}")" && DETAIL="${DETAIL%; }"
echo "STRIPE_WEBHOOK_HEALTH $LEVEL$DETAIL"
case "$LEVEL" in OK) exit 0 ;; WARN) exit 1 ;; *) exit 2 ;; esac
