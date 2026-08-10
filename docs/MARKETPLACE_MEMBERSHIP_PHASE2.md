# Marketplace Membership — Phase 2 (Economy Settings Foundation)

## Purpose

Phase 2 adds a **configuration-only** global Marketplace Economy policy layer for **باقات العمل**, including:

- Work Token accounting defaults
- OPTIONAL **normal application** token policy (not Priority Bid)
- **Priority Bid auction policy** (config only)
- **Fair Work Distribution** policy (config only; internal)
- Commission / cash fee / verification / Elite policy knobs

It does **not** execute any marketplace economy:

- no Work Token grants / reservations / consumes
- no Priority auctions / resolution workers
- no fairness score computation / assignment override
- no Elite offers / entitlements / queues
- no commission calculation
- no cash membership payments
- no verification bonus grants
- no Stripe calls
- no marketplace subscriptions / cycles / wallets

See also: `docs/MARKETPLACE_PRIORITY_BID_AND_FAIRNESS.md`.

## Architecture decision: dedicated singleton table

**Use `marketplace_economy_settings` (singleton `id = 1`).**

Typed money/percents, atomic multi-field updates, domain grouping, audit columns, separation from activation fee / UI settings.

## Migrations

| File | Status |
|---|---|
| `135_marketplace_economy_settings.sql` | Prepared — **not auto-applied** |
| `136_marketplace_membership_priority_bid.sql` | Prepared plan capability fields — **not auto-applied** |
| `134_…` | **Do not modify** (Production applied) |

## Corrected namespaces (manager update)

| Setting | Meaning |
|---|---|
| `normal_application_tokens_per_order_jod` | OPTIONAL future **normal** apply rate — **NOT** Priority Bid amount |
| `normal_application_token_refund_percentage` | OPTIONAL future **normal** refund — **NOT** Priority Bid loser release |
| Priority Bid loser release | **Always 100%** of reserved Tokens |
| Priority Bid amount | Chosen by Freelancer |

Legacy patch keys `bidTokensPerOrderJod` / `applicationTokenRefundPercentage` are accepted as aliases and mapped to the normal-application fields.

## Default CURRENT POLICY (selected)

| Setting | Default |
|---|---|
| Work Token value | **0.100 JOD** |
| Normal apply tokens / JOD | **1** (policy only) |
| Normal apply refund % | **70** (policy only) |
| Platform commission % | **30** |
| Cash processing fee | **5.000 JOD** / cash **transaction** |
| Priority Bid duration | **30** minutes |
| Priority Bid min tokens | **1** |
| Priority Bid allow increase | **true** |
| Priority Bid allow decrease | **false** |
| Priority Bid return use on order cancel | **true** |
| Priority Bid assignment strategy | **HIGHEST_TOKEN_ONLY** |
| Fairness / Hybrid weights | fairness **0**, token **100** (others 0) |
| Award reset policy | **RESET_TO_ZERO** |

### Execution feature flags (MUST stay OFF)

| Flag | Default |
|---|---|
| `work_tokens_enabled` | **false** |
| `priority_bidding_enabled` | **false** |
| `fair_work_distribution_enabled` | **false** |
| `marketplace_commission_enabled` | **false** |
| `cash_membership_payments_enabled` | **false** |
| `elite_engine_enabled` | **false** |
| `verification_bonuses_enabled` | **false** |

## Per-plan Priority Bid uses (migration 136)

| tier_code | uses |
|---|---|
| pay_as_you_work | 1 |
| active | 2 |
| pro | 3 |
| elite | 4 |

Prices unchanged: 1.99 / 8.99 / 14.99 / 49.99.

## Real economic orders

Applies to **REAL ECONOMIC ORDERS** (customer / FAZ3AT / admin / other authorized real workflows when properly funded/authorized).

**Never** fake/training.

Helper: `assertMarketplaceEconomyRealOrdersOnly()`.

## Engine dependencies (blocked until ready)

`MARKETPLACE_ECONOMY_ENGINE_DEPENDENCIES` in service documents required Phase 3–7 components. Do not enable Priority Bid without wallet AVAILABLE/RESERVED.

## Super Admin UI

- `/dashboard/super-admin/marketplace-economy`
- Sections: Work Tokens + normal apply, Priority Bid, Fair Distribution, Commission, Cash, Verification, Elite

## Revised next phases

3 Memberships + cycles + Priority Bid use counters  
4 Wallet + ledger  
5 Normal Token participation (if required)  
6 Priority Auction engine  
7 Fairness engine + Admin explainability  
8 Elite Direct Orders  

## Tests

- `backend/test/marketplaceEconomySettingsService.test.js`
- `backend/test/marketplaceEconomySettingsMigration.test.js`
- `backend/test/marketplaceMembershipPriorityBidMigration.test.js`
- `frontend/src/admin/marketplaceEconomy/marketplaceEconomyFormUtils.test.js`
