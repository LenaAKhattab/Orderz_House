#!/usr/bin/env bash
# OrderzHouse Production app deploy — SHA 41ede98
# NO migrations. NO Campaign 2 changes. NO secrets overwrite.
set -euo pipefail

TARGET_SHA="41ede98231bb38a19fe2472b37ebbb118768d27e"
STASH_NAME="pre-deploy-legacy-admin-center-20260922"
PROJECT="/root/Orderz_House"

echo "=== 1) ENTER PROJECT ==="
cd "$PROJECT"
pwd

echo "=== 2) PRE-STATE ==="
PREV_SHA="$(git rev-parse HEAD)"
echo "PREV_SHA=$PREV_SHA"
git branch -vv
git remote -v
git status --short || true

echo "=== 3) DOCKER COMPOSE DETECT ==="
if [ -f docker-compose.yml ]; then
  COMPOSE_FILE="docker-compose.yml"
elif [ -f compose.yml ]; then
  COMPOSE_FILE="compose.yml"
else
  echo "BLOCKED: no docker compose file found"
  ls -la
  exit 2
fi
echo "COMPOSE_FILE=$COMPOSE_FILE"
docker compose -f "$COMPOSE_FILE" ps || true

echo "=== 4) STASH LOCAL CHANGES IF NEEDED ==="
STASHED=0
# Preserve .env / secrets: stash only tracked modifications; leave ignored files alone.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Tracked changes present — stashing safely"
  git stash push -m "$STASH_NAME" -- backend frontend docker-compose.yml compose.yml 2>/dev/null \
    || git stash push -u -m "$STASH_NAME" -- backend frontend
  STASHED=1
  echo "STASHED=1 name=$STASH_NAME"
  git stash list | head -n 5
else
  # Also stash tracked-only via status porcelain excluding untracked secrets
  DIRTY_TRACKED="$(git status --porcelain | awk '{print $1}' | grep -v '^??' || true)"
  if [ -n "$DIRTY_TRACKED" ]; then
    git stash push -m "$STASH_NAME"
    STASHED=1
    echo "STASHED=1 name=$STASH_NAME"
  else
    echo "Working tree clean (ignored files like .env left untouched)"
  fi
fi
git status --short || true

echo "=== 5) FETCH + FF TO TARGET ==="
git fetch origin
git checkout main
git pull --ff-only origin main
HEAD_SHA="$(git rev-parse HEAD)"
echo "HEAD_SHA=$HEAD_SHA"
if [ "$HEAD_SHA" != "$TARGET_SHA" ]; then
  # Allow abbreviated match if remote tip is exactly target
  SHORT="$(git rev-parse --short=7 HEAD)"
  if [[ "$TARGET_SHA" != "$HEAD_SHA"* ]] && [[ "$HEAD_SHA" != 41ede98* ]]; then
    echo "BLOCKED: HEAD $HEAD_SHA does not match required 41ede98"
    exit 3
  fi
fi
if [[ "$HEAD_SHA" != 41ede98* ]]; then
  echo "BLOCKED: HEAD must start with 41ede98, got $HEAD_SHA"
  exit 3
fi
echo "SHA_OK=$HEAD_SHA"

echo "=== 6) NO MIGRATIONS (already applied on Neon Production) ==="

echo "=== 7) BUILD + RESTART ==="
docker compose -f "$COMPOSE_FILE" up -d --build

echo "=== 8) CONTAINER STATUS ==="
docker compose -f "$COMPOSE_FILE" ps

echo "=== 9) LOCAL HEALTH ==="
sleep 5
curl -sS -m 20 http://127.0.0.1/api/health || curl -sS -m 20 http://127.0.0.1:5000/api/health || true
echo
curl -sS -m 20 -o /dev/null -w "health_http=%{http_code}\n" https://orderzhouse.com/api/health || true
curl -sS -m 20 -o /dev/null -w "home_http=%{http_code}\n" https://orderzhouse.com/ || true
curl -sS -m 20 -o /dev/null -w "legacy_route_http=%{http_code}\n" https://orderzhouse.com/dashboard/legacy-freelancers || true

echo "=== 10) RECENT LOGS (tail) ==="
docker compose -f "$COMPOSE_FILE" logs --tail=80 backend 2>/dev/null || docker compose -f "$COMPOSE_FILE" logs --tail=80 2>/dev/null | tail -n 100

echo "=== 11) FINAL GIT STATE ==="
echo "PREV_SHA=$PREV_SHA"
echo "FINAL_SHA=$(git rev-parse HEAD)"
echo "STASHED=$STASHED"
git status --short || true
git stash list | head -n 5 || true
echo "DEPLOY_SCRIPT_DONE"
