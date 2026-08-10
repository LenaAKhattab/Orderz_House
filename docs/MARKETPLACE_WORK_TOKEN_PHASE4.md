# Marketplace Work Token Wallet — Phase 4

**Status:** Code + migration `139` ready for review. **Not applied to Production.**  
**Scope:** Accounting foundation only (wallet + reservations + append-only ledger).

**Out of scope:** Priority Auction, normal Order Token deduction, Fair Distribution, Elite, Token purchase (Stripe/cash), automatic membership cycle grants, verification bonus execution.

---

## 1. Wallet model

| Concept | Table | Role |
|---|---|---|
| Wallet aggregates | `freelancer_work_token_wallets` | Current `available_tokens` + `reserved_tokens` (projection) |
| Reservations | `work_token_reservations` | What holds reserved Tokens (per economic reference) |
| Ledger | `work_token_ledger_entries` | Append-only immutable history |

**Token unit:** integer Work Tokens only (matches `included_tokens_per_cycle` / Priority Bid INT model).  
`work_token_value_jod` remains money config (0.100 JOD per token) — **not** stored as wallet balance.

**Invariant:** one wallet per Freelancer (`UNIQUE freelancer_user_id`).  
**Lazy creation:** wallets are created on first mutation, never by migration backfill.

---

## 2. Available vs Reserved

| Balance | Meaning |
|---|---|
| `available_tokens` | Free to reserve (or future direct spend) |
| `reserved_tokens` | Held by **active** reservations |

Never allow `available < 0` or `reserved < 0` (DB CHECK + service).

Example Priority Bid path (Phase 6 caller):

1. CREDIT 500 → available 500 / reserved 0  
2. RESERVE 150 → available 350 / reserved 150  
3. Lose → RELEASE 150 → available 500 / reserved 0  
4. Win → CONSUME 150 → available 350 / reserved 0 (permanent spend)

---

## 3. Reservation lifecycle

Statuses: `active` → `released` | `consumed` | `cancelled`

Identity: **UNIQUE (`wallet_id`, `reference_type`, `reference_id`)** — wallet-scoped.
Two freelancers may share the same business reference independently.

| Operation | Effect |
|---|---|
| `reserveWorkTokens` | Create active reservation; available− / reserved+ |
| `increaseWorkTokenReservation` | Delta only (100→180 reserves +80); **requires** `idempotencyKey` |
| `releaseWorkTokenReservation` | 100% back to available (Priority Bid loser path) |
| `consumeWorkTokenReservation` | reserved− only; no refund |

Cross-reservation isolation: releasing A never affects B.
Ownership is enforced on every reservation resolution.

---

## 4. Ledger semantics

Every economic change writes a ledger row. No silent balance updates.  
No UPDATE/DELETE of ledger rows via application services — corrections are compensating entries.

**Business reference** (`reference_type` / `reference_id`) is separate from  
**operation idempotency** (`idempotency_key`).

Idempotency: **UNIQUE (`wallet_id`, `idempotency_key`)**.  
Conflicting amount on same operation key → `WORK_TOKEN_IDEMPOTENCY_CONFLICT`.

Increases require an explicit caller `idempotencyKey`. Retrying the same key is a no-op;
a later legitimate increase must use a new key.

---

## 5. Concurrency / locking

Mutations:

1. `BEGIN` (unless caller provided `client`)
2. Ensure wallet row (`ON CONFLICT DO NOTHING`)
3. `SELECT … FOR UPDATE` wallet
4. Validate / mutate reservation
5. Update wallet aggregates
6. Insert ledger
7. `COMMIT`

Concurrent reserves against the same wallet are serialized by the row lock.  
One of two competing 80-token reserves against 100 available succeeds; the other gets `INSUFFICIENT_WORK_TOKENS`.

---

## 6. External DB client support

All mutators accept `client` for caller-owned transactions:

```js
await reserveWorkTokens({ …, client }); // joins outer txn; no internal commit
```

Critical for Phase 6 atomic:

- Priority Bid usage consume
- Work Token reserve
- Bid record

in **one** transaction.

---

## 7. Read without write

`getWorkTokenWalletSnapshot()` returns `available=0, reserved=0` when no row exists — **does not insert**.  
HTTP `GET /api/freelancer/work-token-wallet` uses this path.

`getOrCreateWorkTokenWallet()` is for mutation paths only.

---

## 8. Real-economic-order isolation

Phase 4 primitives are **source-agnostic**. They do not inspect Orders.  
Future callers must supply authorized economic `reference_type` / `reference_id`.  
Fake/training Orders must never call these services.  
Fail closed when economic validity cannot be proven (later integration).

`FAKE_TRAINING_WORK_TOKEN_LINKAGE = NONE`

---

## 9. Membership cycle & verification bonuses (future)

Ledger supports `MEMBERSHIP_CYCLE_GRANT` and verification bonus events with idempotent references.  
**Phase 4 does not execute grants.** Current `included_tokens_per_cycle = 0`.  
`verification_bonuses_enabled` remains **false**.

---

## 10. Admin adjustments

No unrestricted Admin “set balance” endpoint.  
No Admin mutation UI in Phase 4.  
If an internal adjustment primitive is used later: actor + reason + idempotency + ledger required.

---

## 11. APIs

### Freelancer (read-only)

- `GET /api/freelancer/work-token-wallet` → available, reserved, `engineAvailable`
- `GET /api/freelancer/work-token-wallet/transactions` → paginated own ledger (sanitized)

### Super Admin (read-only)

- `GET /api/super-admin/work-token-wallets`
- `GET /api/super-admin/work-token-wallets/:id`

When `work_tokens_enabled=false`, responses include `engineAvailable=false`.

---

## 12. UI

Minimal Freelancer card on Plans page:

- Available / Reserved  
- Status: **قريبًا** / Coming soon  

No Buy / Reserve / Spend / Bid actions.

---

## 13. Migration rollout

File: `backend/sql/migrations/139_marketplace_work_token_wallet_ledger.sql`

- Additive, empty tables, no backfill, no flag flips  
- Does **not** modify 134–138  
- Apply only after review (`db:migrate` / Production process) — **not by agent**

---

## 14. Internal services

`backend/src/services/marketplaceWorkTokenWalletService.js`

- `getWorkTokenWalletSnapshot`
- `getOrCreateWorkTokenWallet`
- `creditWorkTokens`
- `reserveWorkTokens`
- `increaseWorkTokenReservation`
- `releaseWorkTokenReservation`
- `consumeWorkTokenReservation`
- `consumeAvailableWorkTokens` (future normal apps; not wired)
- `verifyWorkTokenWalletIntegrity`

---

## 15. Integrity checker

Read-only: wallet aggregates must match ledger replay + sum of active reservation amounts.

---

## 16. Engine flags

All economy engines remain **OFF**, including `work_tokens_enabled=false`.

---

## 17. Recommended next step after review

1. Review migration 139 SQL + service invariants  
2. Apply 139 to Production via approved migrate process  
3. Deploy code  
4. **Do not** start Phase 5 (normal Order Token) or Phase 6 (Priority Auction) until Phase 4 is verified empty and healthy
