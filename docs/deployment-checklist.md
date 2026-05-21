# Orderz House — Deployment Checklist

Documentation-only guide for staging and production. No application logic changes.

**Related:** [Manual Staging E2E](./manual-staging-e2e.md) · `backend/.env.example` · `frontend/.env.example`

---

## A) Staging setup

### 1. Database

- [ ] Create a **dedicated Postgres** instance for staging (not production data).
- [ ] Set `DATABASE_URL` in backend secrets (SSL as required by host).
- [ ] **Do not** run `sql/init.sql` on staging — it drops `users` and `categories`.
- [ ] From `backend/` run migrations:

```bash
npm run db:migrate
npm run db:verify-schema
```

- [ ] Optional (staging only, if you need an admin user): `npm run db:create-admin` — never on production without a documented process.

### 2. Backend environment

Copy `backend/.env.example` → host env / `.env` and set:

| Variable | Staging notes |
|----------|----------------|
| `NODE_ENV` | `production` (recommended for cookie/security behaviour) |
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
| `FAKE_ORDERS_AUTOMATION_ENABLED` | `false` unless single instance + intentional |

### 3. Frontend environment

Copy `frontend/.env.example` → build-time env:

| Variable | Staging notes |
|----------|----------------|
| `VITE_API_BASE_URL` | `https://<API_HOST>/api` |
| `VITE_POSTHOG_KEY` | Staging project key (optional) |
| `VITE_POSTHOG_HOST` | `https://us.i.posthog.com` or `eu.i` |
| `VITE_POSTHOG_ENABLE_IN_DEV` | `false` for production builds |

### 4. Build & run

```bash
# Backend (from backend/)
npm install
npm run test:unit
npm start

# Frontend (from frontend/)
npm install
npm run lint
npm run build
npm test
# Deploy dist/ to static host; point SPA to staging API
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
