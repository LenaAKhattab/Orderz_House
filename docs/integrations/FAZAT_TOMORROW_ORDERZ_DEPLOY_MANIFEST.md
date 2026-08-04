# FAZAT Provider API — Tomorrow Orderz Deploy Manifest

**Status:** Local code ready · Live `orderzhouse.com` does **not** serve FAZAT yet · Deploy deferred to owner tomorrow  
**Audience:** Orderz owner / ops deploying to Ubuntu production  
**Related:** [FAZAT_WORKFORCE_PROVIDER_API.md](./FAZAT_WORKFORCE_PROVIDER_API.md) · [FAZAT_CONTROLLED_LIVE_PILOT.md](./FAZAT_CONTROLLED_LIVE_PILOT.md)

---

## 0. Pre-flight (read first)

| Item | Status |
|------|--------|
| Migration `125_fazat_workforce_provider.sql` | **Already applied on live Neon** — **do not re-run** |
| Partner `FAZAT` row + ranks 2404/3707 | Already set from controlled pilot |
| Pilot partner order | Prefer reuse **`68649`** |
| Stripe / payouts / wallet | **Do not touch** |
| Allowlist | Keep **`2404,3707` only** — do not widen |
| Seed | **Never** run `seed:fazat-staging` on live |
| Secrets | Do **not** commit `backend/.env` |

**Success gate after restart:**

`GET https://orderzhouse.com/api/integrations/fazat/freelancers` must **stop** returning:

```json
{"success":false,"message":"يجب إرسال رمز دخول صالح.","code":"UNAUTHORIZED"}
```

Valid HMAC → **200**. Invalid HMAC → partner auth error (English/`UNAUTHORIZED` / `TIMESTAMP_REJECTED`), **not** the Arabic JWT message.

---

## 1. Exact files required for deploy

### 1.1 Tracked modified (must ship)

| Path | Purpose |
|------|---------|
| `backend/src/app.js` | Early mount `/api/integrations/fazat` + raw body for HMAC |
| `backend/src/middleware/originGuardMiddleware.js` | Skip originGuard for partner B2B |
| `backend/src/middleware/apiRateLimiter.js` | Skip shared browser rate bucket for fazat |
| `backend/src/utils/orderViewerSanitize.js` | Hide FAZAT/FAZ3AT from freelancers |
| `backend/src/services/ordersService.js` | Partner-order privacy / enrichment hooks |
| `backend/src/controllers/ordersController.js` | Viewer sanitize wiring |
| `backend/package.json` | FAZAT npm scripts |
| `backend/.env.example` | Documented env vars (no secrets) |
| `backend/.gitignore` | Ignore local pilot/e2e env files |

### 1.2 Untracked runtime (must ship — API will not boot without these)

| Path |
|------|
| `backend/src/routes/fazatIntegrationRoutes.js` |
| `backend/src/middleware/fazatIntegrationAuth.js` |
| `backend/src/controllers/fazatIntegrationController.js` |
| `backend/src/config/fazatIntegration.js` |
| `backend/src/utils/fazatCrypto.js` |
| `backend/src/utils/fazatDbSafety.js` |
| `backend/src/services/fazatPartnerOrderService.js` |
| `backend/src/services/fazatPartnerMessageService.js` |
| `backend/src/services/fazatFreelancerProfileService.js` |
| `backend/src/services/fazatOrderEnrichmentService.js` |
| `backend/src/services/fazatWebhookOutboundService.js` |
| `backend/src/services/fazatAuditService.js` |

### 1.3 Migration (include in artifact; do **not** apply again)

| Path | Note |
|------|------|
| `backend/sql/migrations/125_fazat_workforce_provider.sql` | Already on live DB. Ship for source consistency only. **Do not** run `migrate:fazat-safe` or re-apply on production. |

### 1.4 Scripts (optional on server; recommended for post-deploy smoke from a safe machine)

| Path | Use tomorrow? |
|------|----------------|
| `backend/scripts/fazatPilotLiveSmoke.js` | Yes — controlled smoke (reuse pilot order) |
| `backend/scripts/qaFazatIntegration.js` | Optional offline QA |
| `backend/scripts/checkFazatDbSafety.js` | Optional safety check |
| `backend/scripts/migrateFazatSafe.js` | **No — do not run on live** |
| `backend/scripts/seedFazatStagingFreelancers.js` | **No — never on live** |
| `backend/scripts/enableFazatPartner.js` | No — already done |
| `backend/scripts/setFazatPilotRank.js` | No — already done |
| `backend/scripts/startFazatPilotServer.js` | No — local only |

### 1.5 Tests / docs / examples (recommended; not required for Node boot)

| Path |
|------|
| `backend/test/fazatIntegrationFoundation.test.js` |
| `backend/test/fazatDbSafety.test.js` |
| `backend/.env.fazat-e2e.example` |
| `docs/integrations/FAZAT_WORKFORCE_PROVIDER_API.md` |
| `docs/integrations/FAZAT_CONTROLLED_LIVE_PILOT.md` |
| `docs/integrations/FAZAT_LIVE_DB_ROLLOUT.md` |
| `docs/integrations/FAZAT_LOCAL_E2E_SETUP.md` |
| `docs/integrations/FAZAT_TOMORROW_ORDERZ_DEPLOY_MANIFEST.md` (this file) |

### 1.6 Never deploy / never commit

* `backend/.env`
* `backend/.env.fazat-pilot.local`
* `backend/.env.fazat-e2e` / `.env.fazat-e2e.local`
* Stripe keys, Neon passwords, FAZAT secrets in tickets/chat

---

## 2. Production env checklist (no secrets)

Paste into the **server** env that the live Node/Docker process actually loads (`backend/.env` on host, or compose `env_file`). Local laptop env is not enough.

### Required for first live API deploy

```env
FAZAT_INTEGRATION_ENABLED=true
FAZAT_INTEGRATION_API_KEY=<redacted — same key FAZ3AT will use>
FAZAT_INTEGRATION_SHARED_SECRET=<redacted — 32+ chars, same as FAZ3AT>
FAZAT_PILOT_FREELANCER_IDS=2404,3707
ORDERZ_PUBLIC_API_URL=https://orderzhouse.com
FAZAT_INTEGRATION_ACTOR_USER_ID=4
FAZAT_DEFAULT_CATEGORY_ID=1
FAZAT_REQUEST_MAX_SKEW_SEC=300
FAZAT_WEBHOOK_URL=
```

### When FAZ3AT live webhook URL is known

```env
FAZAT_WEBHOOK_URL=https://<FAZAT-LIVE-DOMAIN>/api/v1/integrations/orderz/webhooks
```

Then restart Orderz once more.

### Rules

* First deploy **before** FAZ3AT URL: leave `FAZAT_WEBHOOK_URL` **empty**. Inbound provider API still works; **outbound webhooks will not**.
* **Never** set `FAZAT_WEBHOOK_URL` to `localhost` / `127.0.0.1` on production.
* Do **not** clear `FAZAT_PILOT_FREELANCER_IDS` while enabled (empty allowlist blocks partner order create).
* Do **not** set `FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT`, `FAZAT_SEED_CONFIRM`, or `FAZAT_ALLOW_REMOTE_STAGING_DB` for this deploy.

---

## 3. Deploy steps (owner — tomorrow)

### Option A — Git-based (preferred if owner commits)

1. Include all files in §1.1–§1.3 (plus optional §1.4–§1.5).
2. Suggested commit message (owner runs commit — agents do not unless asked):

   ```text
   feat(backend): enable FAZAT partner provider API (HMAC, pilot allowlist)

   Mount /api/integrations/fazat before JWT routers for FAZ3AT B2B pilot.
   ```

3. Push / pull via normal pipeline onto Ubuntu host.
4. Ensure **server** env matches §2.
5. Rebuild/restart backend only (frontend not required for this API):

   ```bash
   # Docker Compose example (adjust path)
   cd /path/to/Orderz_House
   docker compose up --build -d backend
   docker compose logs -f --tail=100 backend
   ```

6. Confirm boot: no `Cannot find module './routes/fazatIntegrationRoutes'`.
7. `curl -sS https://orderzhouse.com/api/health` → 200.

### Option B — SSH / manual copy

1. Copy §1.1 + §1.2 (+ §1.3 for consistency) preserving paths under `backend/`.
2. Update **server** env (§2).
3. Restart Docker/PM2/systemd (same as above).
4. `package.json` scripts changed only — no new npm dependencies expected; if lockfile unchanged, `npm ci` not required unless image rebuild needs it. Docker rebuild copies tree via `COPY . .`.

---

## 4. Post-deploy smoke (tomorrow)

Headers for partner auth:

* `X-Orderz-Partner-Key`
* `X-Orderz-Timestamp` (unix seconds)
* `X-Orderz-Nonce`
* `X-Orderz-Signature` (HMAC-SHA256 hex over signing payload)
* Optional: `X-Idempotency-Key` on create

Base: `https://orderzhouse.com`

### A. Invalid HMAC (must not be Arabic JWT)

```bash
curl -sS -w "\nHTTP:%{http_code}\n" \
  -H "X-Orderz-Partner-Key: wrong" \
  -H "X-Orderz-Timestamp: 1" \
  -H "X-Orderz-Nonce: smoketestnonce1" \
  -H "X-Orderz-Signature: deadbeef" \
  "https://orderzhouse.com/api/integrations/fazat/freelancers"
```

Expect: **401** partner message (e.g. `Invalid partner key.`) — **not** `يجب إرسال رمز دخول صالح`.

### B. Valid signed GET freelancers → 200

Use agreed key/secret and correct HMAC. Expect allowlisted safe snapshots only (no payment/wallet/FAZAT labels for freelancer UI; partner list is sanitized snapshots).

### C. Allowlist / rank

| Action | Expect |
|--------|--------|
| `POST /api/integrations/fazat/orders` with freelancer **3707** | **403** (UNAPPROVED) |
| Same with **non-allowlisted** freelancer id | **403** |
| Same with **2404** | Allowed (prefer **reuse** existing assignment / order **68649**; at most **one** new pilot order if needed) |

### D. Messages

```text
POST /api/integrations/fazat/orders/68649/messages
GET  /api/integrations/fazat/orders/68649/messages
```

Both with valid HMAC. Prefer **68649**; do not create many orders.

### Optional scripted smoke

```bash
cd backend
# Point ORDERZ_PUBLIC_API_URL=https://orderzhouse.com and live key/secret via a non-committed env file
node scripts/fazatPilotLiveSmoke.js
```

---

## 5. Rollback notes

If live API misbehaves after deploy:

1. **Fast disable (no code rollback):** set `FAZAT_INTEGRATION_ENABLED=false` on server → restart. Partner routes should reject as disabled; other Orderz traffic unchanged.
2. **Code rollback:** redeploy previous backend image/commit (pre-FAZAT `app.js` and without fazat modules). Live DB tables from migration 125 are additive — leaving them is safe; do **not** drop tables.
3. Do **not** delete pilot order **68649** or freelancers as part of rollback.
4. Do **not** reverse Stripe/config as part of FAZAT rollback.

---

## 6. What must not be done tomorrow

* No `seed:fazat-staging`
* No `migrate:fazat-safe` / re-apply migration 125
* No bulk E2E / mass order creation
* No Stripe / payout / wallet / settlement changes
* No widening `FAZAT_PILOT_FREELANCER_IDS`
* No exposing FAZAT/FAZ3AT source to freelancers
* No `FAZAT_WEBHOOK_URL=http://localhost...` on production
* No deleting live data

---

## 7. FAZ3AT handoff values (after Orderz live smoke passes)

```text
ORDERZ_API_BASE_URL=https://orderzhouse.com
ORDERZ_PROVIDER_API_PREFIX=/api/integrations/fazat
ORDERZ_PARTNER_KEY=<redacted>
ORDERZ_INTEGRATION_SHARED_SECRET=<redacted>
ORDERZ_WEBHOOK_SHARED_SECRET=<redacted if same secret>
ORDERZ_MOCK_MODE=false
```

If `FAZAT_WEBHOOK_URL` still empty on Orderz: report **WAITING_FOR_FAZAT_LIVE_URL** for webhooks; provider API can still be ready.
