# Orderz House — Deployment Checklist

Documentation-only guide for staging and production. No application logic changes.

**Related:** [Manual Staging E2E](./manual-staging-e2e.md) · `backend/.env.example` · `frontend/.env.example`

---

## A) Staging setup

### 1. Database

- [ ] Create a **dedicated Postgres** instance for staging (not production data).
- [ ] Set `DATABASE_URL` in backend secrets (SSL as required by host).
- [ ] **Do not** run `sql/init.sql` on staging — it drops `users` and `categories`.
- [ ] From `backend/` run migrations **only against the intended DB**:

```bash
npm run db:migrate:status
npm run db:migrate          # non-production only — refuses shared Neon
npm run db:verify-schema
```

- [ ] Production schema changes: follow `docs/ENVIRONMENT_SAFETY.md` (`db:migrate:production` + backup confirmation). Do **not** run `npm run db:migrate` from a workstation `.env` that points at production Neon.

- [ ] Optional (staging only, if you need an admin user): `npm run db:create-admin` — never on production without a documented process.

### 2. Backend environment

Copy `backend/.env.example` → host env / `.env` and set:

| Variable | Staging notes |
|----------|----------------|
| `NODE_ENV` | **`production` (mandatory on the live API host)** — set in the process manager / Docker `environment`, not only in a file. A host `backend/.env` with `NODE_ENV=development` previously overrode orchestrator env because `dotenv` used `override: true` (fixed). Confirm `GET /api/health` → `runtime.nodeEnv === "production"`. |
| `PORT` | Host port (e.g. `5000`) |
| `DATABASE_URL` | Staging Postgres connection string |
| `JWT_SECRET` | Strong random secret (≥ 16 chars) |
| `CLIENT_URL` | `https://staging.your-domain.com` (single URL) |
| `CORS_ORIGINS` | Extra origins if needed (www, preview) |
| `TRUST_PROXY` | `1` behind reverse proxy |
| `STRIPE_SECRET_KEY` | **`sk_test_...` only** on staging |
| `STRIPE_WEBHOOK_SECRET` | From Stripe Dashboard or `stripe listen` |
| `RESEND_API_KEY` | Required to test register OTP / reset password |
| `EMAIL_FROM` | Verified sender in Resend |
| `CLOUDINARY_*` | Required before upload E2E |
| `COOKIE_SAME_SITE` | `none` if SPA and API are on **different** HTTPS hosts |
| `FAKE_ORDERS_AUTOMATION_ENABLED` | `false` on multi-instance — use external cron (see below) |
| `FAKE_ORDERS_AUTOMATION_CRON_SECRET` | **Required for production cron** (≥ 16 chars, not a placeholder) |
| `FAKE_ORDERS_TICK_MS` | `60000` — how often `runAutomationTick` runs (not round duration) |

**Training round duration (12 hours)** is **not** an env var — set in Super Admin → Training → Settings (`duration_value` + `duration_unit`, default `12` / `hours`). Migration `082` restores 12h if DB was left at `2 minutes` from testing.

#### Fake orders automation cron (production / multi-instance)

0. Run migrations **`081`**, **`082`**, **`083`** (`npm run db:migrate` from `backend/`):
   - `081` — marketplace visibility proof columns (`was_marketplace_visible`)
   - `082` — restore 12h round duration if DB was left at 2-minute test values
   - `083` — realign `next_automation_run_at` to ~12h ahead after duration restore
1. Set `FAKE_ORDERS_AUTOMATION_CRON_SECRET` in backend secrets (generate a random 32+ char string).
2. Keep `FAKE_ORDERS_AUTOMATION_ENABLED=false` when more than one backend instance may run.
3. Schedule **every 1–2 minutes**:

```bash
curl -sS -X POST "https://<API_HOST>/api/internal/fake-orders/automation-tick" \
  -H "X-Fake-Orders-Automation-Secret: <FAKE_ORDERS_AUTOMATION_CRON_SECRET>"
```

4. In Super Admin → Training → Settings: enable **training orders** and **automation**; set duration to **12 hours**.
5. After deploy, run: `npm run verify:fake-orders-automation` (from `backend/` with `DATABASE_URL` + optional `VERIFY_API_BASE`). Confirm **Super Admin → Training → صحة الأتمتة** shows driver active.

| Check | Expected |
|-------|----------|
| Automation driver | Configured (cron secret or single-instance in-process) |
| `lastAutomationRunAt` | Updates every 1–2 min |
| `nextAutomationRunAt` | ~12h after last scheduled rotation |
| Visible fake orders | > 0 |
| `GET /api/orders/pool` | Includes training rows |
| Homepage `completedOrders` | Real completed + proven ended training rotations |
| `trainingRotationsCompleted` | Increases only after proven visible cycle ends |

### 3. Frontend environment

Copy `frontend/.env.example` → build-time env:

| Variable | Staging notes |
|----------|----------------|
| `VITE_API_BASE_URL` | Prefer `/api` (same-origin). Absolute API hosts are legacy. See `docs/production-origin-canonical.md`. |
| `VITE_POSTHOG_KEY` | Staging project key (optional) |
| `VITE_POSTHOG_HOST` | `https://us.i.posthog.com` or `eu.i` |
| `VITE_POSTHOG_ENABLE_IN_DEV` | `false` for production builds |

### 4. Build & run

```bash
# Backend (from backend/) — plain Node, no compile step
npm ci
npm run test:unit
NODE_ENV=production npm start
# Verify: GET /api/health → runtime.nodeEnv === "production"

# Frontend (from frontend/)
npm ci
npm run lint
npm run build
npm test
# Deploy dist/ to static host; point SPA to staging API
```

Optional Docker (requires `backend/Dockerfile` + `frontend/Dockerfile`):

```bash
docker compose up --build -d
```

### 5. Smoke checks

```bash
# From backend/ — BASE_URL = staging API root without /api
BASE_URL=https://api.staging.your-domain.com npm run api:smoke
```

- [ ] `GET /api/health` → 200
- [ ] `GET /api/categories` → 200
- [ ] Open staging SPA in browser — home loads, no console CORS errors
- [ ] Complete [Manual Staging E2E](./manual-staging-e2e.md)

---

## B) Production setup

### Stripe (live)

- [ ] `STRIPE_SECRET_KEY` = **`sk_live_...`** (never on local dev machines)
- [ ] Webhook endpoint in Stripe Dashboard:

  `https://<API_HOST>/api/webhooks/stripe`

- [ ] Subscribe to events:
  - `checkout.session.completed`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
- [ ] Copy signing secret → `STRIPE_WEBHOOK_SECRET`
- [ ] `CLIENT_URL` = production SPA URL (HTTPS, no commas)

### Email, files, analytics

- [ ] Resend: production API key + verified `EMAIL_FROM`
- [ ] Cloudinary: production cloud credentials
- [ ] PostHog (optional): backend `POSTHOG_*` + frontend `VITE_POSTHOG_*` aligned to same region

### HTTPS, CORS, cookies

- [ ] Frontend and API served over **HTTPS**
- [ ] `CLIENT_URL` matches primary SPA origin
- [ ] `CORS_ORIGINS` lists any additional allowed browser origins
- [ ] If SPA host ≠ API host: `COOKIE_SAME_SITE=none` and Secure cookies (`COOKIE_SECURE` default in production)
- [ ] `TRUST_PROXY=1` on API behind load balancer

### Migrations

| Command | Purpose | Production-safe? |
|---------|---------|------------------|
| `npm run db:migrate` | Applies pending SQL files from `sql/migrations` via `scripts/runAllMigrations.js`, tracked in `schema_migrations` | **Yes** — use this on staging/production |
| `npm run db:verify-schema` | Read-only schema sanity checks | **Yes** |
| `npm run db:migrate:deploy` | **Does not exist** in this repo | N/A |
| Prisma migrate | **Not used** — backend is raw `pg` + SQL files | Never |

There is **no Prisma** in this backend. Never run `prisma migrate dev` or any Prisma command for Orderz House.

```bash
cd backend
npm run db:migrate
npm run db:verify-schema
```

---

## C) Quality commands (pre-deploy)

| Command | Where | Purpose |
|---------|-------|---------|
| `npm run lint` | `frontend/` | ESLint |
| `npm run build` | `frontend/` | Production bundle |
| `npm test` | `frontend/` | RBAC + payment helpers |
| `npm run test:unit` | `backend/` | Unit + security tests (154) |
| `npm run test:integration` | `backend/` | Postgres lifecycle (needs real `DATABASE_URL`) |
| `npm run db:migrate` | `backend/` | Apply SQL migrations |
| `npm run db:verify-schema` | `backend/` | Schema sanity check |
| `npm run api:smoke` | `backend/` | HTTP smoke (health, 401 guards) |

---

## D) Important warnings

| Warning | Reason |
|---------|--------|
| **Never run `sql/init.sql` on production/staging** | Contains `DROP TABLE` — destroys data |
| **Never run seed/reset/drop scripts on production** | Data loss / test pollution |
| **Do not enable `FAKE_ORDERS_AUTOMATION_ENABLED` on multiple instances** | Duplicate ticks / race conditions |
| **Never `EXPOSE_ERROR_DEBUG=true` in production** | Leaks stack traces |
| **Never use Stripe live keys locally** | Accidental charges / compliance |
| **Never use Stripe test keys in production** | Payments will not settle |
| **Do not commit `.env` files** | Secrets belong in host secret store |

---

## Hosting notes

| Layer | Typical approach |
|-------|------------------|
| Frontend | Static deploy of `frontend/dist` (Vercel, Netlify, S3+CDN) |
| Backend | Node `npm start` (Render, Railway, Fly, VPS) |
| Database | Managed Postgres |
| Webhooks | Public HTTPS URL to `/api/webhooks/stripe` only |
