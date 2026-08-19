# OrderzHouse Bildazo Author Gate — Phase 0B–1B

**Status:** Phase 0B–0F local request + Super Admin manual link. Phase 1B optional backend-only S2S client (off by default).  
**Related:** freelancer Mini Article flow (`/dashboard/freelancer/articles`), `docs/MOBILE_SUPER_ADMIN_SCOPE.md` (mobile SA article queues remain separate).

## 1. Why the gate exists

Accepted Mini Article work will later be queued for review/publish on **Bildazo** under the freelancer’s writer name. Before a freelancer can apply, OrderzHouse must have a **verified link** to that writer identity. Phase 0B collects consent and a link *request* only.

## 2. Bildazo Phase 0A findings (consumed, not re-audited)

- A Bildazo author is a **User**, not a separate Author table.
- Required create fields: `email`, `passwordHash`, `fullName`, `roleId`.
- Recommended role: **writer**, id **2**.
- Article create → `PENDING_REVIEW` (not instant publish).
- Public articles are **APPROVED** only.
- Safe live integration endpoints were **not** implemented in Bildazo yet.
- OrderzHouse must **not** call Bildazo yet.
- Later Bildazo login should use **password reset**, not SSO.
- Future publishing should **queue/review** in Bildazo, never auto-approve.

## 3. Current no-live-call limitation (through Phase 0F)

Through Phase 0F, OrderzHouse did **not**:

- HTTP-call Bildazo
- create Bildazo users
- collect or store a Bildazo password
- mark `status=linked` from a freelancer form submit
- implement SSO

Legacy stub helpers on `bildazoAuthorIntegrationClient` still throw `BILDAZO_INTEGRATION_NOT_IMPLEMENTED` if invoked. Phase 1B adds an **opt-in** S2S path (`linkOrCreateBildazoAuthor`) that stays off unless `BILDAZO_AUTHOR_SYNC_ENABLED=true`.

## 4. New OrderzHouse data model

Migration **file only** (not applied in this phase):

`backend/sql/migrations/164_freelancer_bildazo_author_links.sql`

Table: `freelancer_bildazo_author_links` (one row per freelancer).

`status = linked` is the **only** meaning of “Bildazo account exists/linked”. Pending rows are OrderzHouse requests.

**IP capture:** deferred. This codebase has no established safe IP-consent pattern.

## 5. New-account flow (verified OrderzHouse email)

`linkFlow = new_account`

- Email is taken from the **authenticated freelancer** (`users.email`), which was OTP-verified at OrderzHouse registration.
- Frontend shows that email **read-only**. Backend **ignores** any frontend `email` field.
- No password field.
- Stored status: `pending_new_account`.
- Copy: the request was **saved**; the account is **not** created yet.

## 6. Existing-account flow

`linkFlow = existing_account`

At least one of: `existingBildazoEmail`, `existingBildazoPublicId`, `existingBildazoProfileUrl`.

| Case | Resulting status |
|---|---|
| Email matches OrderzHouse verified email | `pending_existing_account`, `email_matches_orderz=true` |
| Email differs | `pending_external_verification` (not linked) |
| publicId / profile URL only | `pending_existing_account` |

Ownership of a different-email Bildazo account must be verified before any future link.

## 7. API endpoints

Freelancer only (`requireAuth` + `requireFreelancer`):

| Method | Path |
|---|---|
| GET | `/api/freelancer/bildazo-author-link/me` |
| POST | `/api/freelancer/bildazo-author-link/request` |

GET returns `status`, `linkFlow`, `orderzVerifiedEmail`, `canApplyToArticles`, `gateEnabled`, submitted values, linked profile fields if `linked`.

POST does not accept passwords. `orderz_verified_email` is always the server identity.

Clients and guests cannot access these routes.

## 8. Feature flag

`BILDAZO_AUTHOR_GATE_ENABLED` — default **false** (`backend/.env.example` placeholder only).

| Flag | Apply behavior | UI |
|---|---|---|
| `false` | Existing Mini Article apply **unchanged** | Gate card is informational; list/apply still work |
| `true` | Apply requires `status=linked` else **409** `BILDAZO_AUTHOR_LINK_REQUIRED` | Apply CTA hidden; Arabic message shown |

## 9. Freelancer UI

- Articles stay **separate** from available orders (`/dashboard/freelancer/articles`, sidebar **المقالات**).
- Gate card on the Articles list: two tabs (new writer / I already have an account).
- Linked: show “حساب الكاتب مرتبط” plus publicId/URL if present, then opportunities as before.

## 10. Article apply gate

Exact apply endpoint (unchanged except the guarded prerequisite):

`POST /api/freelancer/marketplace-articles/:id/applications`  
→ `marketplaceArticleApplicationsService.submitArticleApplication`

When the flag is on, `assertBildazoAuthorLinkedForArticleApply` runs **before** INSERT and **before** Bid reservation. Min-bids, fair ranking, and collection state machine are not otherwise changed.

Arabic 409:

`يرجى إنشاء أو ربط حساب الكاتب في Bildazo قبل التقديم على المقالات.`

## 11. Phase 0C — Super Admin Manual Link

This is the first OrderzHouse path that can set `status=linked`. It is **temporary** until Bildazo server-to-server create/link exists. Super Admin must verify ownership **outside** OrderzHouse (Bildazo admin, email, profile URL). OrderzHouse still does not call Bildazo.

### Endpoints (Super Admin only)

| Method | Path |
|---|---|
| GET | `/api/super-admin/bildazo-author-links` |
| PATCH | `/api/super-admin/bildazo-author-links/:id/manual-link` |
| PATCH | `/api/super-admin/bildazo-author-links/:id/status` |

Query filters on GET: `status`, `linkFlow`, `search`/`q`, `page`, `limit`.

If migration 164 is not applied: GET/PATCH return **503** `BILDAZO_AUTHOR_GATE_SCHEMA_MISSING` and `schemaReady: false` (no crash).

### Page

`/dashboard/super-admin/bildazo-author-links` — sidebar **ربط حسابات Bildazo** (under work/articles). Super Admin only; freelancer/client nav must not show it.

### Manual verification process

Super Admin should confirm, outside OrderzHouse:

1. The freelancer identity (OrderzHouse verified email / name) matches the Bildazo writer they intend to attach.
2. For `existing_account` with a **different** email: ownership of that Bildazo user (not just a typed publicId).
3. For `new_account`: that a writer account may later be created on Bildazo with the OrderzHouse verified email (not created by this button).

Then enter Bildazo User ID (optional), Public ID and/or `https://bildazo.com/…` profile URL, check:

«أؤكد أنني تحققت من ملكية حساب Bildazo قبل الربط.»

Stored on the row: `status=linked`, `linked_at`, `linked_by_user_id`, `bildazo_user_id`, `bildazo_public_id`, `bildazo_profile_url`, optional `manual_review_reason`.

Blocked rows cannot be linked until status is changed via the status endpoint (`needs_manual_review` / `failed` / `blocked`). The status endpoint **cannot** set `linked`.

Duplicate linked `bildazoUserId` / `publicId` / `profileUrl` on another freelancer is rejected (`BILDAZO_AUTHOR_IDENTIFIER_IN_USE`).

### Why `BILDAZO_AUTHOR_GATE_ENABLED` stays false

Keep the gate **off** until:

1. Migration **164** is applied on the target database.
2. Super Admins can actually complete a manual link (this page).
3. Product is ready to block Mini Article apply for unlinked freelancers.

Turning the flag on before 164 is applied would 409 every apply.

### Rollout checklist

1. Apply `164_freelancer_bildazo_author_links.sql` via the guarded migrate path (staging first). **Not from this phase.**
2. Train Super Admin on the verification checklist above.
3. Keep `BILDAZO_AUTHOR_GATE_ENABLED=false` until a real `linked` row exists and apply-blocking is desired.
4. Do not treat this UI as Bildazo account creation.
5. Replace manual link with S2S when Bildazo live endpoints exist.

## 12. Future Bildazo server-to-server integration

Planned (not in 0B):

1. Apply migration 164 on an isolated/staging DB, then production with the normal migrate gate.
2. Implement live Bildazo endpoints (create writer as role id 2; never auto-approve articles).
3. For new-account: create user with OrderzHouse verified email; trigger Bildazo password reset (no SSO, no OH-stored password).
4. For existing-account: verify ownership, then set `linked`.
5. Enable `BILDAZO_AUTHOR_GATE_ENABLED` only after 164 is applied **and** Super Admin (or future S2S) can set `linked`.
6. Queue accepted Mini Articles as Bildazo `PENDING_REVIEW`.

## 13. Test plan

- Backend: `node --test test/bildazoAuthorLinkPhase0b.test.js test/bildazoAuthorLinkPhase0c.test.js test/bildazoAuthorLinkPhase0fReadiness.test.js test/attachAuthContextUserIdHydration.test.js`
- Frontend: `npm test` includes `src/phase0c_bildazo_author_admin.test.js`
- Frontend: `npm test` includes `src/phase0b_bildazo_author_gate.test.js`
- Isolated 0D gate: `node scripts/runBildazoAuthorLinkPhase0dGate.js`
- Staging clone browser QA: `node scripts/runBildazoAuthorLinkPhase0eStagingBrowserQa.js`
- Frontend build: `npm run build`

## 14. Phase 0D staging QA

**Date:** 2026-08-18  
**Command:** `node scripts/runBildazoAuthorLinkPhase0dGate.js` (from `backend/`)

### Migration target

| Target | Classification | Result |
|---|---|---|
| Workstation `backend/.env` `DATABASE_URL` | **PRODUCTION** (`ep-wandering-cherry…/neondb`) | **Not touched.** `npm run db:migrate` refused. |
| Isolated embedded Postgres | **LOCAL** `127.0.0.1:55464/orderz_house_bildazo_0d` | **164 applied here only.** |

Production still has 164 **pending** (along with 163). Do not apply 164 there from a local session.

### 164 application result (isolated local)

| Check | Before | After |
|---|---|---|
| Applied migration count | 0 | 1 |
| `164_freelancer_bildazo_author_links` registered | false | true |
| `freelancer_bildazo_author_links` exists | false | true |

SQL review: additive `CREATE TABLE IF NOT EXISTS` + index + comment. No `DROP TABLE`, `DELETE FROM`, `TRUNCATE TABLE`, or destructive `ALTER` in executable SQL. A raw-file danger scan flags `TRUNCATE` only because the header **comment** says “No DROP/DELETE/TRUNCATE”.

### Freelancer request flow (isolated DB)

- `new_account` → `pending_new_account`; OrderzHouse email taken from the authenticated user (frontend spoof email ignored); password rejected.
- `existing_account` same email → `pending_existing_account`, `email_matches_orderz=true`.
- `existing_account` different email → `pending_external_verification` (**not** `linked`).
- publicId + profile URL → `pending_existing_account`.
- Client role cannot use freelancer link service (403).

UI contracts (source tests): Articles page shows the gate; OrderzHouse email is read-only; no password field; no “تم إنشاء الحساب” copy.

### Super Admin manual link (isolated DB)

- Pending rows listed.
- Manual link without `confirmVerified` rejected.
- With confirmation + `https://bildazo.com/…` publicId/URL → `status=linked`, `linked_at` set, `linked_by_user_id` set, identifiers stored.

### Linked-state

Freelancer GET `/me` after manual link: `status=linked`, `messageKey=linked`, publicId/profile URL present. UI shows **حساب الكاتب مرتبط** when `status=linked`.

### Gate off / on (isolated DB only)

| Flag | Unlinked apply prerequisite | Linked apply prerequisite |
|---|---|---|
| **OFF** (default) | No-op — apply not blocked | N/A |
| **ON** (isolated only) | 409 `BILDAZO_AUTHOR_LINK_REQUIRED` **before** Bid reserve | Passes |

`assertBildazoAuthorLinkedForArticleApply` still sits before `reserveBidCreditsFefo`. Flag was **not** set in workstation/production `.env`.

### Tests / build (Phase 0D session)

- Isolated gate: **PASS**
- Backend 0B+0C: **38/38 pass**
- Frontend 0B+0C: **17/17 pass**
- Frontend `npm run build`: **pass**

### Recommendation for production rollout

1. **Do not** run `npm run db:migrate` from this workstation while `DATABASE_URL` is production Neon.
2. Production may later apply **164** only via `npm run db:migrate:production` / `:next` with the multi-flag approvals, after backup confirmation. 163 is also still pending — do not skip ahead.
3. Keep **`BILDAZO_AUTHOR_GATE_ENABLED=false`** in production until 164 is applied **and** Super Admins have completed at least one real manual link.
4. Isolated 0D QA is not a substitute for a staging clone with real freelancer/admin sessions in the browser.

## 15. Phase 0E — True staging clone browser QA

**Date:** 2026-08-18  
**Command:** `node scripts/runBildazoAuthorLinkPhase0eStagingBrowserQa.js` (from `backend/`)  
**Result:** **PASS** (report: `backend/.tmp/bildazo_author_link_0e_report.json`)

### Staging target

There is **no remote Neon staging branch** on this workstation. Phase 0E used a **local schema clone**, not production:

| Target | Classification | Result |
|---|---|---|
| Workstation `backend/.env` `DATABASE_URL` | **PRODUCTION** `ep-wandering-cherry-ah474lak-pooler.c-3.us-east-1.aws.neon.tech/neondb` | **Not migrated. Not written.** `APP_ENV` unset, `NODE_ENV=development`, Stripe live key present. |
| Local clone | **LOCAL** `127.0.0.1:55470/orderz_house_bildazo_0e` | Full `init.sql` + **163 then 164** via the guarded `applyOneMigration` runner. Browser QA pointed at this clone only (`localhost:5173` + clone API). |

`BILDAZO_AUTHOR_GATE_ENABLED` was **not** set in production `.env`.

### Migration ordering

Pending on the empty clone before apply: 173 files, including `163_freelancer_onboarding` then `164_freelancer_bildazo_author_links`. One `158_` file, one `163_` file (no duplicate 158/163 conflict). 164 SQL remains additive (no `DROP`/`DELETE`/`TRUNCATE` in executable SQL).

| Checkpoint | Applied | Pending | 163 | 164 | `freelancer_bildazo_author_links` |
|---|---|---|---|---|---|
| Before all | 0 | 173 | no | no | no |
| After 163 | 172 | 1 (`164`) | yes | no | no |
| After 164 | 173 | 0 | yes | yes | yes |

Empty-DB replay repaired `057_pin_orderzhouse_plans_ids_1_2_3` name uniqueness, then retried. **No production writes.**

### Freelancer browser flow

Chromium against `http://localhost:5173` (Vite `VITE_API_BASE_URL=/api`, clone backend only):

- Gate appears on `/dashboard/freelancer/articles`.
- OrderzHouse email prefilled and read-only; **no password field**.
- Terms checkbox required; new_account submit → **`pending_new_account`**.
- Copy: **تم حفظ طلب…** — not “account created” / “linked”.
- Same email existing_account → **`pending_existing_account`**, `email_matches_orderz=true`.
- Different email → **`pending_external_verification`**, not linked.
- publicId + `https://bildazo.com/…` URL → **`pending_existing_account`**.
- No freelancer submit became `linked`.

### Super Admin browser flow

- `/dashboard/super-admin/bildazo-author-links` lists requests; search/filters usable.
- Manual link dialog: confirm checkbox required; publicId or bildazo.com profile URL required; **no password/role/token fields**.
- Submit with test publicId `writer-0e-1` → row **`linked`**, `linked_at` and `linked_by_user_id` stored.
- UI says the request was saved / **لا يتم إنشاء حساب Bildazo** — not that a Bildazo account was created.

### Linked-state

Freelancer Articles page after SA link: **حساب الكاتب مرتبط**, publicId `writer-0e-1` and profile URL visible. Article empty-list still renders. With gate off, unlinked hint **التقديم على المقالات ما زال متاحًا**.

### Gate off / on (clone only)

| Mode | Unlinked | Linked | Bid ledger |
|---|---|---|---|
| **OFF** (clone API default) | Prerequisite no-op; Articles apply CTA unchanged | N/A | unchanged |
| **ON** in-process | 409 `BILDAZO_AUTHOR_LINK_REQUIRED` | passes | 0 → 0 |
| **ON** HTTP (clone port 5001 only) | 409 `BILDAZO_AUTHOR_LINK_REQUIRED` **before** Bid reserve | passes gate, then `ARTICLE_BID_ECONOMY_DISABLED` (no article/bid seed) | 0 |

Gate-on HTTP used a **second clone backend on port 5001**; the main clone API on 5000 stayed `BILDAZO_AUTHOR_GATE_ENABLED=false`. Production `.env` was not changed.

Clone-only: `marketplace_economy_settings.article_applications_enabled=true` so HTTP apply could reach the Bildazo prerequisite (engine-off would 409 first). Not written to production.

### Tests / build (Phase 0E session)

- Phase 0E browser QA: **PASS**
- Isolated 0D gate: **PASS** (re-run)
- Backend 0B+0C: **38/38 pass**
- Frontend 0B+0C: **17/17 pass**
- Frontend `npm run build`: **pass**
- Flutter: not run (no Flutter file changes)

### Recommendation for production rollout

1. **Do not** migrate from this workstation while `DATABASE_URL` is production Neon.
2. Production still has **163 then 164** pending — apply **163 first**, then 164, only via `db:migrate:production` / `:next` with approvals.
3. Keep **`BILDAZO_AUTHOR_GATE_ENABLED=false`** in production until 164 is on that DB and at least one real Super Admin manual link exists.
4. Local schema clone 0E is **not** a Neon dump of production data. A true hosted staging clone remains recommended before enabling the gate.

## 16. Rollout steps

See **§17 Phase 0F** for the production-safe checklist. Summary:

1. Review provisional terms copy with counsel (`ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION = 2026-08-18-v1`).
2. Neon snapshot/backup first. Apply **163 then 164** on production only via `npm run db:migrate:production:next` with approvals — never skip 163, never from this workstation without the production migrate flags.
3. Keep `BILDAZO_AUTHOR_GATE_ENABLED=false` (or unset) until 164 is on the target DB and a real `linked` row exists.
4. Super Admin manual link (Phase 0C) is the current path to `linked`. Phase 0E browser QA passed on a local schema clone; isolated Phase 0D also passed.

## 17. Phase 0F — Production migration readiness

**Date:** 2026-08-18  
**Result:** **READY** for a later approved production apply of **163 then 164**. This phase did **not** apply migrations, deploy, or commit.

Workstation `backend/.env` `DATABASE_URL` remains **PRODUCTION** Neon. `BILDAZO_AUTHOR_GATE_ENABLED` is **unset** there (defaults false). Do not enable the gate in production.

### 163 / 164 order

| File | Version | Kind | Production danger scan (raw file) |
|---|---|---|---|
| `163_freelancer_onboarding.sql` | `163_freelancer_onboarding` | Additive `CREATE TABLE IF NOT EXISTS` + seed `INSERT … ON CONFLICT (key) DO NOTHING` | clean |
| `164_freelancer_bildazo_author_links.sql` | `164_freelancer_bildazo_author_links` | Additive `CREATE TABLE IF NOT EXISTS` | clean after comment fix (see below) |

- Filename order: **163 immediately before 164**. One `158_` file, one `163_` file (no 158/163 collision).
- Runner pin: `EXPECTED_MIGRATION_VERSION=164_…` while 163 is first pending → **refused** (`nextPending: 163_freelancer_onboarding`). Cannot skip.
- Neither file contains executable destructive SQL. FK clauses `ON DELETE CASCADE` / `ON DELETE SET NULL` do not match the runner’s `DELETE FROM` heuristic.
- No previously applied migration file was rewritten. 164’s **header comments** were edited so the production scanner no longer false-positives on the words `DROP TABLE` / `DELETE FROM` / `TRUNCATE` in comments. Executable SQL is unchanged.
- **Critical:** `db:migrate:production` and `:next` fail-closed if **any** pending file matches the raw-file scanner. A 164 comment false-positive would also **block 163**. Do not set `ALLOW_DANGEROUS_PRODUCTION_SQL=1` to bypass that.

163 risk: additive only. Seed insert is idempotent (`ON CONFLICT DO NOTHING`). FK `ON DELETE CASCADE/SET NULL` are constraint clauses, not `DELETE FROM`.  
164 risk: additive only. Table is unused until Super Admin / freelancer link APIs run. Gate remains off.

### Auth hydration regression

Phase 0E set `req.user.id = Number(legacyUser.id)` in `attachAuthContext` because JWT `signToken` only has `sub` (plus `accountId`/`role`/`email`). Article apply and other marketplace controllers read `req.user.id`.

| Check | Result |
|---|---|
| Web cookie auth | Cookie still preferred over `Authorization` (`getTokenFromRequest`) |
| Mobile Bearer auth | Fallback Bearer unchanged; mobile session tests skip on production `DATABASE_URL` (placeholder override) |
| `/api/auth/me` | Still loads user by `req.user.sub` |
| Client / freelancer / super-admin roles | Taken from **DB** `users.role` / RBAC after lookup of `sub`; JWT `role`/`id` claims cannot escalate |
| Unauthenticated | Missing token → 401; missing `sub` → `attachAuthContext` no-ops (public/optional routes unchanged) |
| Spoof `req.body.id` / `x-user-id` / JWT `id` | Ignored; identity is `jwt.verify` → `sub` → `getUserRowByIdForAuthz` |
| Unknown `sub` | 401 `INVALID_TOKEN` |

### Feature flag

- `isBildazoAuthorGateEnabled()` is true only for `1` / `true` / `yes` / `on`.
- **Production `.env` must remain unset or `false`.**
- Flag off: `assertBildazoAuthorLinkedForArticleApply` is a no-op; article apply is unchanged.
- Flag on (tests/clone only): unlinked → 409 `BILDAZO_AUTHOR_LINK_REQUIRED` **before** `reserveBidCreditsFefo`; linked passes. No Bildazo HTTP. No password field.

### Production-safe command (do not run in this phase)

Prefer **one file at a time** (`:next`), not full `db:migrate:production`.

From `backend/`, after Neon backup:

```bash
# 1) inspect only (SELECT)
npm run db:migrate:status

# 2) dry-run pin for 163
APP_ENV=production ALLOW_PRODUCTION_DB_MIGRATIONS=1 CONFIRM_PRODUCTION_DATABASE=orderzhouse-production PRODUCTION_BACKUP_CONFIRMED=1 EXPECTED_MIGRATION_VERSION=163_freelancer_onboarding npm run db:migrate:production:next -- --dry-run

# 3) apply 163
APP_ENV=production ALLOW_PRODUCTION_DB_MIGRATIONS=1 CONFIRM_PRODUCTION_DATABASE=orderzhouse-production PRODUCTION_BACKUP_CONFIRMED=1 EXPECTED_MIGRATION_VERSION=163_freelancer_onboarding npm run db:migrate:production:next

# 4) verify 163 in schema_migrations, then dry-run + apply 164
APP_ENV=production ALLOW_PRODUCTION_DB_MIGRATIONS=1 CONFIRM_PRODUCTION_DATABASE=orderzhouse-production PRODUCTION_BACKUP_CONFIRMED=1 EXPECTED_MIGRATION_VERSION=164_freelancer_bildazo_author_links npm run db:migrate:production:next -- --dry-run

APP_ENV=production ALLOW_PRODUCTION_DB_MIGRATIONS=1 CONFIRM_PRODUCTION_DATABASE=orderzhouse-production PRODUCTION_BACKUP_CONFIRMED=1 EXPECTED_MIGRATION_VERSION=164_freelancer_bildazo_author_links npm run db:migrate:production:next
```

On Windows PowerShell, set the same env vars before `npm run db:migrate:production:next`.

### Rollback / backup

- **Required before apply:** Neon project snapshot (or equivalent backup) of production. Record snapshot id/time.
- 163/164 are additive `CREATE TABLE`. **Do not ship a DROP-table rollback.** If apply fails mid-file, the runner uses a transaction (`BEGIN`/`COMMIT` in each file). Restore from snapshot only if the DB is left inconsistent.
- After success: keep the snapshot until smoke tests pass.

### Production rollout checklist (execute later, not this phase)

1. Neon backup/snapshot; set `PRODUCTION_BACKUP_CONFIRMED=1` only after that is real.
2. `npm run db:migrate:status` — first pending must be `163_freelancer_onboarding.sql`, second `164_freelancer_bildazo_author_links.sql`. Stop if not.
3. Dry-run then apply **163**.
4. Verify `163_freelancer_onboarding` in `schema_migrations`; tables `onboarding_items` / `user_onboarding_events` / `user_onboarding_progress` exist.
5. Dry-run then apply **164**.
6. Verify `164_freelancer_bildazo_author_links` in `schema_migrations` and table `freelancer_bildazo_author_links` exists.
7. Keep **`BILDAZO_AUTHOR_GATE_ENABLED` unset/false**.
8. Restart backend only if the running process would not otherwise pick up schema (migration itself does not require a code deploy if 163/164 SQL is already in the shipped build).
9. Smoke (gate still off):
   - freelancer `GET /api/freelancer/bildazo-author-link/me`
   - super-admin `GET /api/super-admin/bildazo-author-links`
   - freelancer Articles page
   - article apply still works with gate false
10. Manual link with a **safe test account only if approved**.

### Risks and stop conditions

Stop and do **not** apply if:

- First pending is not `163_freelancer_onboarding`
- Pin for 164 is attempted while 163 is still pending
- Raw danger scan flags 163 or 164
- Someone proposes `ALLOW_DANGEROUS_PRODUCTION_SQL=1` to skip review
- `BILDAZO_AUTHOR_GATE_ENABLED` is true in production `.env`
- Workstation session lacks backup confirmation
- Auth/role smoke fails after a future apply (401/403 regressions, role escalation)

This phase: **no production migration, no production writes, no deploy, no git commit.** No Bildazo API, user create, or password collection.

### Tests / build (Phase 0F session)

- Read-only `npm run db:migrate:status`: production pending **163 then 164**, no dangerous flags (after 164 comment cleanup)
- Backend 0B+0C+0F readiness + hydration: **51/51 pass**
- Auth/role/origin/mobile unit tests: **pass** (mobile Postgres integration **skipped** — production `DATABASE_URL` forced to placeholder so tests cannot INSERT/DELETE users)
- Isolated 0D gate: **PASS** (local embedded Postgres only)
- Frontend 0B+0C: **17/17 pass**
- Frontend `npm run build`: **pass**
- Flutter: not run (no Flutter file changes)

## 18. Phase 1B — Live Bildazo S2S author link/create client

OrderzHouse can optionally call Bildazo:

`POST {BILDAZO_API_BASE_URL}/api/integrations/orderzhouse/authors/link-or-create`

This is **backend-only**. The browser never receives the integration secret and never calls Bildazo.

### Env variables (backend `.env.example` placeholders only)

| Variable | Default | Meaning |
|---|---|---|
| `BILDAZO_AUTHOR_SYNC_ENABLED` | `false` | Whether OrderzHouse calls Bildazo |
| `BILDAZO_API_BASE_URL` | empty | Bildazo origin, e.g. `http://localhost:4000` |
| `BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET` | empty | Shared S2S secret (header `X-OrderzHouse-Integration-Secret`) |
| `BILDAZO_AUTHOR_SYNC_TIMEOUT_MS` | `8000` | HTTP timeout |
| `BILDAZO_AUTHOR_GATE_ENABLED` | `false` | Whether unlinked freelancers are blocked from article apply |

These flags are **separate**. Enabling sync does not enable the apply gate. Enabling the gate does not call Bildazo.

Do **not** put the secret in frontend env. Do **not** enable either flag in production until S2S and Super Admin manual link are verified **after** migrations **163 then 164**.

### Disabled behavior (`BILDAZO_AUTHOR_SYNC_ENABLED=false`)

- Freelancer `POST /api/freelancer/bildazo-author-link/request` still creates/updates the local row.
- `new_account` stays `pending_new_account`.
- Same-email `existing_account` stays `pending_existing_account`.
- Different-email stays `pending_external_verification`.
- publicId / profile URL only stays `pending_existing_account`.
- **No HTTP** to Bildazo.
- Super Admin manual link (Phase 0C) is unchanged.

### Enabled behavior

Local row is written first. Then, if allowed, OrderzHouse POSTs:

- `orderzFreelancerId`, `email` (authenticated OrderzHouse verified email only), `fullName`
- optional `phoneE164`, `countryIso`, `bio`, `acceptedTermsVersion`, `acceptedAt`

Never sent: password, passwordHash, role fields. Frontend email is ignored.

### Response mapping

| Bildazo `status` | Local `freelancer_bildazo_author_links.status` |
|---|---|
| `created` | `linked` (store `bildazoUserId`, `bildazoPublicId`, `bildazoProfileUrl` which may be null, `linked_at`; `linked_by_user_id` NULL) |
| `linked` | `linked` (same fields) |
| `already_linked` | `linked` (same fields) |
| `needs_manual_review` | `needs_manual_review` (not linked; Super Admin can review) |
| unknown / non-2xx / timeout / network / missing config | `failed` (not linked; safe `last_error`; retry by resubmitting) |

`status=linked` still requires at least one of `bildazo_user_id`, `bildazo_public_id`, `bildazo_profile_url` (migration 164 CHECK). A success status without identity stays `failed`.

### Existing-account rules

| Case | S2S? | Local status |
|---|---|---|
| `existingBildazoEmail` equals OrderzHouse verified email | yes, if sync enabled | linked / needs_manual_review / failed per Bildazo |
| different email | **no** | `pending_external_verification` |
| publicId / profile URL only | **no** | `pending_existing_account` |

Do not auto-link a different-email Bildazo account without ownership verification (Super Admin manual link).

### Failure / retry / idempotency

- Already-`linked` local row returns linked and does **not** call Bildazo again.
- One row per freelancer (`freelancer_user_id` UNIQUE); resubmit updates the same row.
- Bildazo treats the same `orderzFreelancerId` as idempotent (`already_linked` → local `linked`).
- `failed` and pending statuses are in `BILDAZO_PENDING_UPDATE_STATUSES` and can be retried.
- Raw vendor errors and the integration secret are never shown to the frontend.
- No password and no integration secret are stored in the database.

### Local / staging QA (not production)

Only against a **local** Bildazo with its OrderzHouse integration enabled:

1. Bildazo local: `ORDERZHOUSE_INTEGRATION_ENABLED=true` and `ORDERZHOUSE_INTEGRATION_SECRET=<test secret>` (Bildazo migration applied **locally only**).
2. OrderzHouse local: `BILDAZO_AUTHOR_SYNC_ENABLED=true`, `BILDAZO_API_BASE_URL=http://localhost:<bildazo-port>`, `BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET=<same test secret>`.
3. Submit `new_account` from the freelancer Articles gate.
4. Confirm Bildazo creates or links a writer User, OrderzHouse row becomes `linked`, response has **no password**, and later Bildazo login uses **password reset**.

Do **not** run this against production Bildazo. Do **not** apply production migrations as part of this phase.

### Production warning

Keep **`BILDAZO_AUTHOR_GATE_ENABLED=false`** until S2S and Super Admin manual link are verified after migrations **163 then 164**. Keep **`BILDAZO_AUTHOR_SYNC_ENABLED=false`** in production until a dedicated, approved local/staging S2S check has passed. This phase does not deploy, migrate production, or commit.

Remaining after 1B: accepted Mini Article queue/publish integration (not auto-publish).

## 19. Phase 1C — Live local S2S author-link QA

Isolated live QA (script `backend/scripts/runBildazoAuthorLinkPhase1cLiveS2sQa.js`). Workstation production Neon URLs were classified and **not** used.

### Local endpoints used

| Process | URL |
|---|---|
| Isolated Postgres | `127.0.0.1:55471` databases `orderz_house_bildazo_1c` + `bildazo_1c` |
| Bildazo backend | `http://127.0.0.1:4001` |
| OrderzHouse backend | `http://127.0.0.1:5010` |
| OrderzHouse frontend | `http://localhost:5174` |

### Env flags used (process env only, not production `.env`)

| Flag | Value |
|---|---|
| `ORDERZHOUSE_INTEGRATION_ENABLED` | `true` (Bildazo local) |
| `ORDERZHOUSE_INTEGRATION_SECRET` | local test secret (not production) |
| `BILDAZO_AUTHOR_SYNC_ENABLED` | `true` |
| `BILDAZO_API_BASE_URL` | `http://127.0.0.1:4001` |
| `BILDAZO_AUTHOR_GATE_ENABLED` | `false` during S2S/UI; temporarily `true` on port 5011 for gate HTTP |

### Results

- **new_account:** OrderzHouse row `linked`; Bildazo writer User created (`role=writer`); `bildazoUserId` + `bildazoPublicId` stored; `profileUrl` null; no password in response.
- **idempotency:** second submit `alreadyLinked`; one OrderzHouse row; no extra Bildazo user.
- **existing_account same email:** S2S linked to the pre-seeded writer; no duplicate User.
- **existing_account different email:** `pending_external_verification`; no S2S link row added on Bildazo.
- **publicId only:** `pending_existing_account` (no S2S in this phase).
- **Failure modes:** missing/wrong secret → Bildazo `401 ORDERZHOUSE_SECRET_INVALID`. Bildazo down → OrderzHouse `failed` with safe `last_error` (`Bildazo request failed`), not linked. Secret not present in server logs.
- **Article gate:** gate off = unlinked apply prerequisite is a no-op. Gate on (local only): unlinked HTTP apply `409 BILDAZO_AUTHOR_LINK_REQUIRED` before Bid reserve (ledger unchanged). Linked freelancer is not blocked by the Bildazo prerequisite (may still fail later for unrelated article-economy reasons). Flag restored to `false`.
- **Frontend:** linked card shows «حساب الكاتب مرتبط» + publicId; null profileUrl renders no anchor; no password field; no «تم إنشاء الحساب»; Super Admin links page loads with filters.

### Production warning

Keep **`BILDAZO_AUTHOR_GATE_ENABLED=false`** and **`BILDAZO_AUTHOR_SYNC_ENABLED=false`** in production until migrations **163 then 164** (OrderzHouse) and Bildazo `20260818120000_orderzhouse_author_links` are applied and verified on the intended non-local environment. This QA did **not** migrate production, call production Bildazo, deploy, or commit.

Remaining after 1C: accepted Mini Article queue/publish integration (Phase 2B).

## 20. Phase 2B — Publish accepted OrderzHouse articles to Bildazo

**Status:** implemented in OrderzHouse, **disabled by default**. Migration **165 is file-only** and was **not applied to production**.

After Super Admin **final approval** (`POST /api/super-admin/article-applications/:applicationId/finalize-approval` → `finalizeArticleApproval` settlement **COMMIT**), OrderzHouse may S2S-publish the accepted application to Bildazo.

This does **not** change Bid consume, min-bids, fair ranking, Pantry, Stripe, or `ordersService`. Bildazo publish failure never rolls back OrderzHouse acceptance.

### Env variables (backend only)

| Variable | Default | Purpose |
|---|---|---|
| `BILDAZO_ARTICLE_PUBLISH_ENABLED` | `false` | Master switch. No HTTP when false. |
| `BILDAZO_ARTICLE_PUBLISH_TIMEOUT_MS` | `10000` | Fetch timeout (1s–30s). |
| `BILDAZO_API_BASE_URL` | empty | Same as Phase 1B. |
| `BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET` | empty | Same as Phase 1B. Never in frontend. |
| `BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID` | empty | **Local/staging QA only.** Must be a Bildazo **leaf category UUID**. |
| `BILDAZO_ARTICLE_CATEGORY_MAP` | empty | Optional JSON: `{"subcategory:12":"<uuid>","category:3":"<uuid>"}`. Values must be UUIDs. |

Do **not** send an OrderzHouse integer category id as a Bildazo `categoryId`.

### Category mapping

Bildazo requires a leaf `categoryId` UUID. OrderzHouse `marketplace_articles.category_id` / `subcategory_id` are local integers.

Resolution order: map `subcategory:{id}` → map `category:{id}` → `BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID`. If none, **no HTTP** and local status `needs_manual_review` with `INVALID_BILDAZO_CATEGORY_MAPPING`.

Production must use a real Bildazo leaf UUID mapping; the default env value is for isolated QA only.

### Acceptance hook

1. Super Admin selects an applicant (`/select`) — assignment/snapshot only.
2. Super Admin **Approves article** (`/finalize-approval`) — Bid consume + settlement + existing E2 outbox row.
3. **After COMMIT**, `publishAfterArticleAcceptance` runs.
4. Content sent: campaign `title`; body = application `proposal_message` if present, else campaign `description`.
5. Bildazo `orderzArticleId` is the **application id** (one accepted work unit). A campaign (`marketplace_articles`) can accept more than one application (`target_article_count`), so uniqueness is `orderz_application_id`.

Linked author required locally (`freelancer_bildazo_author_links.status=linked` and UUID `bildazo_user_id`). Unlinked → no HTTP, `needs_manual_review` / `BILDAZO_AUTHOR_NOT_LINKED`.

### Response mapping

| Bildazo `status` | Local `bildazo_article_publish_records.status` |
|---|---|
| `approved` | `published` (store id/url/articleStatus) |
| `already_imported` | `already_imported` (idempotent) |
| `needs_manual_review` | `needs_manual_review` (acceptance still succeeds) |
| timeout / network / config / unknown | `failed` (acceptance still succeeds) |
| flag off | `skipped` (no HTTP) |

Successful `published` / `already_imported` rows are **never overwritten** by a later failed attempt.

### Failure behavior

- OrderzHouse approval always commits first.
- Retry does **not** re-run financial settlement (`BILDAZO_PUBLISH_FAILURE_REPEATS_FINANCIAL_SETTLEMENT = NO`).
- Super Admin retry: `POST /api/super-admin/article-applications/:applicationId/bildazo-publish/retry` and campaign `POST /api/super-admin/marketplace-articles/:id/bildazo-publish/retry` for retryable rows (`pending`, `failed`, `needs_manual_review`, `skipped`).

### User-facing states

Freelancer (no raw errors, no secrets):

- published / already_imported: «تم نشر مقالك على Bildazo» + `articleUrl` when present
- pending / skipped / failed: «تم قبول المقال داخل OrderzHouse، وجارٍ ربط النشر على Bildazo.»
- needs_manual_review: «يحتاج النشر على Bildazo إلى مراجعة من الإدارة.»

### Local QA instructions

Only against **local** Bildazo Phase 2A (not production):

1. Bildazo: `ORDERZHOUSE_INTEGRATION_ENABLED=true`, matching test secret, integration publish route live.
2. OrderzHouse: `BILDAZO_ARTICLE_PUBLISH_ENABLED=true`, `BILDAZO_API_BASE_URL=http://127.0.0.1:<bildazo-port>`, same secret, `BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID=<local leaf UUID>`.
3. Link a writer (Phase 1B/1C). Apply + Super Admin select + **Approve article**.
4. Confirm Bildazo Article `APPROVED`, public URL, OrderzHouse stored `articleUrl`, repeat is `already_imported`.

### Production warning

Keep **`BILDAZO_ARTICLE_PUBLISH_ENABLED=false`**. Do not apply migration **165** to production until 163 → 164 → 165 are reviewed. Do not point `BILDAZO_API_BASE_URL` at production Bildazo. This phase does not deploy, migrate production, or commit.

The E2 table `marketplace_article_bildazo_outbox` remains a settlement-side enqueue stub; Phase 2B tracking lives in `bildazo_article_publish_records`.

## 21. Phase 2B.1 — Final article manuscript source

**Status:** implemented, **disabled Bildazo publish still default**. Migration **166 is file-only** and was **not applied to production**.

### What existed before

Mini Articles had **no** final delivery/manuscript table. `proposal_message` is the **bid/application note**. `marketplace_articles.description` is the **campaign brief**. Super Admin `finalize-approval` settled the selected application without a written article body.

E2 application statuses include `submitted` / `revision_requested`, but they were unused for content.

### Final manuscript source

Table: `marketplace_article_submissions` (one row per `application_id`).

| Field | Role |
|---|---|
| `title` | Final article title (Bildazo publish title) |
| `content` | Final article body (Bildazo publish content) |
| `status` | `submitted` / `revision_requested` / `approved` / `rejected` |

**`proposal_message` is not publishable content.** It is a bid note. **Campaign `description` is not publishable content.** It is the listing brief.

### Freelancer

After Super Admin **select**, the freelancer submits title + content (`POST /api/freelancer/article-applications/:applicationId/final-manuscript`). Resubmit is allowed while `submitted` or `revision_requested`. Word count must meet the campaign `required_word_count` when set.

### Approval requirement

`finalize-approval` is blocked with `ARTICLE_FINAL_CONTENT_REQUIRED` **before** Bid consume / settlement if there is no `submitted` manuscript. Super Admin can request revision (`/request-revision`) instead of approving.

### Publish payload

After successful COMMIT:

- `orderzArticleId` = application id (unchanged idempotency key)
- `title` = manuscript title
- `content` = manuscript content
- `reviewerNotes` = manuscript reviewer notes if present

If manuscript is missing at publish time (should not happen after the block): local `needs_manual_review` / `MISSING_FINAL_ARTICLE_CONTENT`, **no HTTP**.

## 22. Phase 2C — Live local accepted-article publish QA

**Status:** PASS on isolated local databases. **Not applied to production. Not committed.**

Replay (from OrderzHouse `backend/`):

```text
node scripts/runBildazoAuthorLinkPhase2cLiveS2sQa.js
```

### Local ports (this run)

| Service | Address |
|---|---|
| Isolated Postgres | `127.0.0.1:55481` |
| OrderzHouse DB | `orderz_house_bildazo_2c` |
| Bildazo DB | `bildazo_2c` |
| Bildazo backend | `http://127.0.0.1:4011` |
| OrderzHouse backend | `http://127.0.0.1:5020` |
| OrderzHouse frontend | `http://localhost:5176` |
| Bildazo public article base (`FRONTEND_URL`) | `http://127.0.0.1:3000` |

Workstation `.env` files still point at hosted Neon. The runner **classifies them and does not migrate or write them**.

### Local env flags (process env of spawned servers only)

Bildazo:

- `ORDERZHOUSE_INTEGRATION_ENABLED=true`
- `ORDERZHOUSE_INTEGRATION_SECRET=local-orderzhouse-bildazo-test-secret`
- `ORDERZHOUSE_WEBHOOK_IP_ALLOWLIST=` (empty)
- `FRONTEND_URL=http://127.0.0.1:3000`
- `NODE_ENV=development`

OrderzHouse:

- `BILDAZO_AUTHOR_SYNC_ENABLED=true`
- `BILDAZO_ARTICLE_PUBLISH_ENABLED=true`
- `BILDAZO_API_BASE_URL=http://127.0.0.1:4011`
- `BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET=local-orderzhouse-bildazo-test-secret`
- `BILDAZO_AUTHOR_SYNC_TIMEOUT_MS=8000`
- `BILDAZO_ARTICLE_PUBLISH_TIMEOUT_MS=10000`
- `BILDAZO_AUTHOR_GATE_ENABLED=false`
- `BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID=<local leaf UUID>`

### Leaf category id strategy

After local `prisma migrate deploy` + `seed-article-categories.mjs`, pick a 3-level leaf (`root → section → leaf`, no children). Leaf ids are generated per isolated cluster (last PASS used `f50e71ef-eed6-421a-973e-82fffd3037d7`). Never send OrderzHouse integer category ids as Bildazo UUIDs.

### Results (this run)

- Manuscript: `marketplace_article_submissions.status=submitted`; title/content = final manuscript; `proposal_message` and campaign `description` stayed on their own columns.
- Super Admin `finalize-approval`: HTTP 200; Bid consume `1`; settlement row created; publish record `published` with Bildazo id/url/`APPROVED`.
- Bildazo `Article`: `APPROVED`, `publishedAt` set, `authorId` = linked writer, title/content = manuscript only. Public path `/m/articles/{id}`.
- Idempotency: one `bildazo_article_publish_records` row, one `orderzhouse_article_imports` row, one Bildazo article. Repeat finalize 409 (already settled); retry 200 without a second article.
- Failures: unlinked → `needs_manual_review` / `BILDAZO_AUTHOR_NOT_LINKED`, settlement kept, no extra article. Missing category mapping → `INVALID_BILDAZO_CATEGORY_MAPPING`, no HTTP/article. Wrong secret → publish `failed`, settlement kept. Bildazo down retry → still `failed`, settlement still one row. Missing/wrong S2S secret on Bildazo publish = 401. Valid secret reaches validation (400 missing freelancer id).
- Frontend: freelancer shows «تم نشر مقالك على Bildazo» + `/m/articles/` URL; Super Admin shows manuscript approved + Bildazo URL on the published campaign. No passwords/secrets in UI or backend logs.

### Production warning

Keep **`BILDAZO_ARTICLE_PUBLISH_ENABLED=false`**. Do not apply migrations **165/166** to production until reviewed. Do not point `BILDAZO_API_BASE_URL` at production Bildazo. Do not enable production `ORDERZHOUSE_INTEGRATION_*`. This phase does not deploy, migrate production, or commit.

## Terms / consent

Stored on the request row: `accepted_terms_version`, `accepted_at`, `accepted_terms_snapshot` (JSON: version, provisional copy, userId, linkFlow, OrderzHouse email, existing identifiers).

**Legal copy is provisional** and must be reviewed before treating it as binding.
