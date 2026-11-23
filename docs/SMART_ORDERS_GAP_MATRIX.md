# Smart Order Management — Gap Matrix (audit 2026-11-23)

Source spec: `Smart_Order_Management_Developer_Spec_AR_v2_Guest_Orders.docx` (v1.1, 22 Nov 2026).
Baseline: Production HEAD = origin/main = `dfc56e8` (WhatsApp freelancer intake, migration 215).

Current code + database are the compatibility source of truth. Where the spec proposes a business
value (50% split, 5% pool, AED base, 5% VAT, 2 AED checks) the **current Production rule stays the
active default** and the spec value is recorded as a decision gate (section "Policy gates").

## Baseline facts that shape the design

| Area | Current Production | Consequence |
|---|---|---|
| Orders | One `orders` table; `source_type` ∈ admin_created / super_admin_created / client_created; `order_code` `ORD-YYYYMMDD-XXXXXX` | Keep ONE canonical order. New paths add columns, never a second order table. |
| Admin orders | Internal work items: no customer at all; `created_by_user_id` = admin; `budget` (JOD) = freelancer compensation; `payment_status = not_required` | A customer price is a NEW concept, separate from `budget`. |
| Client orders | `created_by_user_id` = client; Stripe checkout; ownership = `source_type='client_created' AND created_by_user_id` | Customer-linked admin orders need an additional, read-oriented ownership rule. |
| Identity | `users.email` NOT NULL UNIQUE, `password_hash` NOT NULL, `phone` NOT NULL **not unique**; registration verified by **email** OTP | A users row cannot exist without email/password → "Pending Activation" lives on the order claim, not in `users`. |
| OTP / SMS | Email OTP only. No SMS / WhatsApp Business provider. | Phone-OTP = external gate. Activation uses a one-time signed claim link (spec allows "OTP **or** one-time link") + existing email-verified auth. |
| Statuses | draft, published, pending_payment, open_for_bids, awaiting_payment_after_bid_selection, assigned, in_progress, ready_for_work, pending_client_review, completed, cancelled (+ open_for_freelancers) | Map spec states onto these + derived sub-states; no state-machine rewrite. |
| Catalog | categories → subcategories → sub_subcategories (AR + `name_en`), no units / form schema | Extend (S2) with service definitions + versioned field schemas linked to existing categories. |
| Money | JOD everywhere (`NUMERIC(12,2)`), display-only currency conversion (`displayCurrencies`) | AED base = gate; customer price supports JOD/AED explicitly, no FX recompute. |
| Freelancer pay | Admin orders: manual financial claims (budget = payout). Fazat settlements for partner orders. | 50% net split engine = gate; build configurable, keep current rule active. |
| RBAC | Roles super_admin/admin/client/freelancer/financial_user + `dashboard.admin.*` permissions | Map Ops Manager→admin(+perms), Accountant→financial_user, Employee→financial_user/admin; no new roles in S1. |
| Web i18n | AR/EN/DE/NL/RO, parity tests | Every new string in all five. |
| Flutter | AR/EN only; client_orders + freelancer features; consumes `/client/orders` | Server-side visibility gives activated customers the order; Flutter UI tweaks (managed-order badge, hide client actions) in S4. Guest never uses the app. |
| WhatsApp freelancer intake (Path C) | `external_order_intakes` → canonical order | Untouched. Its orders get `order_channel='whatsapp'` (provable backfill). |

## Matrix

Legend: ✅ exists · 🟡 partial · ❌ missing · ⚠️ policy gate. Phase = implementation phase.

| # | Spec requirement | State | DB / migration | Web | Flutter | Risk | Phase |
|---|---|---|---|---|---|---|---|
| 1 | Three explicit customer modes at admin create | ❌ | orders.customer_mode | wizard step | — | M | S1 |
| 2 | Guest = no users row / OTP / link | ❌ | guest_contacts + CHECK | guest form | none (by design) | H | S1 |
| 3 | guest_contacts minimal record + retention | ❌ | new table | — | — | M | S1 |
| 4 | orders.customer_user_id / guest_contact_id consistency | ❌ | columns + CHECK (NOT VALID→VALIDATE) | — | — | M | S1 |
| 5 | created_by_admin / account_manager_admin | 🟡 (created_by_user_id) | account_manager_admin_id | selector + change | — | L | S1 |
| 6 | Existing account lookup (privacy-minimised) | ❌ | — | search | — | M | S1 |
| 7 | New account → pending activation → same order | ❌ | order_customer_invitations | claim page | visibility via API (S1), UI polish S4 | H | S1 |
| 8 | Existing phone → link after verification, no duplicate | 🟡 (no phone identity) | — | warning to admin, claim requires login | — | M | S1 (+gate) |
| 9 | Guest admin ownership, no fake client | ❌ | — | — | — | L | S1 |
| 10 | WhatsApp templates / copy helpers | ❌ | — | copy dialog (5 langs) | — | L | S1 |
| 11 | Guest → account later (same order, audited) | ❌ | invitation purpose guest_conversion + events | admin action | — | H | S1 |
| 12 | Freelancer never sees guest contact | ✅ (mapOrderBase has no customer fields) | — | — | — | — | S1 verify |
| 13 | Order channel enum | ❌ | orders.order_channel | selector + filter | — | L | S1 |
| 14 | Same canonical Order ID for all modes | ✅ order_code | — | — | — | — | — |
| 15 | Configurable catalog: code, unit, price mode, visibility, localized | 🟡 categories only | service_definitions | admin catalog UI | read-only | M | S2 |
| 16 | Dynamic form builder (14 field types) + versioned schema | ❌ | service_form_versions | renderer | S4 | M | S2 |
| 17 | Form snapshot on order (immutable) | ❌ | order_form_snapshots | — | — | M | S2 |
| 18 | Multi-service order items | 🟡 extra_category_ids | order_items (design, later) | — | — | H | S3+ (design only) |
| 19 | Spec FSM vs current statuses | 🟡 | derived `customer_pricing_status`; no rewrite | — | — | H | S1 map / S3 |
| 20 | Transition audit (who/why/when) | 🟡 per-domain events | order_customer_events (S1), order_events (S3) | — | — | M | S1/S3 |
| 21 | Quote model (id, version, expiry, tax, approval) | ❌ | order_quotes / versions | quote panel | S4 | M | S3 |
| 22 | Stripe guest payment link (server-confirmed) | 🟡 client checkout only | reuse webhook, new session kind | link generator | — | H | S3 |
| 23 | Manual documented payment | 🟡 skipped_by_admin | quote payment record | — | — | M | S3 |
| 24 | Assignment / pool / direct assign | ✅ | — | — | — | — | — |
| 25 | Freelancer accept / reject with deadline | 🟡 (pool claim/bid; direct assign = immediate in_progress) | assignment offers | — | S4 | H | S3 |
| 26 | Financial terms snapshot on acceptance | ❌ | terms snapshot | — | — | M | S3 |
| 27 | Delivery / revision / R2 | ✅ | — | — | — | — | reuse |
| 28 | Gross→Tax→Fees→QC→Costs→Net→shares (Decimal) | ❌ | settlement preview tables | finance view | — | H | S5 ⚠️ |
| 29 | AED/JOD with dated FX snapshot | 🟡 display only | fx_rate_snapshots | — | — | H | S5 ⚠️ |
| 30 | Tax treatment profiles | ❌ | tax_profiles (disabled) | — | — | H | S5 ⚠️ |
| 31 | Quality-check costs (success only) | ❌ (no integration) | cost_entries | — | — | M | S5 ⚠️ |
| 32 | Append-only ledger / reversal entries | 🟡 (work-token ledger, claims history) | settlement_entries | — | — | H | S5 |
| 33 | Employee reward pool (company share only) | ❌ | pool periods/weights/allocations | admin + employee view | — | H | S6 ⚠️ |
| 34 | Weights = 100.00% gate, closed periods immutable | ❌ | — | — | — | M | S6 |
| 35 | Granular permissions (assign, price_override, share_change, pool_weight_edit, payout_approve) | 🟡 dashboard.* perms | permission keys | — | — | M | S3/S6 |
| 36 | Reports: channel, mode, guest volume, activation conversion | ❌ | aggregate queries | admin summary | — | L | S1 (base) / S6 |

## Spec status → current status mapping (no rewrite)

| Spec | Current canonical |
|---|---|
| draft | `draft` (archived) |
| waiting information / review | admin-side note; order not created until admin saves (S1) |
| waiting pricing | `customer_pricing_status = pending_pricing` (orthogonal to order_status) |
| waiting customer approval / payment | S3 quote status (`issued` / `accepted`) + `payment_status` |
| ready for assignment | `published` / `open_for_bids` (pool) |
| waiting freelancer acceptance | S3 assignment offer `pending` |
| in progress | `in_progress` / `assigned` / `ready_for_work` |
| quality review / ready for delivery | `pending_client_review` (admin review for admin orders) |
| revision needed | `in_progress` + `client_revision_note` |
| delivered / closed | `completed` |
| cancelled / refunded | `cancelled` / `payment_status=refunded` |
| disputed / paused | not in Production — S3 decision gate (no silent new status) |

## Policy gates (current rule stays active)

| Gate | Spec proposal | Active default |
|---|---|---|
| G1 Phone OTP provider | SMS/WhatsApp OTP | One-time signed claim link sent by admin via WhatsApp + existing email-verified account |
| G2 Base currency | AED | JOD (orders.budget); customer price explicit JOD or AED, no FX recompute |
| G3 Freelancer share | 50% of net | Current: freelancer compensation = admin-set budget (manual claims) |
| G4 VAT | taxable/zero/exempt/out-of-scope | No tax applied; architecture only, feature-flag off |
| G5 Stripe fees source | actual balance-transaction fees | Not deducted from freelancer pay today |
| G6 Quality checks | 3 × 2 AED | No licensed integration exists; costs recorded only when a real check succeeds |
| G7 Employee pool | 5% of company share, monthly | Disabled; preview-only until approved |
| G8 Invoicing entity / principal vs agent | — | Unchanged |
| G9 Disputed / paused statuses | side paths | Not introduced without approval |
| G10 Official app links | — | Existing footer app-download links |

## S1 scope (this phase)

Customer modes + guest contacts + guest orders + new-account claim + guest→account conversion +
order channel + account manager + customer pricing status + WhatsApp copy templates + base
channel/mode report. Path A (internal admin order with no customer), Path B, Path C unchanged.
