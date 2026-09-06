# Marketplace Membership — Phase 3

**Status:** DB migration 137 applied in Production (empty tables).  
**Hardening:** see [MARKETPLACE_MEMBERSHIP_PHASE3_1_HARDENING.md](./MARKETPLACE_MEMBERSHIP_PHASE3_1_HARDENING.md) (migration 138 pending review).

**Out of scope:** Work Token wallet, Priority Auctions, Fair Distribution, Elite entitlements, Stripe purchase, public `/plans` cutover

---

## 1. Independence from legacy subscriptions

Marketplace Membership (`freelancer_marketplace_memberships`) is a **parallel domain**:

| Domain | Tables | Product |
|---|---|---|
| الباقات الرئيسية / باقات الصفحات | `plans`, `plan_pages`, `freelancer_subscriptions` | Legacy |
| باقات العمل (Marketplace) | `marketplace_membership_plans` + Phase 3 membership/cycle tables | New |

Do **not** map legacy Pro → Marketplace Pro. Do **not** backfill existing subscribers.

---

## 2. Paid term vs monthly benefit cycle

- **Paid term** (`paid_term_starts_at` → `paid_term_ends_at`): how long the membership relationship is authorized (1 month, 6 months, 12 months, …).
- **Benefit cycle** (`marketplace_membership_cycles`): one **monthly** window that delivers snapshotted benefits (Priority Bid uses, later tokens/Elite).

Prepaid 6 months ≠ 6 immediately usable monthly allowances. Only the **ACTIVE** cycle’s allowance is usable.

---

## 3. Anniversary cycles

Cycles are anchored to membership start (`cycle_anchor_day`, 1–31), **not** the 1st of each calendar month.

Example: start `2026-08-17` → cycles `17 Aug–17 Sep`, `17 Sep–17 Oct`, …

Helpers: `backend/src/utils/marketplaceMembershipCycleDates.js`

### Month-end / February

Uses clamp-to-month-length with **anchor day restoration**:

- Jan 31 → Feb 28/29 → Mar 31 (anchor 31 restored when the month has 31 days)

---

## 4. Plan benefit snapshot

When a cycle is created/activated, it stores:

- `priority_bid_uses_allowed` (from current plan `priority_bid_uses_per_cycle`)
- `included_tokens_allowed` (currently 0; no wallet yet)

If Admin later changes Pro `3 → 5`:

- **Current cycle keeps 3**
- **Next cycle snapshots 5**

---

## 5. Priority Bid usage accounting

- Aggregate counters on the cycle for fast reads
- Auditable ledger: `marketplace_membership_cycle_usage` (`consumed` / `returned` / `admin_adjustment`)
- Idempotency: unique `(reference_type, reference_id, event_type)`
- Internal services only (`marketplacePriorityBidUsageService`)
- Accepts an existing DB `client` for future atomic auction + token reservation
- **No** Freelancer `POST /consume-priority-use`
- **No** consumption on Order view / modal / API reads

`remaining = max(allowed - consumed, 0)`

---

## 6. Cycle creation / reconciliation strategy

**Chosen: B — lazy current cycle + DB reconciliation**

- On activation: create cycle `#1` only
- Do **not** pre-create 12 months of benefit rows
- Reconciliation (idempotent):
  - expire membership when paid term ended
  - close ended active cycles
  - create/activate the due anniversary cycle exactly once
- Drivers:
  - optional in-process interval (non-prod default; prod OFF unless enabled)
  - `POST /api/internal/marketplace-memberships/reconcile-tick` + `MARKETPLACE_MEMBERSHIP_RECONCILE_SECRET`

Server downtime at a boundary is recovered by the next reconcile using DB timestamps.

---

## 7. One current membership

Partial unique index: at most one `is_current = TRUE` per freelancer.  
Plan changes demote the previous row (`is_current = FALSE`); history is retained.

One `status = 'active'` cycle per membership (partial unique index).

---

## 8. Membership status model

`pending` | `active` | `cancel_at_period_end` | `expired` | `cancelled` | `suspended`

Paid-term validity and cycle windows are separate fields — status alone is not the cycle clock.

---

## 9. APIs

| Method | Path | Audience |
|---|---|---|
| GET | `/api/freelancer/marketplace-membership` | Freelancer (read) |
| GET | `/api/super-admin/marketplace-memberships` | Super Admin (read) |
| GET | `/api/super-admin/marketplace-memberships/:id` | Super Admin (read) |
| POST | `/api/internal/marketplace-memberships/reconcile-tick` | Secret cron |

Internal create/activate: `createAndActivateMarketplaceMembership()` — **not** wired to Stripe/manual Production purchase in Phase 3.

---

## 10. Engines still OFF

Production `marketplace_economy_settings` execution flags remain OFF:

- Work Tokens
- Priority Bidding
- Fair Distribution
- Commission / cash / Elite engine / verification bonuses

UI may show Priority Bid **allowance** with “قريبًا” — never an auction entry button.

---

## 11. Migration rollout

**File:** `backend/sql/migrations/137_marketplace_memberships_cycles.sql`

- Additive, empty tables, no backfill, no feature-flag flips
- Does **not** edit 134 / 135 / 136
- **Do not apply** until explicit Production migration approval

### Suggested apply steps (human)

1. Review SQL + tests
2. Backup / confirm Neon target
3. Run protected migrate runner once
4. Verify tables empty + `schema_migrations` has `137_marketplace_memberships_cycles`
5. Confirm economy flags still false

---

## 12. Phase 4 recommendation

**Work Token Wallet** (AVAILABLE / RESERVED / CONSUMED) with ledger — still independent of auctions.  
Do not build Priority Auction until wallet + membership accounting are solid.
