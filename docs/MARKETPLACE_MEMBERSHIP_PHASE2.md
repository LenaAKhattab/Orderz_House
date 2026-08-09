# Marketplace Membership — Phase 2 (Economy Settings Foundation)

## Purpose

Phase 2 adds a **configuration-only** global Marketplace Economy policy layer for **باقات العمل**.

It does **not** execute any marketplace economy:

- no Work Token grants / deductions / refunds
- no Elite offers / entitlements / queues
- no commission calculation
- no cash membership payments
- no verification bonus grants
- no Stripe calls
- no marketplace subscriptions / cycles / wallets

Changing Super Admin settings in this phase updates **CURRENT POLICY** only.

## Architecture decision: dedicated singleton table

### Audit summary

Existing patterns in the repo:

| Pattern | Examples | Shape |
|---|---|---|
| Sparse string KV | `system_settings` via `systemSettingsService` | activation fee keys as strings |
| Typed singleton row | `fake_order_settings`, `platform_ui_settings` | one row (`id = 1`), typed columns, atomic UPDATE |

### Decision

**Use dedicated table `marketplace_economy_settings` (singleton `id = 1`).**

### Why not `system_settings`

1. **Typed values** — money (`NUMERIC(12,3)`), percents, ints with DB CHECK constraints.
2. **Atomic multi-field updates** — one `UPDATE … WHERE id = 1` in a transaction avoids partial KV writes.
3. **Domain grouping** — economy policy is a coherent object, not unrelated keys.
4. **Auditability** — `updated_by_user_id` / `updated_at` on the policy row.
5. **Separation** — never mix with `subscription_activation_fee_*` or UI settings.
6. **Future growth** — adding columns/CHECs is clearer than proliferating string keys.

`system_settings` remains appropriate for sparse flags (e.g. activation fee). Marketplace Economy is a typed multi-field domain → singleton table.

## Migration

File: `backend/sql/migrations/135_marketplace_economy_settings.sql`

- Additive, idempotent seed (`ON CONFLICT DO NOTHING`)
- Does **not** modify migration 134
- Does **not** alter legacy `plans` / fake-training / `system_settings`
- **Do not apply automatically** — review then migrate explicitly

## Default CURRENT POLICY

| Setting | Default |
|---|---|
| Work Token value | **0.100 JOD** |
| Bid rate | **1** token per 1 JOD real order value |
| Application refund % | **70** |
| Platform commission % | **30** |
| Cash processing fee | **5.000 JOD** per cash **transaction** |
| Identity bonus policy | enabled, **10** tokens |
| Payout method bonus policy | enabled, **10** tokens |
| Elite direct orders / cycle | **1** |
| Elite offer duration | **10** minutes |
| Carry forward | enabled, **7** days, max **1** |
| Declines affect carry-forward | **false** (extensibility only) |

### Execution feature flags (MUST stay OFF until engines exist)

| Flag | Default |
|---|---|
| `work_tokens_enabled` | **false** |
| `marketplace_commission_enabled` | **false** |
| `cash_membership_payments_enabled` | **false** |
| `elite_engine_enabled` | **false** |
| `verification_bonuses_enabled` | **false** |

Policy “enabled” toggles for verification bonuses are **not** the execution engine. Execution requires `verification_bonuses_enabled = true` **and** a future grant flow.

### Plan capability vs global engine

| Concept | Location |
|---|---|
| Tier is Elite-capable | `marketplace_membership_plans.elite_direct_orders_enabled` |
| Elite **system** is operational | `marketplace_economy_settings.elite_engine_enabled` |

## Real Orders Only

Economic features apply **only** to REAL customer-funded orders.

Fake/training systems must never read these settings for execution:

- `fakeOrdersService`
- `fake_order_settings_plans`
- `fake_order_round_items`
- `training.order.visible`
- `planOrderValueEligibility`

Service helper: `assertMarketplaceEconomyRealOrdersOnly()`.

## CURRENT POLICY vs HISTORICAL SNAPSHOT

Settings are dynamic. Future financial/ledger rows **must snapshot** values at write time:

- `workTokenValueJod` / `bidTokensPerOrderJod`
- `applicationTokenRefundPercentage`
- `platformCommissionPercentage`
- `cashProcessingFeeJod`
- verification bonus amounts when granted
- Elite entitlement policy values when issued

Phase 2 does **not** create order snapshots yet — only documents the requirement (`MARKETPLACE_ECONOMY_SNAPSHOT_FIELDS`).

## Activation fee separation

Unchanged and independent:

- `subscription_activation_fee_enabled`
- `subscription_activation_fee_amount_minor`

Distinct concepts:

1. Membership price (plan catalog)
2. Activation fee (legacy yearly unlock)
3. Cash processing fee (marketplace cash TRANSACTION admin fee)
4. Platform commission (% of completed real work)

## APIs (Super Admin only)

| Method | Path |
|---|---|
| GET | `/api/super-admin/marketplace-economy-settings` |
| PUT | `/api/super-admin/marketplace-economy-settings` |

No public settings endpoint in Phase 2.

Service: `marketplaceEconomySettingsService.js`

- `getMarketplaceEconomySettings()`
- `updateMarketplaceEconomySettings({ actorUserId, patch })` — transactional `FOR UPDATE` + single UPDATE

## Super Admin UI

- Route: `/dashboard/super-admin/marketplace-economy`
- Arabic title: **إعدادات اقتصاد العمل**
- Linked from `/dashboard/super-admin/marketplace-plans`
- Sections: Work Tokens, Commission, Cash, Verification bonuses, Elite
- Warning: belongs to باقات العمل — not الباقات الرئيسية / باقات الصفحات; fake/training excluded

## Explicitly NOT in Phase 2

- `freelancer_marketplace_memberships` / cycles
- Work Token wallet / ledger / bidding / refunds
- Elite tables / matching / timers
- Commission engine / earnings changes
- Cash payment receipts / activation
- Verification upload flows
- Public `/plans` cutover (`GET /api/plans` unchanged)
- Stripe

## Suggested Phase 3

`freelancer_marketplace_memberships` + membership cycles foundation (still before token wallet / Elite engine / public cutover).

## Tests

- `backend/test/marketplaceEconomySettingsService.test.js`
- `backend/test/marketplaceEconomySettingsMigration.test.js`
- `frontend/src/admin/marketplaceEconomy/marketplaceEconomyFormUtils.test.js`
