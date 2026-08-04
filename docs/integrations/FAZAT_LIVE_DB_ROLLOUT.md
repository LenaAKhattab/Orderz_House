# FAZAT Live DB Rollout — Schema Only

**Status:** planning / owner-gated  
**Does NOT mean cross-app E2E is ready.**  
**Preferred:** Neon branch or staging DB for any E2E / seed / test assignments.

---

## Owner decision context

If the owner prefers not to set up local DB and considers the live Orderz DB:

| Activity | On live DB? |
|----------|-------------|
| Additive migration 125 only | Allowed **only** with explicit owner approval |
| Seed freelancers / ranks | **Forbidden** |
| E2E / fake assignments / test orders | **Forbidden** |
| Enable `FAZAT_INTEGRATION_ENABLED` | **Forbidden** until separate pilot approval |
| Auto rank changes | **Forbidden** |

---

## Recommendation

**Preferred:** create a Neon **branch** from live (or dedicated staging) and run full E2E there.

**Acceptable fallback:** live **schema-only** rollout of migration 125, feature disabled, no seed, no traffic.

---

## Migration 125 review (additive)

File: `backend/sql/migrations/125_fazat_workforce_provider.sql`

| Check | Result |
|-------|--------|
| `CREATE TABLE IF NOT EXISTS` only for new tables | Yes |
| `CREATE INDEX IF NOT EXISTS` | Yes |
| No `DROP` / `TRUNCATE` / `DELETE` | Yes |
| No `UPDATE` on existing product tables | Yes |
| No `ALTER` on `orders` / `users` / fake tables | Yes |
| Single `INSERT` into **new** `integration_partners` (`enabled=FALSE`, `ON CONFLICT DO NOTHING`) | Yes — not a bulk rewrite |
| `INSERT` into `schema_migrations` | Yes — version tracking only |
| FKs from **new empty** tables → `users` / `orders` | Brief locks on parent tables; expected short |

**Not a full production load test** — still run during a low-traffic window after backup.

---

## Live rollout checklist

### Before

- [ ] Backup / snapshot Neon (or host backup) confirmed
- [ ] Confirm `DATABASE_URL` host is the intended live Orderz DB (redact secrets when sharing)
- [ ] Owner written approval for **schema-only**
- [ ] Confirm `FAZAT_INTEGRATION_ENABLED` is unset/false on all production workers
- [ ] Confirm nobody will run `seed:fazat-staging` or E2E against live
- [ ] Prefer low-traffic window

### During

- [ ] Run safety check (see commands below)
- [ ] Run **only** migration 125 via `migrate:fazat-safe` with live schema flags
- [ ] Do **not** run full `db:migrate` unless the team already uses it for all pending migrations and understands scope
- [ ] Do **not** seed
- [ ] Do **not** create partner orders

### After

- [ ] Verify FAZAT tables exist (list below)
- [ ] Verify `integration_partners` row `FAZAT` has `enabled=false` (row flag; real gate is env)
- [ ] Smoke existing app: login, freelancer dashboard, order pool, admin, training automation health
- [ ] Confirm no rows in `partner_orders` / no unexpected `partner_freelancer_profiles`
- [ ] **Unset** `FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT` and `FAZAT_LIVE_SCHEMA_CONFIRM`
- [ ] Keep `FAZAT_INTEGRATION_ENABLED=false`

### Rollback strategy

Migration is additive. Rollback options:

1. **Preferred:** leave tables in place (idle; no traffic if env disabled). Lowest risk.
2. **Hard rollback (only if required):** drop FAZAT tables in reverse FK order in a maintenance window — **not** automated; requires separate owner approval. Do not drop `users` / `orders`.

```sql
-- MANUAL / OWNER-APPROVED ONLY — reverse of 125 (destructive to FAZAT tables only)
-- BEGIN;
-- DROP TABLE IF EXISTS partner_integration_audit_logs;
-- DROP TABLE IF EXISTS partner_webhook_events;
-- DROP TABLE IF EXISTS partner_request_nonces;
-- DROP TABLE IF EXISTS partner_order_messages;
-- DROP TABLE IF EXISTS partner_orders;
-- DROP TABLE IF EXISTS partner_freelancer_profiles;
-- DROP TABLE IF EXISTS integration_partners;
-- DELETE FROM schema_migrations WHERE version = '125_fazat_workforce_provider';
-- COMMIT;
```

---

## Live safety guard (scripts)

Default: Neon/live **blocked** for migrate/seed.

### Schema-only override (temporary)

```bash
FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT=true
FAZAT_LIVE_SCHEMA_CONFIRM=LIVE_SCHEMA_ONLY
```

- Allows `npm run migrate:fazat-safe` only
- Prints a large warning
- Refuses if `FAZAT_INTEGRATION_ENABLED` is truthy
- **Does not** allow `npm run seed:fazat-staging` (seed still refuses when live schema flag is set)

Unset immediately after migration.

---

## Exact command sequence (DO NOT RUN without owner approval)

```powershell
cd backend

# A) Backup first (Neon console snapshot / provider backup) — manual

# B) Confirm identity (no secrets printed)
npm run check:fazat-db-safety
# Expect UNSAFE until override; that is correct.

# C) Schema-only (OWNER APPROVED)
$env:FAZAT_INTEGRATION_ENABLED = "false"
$env:FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT = "true"
$env:FAZAT_LIVE_SCHEMA_CONFIRM = "LIVE_SCHEMA_ONLY"
npm run migrate:fazat-safe

# D) Unset override immediately
Remove-Item Env:FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT -ErrorAction SilentlyContinue
Remove-Item Env:FAZAT_LIVE_SCHEMA_CONFIRM -ErrorAction SilentlyContinue

# E) Keep integration disabled on the server process env / secrets manager
# FAZAT_INTEGRATION_ENABLED=false

# F) NEVER on live:
# npm run seed:fazat-staging
```

Verify tables:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'integration_partners',
    'partner_freelancer_profiles',
    'partner_orders',
    'partner_order_messages',
    'partner_request_nonces',
    'partner_webhook_events',
    'partner_integration_audit_logs'
  )
ORDER BY 1;

SELECT code, enabled FROM integration_partners WHERE code = 'FAZAT';
```

---

## What live schema rollout does **not** unlock

- Cross-app E2E with FAZ3AT
- Seeded UNAPPROVED/APPROVED/TRUSTED test freelancers
- Test partner orders / messages / webhooks load tests
- Enabling production FAZAT traffic

FAZ3AT integration prompt should wait until:

**A)** Neon branch / staging E2E ready, or  
**B)** Owner explicitly accepts a **production pilot** with real freelancers (separate checklist).

---

## Related docs

- [FAZAT_WORKFORCE_PROVIDER_API.md](./FAZAT_WORKFORCE_PROVIDER_API.md)
- [FAZAT_LOCAL_E2E_SETUP.md](./FAZAT_LOCAL_E2E_SETUP.md)
