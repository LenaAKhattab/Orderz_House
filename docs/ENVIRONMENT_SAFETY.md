# Orderz House — Environment & Database Safety

This document exists because a local development session accidentally applied
footer CMS migrations **130** and **131** to the **shared/production Neon**
database.

## What went wrong

Local `backend/.env` mixed:

| Setting | Local-looking value | Dangerous value also present |
|---------|---------------------|------------------------------|
| `NODE_ENV` | `development` | — |
| `CLIENT_URL` | `http://localhost:5173` | — |
| `DATABASE_URL` | — | shared Neon `ep-wandering-cherry-…/neondb` |
| `STRIPE_SECRET_KEY` | — | `sk_live_…` |

`NODE_ENV=development` alone does **not** mean the database is safe.
`npm run db:migrate` previously trusted whatever `DATABASE_URL` was in `.env`.

Those migrations were **additive** and must **not** be rolled back.
This safety system prevents the **next** accidental **tooling** write.

## Normal development (restored)

```bash
cd backend
npm run dev
```

Loads:

1. Process / shell environment (wins)
2. `backend/.env` fills unset keys only (`override: false` — never `override: true`)

**`.env.local` is not required** and is not part of the normal startup path.

Using `backend/.env` may still point at shared/live Neon or Live Stripe depending on
your local configuration. That is allowed for **normal application startup**
(login, Admin pages, ordinary API writes). Destructive **tooling** remains guarded
separately (see below).

`APP_ENV=local` is **not** required for `npm run dev`.

## Concepts

### `APP_ENV` (data / deployment environment)

| Value | Meaning |
|-------|---------|
| `local` | Optional label for workstation context (inferred from non-production `NODE_ENV` if unset) |
| `test` | Automated tests |
| `sandbox` | Isolated Stripe/DB QA |
| `staging` | Staging deploy |
| `production` | Live Orderz House |

### `NODE_ENV` (Node runtime behavior)

Still controls Express/cookie/production checks. Prefer:

- workstation: `NODE_ENV=development`
- production host: `NODE_ENV=production` + `APP_ENV=production`

## Production / shared DB markers

Known production Neon (treat as PRODUCTION/SHARED):

- Host contains `ep-wandering-cherry` (pooler:
  `ep-wandering-cherry-ah474lak-pooler.c-3.us-east-1.aws.neon.tech`)
- Database name commonly `neondb` on that host

Optional extras:

```bash
PRODUCTION_DATABASE_HOST=other-prod-host.example
# or
PRODUCTION_DATABASE_MARKER=ep-other-prod
```

## Env file layout

| Profile | File(s) | Falls back to `.env`? |
|---------|---------|------------------------|
| **Normal / default** (`npm run dev`) | `backend/.env` | N/A — this **is** the file |
| **sandbox** tooling | `.env.sandbox` **only** | **No** → `SANDBOX_ENV_NOT_LOADED` |
| **test** tooling | `.env.test` **only** | **No** → `TEST_ENV_NOT_LOADED` |
| **production** deploy | process/orchestrator env first; `.env` may fill **unset** keys only | Never required on hosts that inject full env |

**Never** use `dotenv` `override: true` — process environment must win over files.

Startup does **not** fail with `LOCAL_ENV_NOT_LOADED` / `LOCAL_ENV_INCOMPLETE`.
Startup does **not** exit for `UNSAFE_MIXED_ENVIRONMENT` merely because `.env` points at
shared Neon + Live Stripe. The banner still labels those targets for awareness.

## What is guarded vs what is not

| Action | Guarding |
|--------|----------|
| `npm run dev` / normal API (login, Admin, app records) | Not blocked by mixed DB/Stripe |
| `npm run db:migrate` against production Neon | **Blocked** (`PRODUCTION_DATABASE_WRITE_BLOCKED`) |
| `npm run db:migrate:production` | Requires multi-flag approval |
| QA / seed / Test Clock / sandbox mutation scripts | **Blocked** on production Neon |
| Operational repair scripts on production | Explicit confirm flags |

There is **no** global DB write blocker inside normal API request handlers.

## Commands

### Safe local migration (non-production DB)

```bash
cd backend
npm run db:migrate:status   # read-only
npm run db:migrate          # BLOCKS production/shared Neon
```

### Deliberate production migration

```bash
cd backend
npm run db:migrate:status   # confirm TARGET=PRODUCTION and pending list

# Deployment-only (do NOT put these in a developer .env):
APP_ENV=production \
ALLOW_PRODUCTION_DB_MIGRATIONS=1 \
CONFIRM_PRODUCTION_DATABASE=orderzhouse-production \
PRODUCTION_BACKUP_CONFIRMED=1 \
npm run db:migrate:production
```

### Apply exactly one production migration (first pending only)

When multiple migrations are pending and only the next approved migration should apply:

```bash
cd backend
npm run db:migrate:status

# Dry-run / pin inspection (no migration SQL executed):
EXPECTED_MIGRATION_VERSION=145_marketplace_article_level_model \
npm run db:migrate:production:next -- --dry-run

# Apply ONLY the first pending migration (must match EXPECTED_MIGRATION_VERSION):
APP_ENV=production \
ALLOW_PRODUCTION_DB_MIGRATIONS=1 \
CONFIRM_PRODUCTION_DATABASE=orderzhouse-production \
PRODUCTION_BACKUP_CONFIRMED=1 \
EXPECTED_MIGRATION_VERSION=145_marketplace_article_level_model \
npm run db:migrate:production:next
```

If `EXPECTED_MIGRATION_VERSION` does not equal the first pending migration, the command
fails closed with `EXPECTED_MIGRATION_DOES_NOT_MATCH_NEXT_PENDING` (no skip / no reorder).

`npm run db:run` remains blocked against production (`guardNonProductionWrite`).

If pending SQL matches `DROP` / `TRUNCATE` / unconstrained `DELETE` heuristics,
also set `ALLOW_DANGEROUS_PRODUCTION_SQL=1` after review.

### Production migration checklist

Before `db:migrate:production`:

1. Neon restore point / branch / backup confirmed
2. Pending SQL reviewed (`db:migrate:status`)
3. Rollback strategy understood (no automated destructive rollback)
4. Maintenance impact understood
5. Set `PRODUCTION_BACKUP_CONFIRMED=1` only after the above

## QA / seed scripts

Scripts that seed or mutate QA data call `assertQaMutationAllowed`.
Against production/shared Neon they exit with:

`QA_PRODUCTION_DATABASE_BLOCKED`

Sandbox Stripe / Test Clock tooling must use `backend/.env.sandbox` only
(never silently inherit Live config from `backend/.env`).

## Operational admin / repair scripts

Examples: `markActivationFeePaidByEmail`, `applyAdminAssignmentOfflinePayments`,
`resetPasswordByEmail`.

On production DB they require:

```bash
ALLOW_PRODUCTION_OPERATIONAL_SCRIPT=1
CONFIRM_PRODUCTION_OPERATIONAL_SCRIPT=orderzhouse-production
```

## Stripe

| Context | Behavior |
|---------|----------|
| Normal `npm run dev` | Does **not** crash solely because `STRIPE_SECRET_KEY` is Live |
| Sandbox / Test Clock QA | `sk_test_` only (`assertStripeSandboxQaAllowed`) |
| Production host | `sk_live_` expected; test keys blocked where those checks apply |

## Mixed environment helper

`evaluateMixedEnvironment` / `assertRuntimeEnvironmentSafe` classify dangerous
combinations (e.g. `APP_ENV=local` + production Neon) for tooling and diagnostics.
They are **not** invoked to kill normal application startup.

## Recommended safer local DB (optional)

If you want migrations/seeds without hitting shared Neon:

1. Create a **local Postgres** or **isolated Neon branch** (not the wandering-cherry pooler).
2. Point `DATABASE_URL` in `backend/.env` at that isolated DB.
3. Prefer `sk_test_…` for Stripe when not intentionally exercising Live flows.
4. Keep production Neon + Live Stripe as intentional choices you understand.

## Deployment

Production API hosts should inject secrets via Compose/PM2/orchestrator
(`NODE_ENV=production`, `APP_ENV=production`, DB, Stripe). Process env wins;
`backend/.env` may only fill unset keys.

## Related code

- `src/utils/databaseEnvironmentSafety.js` — migrate / QA / operational guards + banner
- `src/config/loadBackendEnv.js` — sandbox/test fail-closed loaders
- `src/config/env.js` — startup validation (required vars + banner; no mixed-env exit)
- `server.js` — loads `backend/.env` for normal startup
- `scripts/runAllMigrations.js` / `scripts/migrateStatus.js`
- `scripts/lib/assertScriptDatabaseAllowed.js`
- `src/utils/stripeModeGuard.js` — sandbox/QA Stripe mode checks
