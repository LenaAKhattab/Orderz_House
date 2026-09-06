# Marketplace Membership — Phase 1 (Catalog Foundation)

## Why a dedicated domain

Legacy «الباقات الرئيسية» and «باقات الصفحات» are **not** two product economies. They share:

- `plans`
- `plan_pages` (`page_type = default | special`)
- `plan_features`
- `freelancer_subscriptions`

The new marketplace business model (Work Tokens, Elite Direct Orders, cycles, commission, etc.) **must not** be bolted onto that shared catalog.

Phase 1 introduces an independent family:

| Internal | Arabic | Table |
|---|---|---|
| `MARKETPLACE_MEMBERSHIP` | باقات العمل | `marketplace_membership_plans` |

## Phase 1 includes

- Additive migration `134_marketplace_membership_plans.sql` (prepared; **not auto-applied**)
- Idempotent seed of four tiers by `tier_code` (not numeric id):
  - `pay_as_you_work` — 1.99 JOD — max real order 10 JOD
  - `active` — 8.99 JOD — max real 25 JOD
  - `pro` — 14.99 JOD — max real 100 JOD
  - `elite` — 49.99 JOD — unlimited real order + `elite_direct_orders_enabled`
- Backend service + validators + public/admin APIs
- Super Admin page: `/dashboard/super-admin/marketplace-plans` (إدارة باقات العمل)
- Hub link from legacy `/dashboard/super-admin/plans` → dedicated page (no shared CRUD)
- Sale % fields on the marketplace plan row (base price never overwritten)
- Structural `included_tokens_per_cycle` default **0** (not finalized product values)

## Phase 1 explicitly does NOT include

- Token wallet / ledger / bidding / refunds
- Subscription cycles or monthly token grant jobs
- Elite queue / entitlement execution
- Cash payment processing / commission / bonuses
- Stripe Product/Price/Checkout (nullable cache columns only)
- Wiring to `freelancer_subscriptions`
- Switching public `/plans` off legacy `GET /api/plans`

## Real-orders-only principle

Access fields are explicitly named:

- `max_real_order_value_jod`
- `unlimited_real_order_value`

These must **never** gate fake/training/pool orders. Phase 1 does not connect this catalog to `fake_order_settings_plans` or `planOrderValueEligibility`.

## APIs

| Method | Path | Auth |
|---|---|---|
| GET | `/api/marketplace-membership-plans` | Public (active only) |
| GET | `/api/super-admin/marketplace-membership-plans` | Super Admin |
| POST | `/api/super-admin/marketplace-membership-plans` | Super Admin |
| PATCH | `/api/super-admin/marketplace-membership-plans/:id` | Super Admin |
| PATCH | `/api/super-admin/marketplace-membership-plans/reorder` | Super Admin |
| DELETE | `/api/super-admin/marketplace-membership-plans/:id` | Super Admin (prefer deactivate) |

## Per-plan vs global

Stored on each plan: price, real-order access, tokens/cycle slot, cash months flags, Elite capability, sale, active, sort.

**Not** stored on plan rows (future global Marketplace Economy settings): token JOD value, bid/refund formulas, commission %, verification/payout bonuses, Elite offer duration, carry-forward, queue rules.

## Activation fee

Unchanged. Future marketplace checkout may add activation fee as a **separate line** when due — never merge into `monthly_price_jod`.

## Public `/plans` cutover

Not active. When ready (later phase): feature-flag switch so `/plans` consumes marketplace public API only. Legacy `/plans/:slug` pages remain for special marketing pages.

## Suggested next phases

2. Global marketplace economy settings — **see `docs/MARKETPLACE_MEMBERSHIP_PHASE2.md`**
3. `freelancer_marketplace_memberships` + cycles
4. Stripe recurring membership checkout (+ optional activation fee line)
5. Work Token wallet/ledger + real-order-only enforcement
6. Elite Direct Orders
7. Controlled public `/plans` cutover

## Apply migration

Review SQL, then apply explicitly in the appropriate environment:

```bash
# Do NOT run against Production from agent tasks without explicit approval
npm run db:migrate
```
