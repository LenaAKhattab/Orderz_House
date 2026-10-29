#!/usr/bin/env bash
# Cron wrapper for orderzhouse-stripe-webhook-health.sh (read-only, counts only).
# Appends the report to a logrotate-managed file and mirrors the verdict + exit code to syslog
# (tag orderzhouse-stripe-webhook-health; info on OK, warning on WARN, err on ALERT/could-not-run).
#
# VPS install:
#   /etc/cron.d/orderzhouse-stripe-webhook-health
#     MAILTO=""
#     0 9 * * * root bash /root/Orderz_House/scripts/orderzhouse-stripe-webhook-health-cron.sh 24 >/dev/null 2>&1
#   /etc/logrotate.d/orderzhouse-stripe-webhook-health  →  /var/log/orderzhouse/stripe-webhook-health.log
# Read results: tail /var/log/orderzhouse/stripe-webhook-health.log ; journalctl -t orderzhouse-stripe-webhook-health
set -uo pipefail

HOURS="${1:-24}"
LOG_DIR=/var/log/orderzhouse
LOG_FILE="$LOG_DIR/stripe-webhook-health.log"
TAG=orderzhouse-stripe-webhook-health
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -d -m 750 "$LOG_DIR"
OUT=$(bash "$SCRIPT_DIR/orderzhouse-stripe-webhook-health.sh" "$HOURS" 2>&1)
RC=$?
{ printf '%s\n' "$OUT"; echo "exit=$RC"; echo; } >> "$LOG_FILE"
chmod 640 "$LOG_FILE"

VERDICT=$(printf '%s\n' "$OUT" | grep '^STRIPE_WEBHOOK_HEALTH' | tail -n 1)
case "$RC" in
  0) PRIORITY=user.info ;;
  1) PRIORITY=user.warning ;;
  *) PRIORITY=user.err ;;
esac
logger -t "$TAG" -p "$PRIORITY" -- "exit=$RC window=${HOURS}h ${VERDICT:-STRIPE_WEBHOOK_HEALTH UNKNOWN (no verdict line)}"
exit "$RC"
