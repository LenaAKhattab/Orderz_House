#!/usr/bin/env bash
# Production rollout gate for Orderz House on the VPS.
# A deploy is not successful until every check below passes.
set -euo pipefail

TIMEOUT_SEC="${1:-90}"
deadline=$((SECONDS + TIMEOUT_SEC))

pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; exit 1; }

wait_http() {
  local url="$1"
  local label="$2"
  while true; do
    if curl -fsS -m 5 -o /tmp/oh_rollout_body.json "$url"; then
      pass "$label"
      return 0
    fi
    if (( SECONDS > deadline )); then
      fail "$label (timeout waiting for $url)"
    fi
    sleep 2
  done
}

echo "=== OrderzHouse rollout check ==="
date -u

# 1–2 containers / processes listening
if ! ss -ltn | grep -q ':3006'; then fail "frontend listener :3006"; fi
pass "frontend listener :3006"
if ! ss -ltn | grep -q ':3007'; then fail "backend listener :3007"; fi
pass "backend listener :3007"

# 3–4 local HTTP
wait_http "http://127.0.0.1:3006/" "local frontend 3006"
wait_http "http://127.0.0.1:3007/api/health" "local backend health"

# 5 DB connected field
if ! grep -q '"database":"connected"' /tmp/oh_rollout_body.json 2>/dev/null; then
  # health body may still be from prior wait; re-fetch
  curl -fsS -m 8 -o /tmp/oh_rollout_body.json http://127.0.0.1:3007/api/health || fail "health refetch"
fi
if grep -q '"database":"connected"' /tmp/oh_rollout_body.json; then
  pass "database connected"
else
  fail "database not connected ($(head -c 200 /tmp/oh_rollout_body.json))"
fi

# 6 frontend container can resolve + reach backend on Production host port 3007
if docker ps --format '{{.Names}}' | grep -qx orderzhouse-frontend; then
  if ! docker exec orderzhouse-frontend getent hosts backend >/dev/null 2>&1; then
    fail "frontend cannot resolve backend"
  fi
  pass "frontend resolves backend"
  if docker exec orderzhouse-frontend wget -qO- -T 5 http://backend:3007/api/health 2>/dev/null \
    | grep -q '"database":"connected"'; then
    pass "frontend reaches backend:3007"
  else
    fail "frontend cannot reach backend:3007/api/health"
  fi
  if curl -fsS -m 8 -o /tmp/oh_rollout_3006_api.json http://127.0.0.1:3006/api/health \
    && grep -q '"database":"connected"' /tmp/oh_rollout_3006_api.json; then
    pass "local frontend:3006 proxies /api"
  else
    fail "local frontend:3006 /api/health (SPA nginx upstream)"
  fi
else
  echo "WARN frontend container not named orderzhouse-frontend — skip resolve check"
fi

# 7–8 public
wait_http "https://orderzhouse.com/api/health" "public /api/health"
wait_http "https://orderzhouse.com/" "public /"

# 9 one DB-backed public endpoint
if curl -fsS -m 20 -o /tmp/oh_rollout_orders.json \
  "https://orderzhouse.com/api/orders/pool?page=1&limit=1&sort=newest"; then
  pass "public orders pool"
else
  fail "public orders pool"
fi

if curl -fsS -m 15 -o /tmp/oh_rollout_tp.json \
  "https://orderzhouse.com/api/public/training-packages"; then
  pass "public training packages"
else
  fail "public training packages"
fi

echo "ROLLOUT_READY"
