# Institutional release scheduler — production

Institutional releases are **independent** from fake/training-order automation.

## Chosen production strategy: Option A (single in-process worker)

Recommended for Orderz House single-primary API deployments:

1. On **exactly one** backend process / worker:
   - `INSTITUTIONAL_RELEASE_SCHEDULER_ENABLED=true`
   - `INSTITUTIONAL_RELEASE_TICK_MS=60000`
2. On **all other** API instances:
   - `INSTITUTIONAL_RELEASE_SCHEDULER_ENABLED=false`

### Option B (external cron) — multi-instance fleets

If you cannot pin a single worker:

1. Set `INSTITUTIONAL_RELEASE_SCHEDULER_ENABLED=false` on **every** API instance.
2. Cron every 1–2 minutes calls:
   - `POST /api/admin/institutional-order-storage/release-tick`
   - Authenticated staff session/token with permission `institutional_order_storage.retry_release`
3. Never enable in-process ticks on another host at the same time.

## Environment variables

| Variable | Recommended prod | Meaning |
|---|---|---|
| `INSTITUTIONAL_RELEASE_SCHEDULER_ENABLED` | `true` on one worker only; `false` elsewhere | In-process `setInterval` driver |
| `INSTITUTIONAL_RELEASE_TICK_MS` | `60000` (min 15000) | Poll interval |

Defaults when unset: enabled in non-production, **disabled in production**.

Do not hardcode these values in source.

## How to verify it is running

1. `GET /api/health` — API/DB up; includes `institutionalReleaseScheduler` flags.
2. Staff: `GET /api/admin/institutional-order-storage/scheduler/health`
   - `configEnabled` / `processCurrentlyRunning`
   - `schedulerMode`: `in-process` | `external_cron_expected` | `disabled`
   - `lastSuccessAt`, `lastFailureAt`, `lastTickError`
   - `nextScheduledReleaseAt`, `overdueBatchCount`, `processingBatchCount`, `failedBatchCount`
   - `warnings[]` with Arabic operator messages
3. Admin UI: مخزون → تفاصيل → تبويب **المجدول**

## Overdue batches

- Health: `overdueBatchCount > 0`
- Warning code `OVERDUE_WHILE_DISABLED` if scheduler is off
- Emergency: manual tick endpoint (below)

## Disable safely

Set `INSTITUTIONAL_RELEASE_SCHEDULER_ENABLED=false` and restart that process. Due batches remain in DB until re-enabled or manually ticked.

## Emergency manual tick

```http
POST /api/admin/institutional-order-storage/release-tick
Authorization: <staff with retry_release permission>
```

## Duplicate-execution protection

1. Tick acquisition uses **session** advisory lock `pg_try_advisory_lock(913847201)` held for the full tick (due-batch selection **and** `processOneBatch` work). Unlock happens in `finally` (and on pool client release as a safety net).
2. Due rows use `FOR UPDATE … SKIP LOCKED`.
3. Each batch is claimed with a conditional `UPDATE … SET status = 'PROCESSING' WHERE status IN ('SCHEDULED','FAILED','PARTIALLY_RELEASED')`.
4. Per-order release is idempotent (`released_order_id` / existing live order reuse), success logs are written once, and migration **116** enforces a unique index on `orders.institutional_stored_order_id`.

### What advisory locks do **not** protect against

- Two separate hosts both with in-process schedulers **and** an external cron firing the same tick simultaneously still rely on row locks / status transitions / unique index — do not configure competing drivers.
- Long-running `PROCESSING` stuck batches need operator attention (`STUCK_PROCESSING` warning after 15 minutes).
- Application bugs outside the release path (e.g. manually inserting duplicate orders without the institutional_stored_order_id link).
- Holding a session lock only on one connection: if that process crashes hard before unlock, PostgreSQL releases the lock when the backend session ends.

## Which service enables the scheduler

The Node API process that runs `server.js` / `startInstitutionalReleaseScheduler()` — typically the primary web/API worker, not a separate microservice unless you deliberately isolate it.
