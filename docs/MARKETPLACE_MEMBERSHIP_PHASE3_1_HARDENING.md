# Marketplace Membership — Phase 3.1 Hardening

**Status:** Ready for migration review (migration **138** not applied)  
**Depends on:** Migration 137 applied in Production (empty tables)

---

## Canonical membership state

| Status | May be `is_current=true`? | May consume Priority Bid uses? | Reconcile calendar? |
|---|---|---|---|
| `pending` | yes | no | no |
| `active` | yes | yes | yes |
| `cancel_at_period_end` | yes | yes (until term end) | yes |
| `suspended` | yes | **no** | **yes** |
| `expired` | **no** | no | no |
| `cancelled` | **no** | no | no |
| `superseded` | **no** | no | no |

**`is_current` meaning:** at most one current Marketplace Membership per freelancer (partial unique index). Resolvers **must** use `is_current = TRUE`, never `status='active'` alone.

**DB CHECK (migration 138):** `is_current=TRUE` ⇒ status ∈ {pending, active, cancel_at_period_end, suspended}.

---

## Replacement / superseded

When a new membership is activated for the same freelancer:

1. Prior `is_current` row → `status='superseded'`, `is_current=false`, `ended_at` set  
2. Active cycles on prior membership closed  
3. Audit: `MEMBERSHIP_SUPERSEDED`  
4. New membership created as `active` + cycle #1  

This is **not** expiry and **not** freelancer cancellation.

---

## Suspension (access hold, not billing pause)

- Remains current  
- Paid term calendar continues (no automatic extension)  
- Cannot consume Priority Bid uses  
- Reconcile still advances to the correct **anniversary** cycle  
- Missed months do **not** accumulate usable backlog  
- On resume: restore `active` or `cancel_at_period_end`; if term already ended → `expired`  
- Resume reconciles to current anniversary window (e.g. suspend Feb–May → May17–Jun17 as cycle #5)

Server-only: `suspendMarketplaceMembership()` / `resumeMarketplaceMembership()`.

---

## Priority usage idempotency (Phase 3.1)

**Final unique key:**

`(cycle_id, reference_type, reference_id, event_type)`

Global `(reference_type, reference_id, event_type)` from 137 is replaced by 138.

**Return linkage:** `related_usage_id` → original consume row; unique one return per consume.

`admin_adjustment` remains schema-allowed, **unwired** (no Admin UI).

---

## Reconciliation Strategy B

- Candidates: `is_current = TRUE` AND status ∈ active | cancel_at_period_end | suspended  
- Creates **only** the due cycle with correct `cycle_number` (skipped months leave gaps — intentional)  
- Multi-instance: membership `FOR UPDATE` + unique cycle indexes; idempotent create; no duplicate create audits on retry  

Exact term boundary: `paid_term_ends_at <= now` ⇒ expire; no next cycle.

Partial final cycle: cycle end capped to `paid_term_ends_at`.

---

## Engines still OFF

Work Tokens / Priority Auction / Fair Distribution / Elite entitlement / Stripe purchase / `/plans` cutover — unchanged.

---

## Migration 138

File: `backend/sql/migrations/138_marketplace_membership_phase3_1_hardening.sql`

- Additive on empty Phase 3 tables  
- Does **not** edit 134–137  
- **Do not apply** until review  

### After apply (human)

1. Verify 0 pending  
2. Confirm CHECKs/indexes  
3. Confirm row counts still 0  
4. Deploy Phase 3.1 application code only after approval  
