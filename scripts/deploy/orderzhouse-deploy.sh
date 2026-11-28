#!/usr/bin/env bash
# OrderzHouse Production deploy — runs ON the VPS (srv1528115), started detached by
# `node scripts/oh.mjs prod:deploy`. Mirrors the proven manual flow:
#   reset to merged SHA → compose build → migrations (explicit, one at a time) → up → rollout gate.
#
# Required env:
#   TARGET_SHA=<full 40-char sha on origin/main>
#   CONFIRM=orderzhouse-production
# Optional env:
#   MIGRATIONS="219_x 220_y"   ordered pending migrations to apply (each must be the next pending one)
#   SERVICES="backend frontend" services to rebuild (default both)
set -euo pipefail

ROOT=/root/Orderz_House
LOCK=/root/.orderzhouse-deploy.lock

[[ "${CONFIRM:-}" == "orderzhouse-production" ]] || { echo "DEPLOY_FAIL missing CONFIRM=orderzhouse-production"; exit 2; }
[[ "${TARGET_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo "DEPLOY_FAIL TARGET_SHA must be a full sha"; exit 2; }
[[ "$(hostname)" == "srv1528115" ]] || { echo "DEPLOY_FAIL unexpected host $(hostname)"; exit 2; }
SERVICES="${SERVICES:-backend frontend}"

exec 9>"$LOCK"
flock -n 9 || { echo "DEPLOY_FAIL another deploy is running"; exit 3; }

cd "$ROOT"
echo "=== PRE $(date -u +%FT%TZ) HEAD=$(git rev-parse HEAD)"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "DEPLOY_FAIL tracked local changes on the VPS checkout; inspect before deploying"
  git status --short --untracked-files=no
  exit 4
fi
git fetch -q origin main
git merge-base --is-ancestor "$TARGET_SHA" origin/main || { echo "DEPLOY_FAIL $TARGET_SHA is not on origin/main"; exit 4; }
PREV_SHA="$(git rev-parse HEAD)"
git checkout -q main
git reset -q --hard "$TARGET_SHA"
[[ "$(git rev-parse HEAD)" == "$TARGET_SHA" ]] || { echo "DEPLOY_FAIL checkout mismatch"; exit 4; }
echo "=== CHECKOUT $PREV_SHA -> $TARGET_SHA"

cp -a docker-compose.production.yml docker-compose.override.yml
if [[ -f backend/ops/neonIpv6Dial.js ]]; then
  install -m 644 backend/ops/neonIpv6Dial.js /root/oh-neon-ipv6.js
fi

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.production.yml)
# shellcheck disable=SC2086
"${COMPOSE[@]}" build $SERVICES

MIGRATE_ENV=(-e APP_ENV=production -e ALLOW_PRODUCTION_DB_MIGRATIONS=1
  -e CONFIRM_PRODUCTION_DATABASE=orderzhouse-production -e PRODUCTION_BACKUP_CONFIRMED=1)
LATEST="$(ls backend/sql/migrations/*.sql | sort -V | tail -1 | xargs -n1 basename | sed 's/\.sql$//')"
if [[ -n "${MIGRATIONS:-}" ]]; then
  for m in $MIGRATIONS; do
    echo "=== MIGRATE $m"
    if ! "${COMPOSE[@]}" run --no-deps --rm "${MIGRATE_ENV[@]}" -e EXPECTED_MIGRATION_VERSION="$m" \
      backend npm run -s db:migrate:production:next; then
      echo "DEPLOY_FAIL migration $m failed; containers NOT restarted"
      exit 5
    fi
  done
fi
echo "=== MIGRATION STATUS (dry-run, latest=$LATEST)"
OUT="$("${COMPOSE[@]}" run --no-deps --rm "${MIGRATE_ENV[@]}" -e EXPECTED_MIGRATION_VERSION="$LATEST" \
  backend node scripts/runNextProductionMigration.js --dry-run 2>&1 || true)"
if grep -q -E "NO_PENDING_MIGRATIONS|EXPECTED_MIGRATION_ALREADY_APPLIED" <<<"$OUT"; then
  echo "migrations: none pending"
else
  echo "$OUT" | tail -15
  echo "DEPLOY_FAIL pending migrations remain; containers NOT restarted (old version still serving)."
  echo "Pass MIGRATIONS=\"...\" in order. Code checkout is at $TARGET_SHA; previous was $PREV_SHA."
  exit 5
fi

# shellcheck disable=SC2086
"${COMPOSE[@]}" up -d --remove-orphans $SERVICES
sleep 12
sed -i 's/\r$//' scripts/orderzhouse-rollout-check.sh || true
bash scripts/orderzhouse-rollout-check.sh 120
curl -fsS -m 20 https://orderzhouse.com/api/health; echo
echo "DEPLOY_DONE $(git rev-parse HEAD) $(date -u +%FT%TZ)"
