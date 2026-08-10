# Marketplace Membership — Priority Bid & Fair Work Distribution Architecture

## Status

**Foundation / configuration only (updated Phase 2).**  
Auction engine, wallet reservation ledger, fairness stats tables, and resolution workers are **NOT** implemented.

Terminology remains **Work Tokens** (`TERMINOLOGY_DECISION_REQUIRED` vs manager “Work Connects”).  
Catalog prices remain **1.99 / 8.99 / 14.99 / 49.99** (`PRODUCT_DECISION_REQUIRED` vs alternate 24.99–99.99 docs).

---

## Corrected business model

### Priority Bid = token auction (NOT fixed-rate apply cost)

| Rule | Behavior |
|---|---|
| Freelancer chooses bid amount | e.g. 70 / 90 / 120 / 150 |
| During auction | Tokens **RESERVED** only |
| Losers | **100%** reserved Tokens **RELEASED** |
| Winner | **100%** winning bid **CONSUMED** |
| Never | deduct-then-refund as the primary model |

### Separate from normal applications

Priority Bid does **not** replace normal claim/bid/proposal flows.

| Concern | Controls |
|---|---|
| Normal apply token rate (optional future) | `normal_application_tokens_per_order_jod` |
| Normal apply refund when no one selected | `normal_application_token_refund_percentage` |
| Priority Bid loser release | **always 100%** (hard rule) |

Legacy Phase 2 names `bid_tokens_per_order_jod` / `application_token_refund_percentage` were **incorrectly implied as Priority Bid**. They are renamed and documented as **normal application only**.

### Per-plan Priority Bid uses (by `tier_code`)

| tier_code | uses / cycle |
|---|---|
| `pay_as_you_work` | 1 |
| `active` | 2 |
| `pro` | 3 |
| `elite` | 4 |

Columns (migration **136**): `priority_bid_enabled`, `priority_bid_uses_per_cycle`.

Use consumed only when confirm + eligibility + sufficient AVAILABLE + reservation + bid row succeed atomically.  
Loss does **not** return the monthly use.  
Order cancel before resolution: release all reservations; return use if `priority_bid_return_use_on_order_cancel` (default **true**).

Elite Direct Orders entitlement is **independent** — Priority Bid use must not consume Elite entitlement.

---

## Token wallet dependency (Phase 4 — NOT built)

Required balances:

- **AVAILABLE**
- **RESERVED**
- **CONSUMED** (historical)

Ledger events (conceptual):

- `PRIORITY_BID_RESERVE`
- `PRIORITY_BID_INCREASE_RESERVE`
- `PRIORITY_BID_RELEASE`
- `PRIORITY_BID_CONSUME`

Reserved Tokens cannot fund another auction/operation. Enforce at DB transaction level.

**Do not** fake this with `users.tokens`.

---

## Assignment strategies

| Strategy | Meaning |
|---|---|
| `HIGHEST_TOKEN_ONLY` | Eligibility → bid DESC → submitted_at ASC → stable id. **Default for Priority Bid.** |
| `FAIR_DISTRIBUTION_FIRST` | Eligibility → fairness → tokens secondary if enabled |
| `HYBRID` | Eligibility → configurable weights |

Fairness is a **ranking factor**, never an absolute blocker, and **never** overrides eligibility.

Pipeline:

1. REAL economic order  
2. Eligible freelancers  
3. Configured strategy  
4. Fairness where strategy allows  
5. Token / performance / workload factors  
6. Atomic assign + immutable decision snapshot  

---

## Fair Work Distribution (internal)

- Not Freelancer-facing  
- Never serialize: fairnessScore, distributionPriority, queuePosition, eligibleAttemptsWithoutAward, rankingReason, assignmentWeights, internalCandidateRank  
- Admin explainability only  

Outcomes (distinct):

| Code | Fairness effect (default) |
|---|---|
| `APPLIED_AND_LOST` | increases waiting priority |
| `ASSIGNMENT_OFFERED_AND_DECLINED` | **no** same boost |
| `FREELANCER_CANCELLED_AFTER_AWARD` | **no** fairness reward |
| Client/Admin/System cancel (not freelancer) | do not auto-penalize freelancer |

Category-aware: prefer stats keyed by order category/subcategory (existing taxonomy) so Graphic Design awards do not wipe Flutter waiting history.

---

## REAL economic orders (source-agnostic)

Valid real sources include (when properly authorized/funded per current workflow):

- customer / `client_created`
- FAZ3AT / partner overlays on real `orders`
- admin / super_admin created
- institutional release into real `orders`

**Excluded forever:** `fake_orders` / training / simulated.

Fake/training must never start auctions, reserve/consume Tokens, consume Priority Uses, or affect real fairness/commission/earnings.

---

## Auction lifecycle (future Phase 6)

- Persistent `start_at` / `end_at` in DB  
- Resolution via existing cron/worker patterns (e.g. internal tick) — **not** `setTimeout`  
- Increase: reserve **delta only**  
- Decrease: default rejected (`priority_bid_allow_decrease=false`)  
- Withdrawal: default false; configurable later  

Default winner: highest eligible Token Bid. If top bidder becomes ineligible, skip to next. If none: `NO_ELIGIBLE_WINNER` → release all reservations, assign nobody.

---

## Revised roadmap

| Phase | Scope |
|---|---|
| **2** | Economy settings + Priority Bid / Fairness **policy** (this document) |
| **3** | Marketplace memberships + cycles + per-cycle Priority Bid usage counters |
| **4** | Work Token wallet + ledger (AVAILABLE/RESERVED/CONSUMED) |
| **5** | Normal real-order Token participation (if still required) |
| **6** | Priority Auction engine + reservation/resolution worker |
| **7** | Fairness stats/history + assignment decision engine + Admin explainability |
| **8** | Elite Direct Orders engine |
| Later | Commission / cash / payouts |

Do not invert dependencies.

---

## Migrations

| File | Notes |
|---|---|
| `134_marketplace_membership_plans.sql` | **IMMUTABLE** (Production applied) |
| `135_marketplace_economy_settings.sql` | Pending — includes Priority Bid + Fairness policy columns |
| `136_marketplace_membership_priority_bid.sql` | Pending — plan capability fields; **does not change prices** |

Do not apply from agent tasks without explicit review/approval.
