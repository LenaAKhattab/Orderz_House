# FAZAT Local / Staging E2E Database Setup

Goal: run Orderz FAZAT integration against a **non-production** database before cross-app E2E with FAZ3AT.

**Contract:** [FAZAT_WORKFORCE_PROVIDER_API.md](./FAZAT_WORKFORCE_PROVIDER_API.md)

---

## Safety rules

| DATABASE_URL host | Classification | Migrate / seed? |
|-------------------|----------------|-----------------|
| `127.0.0.1` / `localhost` | SAFE_LOCAL | Yes |
| Dedicated staging Neon **branch** clearly named staging/dev/test + explicit confirms | SAFE_STAGING | Yes, with guards |
| Live Neon / production-like (e.g. current `neondb` pooler used for live app) | UNSAFE | **Never** |

Scripts:

```bash
npm run check:fazat-db-safety   # prints classification (no secrets)
npm run seed:fazat-staging      # refuses unsafe DB
npm run migrate:fazat-safe      # applies migration 125 only if DB is safe
```

Env template (no secrets):

```text
backend/.env.fazat-e2e.example
```

Copy to `backend/.env.fazat-e2e` (gitignored pattern via local use; do not commit filled file).

---

## Option A — Local PostgreSQL (preferred on this machine)

PostgreSQL 16 is often already installed on Windows (`postgresql-x64-16`).

### 1) Create database

Using pgAdmin or `psql` (replace password):

```bash
# PowerShell
$env:PGPASSWORD = "<your_local_postgres_password>"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h 127.0.0.1 -c "CREATE DATABASE orderz_fazat_e2e;"
```

### 2) Point env at local DB

Create `backend/.env.fazat-e2e` from `.env.fazat-e2e.example`:

```bash
DATABASE_URL=postgresql://postgres:<password>@127.0.0.1:5432/orderz_fazat_e2e
FAZAT_INTEGRATION_ENABLED=true
FAZAT_INTEGRATION_API_KEY=<local_key>
FAZAT_INTEGRATION_SHARED_SECRET=<local_secret_32+_chars>
FAZAT_WEBHOOK_URL=http://localhost:3000/api/v1/integrations/orderz/webhooks
ORDERZ_PUBLIC_API_URL=http://localhost:5000
JWT_SECRET=<local_jwt>
CLIENT_URL=http://localhost:5173
```

You still need a **minimal schema** beyond migration 125 (users, orders, categories, etc.). Options:

1. Restore a **staging anonymized dump** into `orderz_fazat_e2e`, then run `npm run migrate:fazat-safe`.
2. Or run the project’s normal migration chain on the empty local DB (`npm run db:migrate` with the local `DATABASE_URL` only), then seed users/admin as you do for local dev, then FAZAT seed.

**Never** copy production data into git. Prefer a scrubbed staging dump.

### 3) Verify safety + migrate 125

```bash
cd backend
# Ensure process uses the fazat-e2e env, e.g.:
#   copy values into a local .env that is NOT the production Neon URL
#   OR: $env:DATABASE_URL = "postgresql://postgres:...@127.0.0.1:5432/orderz_fazat_e2e"

npm run check:fazat-db-safety
npm run migrate:fazat-safe
```

Expected tables:

- `integration_partners`
- `partner_freelancer_profiles`
- `partner_orders`
- `partner_order_messages`
- `partner_request_nonces`
- `partner_webhook_events`
- `partner_integration_audit_logs`

### 4) Seed FAZAT ranks

Requires at least 3 active freelancers in that DB:

```bash
npm run seed:fazat-staging
```

Optional pins:

```bash
$env:FAZAT_SEED_UNAPPROVED_ID="1"
$env:FAZAT_SEED_APPROVED_ID="2"
$env:FAZAT_SEED_TRUSTED_ID="3"
npm run seed:fazat-staging
```

### 5) Start backend

```bash
# With safe DATABASE_URL in env
npm run dev
# Health: GET http://localhost:5000/api/health
```

### 6) QA

```bash
npm run test:fazat-integration
npm run qa:fazat-integration
# Optional live smoke after env is set:
$env:FAZAT_QA_LIVE="1"
npm run qa:fazat-integration
```

---

## Option B — Dedicated Neon staging branch

1. In Neon console: create a **new branch** named e.g. `staging-fazat-e2e` (not production).
2. Copy **that branch** connection string into `.env.fazat-e2e` only.
3. Confirm host/db name is staging — never the live app connection.
4. Explicit allow (required by guards for non-localhost):

```bash
$env:FAZAT_ALLOW_REMOTE_STAGING_DB="1"
$env:FAZAT_SEED_CONFIRM="STAGING"
npm run check:fazat-db-safety
npm run migrate:fazat-safe
npm run seed:fazat-staging
```

5. Start backend with that env; set `FAZAT_WEBHOOK_URL=http://localhost:3000/api/v1/integrations/orderz/webhooks`.

---

## FAZ3AT companion env (secrets redacted)

```bash
ORDERZ_API_BASE_URL=http://localhost:5000
ORDERZ_PROVIDER_API_PREFIX=/api/integrations/fazat
ORDERZ_PARTNER_KEY=<same as FAZAT_INTEGRATION_API_KEY>
ORDERZ_SHARED_SECRET=<same as FAZAT_INTEGRATION_SHARED_SECRET>
ORDERZ_INTEGRATION_SHARED_SECRET=<same>
ORDERZ_WEBHOOK_SHARED_SECRET=<same HMAC secret>
ORDERZ_MOCK_MODE=false
ORDERZ_REQUEST_MAX_SKEW_SEC=300
```

FAZ3AT webhook receiver Orderz will call:

```text
http://localhost:3000/api/v1/integrations/orderz/webhooks
```

---

## Current machine status (checklist)

- [ ] Local Postgres service running
- [ ] Database `orderz_fazat_e2e` created
- [ ] Local postgres password known / set in `.env.fazat-e2e`
- [ ] Base schema present (migrations or staging dump)
- [ ] `npm run migrate:fazat-safe` applied
- [ ] `npm run seed:fazat-staging` succeeded
- [ ] Backend listening on `:5000` with FAZAT enabled
- [ ] Signed GET `/api/integrations/fazat/freelancers` works
