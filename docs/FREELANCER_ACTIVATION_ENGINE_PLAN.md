# Freelancer Activation Engine — Phase A0 Plan

**Status:** analysis and implementation planning only.  
**Date:** 2026-08-19  
**Scope:** Free Trial → Paid Silver funnel (not “20 free bids” as a standalone perk).  
**This document does not authorize feature code, migrations, git, deploy, or production writes.**

---

## 1. Executive summary

OrderzHouse already has most of the **commercial and marketplace plumbing** for a freelancer trial:

| Product intent | Closest existing asset |
|---|---|
| 10-day trial | Marketplace **STARTER** plan: `cycle_duration_days = 10` |
| 20 bids | `monthly_bid_allowance = 20`, `bid_distribution_mode = full_cycle` |
| Daily bid limit 2 | `daily_bid_spend_limit = 2` + `marketplace_freelancer_daily_bid_spend` |
| One-time trial | `is_one_time_starter` + `assertStarterNotAlreadyConsumed` |
| Silver = 19 JOD | Marketplace **SILVER** plan: `monthly_price_jod = 19`, 30 days, 40 bids, daily 3 |
| Mini Article Bid | `marketplace_articles` + applications + min-bids rounds + Bid reserve/consume |
| Win / write / review / publish | Application statuses + manuscripts + settlement + Bildazo publish |
| Earned (non-withdrawable) balance | `marketplace_article_financial_entries.writer_starter_pending` |

What is **not** built is a dedicated **Activation Engine**: trial state machine (`TRIAL_ACTIVE` → … → `ARCHIVED`), campaign **waves**, trial **work cap**, unique-freelancer **activation fairness**, funnel **KPIs**, global **emergency stop**, and **Work Inventory Reserve**.

**Safest domain strategy:** keep STARTER membership + Bid Credits + Mini Article settlement as the source of truth for money and bids. Add **additive** activation-engine tables and flags. Do not overload `freelancer_subscriptions`, Stripe, `ordersService`, Pantry, wallet/claims, or Bildazo write paths.

**Recommended next coding phase:** **A1 — Trial foundation/settings** (fail-closed flags, trial row/state, no Bid grant changes, no Stripe).

---

## 2. Existing assets to reuse (do not rebuild)

### 2.1 Marketplace membership (canonical trial/paid catalog)

- Plans: `marketplace_membership_plans` (migrations **134**, **153**).
- Specs: `backend/src/constants/marketplaceMembershipPlans.js` (`E1_PLAN_SPECS`).
- Current memberships: `freelancer_marketplace_memberships` + cycles (**137**).
- Starter activation: `activateStarterMembership` in `marketplaceMembershipActivationRequestService.js`.
- One-time: any historical Starter membership blocks recycle (`STARTER_ENTITLEMENT_ALREADY_USED`).
- Paid path: `marketplace_membership_activation_requests` (company approval; **not** Starter).
- After legacy account activation: `ensureMarketplaceMembershipAfterAccountActivation` may grant Starter once.

**Canonical Silver (catalog, not a hardcoded Stripe product in this plan):**  
`tier_code = silver`, **19.000 JOD**, 30 days, 40 bids, daily spend 3, withdrawals enabled. Confirm production `id` before A6 (read-only verify script already exists: `backend/scripts/verifyMigration153ProductionPostApplyReadOnly.js`).

### 2.2 Bid Credits (not Work Tokens)

- Grants + ledger: **146**.
- Reservations / consume / release: **154** (`BID_RESERVE`, `BID_RESERVE_RELEASE`, `BID_RESERVE_CONSUME`).
- Article apply **reserves**; final approval **consumes**; non-winners **release** (return).
- Fail-closed: `article_applications_enabled` **and** `bid_credits_enabled`.
- Daily spend: `marketplace_freelancer_daily_bid_spend` + `marketplaceMembershipDailyBidSpendService.js`.

### 2.3 Mini Article Bid domain

- Listings: `marketplace_articles` (**145**, campaign columns in **154**).
- Applications: `marketplace_article_applications` (**149**, workflow statuses in **154**).
- Min bids / rounds: `opportunity_bid_collection_rounds` (**159**), `article_auto_assign_when_threshold_reached` default **FALSE**.
- Relist uniqueness: **161**.
- Fair ranking (rank only, no auto-assign): `articleFairDistributionAdapterService.js`. **Does not** persist into `fair_distribution_decisions` (`order_id` unique). Metrics are mostly **order-scoped**, not article-activation-scoped.

### 2.4 Manuscript, review, Bildazo (read only in later phases)

- Author link: **164**, gate before Bid reserve. Terms version `2026-08-18-v1` on **link** rows (`ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION`).
- Submissions: **166** (`submitted | revision_requested | approved | rejected`).
- Super Admin revision/approve routes already exist.
- Publish records: **165**; settlement outbox: `marketplace_article_bildazo_outbox`.
- Approval requires manuscript (`assertSubmittedManuscriptForApproval`).

### 2.5 Article money (do not wire into claims in A1–A5 without a product decision)

- Per-article campaign budget: `budget_total_jod`, `budget_spent_jod`, `target_article_count`, `accepted_article_count`, `campaign_stop_reason`.
- Settlements: `marketplace_article_settlements`.
- Ledger: `marketplace_article_financial_entries` (`writer_available`, `writer_starter_pending`, `reviewer`, `company`).
- Split utils: `marketplaceArticleMoney.js` (milli-JOD). Reviewer fee default **0.200 JOD**; company share default **30%**.
- Starter cash-out blocked in `financialClaimsService.js` (`STARTER_WITHDRAWAL_BLOCKED`). **Do not extend this service in A1–A7.**

### 2.6 Onboarding / training / verification (guidance vs gates)

- Onboarding CMS: **163** — banners/CTAs only; does **not** start a trial or grant Bids.
- “Training incomplete” = required **course assignments** complete (`onboardingConditionResolver.js`). Display-only.
- **Paid** membership request: fail-closed on `marketplace_membership_required_course_id` + `course_assignments.completed_at`.
- **Starter** path: verification (email + activation-fee when enabled), **not** the paid-course gate.
- Legacy “activate account”: `freelancer_subscriptions.activation_status` + activation fee — **orthogonal** to marketplace Starter trial. UI: `FreelancerActivateAccountPage.jsx`.

---

## 3. Gap analysis

### 3.1 Exists and should be reused

- Starter catalog numbers (10 / 20 / 2 / one-time / pending earnings).
- Silver catalog (19 JOD).
- Bid FEFO reserve → consume winner / release others.
- Mini Article apply, min-bids, relist, manual fair ranking, manuscript, revision, settlement, Bildazo publish + URL.
- Writer pending ledger rows (not a freelancer-facing “Earned Balance” product yet).
- Economy settings row (`marketplace_economy_settings`) as the natural home for new **flags**.

### 3.2 Partially exists (extend, do not replace)

| Need | Partial today | Gap |
|---|---|---|
| Trial duration / bids / daily cap | Plan columns + daily spend table | No dedicated trial record or funnel states |
| One-time | Any past Starter membership | No `ARCHIVED` / reactivation window semantics |
| Article lifecycle | Split across article status, round status, application status, submission, publish, settlement | No single enum `AVAILABLE → … → FINANCIAL_SETTLED` |
| Campaign budget | Per **article** total/spent | No reserved vs remaining vs wave daily budget |
| Waves | None | Missing entity |
| Min qualified bidders | Collection rounds + settings | Exists for articles; not wave-level |
| Fair unique activation | Lexicographic fair adapter using **order** history | Does not maximize unique **trial** winners |
| Work cap (e.g. 2 accepted) | Campaign `accepted_article_count` vs `target_article_count` | Not a **per-freelancer trial** cap |
| IP / terms per article | Author-link terms version | Submissions do not snapshot IP/terms |
| Reviewer share | Financial entry `reviewer` posted at settlement | Not a payout pipeline; do not change claims |
| Emergency stop | Per-article `campaign_stop_reason` | No global pause-new-assignments flag |
| Funnel KPIs | Scattered membership/application counts | No Activation Engine dashboard |
| Training → trial | Courses + onboarding copy | Starter can start **without** paid-course completion |

### 3.3 Missing

- Trial lifecycle: `TRIAL_ACTIVE → TRIAL_EXPIRED_HIGH_INTENT → DORMANT → FINAL_REACTIVATION_WINDOW → ARCHIVED`.
- Campaign parent entity (budget in JOD, used / reserved / remaining) spanning many articles.
- Waves (dates, freelancer slots, daily budget/articles).
- Trial successful-work cap enforcement.
- Freelancer-visible Earned Balance UX bound to pending article entries (without claims).
- Silver conversion CTA + conversion events.
- Admin section **Freelancer Activation Engine**.
- Work Inventory Reserve % from subscriptions.
- Funnel analytics store / snapshots.

### 3.4 Must not be touched (hard)

- Stripe webhook handlers and subscription billing logic.
- `ordersService` and order assignment/payment flows.
- Payment / JOD wallet / **financial claims** implementation (read-only until an explicit later decision).
- Pantry min-bids / pantry fair ranking.
- Bildazo integration **writes** (author link, publish, S2S) — read existing services only.
- Work Token revival.
- Unique application constraint hacks.
- Production migrations, `db push`, reset, data cleanup, git add/commit/push, deploy.
- Existing Bid/min-bids/fair-ranking/manuscript/publish **rewrites**.

---

## 4. Safest domain model

Keep two layers:

1. **Commercial layer (existing):** `freelancer_marketplace_memberships` on plan `starter` or `silver`. Owns duration, Bid allowance, daily spend, one-time Starter, withdrawal mode.
2. **Activation Engine layer (new, additive):** trial **state**, campaign/wave **inventory**, work cap, conversion events, KPIs, emergency stop. References membership + article applications; does not become a second Bid ledger.

### 4.1 Trial state

- One row per freelancer (`freelancer_activation_trials`).
- Bound to `freelancer_marketplace_memberships.id` when Starter is granted.
- `state` is engine-owned; membership `status` remains `active` / `expired` / `superseded`.
- Transitions are **time + events** (expire, first win, convert to Silver, admin archive). Never delete membership history.

### 4.2 Trial bids and daily limit

- **Do not** invent a second Bid wallet.
- Eligibility in A2 reads: current Starter membership + Bid available + daily spend remaining + engine not paused + work cap not exceeded + (product decision) Mini Article only.
- Reuse `reserveBidCreditsFefo` / consume / release.

### 4.3 Campaign / wave / article budget

- **Campaign** = funded inventory (JOD) and targeting, not a rewrite of `marketplace_articles`.
- **Wave** = dated slice: freelancer slots, daily article/budget caps, min qualified bidders.
- **Article** remains the listing. Optional `activation_wave_id`. Keep `article_value_jod` invariant. Keep existing `budget_total_jod` / `budget_spent_jod` as **listing-level** accounting until A3 maps campaign reserved/used into a **parent** ledger (additive entries, not mutating spent twice).

### 4.4 Work cap

- Counter on trial row: `accepted_article_count` (increment only on existing settlement/approval path, after A4/A5).
- Default product: **2** accepted articles during trial.

### 4.5 Earned balance

- **Display + engine totals** over `writer_starter_pending` (and later `released`) — do not insert `financial_claims` in A5.
- Conversion to withdrawable funds is **A6+** and only via existing membership upgrade rules (`starter_pending_release` already exists on Silver activation in settlement service). **Do not modify claims.**

### 4.6 Conversion events / analytics / emergency stop

- Append-only `activation_funnel_events`.
- Daily/hourly KPI snapshots optional in A7 (materialized from events + existing tables).
- Global flags on economy settings: `activation_engine_enabled`, `activation_pause_new_assignments`, `activation_emergency_stop`. Fail closed when unset.

---

## 5. Proposed schema (additive only — **do not migrate in A0**)

All names are proposals. Prefer `IF NOT EXISTS` / nullable flags in A1.

| Object | Purpose | Relates to | Phase | Risk |
|---|---|---|---|---|
| `marketplace_economy_settings.activation_engine_enabled` | Master fail-closed | existing singleton settings | **A1** | Low |
| `…activation_pause_new_assignments` | Stop new wins/assignments | settings | **A1** (used A4) | Low |
| `…activation_emergency_stop` | Hard stop (no apply + no assign) | settings | **A1** (used A4) | Low |
| `…activation_trial_duration_days` default 10 | Engine override vs plan | settings; **do not** change plan row in A1 | **A1** | Low if unused until A2 |
| `…activation_trial_bid_allowance` default 20 | Documentation/override | settings | **A1** | Low |
| `…activation_trial_daily_bid_limit` default 2 | Override vs plan | settings | **A1** | Low |
| `…activation_trial_work_cap` default 2 | Successful accepted articles | settings | **A1** | Low |
| `freelancer_activation_trials` | One-time trial record + state machine | `users`, `freelancer_marketplace_memberships` | **A1** | Medium (must not grant Bids) |
| Unique `(freelancer_user_id)` on trials | One trial lifetime | users | **A1** | Medium — align with Starter history |
| `freelancer_activation_trial_events` | State transitions audit | trials | **A1** | Low |
| `activation_campaigns` | JOD budget, dates, status | none at first; later articles | **A3** | Medium |
| `activation_campaign_budget_entries` | used / reserved / remaining ledger | campaigns | **A3** | Medium — do not double-count article `budget_spent_jod` |
| `activation_waves` | Wave budget, dates, freelancer count, daily caps | campaigns | **A3** | Medium |
| `marketplace_articles.activation_wave_id` nullable FK | Attach Mini Articles to a wave | articles | **A3** | Low if nullable |
| `marketplace_article_applications.activation_trial_id` nullable | Trace trial apply | applications, trials | **A4** | Low |
| `freelancer_activation_trials.accepted_article_count` | Work cap counter | trials | **A4** | Low |
| `marketplace_article_submissions.accepted_terms_version` + snapshot | IP/terms per manuscript | submissions | **A4 or A5** | Low |
| No new money tables in A5 if pending entries suffice | Earned Balance = SUM pending | `marketplace_article_financial_entries` | **A5** | Low if read-only |
| Optional `activation_earned_balance_snapshots` | UX cache | trials | **A5** later | Low |
| `activation_conversion_events` | Silver CTA outcomes | users, memberships | **A6** | Low — **no Stripe** |
| `activation_kpi_snapshots` | Admin dashboard | none | **A7** | Low |
| `activation_work_inventory_reserves` | % of subscription revenue reserved | campaigns; **read** subscription totals only | **A8** | **High** if it writes payment tables — keep isolated |

**Not proposed:** altering `financial_claims`, Stripe tables, `orders`, Pantry, Bid grant schema, Bildazo tables.

---

## 6. Proposed API / UI phases

### A1 — Trial foundation / settings

**Goal:** Engine settings + trial row + states. No eligibility on apply. No Bid grants. No UI funnel.

- **Backend likely:** `marketplaceEconomySettingsService.js`, settings validators/routes (super-admin economy), new `freelancerActivationTrialService.js` (create-on-Starter hook **behind flag**, default off), constants for trial states.
- **Frontend likely:** Super Admin economy settings form (flags + defaults) only if an existing settings page can take additive fields; otherwise backend-only in A1.
- **Tests:** settings fail-closed; trial unique; no Bid ledger writes; Starter activate still works when flag off.
- **Migration:** **yes** (settings columns + trial tables).
- **Production risk:** **Low** if flags default false and create-trial is no-op when off.
- **Acceptance:**
  - Flag off → zero behavior change on apply/activate/settle.
  - Flag on → Starter activation inserts trial `TRIAL_ACTIVE` without extra Bids.
  - One trial per freelancer; conflict with existing Starter history documented.
  - No Stripe, orders, Pantry, claims, Bildazo writes.

### A2 — Trial bids + eligibility

**Goal:** Apply path checks trial state, daily limit, remaining Bids, one-time, (optional) Mini Article only.

- **Backend:** `marketplaceArticleApplicationsService.js` (eligibility only), `marketplaceMembershipDailyBidSpendService.js` (reuse), Bid reserve already present — **do not change FEFO**.
- **Frontend:** freelancer articles page messaging (trial remaining bids/days) — copy only.
- **Tests:** expired trial cannot apply; daily 2; one-time; flag off bypass.
- **Migration:** no, unless extra columns needed.
- **Risk:** **Medium** (apply path). Keep fail-closed; never reserve twice.
- **Acceptance:** trial freelancer can apply only when `TRIAL_ACTIVE`, Bids available, daily cap OK, engine not emergency-stopped; non-trial paths unchanged.

### A3 — Campaigns / waves / budget

**Goal:** Parent campaign + waves; used/reserved/remaining; attach articles.

- **Backend:** new campaign/wave services + super-admin routes; article create/update optional `activation_wave_id`.
- **Frontend:** Admin **Freelancer Activation Engine** skeleton: campaigns/waves CRUD, budget remaining.
- **Tests:** budget cannot go negative; reserved vs spent; wave date windows.
- **Migration:** **yes**.
- **Risk:** **Medium**. Do not overwrite `article_value_jod`. Do not change settlement spent math until dual-ledger rules are explicit (recommend: campaign ledger is **authoritative for engine**, article columns remain listing-level).
- **Acceptance:** admin can fund a campaign, open a wave, see remaining JOD; articles can attach; no payment/claims changes.

### A4 — Mini Article trial assignment + Fair Distribution

**Goal:** Prefer unique **unactivated** trial freelancers; honor min bidders; reserve→consume/return unchanged; work cap; pause new assignments.

- **Backend:** `articleFairDistributionAdapterService.js` (additive ranking key: `trialActivationWinsCount` / never-won-trial first). **Do not** auto-assign unless product flips existing `article_auto_assign_when_threshold_reached` (leave default false). Assignment still admin/super-admin.
- **Frontend:** fair ranking panel extra column “trial unique”; pause banner when engine paused.
- **Tests:** two eligible trial users → never-won ranks above already-won; work cap 2 blocks further assign; pause blocks assign not review.
- **Migration:** maybe trial counters only.
- **Risk:** **Medium**. Ranking change must not affect Pantry/orders.
- **Acceptance:** min bids still required; Bid return for losers; winner reservation consumed only on existing approval path; unique trial maximization documented in rank payload.

### A5 — Earned Balance + article accounting

**Goal:** Freelancer sees pending earnings after accept/publish; IP/terms version on submission.

- **Backend:** read-only aggregator over `writer_starter_pending`; optional terms columns on **166** submissions. **Do not** call `financialClaimsService` writes. **Do not** change settlement math.
- **Frontend:** freelancer articles/earnings widget “رصيد مكتسب (معلّق)”.
- **Tests:** starter pending sum; Silver users still see `writer_available` separately; terms stored on submit.
- **Migration:** terms columns if not deferred.
- **Risk:** **Low** if read-only.
- **Acceptance:** after existing approval+settlement, freelancer sees pending JOD; no wallet claim created; reviewer entry remains recorded not paid out via new pipes.

### A6 — Silver conversion CTA

**Goal:** High-intent expired trial → CTA to Silver 19 JOD using **existing** paid membership activation request (company approval / existing payment UX). **Do not modify Stripe webhook.**

- **Backend:** trial state `TRIAL_EXPIRED_HIGH_INTENT`; conversion event insert; reuse `createActivationRequest` for `silver` plan id.
- **Frontend:** CTA on articles/dashboard; do not build a new checkout.
- **Tests:** CTA only in allowed states; one-time trial remains consumed; conversion event idempotent.
- **Migration:** conversion events table.
- **Risk:** **Medium** (commercial UX) but **low payment risk** if no Stripe/code path changes.
- **Acceptance:** clicking CTA opens existing Silver activation flow; trial does not grant a second Starter.

### A7 — Admin KPIs / dashboard

**Goal:** Funnel: register → verify → train → trial → apply → win → submit → approve → publish → earned → Silver.

- **Backend:** read aggregations + optional snapshots. No production backfill jobs required for v1.
- **Frontend:** Super Admin **Freelancer Activation Engine** dashboard.
- **Tests:** KPI SQL uses existing statuses; emergency stop visible.
- **Migration:** optional snapshots.
- **Risk:** **Low**.
- **Acceptance:** counts match sampled SQL; no writes to orders/payments.

### A8 — Work Inventory Reserve

**Goal:** Reserve a % of **subscription** revenue conceptually for Mini Article campaign funding.

- **Backend:** isolated reserve ledger; **read** subscription totals only; admin sets percent; does **not** move Stripe money, does **not** change `ordersService`.
- **Frontend:** admin reserve % + remaining inventory.
- **Tests:** percent bounds; cannot over-allocate campaigns.
- **Migration:** **yes**.
- **Risk:** **High** if anyone “posts” into wallet. Keep purely internal inventory.
- **Acceptance:** campaigns cannot open beyond reserved inventory; payment systems unchanged.

---

## 7. Risk notes

- **Two “activation” words:** legacy company activation (`freelancer_subscriptions`) ≠ marketplace Starter trial ≠ this engine. UI and admin KPIs must label them separately.
- **Starter auto-grant** after account activation (`ensureMarketplaceMembershipAfterAccountActivation`, `skipVerification: true`) can start a membership **without** email/fee/training. Engine A1 must not double-grant Bids; A2 must define whether that membership is `TRIAL_ACTIVE`.
- **Fair adapter** currently uses **order** workload. Changing sort keys can surprise admins; keep rank-only; no auto-assign.
- **Budget double-count** if A3 writes both campaign ledger and `budget_spent_jod` without a single owner.
- **Earned Balance vs claims:** starter pending is already a ledger. Pushing into claims/wallet would violate A0 constraints and withdrawal policy.
- **Bildazo:** publish and author-link are done. Engine must only **read** publish URL/status for KPIs.
- **Training:** paid-course gate is fail-closed when course id unset; Starter does not use that gate today.

---

## 8. Product decisions needed before coding (blockers for later phases)

| # | Question | Current evidence | Needed for |
|---|---|---|---|
| 1 | Does training completion **hard-block** Mini Article apply? | Courses exist; onboarding is display-only; paid membership requests require configured `course_assignments.completed_at`; **Starter does not**. | A2 |
| 2 | What is “verified”? | Membership: active freelancer + `email_verified` + activation fee when fee engine enabled. Onboarding also treats empty name as incomplete. Legacy `company_approved` is separate. | A1–A2 |
| 3 | Canonical Silver plan id/code? | Catalog `tier_code = silver` at **19 JOD**. Confirm production `id` read-only before A6. | A6 |
| 4 | Trial access: Mini Articles only, or also 1–10 JOD real orders (Starter E1)? | Starter `project_min/max` allows 1–10 JOD projects. Product funnel text is Mini Article only. | A2 |
| 5 | Earned Balance vs wallet/claims? | Recommend **pending article ledger only** until Silver; existing `starter_pending_release` on upgrade. Do not create claims in A5. | A5–A6 |
| 6 | Reviewer share paid now or recorded? | Recorded as `reviewer` financial entry at settlement (default 0.200 JOD). No new payout rail. | A5 |
| 7 | Legal terms version for **article submission**? | Author-link uses `2026-08-18-v1` (provisional copy, not counsel-approved). Submissions have no IP version yet. Need a product/legal version string. | A4/A5 |
| 8 | Should trial start automatically on Starter grant, or only after training? | Auto-grant exists post account activation. Funnel says register → verify → **train** → trial. | A1 |
| 9 | Global emergency stop vs per-article `campaign_stop_reason`? | Per-article stop exists. Engine needs global pause. | A1/A4 |
| 10 | Fair “unique activated” = unique **first Mini Article win**, or unique **any marketplace assignment**? | Adapter uses order metrics today. | A4 |

---

## 9. Recommended next coding phase: A1

Implement **only** A1 after this document is accepted:

1. Additive migration: economy flags (default **off**) + `freelancer_activation_trials` + events.
2. Map Starter activate → trial row **only when flag on**.
3. Super Admin can read/write flags (or SQL-admin only if UI deferred).
4. Tests proving flag-off is a no-op.
5. Still no apply-path changes, no Bid grant changes, no Stripe, no claims, no Bildazo writes, no git unless requested.

Do **not** start A2 until decisions **1, 2, 4, 8** are answered.

---

## 10. Do not touch list

- Stripe webhooks and subscription charge logic  
- `ordersService` and order payment/assignment  
- Wallet, JOD payments, **financial claims** write paths  
- Pantry  
- Bildazo S2S/author-link/publish **implementation** (read-only)  
- Bid FEFO reservation/consume/release rewrite  
- Min-bids / relist rewrite  
- Manuscript/approval rewrite  
- Work Tokens  
- Production DB writes, `migrate`/`db push`/reset, data deletion  
- `git add` / `commit` / `push` / deploy as part of A0  

---

## 11. A0 static checks performed

Read-only inspection of migrations **134–166** (membership, bids, articles, onboarding, Bildazo, submissions), membership/eligibility/settlement/fair-adapter services, onboarding resolver, activate-account UI, financial claims Starter gate, and existing docs under `docs/`. No tests run, no production connection, no schema changes.

---

## 12. Phase A1 implementation notes (2026-08-19)

A1 is **code + local migration file only**. The migration has **not** been applied to production (or any live database) in this phase.

### Schema actually added (migration `167_freelancer_activation_engine_a1.sql`)

- Columns on `marketplace_economy_settings` (defaults):
  - `freelancer_activation_engine_enabled` = **false**
  - `freelancer_activation_trial_duration_days` = 10
  - `freelancer_activation_trial_bids` = 20
  - `freelancer_activation_daily_bid_limit` = 2
  - `freelancer_activation_successful_work_cap` = 2
  - `freelancer_activation_requires_training` = true
  - `freelancer_activation_requires_verification` = true
  - `freelancer_activation_silver_plan_code` = `silver`
  - `freelancer_activation_archive_after_days` = 45
- Table `freelancer_activation_trials` — unique `freelancer_user_id`, statuses including `not_started` … `paid_active`, copied bid/duration/work-cap, funnel timestamps, work counts.
- Table `freelancer_activation_events` — append-only (`trial_activated`, `trial_activation_idempotent`, `trial_activation_blocked`).

No backfill. No DROP/TRUNCATE/DELETE.

### Engine flag behavior

- Default **off**.
- When off: `getFreelancerActivationTrialState` returns `status=not_started`, `canActivate=false`, `nextRequiredAction=none`, and **does not** query subscriptions/courses/memberships.
- `activateFreelancerTrialIfEligible` returns `FREELANCER_ACTIVATION_ENGINE_DISABLED`.
- Mini Article apply was unchanged in A1. **A2 adds a flag-gated eligibility hook** (skipped when the engine is off).
- Starter auto-grant / Bid grants are **not** hooked. Trial activation does not create memberships or credit Bids.

### Eligibility rules (when flag on)

- Freelancer + active account.
- Verification (setting default true): `users.email_verified` **and** current `freelancer_subscriptions.activation_status = company_approved`.
- Training (setting default true): if `marketplace_membership_required_course_id` is set, that course assignment must have `completed_at`; otherwise all `course_assignments` for the freelancer must be complete. If none are assigned and no required course id, training is **not** complete (fail closed).
- One trial row per freelancer. Terminal statuses (`trial_expired_high_intent`, `dormant`, `final_reactivation_window`, `archived`, `paid_active`) cannot start again. `trial_active` is idempotent.
- Paid current membership (`silver`/`pro`/`elite`) is treated as `hasActivePaidSilver` and cannot start a trial.
- Trial is **not** auto-started on Starter grant.

### APIs

- `GET /api/freelancer/activation-trial`
- `POST /api/freelancer/activation-trial/activate`
- `GET /api/super-admin/freelancer-activation/trials` (counts + recent + settings snapshot)
- `GET/PATCH /api/super-admin/freelancer-activation/settings`

### UI

- Freelancer articles page: status block **only if** `engineEnabled`. Shows status, days remaining, next action; optional Start trial. No earned-balance copy.
- Super Admin **full dashboard UI deferred** (endpoint exists). Settings PATCH is API-only in A1.

### Intentionally deferred from A1 (done in A2 or later)

A2 implements apply-path Mini Article eligibility, trial bid counting, daily limit, lazy expiry, and work-cap block. Remaining later: campaigns/waves (A3), unique-trial fair ranking (A4), earned balance (A5), Silver checkout (A6).

---

## 13. Phase A2 implementation notes (2026-08-19)

No new migration. Reuses 167 trial rows + existing `marketplace_article_applications` and Bid reservations.

### Where eligibility is enforced

`submitArticleApplication` in `marketplaceArticleApplicationsService.js`:

1. Article open + collection round intake (existing)
2. **Trial identity gate** (required / expired / paid bypass / Mini Article surface / work cap) — **before membership and before insert**
3. Existing membership access
4. Duplicate application short-circuit (**no extra Bid, no extra trial count**)
5. **Trial usage gate** (daily + total trial bids) — **before insert**
6. Insert application
7. Existing `reserveBidCreditsFefo` (still not consume)
8. Collection round count (existing)

Preview: `getArticleApplicationEligibility` returns the same trial `reason` codes when the engine is on.

### Engine off

`evaluateTrialMiniArticleApplyGate` returns `{ skipped: true, allowed: true }`. Settings/schema errors also skip. Existing apply, Bid reserve/consume/return, min-bids, and fair ranking are unchanged.

### Trial bid counting

No second Bid currency. Count unique Mini Article applications created on/after `trial.started_at`:

- Counts `pending`/`selected`/…/`approved` with reservation `active` or `consumed` (or no reservation row)
- Does **not** count `withdrawn`/`cancelled`
- Does **not** count `released` reservations (non-winner return)
- Duplicate application ids count once

Daily count uses the same Asia/Amman business date as membership daily Bid spend (`resolveBusinessSpendDate`).

### Work cap

Live count of `status = 'approved'` applications in the trial window, floored by `freelancer_activation_trials.accepted_work_count`. After settlement commit, `syncTrialWorkCountsAfterApproval` updates counters only (does **not** change settlement/Bildazo math). Block error: `FREELANCER_TRIAL_WORK_CAP_REACHED`.

### Expiry

Lazy: if `trial_active` and `now > ends_at`, update to `trial_expired_high_intent`, write `trial_expired` event, block with `FREELANCER_TRIAL_EXPIRED`. No cron. No archive.

### Paid bypass

Current usable membership `silver` / `pro` / `elite` skips trial restrictions.

### Errors (Arabic client messages + `meta`)

`FREELANCER_TRIAL_REQUIRED`, `FREELANCER_TRIAL_EXPIRED`, `FREELANCER_TRIAL_DAILY_BID_LIMIT_REACHED`, `FREELANCER_TRIAL_BID_LIMIT_REACHED`, `FREELANCER_TRIAL_WORK_CAP_REACHED`, `FREELANCER_TRIAL_MINI_ARTICLES_ONLY`.

Meta: `daysRemaining`, `trialBidsUsed`, `trialBidLimit`, `dailyUsed`, `dailyLimit`, `acceptedWorkCount`, `successfulWorkCap`, `nextRequiredAction`.

### Intentionally deferred

- A3 campaigns/waves/budget
- A4 unique-trial fair ranking / assignment
- A5 earned balance
- A6 real Silver checkout (UI placeholder only)
- Trial apply to Pantry/normal orders (Pantry untouched; trial users are Mini Article only)

---

## 14. Phase A2.1 — Trial Bid Credit Grant (2026-08-19)

**Status:** implemented in repo. Migration **168 is not applied to production** from this phase.

A2 could activate `trial_active` without spendable Bid Credits. A2.1 grants the configured trial Bids **once** through the existing Bid Credit ledger.

### Grant strategy

Safest existing function: `marketplaceBidCreditAccountingService.createBidCreditGrant`.

- Amount: `trial_bid_limit` copied from Activation Engine settings (`trialBids`, default **20**).
- Source: `freelancer_activation_trial` (new CHECK value in migration 168).
- Ledger event: `FREELANCER_ACTIVATION_TRIAL_GRANT`.
- Reason/reference: `freelancer_activation_trial` + trial id.
- Idempotency key: `activation_trial_bid_grant:{trialId}` (unique grant table key).
- Expiry: trial `ends_at` (existing grants require `expires_at` after `granted_at`). FEFO expire-on-reserve still applies after `ends_at`.
- A2 apply gates still cap daily/total usage even if other Bid grants exist.

No parallel Bid currency. Admin manual grants remain `admin_manual` / `ADMIN_BID_GRANT`. Apply still uses `reserveBidCreditsFefo` / release / consume unchanged; trial grants are just another FEFO inventory row (`source_type` is not filtered).

### One-time / idempotency

Migration **168** adds to `freelancer_activation_trials` (167 is not edited):

- `trial_bid_granted_at`
- `trial_bid_grant_reference` (grant id)
- `trial_bid_granted_amount`

Re-calling `activateFreelancerTrialIfEligible` on `trial_active` with those columns set does not insert another grant. If the grant row exists (idempotency hit) but trial columns are empty, activation **recovers** by stamping metadata only. Grant failure throws `FREELANCER_TRIAL_BID_GRANT_FAILED` and rolls back the activation transaction (trial is not left “ready” without Bids). Expired / archived / paid_active users cannot start another trial or receive another free grant. Silver upgrade does not call this grant path.

### Activation integration

`activateFreelancerTrialIfEligible`:

1. Engine off → refuse, no grant.
2. Create/get `trial_active` row.
3. `createBidCreditGrant` once.
4. Stamp grant columns.
5. Event `trial_bid_granted`.

Engine flag off remains a no-op for apply (A2) and refuses activation (A1).

### Visibility

- Freelancer status block: granted amount / trial limit, remaining trial applies (A2 usage), apply-ready when grant is recorded, safe grant-failure message.
- Super Admin trials overview already returns mapped trial rows, including the new grant columns.

### Intentionally deferred (after A2.1)

- Unique-trial fair ranking (A4)
- Earned balance (A5)
- Real Silver checkout (A6)
- Cron archive / reactivation window
- Pantry / normal-order trial apply

---

## 15. Phase A3 — Campaigns, Waves, and Budget foundation (2026-08-19)

**Status:** implemented in repo. Migration **169 is not applied to production** from this phase.

### Schema

Additive migration `169_freelancer_activation_campaigns_a3.sql` (167/168 untouched):

- `freelancer_activation_campaigns` — parent budget, share split, trial defaults, emergency stop / pause flags
- `freelancer_activation_waves` — dated slice with its own budget counters
- `freelancer_activation_budget_entries` — ledger types `budget_allocated | budget_reserved | budget_released | budget_used | manual_adjustment`
- Nullable FKs on `marketplace_articles` / `marketplace_article_applications`: `activation_campaign_id`, `activation_wave_id` (unused by apply/settlement in A3)

JOD columns use `NUMERIC(12, 3)` like article `budget_total_jod`. Remaining spendable budget is **computed**: `total - reserved - used`. Wave **unallocated** is `campaign.total - sum(non-archived wave budgets)`.

A3 writes `budget_allocated` audit rows on create only. It does **not** increment reserved/used and does not create Mini Articles.

### APIs (Super Admin)

Mounted on `/api/super-admin` with `requireSuperAdmin`:

- `GET/POST /freelancer-activation/campaigns`
- `GET/PATCH /freelancer-activation/campaigns/:id`
- `POST .../:id/pause|resume|emergency-stop`
- `GET/POST /freelancer-activation/campaigns/:id/waves`
- `PATCH /freelancer-activation/waves/:waveId`

Validation: non-negative budgets, share millis must sum to article total, wave budget ≤ unallocated, safe status transitions.

### UI

`/dashboard/super-admin/freelancer-activation`: A1 settings snapshot, campaign list/create, detail budget summary, waves, pause/resume, confirmation-protected emergency stop.

No freelancer-facing campaign UI.

### Emergency stop scope (A3)

Sets campaign `status=paused`, `emergency_stop_enabled=true`, `pause_new_assignments=true`, and pauses **active** waves. A3 itself did not yet block article apply or assignment.

A4.1 now enforces those flags on attached Mini Articles (see Phase A4.1).

### Intentionally deferred from A3 to later phases

- Budget reservation on assignment / spend on settlement (A4.2)
- Unique-trial fair distribution
- Auto article release
- Daily scheduler/cron

---

## 16. Phase A4.1 — Campaign/Wave attachment and pause guards (2026-08-19)

**Status:** implemented in repo. **No new migration.** Uses nullable FKs from 169. Migrations 167/168/169 are still not applied to production from these phases.

### Article attachment

Super Admin create/update (`POST/PATCH /api/super-admin/marketplace-articles`) may set optional `activationCampaignId` / `activationWaveId`.

- Campaign must exist; wave must belong to that campaign (wave-only infers campaign).
- Archived or completed campaign/wave cannot be attached.
- Unattached Mini Articles remain valid; attachment is not required.
- If 169 columns are missing locally, attaching IDs fails with `FREELANCER_ACTIVATION_SCHEMA_MISSING` instead of crashing lists.

On new application insert, `activation_campaign_id` / `activation_wave_id` are copied from the article when those columns exist. Duplicate application behavior is unchanged.

### Apply guard

When the Activation Engine is **on** and the article has `activation_campaign_id`, `submitArticleApplication` runs `assertActivationOpportunityOpen` **after** the duplicate short-circuit and **before** insert, Bid reserve, and collection-round increment.

- `emergency_stop_enabled` → `ACTIVATION_CAMPAIGN_EMERGENCY_STOPPED`
- `pause_new_assignments` or campaign `status=paused` → `ACTIVATION_CAMPAIGN_PAUSED`
- wave `status=paused` → `ACTIVATION_WAVE_PAUSED`
- outside configured campaign/wave `starts_at`/`ends_at` → `ACTIVATION_CAMPAIGN_NOT_ACTIVE` / `ACTIVATION_WAVE_NOT_ACTIVE`

Engine **off**, or articles without an activation campaign: guard is skipped (existing apply behavior).

Blocked apply does not insert a row, reserve Bid credits, or increment collection counts.

### Assignment guard

`POST /api/super-admin/article-applications/:applicationId/select` runs the same opportunity checks **before** fair-override and status change. Fair-ranking sort is unchanged. No auto-assign.

### Emergency stop scope (A4.1)

Emergency stop still only updates campaign/wave flags (A3). A4.1 **uses** those flags to block **new applications and Super Admin assignment** for Mini Articles attached to that campaign/wave. It does not reserve or spend campaign budget.

### UI

- Super Admin article create/edit: optional campaign/wave selectors (draft/active).
- Super Admin article cards: campaign/wave badge when attached.
- Campaign detail: linked articles count (0 if article FK columns are missing).
- Emergency stop copy states that it blocks new applications and assignment for linked articles.
- Freelancer apply errors map to Arabic copy (`تم إيقاف الحملة مؤقتًا من الإدارة.` / `تم إيقاف استقبال التقديمات لهذه الفرصة مؤقتًا.`) instead of a generic Bid error.

### Intentionally deferred from A4.1

- Unique-trial fair distribution
- Auto article release
- Daily scheduler/cron
- KPI dashboard

---

## 17. Phase A4.2 — Budget reservation, release, and use (2026-08-20)

**Status:** implemented in repo. Additive migration **170 is not applied to production**. 167/168/169 are unchanged and still not applied from these phases.

### Inspected lifecycle (do not guess)

- Assignment becomes official in `selectArticleApplication` when status is set to `selected` (and `assigned_at` when those columns exist), inside the existing BEGIN/COMMIT. `alreadySelected` returns without a second write.
- Final approval commits in `finalizeArticleApproval` (settlement insert, `marketplace_articles.budget_spent_jod`, application `approved`) then `finalizeArticleApplicationApproval` COMMITs. Bildazo publish runs **after** that COMMIT and is non-fatal.
- `request-revision` changes submission/application to `revision_requested` and **keeps the assignment**.
- `reject` previously allowed `pending` only. A4.2 also allows `selected` / `revision_requested` so assigned work can be voided before acceptance.
- Article `cancelled` now also voids `selected` / `revision_requested` applications. Article `closed` still leaves a selected winner in place.
- Existing `marketplace_articles.budget_spent_jod` is the E2 article-campaign field. Activation counters are separate and must not be added to it.

### Budget amount strategy

Canonical amount = campaign `article_total_value_jod` (A3 total article cost, e.g. 1.000 = freelancer 0.500 + company 0.300 + reviewer 0.200). Fallback: article `article_value_jod`, then `1.000`. A4.2 reserves/uses this **total** only. It does not pay reviewer/freelancer or change claims/wallet.

### Reserve point

After A4.1 pause/emergency guards and fair-override, **before** status → `selected`, in the same transaction:

- remaining = total − reserved − used (campaign counters; wave counters if linked)
- insufficient → `ACTIVATION_CAMPAIGN_BUDGET_INSUFFICIENT` / `ACTIVATION_WAVE_BUDGET_INSUFFICIENT` (no status change)
- else ledger `budget_reserved` + increment reserved counters + stamp application columns (if 170 applied)

Engine off or unattached article: skip (existing assignment).

If assignment fails after reserve, the transaction rolls back.

### Release point

Only if a `budget_reserved` entry exists and `budget_used` does not:

- Super Admin reject of `selected` / `revision_requested`
- Article status → `cancelled` (voids assigned work)

Ledger `budget_released`, decrement reserved. Bid reservation release still uses the existing helper. Revision-required does **not** release.

### Used point

Inside `finalizeArticleApproval` after settlement exists and application is `approved`, still before COMMIT and before Bildazo outbox. Moves reserved → used (`budget_used`). If Bildazo publish later fails, settlement and activation used stay committed.

If settlement already exists (retry), `markActivationBudgetUsed` is idempotent. If there was no reservation (legacy/manual), A4.2 writes `budget_used` with metadata `late_use_without_reservation` and increments used only when remaining room exists; it does not fail settlement.

### Idempotency strategy

1. Same transaction as assignment/settlement (rollback on failure).
2. Lookup existing ledger row by `application_id` + `entry_type` before insert.
3. Migration 170 unique partial indexes on reserved/released/used per application_id, plus stamp columns on `marketplace_article_applications`.

### Summary strategy

Source of truth = stored campaign/wave **counters** (`reserved_budget_jod`, `used_budget_jod`), not SUM(ledger). Ledger is audit. Remaining = total − reserved − used. Unallocated = campaign total − sum(non-archived wave budgets). Linked/assigned/accepted counts come from articles/applications FKs, not from money columns. Do not add activation used into `marketplace_articles.budget_spent_jod`.

### UI

Campaign detail: live total / reserved / used / remaining, allocated/unallocated, assigned/accepted counts. Wave list: reserved / used / remaining. Article admin card: not reserved / reserved / used / released. Insufficient assignment errors in Arabic. Freelancer UI does not show campaign budget.

### Intentionally deferred from A4.2

- Unique-trial fair distribution (A4.3)
- Auto article release
- Daily scheduler/cron
- KPI dashboard
- Work Inventory Reserve

---

## 18. Phase A4.3 — Unique Trial Fair Distribution (2026-08-20)

**Status:** implemented in this repo. **No new migration.** Does not auto-assign winners.

### Scoring strategy

Activation-linked Mini Articles (engine **on** + `marketplace_articles.activation_campaign_id`) keep existing eligibility and lexicographic fair-ranking **inputs**, then re-order eligible candidates to maximize unique trial freelancers activated.

Lexicographic priority (compare is the source of truth; numeric `score` is admin-facing only):

1. Trial-first boost: `trial_active` and not paid Silver/Pro/Elite.
2. Fewer accepted + published activation works (zero first).
3. No previous win (`selected` / `approved` / `revision_requested` on activation-linked applications, or trial work counters > 0).
4. Longer wait: earlier of `trial.started_at`, `trial.first_bid_at`, else application `submitted_at`.
5. Lower current assigned Mini Article workload (`selected` / `revision_requested` on activation-linked applications).
6. Training quality score **only if numeric**.
7. Category match **only if boolean**.
8. Deterministic tie-break: `applicationId` ascending (same family as existing adapter; **not** random).

Paid Silver/Pro/Elite applicants still appear. They do **not** receive the trial-first boost.

### Metrics used (no new tables)

| Metric | Source |
|---|---|
| `acceptedActivationWorkCount` | `freelancer_activation_trials.accepted_work_count`, maxed with approved activation-linked applications |
| `publishedActivationWorkCount` | trial `published_work_count`, maxed with `bildazo_article_publish_records` (`published` / `already_imported`) on activation-linked applications |
| `hasPreviousWin` | activation-linked application statuses above, or work counters |
| `activeAssignedWorkCount` | activation-linked applications in `selected` / `revision_requested` |
| `trialStartedAt` / `firstBidAt` | trial row |
| `trainingScore` | **not_available** (boolean course completion is not a quality score) |
| `categoryMatch` | **not_available** (`users.freelancer_categories` TEXT[] cannot be reliably matched to `category_id`) |

Missing schema / unsupported values return `not_available` and ranking continues. Scoring does not throw on garbage training/category input.

### Admin UI

Super Admin Mini Article applications panel shows compact Arabic badges when `activationFairRankingApplied` is true, for example: مرشح مفضل للتفعيل، أول فرصة عمل، لم يحصل على عمل مقبول سابقًا، عبء عمل منخفض، ينتظر منذ X أيام. Selecting a non-#1 candidate still uses the **existing** fair-override reason dialog; a subtle override note is shown but selection is not blocked.

### Non-activation fallback

Engine **off**, unattached articles, or missing campaign/trial schema: `rankArticleFairCandidates` lexicographic order is unchanged. `autoAssigned` remains false. Pantry ranking is untouched.

### Intentionally deferred from A4.3

- Auto article release
- Daily scheduler/cron
- KPI dashboard
- Earned Balance UX (A5)
- Work Inventory Reserve
- Silver conversion checkout

---

## 19. Phase A5 — Earned Balance UX and Submission Terms Snapshot (2026-08-20)

**Status:** implemented in this repo. Migration **171** is additive and **not applied to production**.

### Data source for earned balance

Read-only over existing E2 settlement ledger:

- `marketplace_article_financial_entries` where `entry_type IN ('writer_starter_pending', 'writer_available')`
- Amount displayed = campaign `freelancer_share_jod` when the application is activation-linked and that share exists; otherwise the ledger `amount_jod` (`writer_net_jod` freelancer share, **not** gross article value)
- Status: `pending` (starter pending), `settled_externally` (released/available), `voided`
- Published URL from `bildazo_article_publish_records` when status is `published` / `already_imported`

No `freelancer_activation_earned_balance_entries` table. Settlement already records freelancer share. A5 does not insert financial rows, claims, wallet increments, or Stripe objects.

### Why it is separate from wallet/claims

`writer_starter_pending` is non-withdrawable until existing paid-membership release. The freelancer UI is a **product view** of accepted Mini Article value. Withdrawal/claims remain the existing financial-claims flow (unchanged). Reviewer and company ledger rows are never returned to the freelancer.

### Freelancer API / UI

- `GET /api/freelancer/activation/earned-balance` — current user only (`beneficiary_user_id = req.user.id`)
- Compact panel on freelancer Articles page: الرصيد المكتسب / قيد المعالجة / helper copy / accepted+published counts / recent entries / فتح المقال when Bildazo URL exists
- No withdraw, claim, or wallet-transfer controls
- Empty list returns zeros
- Optional Super Admin `GET /api/super-admin/freelancer-activation/earned-balance` — campaign totals only (no other-user PII)

Trial expired + earned balance: Articles page still shows the trial Silver CTA placeholder **and** the earned-balance panel.

### Terms snapshot

Migration **171** adds nullable columns on `marketplace_article_submissions`:

`terms_version`, `terms_accepted_at`, `terms_accepted_ip`, `terms_accepted_user_agent`, `terms_snapshot_key`, `terms_text_snapshot`

Version: `mini_article_submission_terms_2026-08-v1`. New final-manuscript submits require checkbox acceptance. Resubmit refreshes the snapshot. Legacy rows without columns/values map to `termsAccepted: false` and do not crash. Freelancer/admin APIs do **not** expose raw IP.

**Legal review note:** stored Arabic copy is a **product placeholder** (`provisional_product_copy`). It is not lawyer-approved. Final ownership/publishing terms require legal review before production policy use.

### Intentionally deferred from A5

- Silver checkout / paid conversion (A6)
- Withdrawal/claims
- Reviewer payouts
- KPI dashboard (A7)
- Work Inventory Reserve (A8)
- Auto article release / daily scheduler

---

## 20. Phase A6 — Silver Conversion CTA and Checkout Handoff (2026-08-20)

**Status:** implemented in this repo. **No new migration.** Reuses A1 columns `silver_cta_first_shown_at` / `silver_paid_at` and append-only `freelancer_activation_events` (`event_type` is unconstrained `VARCHAR(64)`).

### Existing Silver / paid flow found (do not rewrite)

| Item | Finding |
|---|---|
| Canonical Silver | Marketplace catalog `tier_code = silver`, **19 JOD**, 30 days (`E1_PLAN_SPECS.silver` / `marketplace_membership_plans`). Settings key `freelancer_activation_silver_plan_code` defaults to `silver`. Production plan **id** is DB-specific — resolved at runtime via `getMarketplaceMembershipPlanByTierCode`. |
| Paid detection | Existing `loadPaidMembership`: current `freelancer_marketplace_memberships` with plan tier in `silver` / `pro` / `elite`, status `active` or `cancel_at_period_end`. |
| Marketplace paid start | `POST /api/freelancer/marketplace-membership/activation-requests` → `createActivationRequest` — **pending until Super Admin approve**. Period starts on approval only. **Not** Stripe Checkout for marketplace plans. |
| Legacy Stripe plans | Separate path: `POST /freelancer/subscriptions/checkout` + Stripe webhook for `freelancer_subscriptions`. Public/dashboard plans pages use that catalog. **A6 does not call Stripe checkout or modify webhooks.** |
| Frontend purchase UI | Freelancer marketplace membership card is presentational; Activation Engine A6 is the CTA that starts marketplace activation request. |

### Conversion API

- `GET /api/freelancer/activation/conversion` — eligibility + Arabic CTA copy + silver plan snapshot + paid membership flags. Runs `syncActivationPaidStatus` first.
- `POST /api/freelancer/activation/conversion/cta-viewed` — appends `silver_cta_shown` (+ `silver_checkout_viewed`); stamps `silver_cta_first_shown_at` only if null.
- `POST /api/freelancer/activation/conversion/start-silver-checkout` — appends `silver_payment_started`, then calls **existing** `createActivationRequest({ marketplacePlanId })`. Returns `{ handoff: "marketplace_activation_request", checkoutUrl: null, activationRequest, plansRoute }`. Does **not** create payment rows or card forms.

### CTA rules

Show when engine **on** and any of: `trial_expired_high_intent`, last 3 days of trial, work cap reached, first accepted/published work, earned balance pending &gt; 0, no remaining trial bid allowance.

Hide as primary when: paid Silver/Pro/Elite active, engine off, not freelancer, or next action is still verify/training/activation.

### Paid status sync

`syncActivationPaidStatus(userId)` — if marketplace paid membership is active and trial status is one of `trial_active` / `trial_expired_high_intent` / `dormant` / `final_reactivation_window`, set `paid_active`, `silver_paid_at` (if null), event `silver_paid_detected`. No-op if not paid. Called from conversion GET. **Not** wired into Stripe/PayTabs webhooks.

### Frontend

- `FreelancerSilverConversionCard` on freelancer Articles page (near trial block + earned balance).
- Starts checkout handoff via API; redirects only if a future `checkoutUrl` is returned; otherwise shows Arabic success for pending activation request + link to `/dashboard/freelancer/plans`.
- No card fields. Earned balance panel unchanged (no withdraw/claim).

### Super Admin

Compact counters on Activation Engine page from overview `conversion`: CTA shown, payment started, paid active, basic rate. Full KPI dashboard remains **A7**.

### Intentionally not changed

- Stripe webhook / PayTabs webhook
- `ordersService`
- Wallet / claims / payment records
- Settlement math / Bid Credit reserve-consume-return
- Pantry / Bildazo / article publish
- Work Inventory Reserve

### Deferred

- Full KPI dashboard (A7)
- Work Inventory Reserve (A8)
- Scheduler/cron
- Withdrawals/claims
- Stripe-backed marketplace Silver checkout (product decision; not in A6)

---

## 21. Phase A7.1 — Backend KPI Analytics API (2026-08-20)

**Status:** implemented in this repo. **No new migration.** Read-only aggregates over existing Activation Engine and marketplace article tables.

### Endpoint

`GET /api/super-admin/freelancer-activation/kpis`

Requires auth + Super Admin (`requireAuth`, `requireSuperAdmin`).

Query params:

| Param | Type | Notes |
|---|---|---|
| `campaignId` | optional positive int | Scopes cohort + article quality + earned pending + campaign budget |
| `waveId` | optional positive int | Scopes cohort; budget uses wave counters when set |
| `dateFrom` / `dateTo` | optional ISO dates | Applied to each metric’s event/milestone timestamp |

Invalid filters return `400` / `INVALID_KPI_FILTER`. Missing schema returns `schemaReady: false` with safe zeros/nulls (does not crash).

### Service

`backend/src/services/freelancerActivationKpiService.js` → `getFreelancerActivationKpis(filters)`.

Response sections: `funnel`, `rates`, `timing` (days), `articleQuality`, `financial`, `metadata` (`generatedAt`, `filters`, `unavailableMetrics`, `notes`).

No PII, no raw user rows, no external/payment provider calls, no writes.

### Data sources (reliable vs unavailable)

| Metric | Source | Reliability |
|---|---|---|
| trialActivatedUsers | `freelancer_activation_trials.started_at` | Reliable |
| firstBidUsers | `trials.first_bid_at` | Reliable |
| firstAssignmentUsers | Applications with selection/assignment statuses (`selected`…`approved` / `selected_at`) | Reliable (trials.`first_win_at` exists but is **never written**) |
| firstAcceptedWorkUsers | `trials.first_accepted_at` | Reliable |
| firstPublishedWorkUsers | `bildazo_article_publish_records` joined to applications | Reliable; trials.`first_published_at` unused |
| silverCtaShownUsers | Events `silver_cta_shown` + `trials.silver_cta_first_shown_at` | Reliable |
| silverPaymentStartedUsers | Events `silver_payment_started` | Reliable |
| silverPaidUsers | `paid_active` / `silver_paid_at` + event `silver_paid_detected` | Reliable |
| registered / verified / trainingCompleted | — | **Unavailable** (null + reason) |
| registeredToPaidRate | — | **Unavailable** |
| subscriptionRevenueJod | — | **Unavailable** (marketplace activation requests have no Activation Engine payment amount ledger) |
| campaign budgets | A3/A4.2 `freelancer_activation_campaigns` / `_waves` counters | Reliable |
| pendingFreelancerEarnedJod | A5 writer ledger (`writer_starter_pending` pending) | Reliable |
| costPerPaidFreelancer | used budget ÷ paid users | Null when paid=0 or used=0 |
| article quality | `marketplace_article_submissions` + publish records | Reliable when apps are activation-linked; global may include unlinked manuscripts (noted) |

### Why no UI in A7.1

A7.1 is backend-only so metrics and filters can be validated before charts/cards. Frontend KPI dashboard is **A7.2**.

### Deferred to A7.2 / A8

- **A7.2:** Super Admin KPI dashboard UI (cards, charts, table, on-page filters)
- **A8:** Work Inventory Reserve
- Scheduler/cron, withdrawals/claims, Stripe-backed marketplace Silver checkout

---

## 22. Phase A7.2 — Super Admin KPI Dashboard UI (2026-08-20)

**Status:** implemented in this repo. **Frontend/admin UI only.** No migration. Uses A7.1 `GET /api/super-admin/freelancer-activation/kpis`.

### Where

`/dashboard/super-admin/freelancer-activation` — section **مؤشرات محرك التفعيل (KPI)** via `FreelancerActivationKpiDashboard`.

API helper: `getSuperAdminFreelancerActivationKpisRequest(params)`.

### UI sections

| Section | Content |
|---|---|
| Filters | Campaign, wave (dependent on campaign), date from/to, refresh |
| Funnel cards | Activated → bid → assignment → accepted → published → CTA → payment started → Silver paid (Arabic labels) |
| Funnel table | Full funnel including registered/verified/training; unavailable → «غير متاح حاليًا» + reason when provided |
| Conversion rates | Trial/accepted/published → Silver; CTA → payment started; payment started → paid (null → «غير متاح», not fake 0%) |
| Timing | Average days to first bid/win/accepted/published |
| Article quality | Accepted/rejected/revision/published + rates |
| Financial | Budget total/reserved/used/remaining, pending earned, cost per paid, subscription revenue (null → unavailable) |
| Notes | Compact box for `unavailableMetrics` / `notes` |

### Behavior

- No campaign selected → global KPIs
- Campaign/wave/date filters passed as query params
- `schemaReady === false` → Arabic schema-not-ready message
- API error → «تعذر تحميل مؤشرات محرك التفعيل حاليًا.»
- No PII, no raw ledger rows, no chart library required (cards + table + simple progress bars)

### Deferred

- Scheduler/cron, auto article release
- Withdrawals/claims, reviewer payouts
- (A8 Work Inventory Reserve — see §23)



## 23. Phase A8 — Work Inventory Reserve (2026-08-20)

**Status:** implemented in this repo (additive). **Migration 172 not applied to production.** Internal accounting only.

### Purpose

Record how much of paid Silver/Pro/Elite marketplace membership **catalog value** is notionally allocated to future work inventory (campaign/wave funding later). This is **not** money movement:

- Does not pay freelancers
- Does not create claims or wallet balances
- Does not touch Stripe/PayTabs webhooks
- Does not create withdrawable balances

### Allocation formula

```
reserve_amount_jod = round_millis(plan_price_jod × reserve_percentage / 100)
```

Example: Silver catalog **19.000 JOD** × **50%** → **9.500 JOD**.

### Plan price data source

Paid active is detected the same way as A6 (`loadPaidMembership`: current membership + tier in `silver|pro|elite`).

**Amount source:** `catalog_plan_price` — from `marketplace_membership_plans.monthly_price_jod` when present, else `E1_PLAN_SPECS` catalog. Activation requests store approval/payment timestamps but **not** a trusted paid amount; company approval starts the membership period and is not Stripe proof. A8 therefore uses catalog price only.

### Settings

Global (migration 172 on `marketplace_economy_settings`):

| Setting | Default |
|---|---|
| `freelancer_activation_work_inventory_enabled` | `FALSE` |
| `freelancer_activation_work_inventory_percentage` | `50.000` (0–100) |

Allocation runs only when **Activation Engine enabled** and **reserve enabled**. Campaign `work_inventory_percentage` (A3) remains campaign-level metadata; A8 uses the **global** percentage for membership allocations.

### Ledger

Table: `freelancer_activation_work_inventory_reserve_entries`  
Idempotency key: `work_inventory_reserve:{membershipId}`  
Event: `work_inventory_reserve_allocated`

Service: `allocateWorkInventoryReserveForPaidMembership`  
Safe hook: after `syncActivationPaidStatus` confirms paid active (conversion GET path). Errors are swallowed so conversion/sync never breaks.

Reversal: `reverseWorkInventoryReserveForMembership` is a **deferred placeholder** (no auto refund/cancel wiring).

### Admin API / UI

- `GET /api/super-admin/freelancer-activation/work-inventory-reserve`
- Settings PATCH already on `/freelancer-activation/settings` (`workInventoryEnabled`, `workInventoryPercentage`)
- Super Admin page section **Work Inventory Reserve** (Arabic internal-accounting note)
- KPI financial: `workInventoryReserveAllocatedJod`, `workInventoryReserveActiveJod` (null + unavailable if ledger schema missing)

### Why separate from wallet / claims / payment

Wallet and claims are user-facing money obligations. Payment webhooks and providers settle real cash. This ledger is an **internal budget attribution** of catalog membership value toward future work inventory — no entitlement is created for freelancers.

### Deferred after A8

- Real refund/reversal integration on membership cancel/refund
- Scheduler/cron
- Auto article release
- Withdrawals / claims
- Reviewer payouts
- Campaign/wave assignment of reserve entries (`campaign_id` / `wave_id` columns reserved)

---

## 25. Phase A9.1 — Mini Article Operating Fund, Plan Pricing, Inventory (2026-08-20)

**Status:** implemented in repo. Migration **173 not applied to production.**

### What existed

- Campaign-level `article_total_value_jod` + freelancer/company/reviewer shares (169)
- A4.2 assignment budget reserve/use of **gross** article value
- A5 earned balance prefers campaign `freelancer_share_jod` when linked
- Freelancer card showed `articleValueJod` without Arabic “full value” / breakdown labels

### Added (173)

| Table | Role |
|---|---|
| `freelancer_activation_article_fund_entries` | Operating fund ledger (deposit/withdraw). **Separate from** A4.2 `budget_entries` |
| `freelancer_activation_plan_daily_allocations` | Per-tier daily caps + editable 50/30/20-style splits |
| `freelancer_activation_article_inventory_items` | Inventory templates before live release |
| Columns on `marketplace_articles` | `activation_*_share_jod`, `activation_plan_tier_code`, `activation_inventory_item_id` |

### Display rules

- Card: **قيمة المقال** = `total_article_value_jod` / `article_value_jod` (gross)
- Detail: total + صافي مستحقاتك + حصة التدقيق + حصة المنصة
- Earned Balance: freelancer share / ledger (not gross as withdrawable)
- Fund balance never exposed to freelancers

### Manual release

Super Admin “إنزال مقال”: creates live `marketplace_articles`, attaches campaign/wave, copies split, increments `released_count`. **No auto-assign.** A4.2 reserve still on selection. Assignment snapshot may override economy split from article activation shares.

### Deferred to A9.2 / A9.3

- Automatic daily release / recycle
- Automatic winner assignment + weighted selection
- Live released-articles monitoring tab
- Deeper settlement integration beyond share override mapping
- Scheduler/cron

---

## 26. Phase A9.2 — Daily Release Engine and Inventory Recycling (2026-08-20)

**Status:** implemented in repo. Migration **174 not applied to production.**

### Reused from A9.1

- `executeInventoryReleaseOnRunner` / manual inventory release
- Plan daily allocations + share split
- Article operating fund ledger (`daily_allocation` at release)
- Campaign/wave emergency + pause gates (`evaluateActivationOpportunityGate`)

### Added (174)

| Table | Role |
|---|---|
| `freelancer_activation_article_release_runs` | Preview/completed/skipped/failed run audit + day/tier idempotency |
| `freelancer_activation_article_release_items` | Per-article preview/released/skipped lines |

### Daily release strategy

- Capacity = min(floor(daily_budget / total_value), max_daily_articles) − already_released_today, then capped by fund balance
- `release_mode=daily_auto` only for programmatic daily_auto runs
- Super Admin **تشغيل الإنزال الآن** uses `runType=manual` and may include `manual` allocations
- Dry-run (`preview`) never inserts `marketplace_articles`
- Actual run creates published articles with campaign/wave/tier/shares/min bidders; **no winner assignment**
- Records operating-fund `daily_allocation` for released gross value (separate from A4.2 assignment reserve)

### Inventory recycling

- `recycle_when_inventory_empty=false` → stop with `inventory_empty` when no ready items
- `=true` → reuse `release_strategy=reusable` items under `max_releases`
- `one_time` never reuses after first release

### Deferred to A9.3 / A9.4

- Automatic winner assignment + weighted fair selection
- Live released-articles monitoring actions
- Cron / scheduler for unattended daily_auto
- `daily_allocation_released` for unused reserved capacity (if needed)

---

## 27. Phase A9.3 — Auto Winner Assignment and Weighted Fair Selection (2026-08-20)

**Status:** implemented in repo. Migration **175 not applied to production.**

### Inspection reuse

| Concern | Reused path |
|---|---|
| Manual select | `selectArticleApplication` (Super Admin POST …/select) |
| Non-winner Bids | `releaseApplicationReservation` → `releaseBidCreditReservation` |
| Min bidders | `opportunityBidCollectionService` threshold / `required_bid_count` |
| A4.2 reserve | inside `selectArticleApplication` before status flip |
| A4.3 ranking | recommendation only; A9.3 uses separate weighted lottery + fair override reason |

### Enablement (default OFF)

- Allocation: `auto_assign_enabled`, `auto_assign_mode` (`disabled` \| `weighted_fair`), `auto_assign_when_min_bidders_reached`
- Copied onto released `marketplace_articles` as `activation_auto_assign_*`
- Requires engine on, activation-linked article, campaign/wave open

### Trigger

After successful apply **COMMIT** (Bid already reserved): `maybeTriggerAfterApplication`.
Also Super Admin: `POST …/marketplace-articles/:id/auto-assignment/run`.

Concurrency: article `FOR UPDATE` + unique completed-run index per article.

### Weighted fair algorithm (`activation_weighted_fair_v1`)

- Boost: zero activation work, prior losses (extra after first), waiting days
- Penalty: prior wins, accepted/published work, active assigned load
- Seeded Mulberry32 lottery (reproducible)
- Audit: runs + candidates with weights/reason tags (admin only)

### Assignment execution

Calls existing `selectArticleApplication` with shared client + override reason.  
**Does not** auto-approve, settle, publish, or create claims/wallet rows.

### Deferred to A9.4

- Live released-articles monitoring tab / advanced admin actions
- Cron for unattended daily_auto release
- Deeper ops dashboards

---

## 28. Phase A9.4 — Live Released Articles Monitoring and Admin Actions (2026-08-20)

**Status:** implemented in repo. **No new migration** (reuses 167–175 tables).

### Monitoring API

- `GET /api/super-admin/freelancer-activation/live-articles` — list + summary + filters
- `GET /api/super-admin/freelancer-activation/live-articles/:articleId` — detail
- `POST …/run-auto-assignment` — reuses A9.3 `runAutoAssignmentForArticle`
- `POST …/release-another` — reuses A9.1 `releaseInventoryItem` for linked inventory

### UI

Fifth ops tab **متابعة المقالات**: summary cards, filters, live rows (`current / required`), auto-assign badges, safe actions (open/view apps, run auto-assign, release another). Links to existing marketplace articles applications panel for approve/reject/revision/Bildazo retry.

**Placement (product UX):** Article operations and monitoring are managed from Super Admin → **المقالات** (`/dashboard/super-admin/articles`), placed in the sidebar directly under **بيت المونة**. Legacy routes (`/article-management`, `/marketplace-articles`) redirect into this hub. Freelancer Activation remains for campaign/settings compatibility only and is no longer a primary sidebar entry for article tools.

### Privacy

Admin-only. Freelancer UI unchanged — no weights, fund balance, or admin actions exposed.

### Deferred after A9.4

- Cron/scheduler for unattended daily release
- Advanced cancellation/refund workflows beyond existing PATCH status
- Withdrawals / claims
- Reviewer payouts

---

## 24. Release readiness — A1–A8 integration review (2026-08-20)

**Status:** code complete locally; **not committed**; migrations **167–172 not applied** to production.  
**This section does not authorize deploy or production migration.**

### Schema / migrations (apply order)

| Order | File | Purpose |
|---|---|---|
| 1 | `167_freelancer_activation_engine_a1.sql` | Engine flags (default **false**), trials, events |
| 2 | `168_freelancer_activation_trial_bid_grant.sql` | Trial Bid grant source + trial grant columns |
| 3 | `169_freelancer_activation_campaigns_a3.sql` | Campaigns, waves, budget entries; nullable article/app FKs |
| 4 | `170_freelancer_activation_budget_a42.sql` | Application budget stamp columns + idempotent budget entry indexes |
| 5 | `171_marketplace_article_submission_terms_a5.sql` | Manuscript terms snapshot columns |
| 6 | `172_freelancer_activation_work_inventory_reserve_a8.sql` | WIR settings (default **false**) + reserve ledger |

All six are additive (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`). Constraint drops are only for recreating CHECK constraints on new columns — **no** `DROP TABLE` / `TRUNCATE` / `DELETE FROM`.

### Feature-flag behavior (fail-closed)

| Flag | Default | Effect when false |
|---|---|---|
| `freelancer_activation_engine_enabled` | **FALSE** | Trial gates, campaign/wave guards, activation fair ranking, budget reserve/use, conversion CTA, WIR allocation all **no-op / skipped** |
| `freelancer_activation_work_inventory_enabled` | **FALSE** | No WIR ledger writes even if engine on |

**Note:** After migration **171** + code deploy, Mini Article manuscript **terms acceptance** is required for submissions (A5). That path is **not** gated by the engine flag — stage it as a general manuscript UX change.

### Production migration checklist (do not run from this review)

1. Commit Activation Engine code + migrations 167–172 in a controlled PR (exclude `backend/.tmp/**`, logs, screenshots).
2. Apply **167→172 in order** on **staging** first; verify `schema_migrations` rows.
3. Confirm flags remain **false** after migrate.
4. Smoke with engine still **off**: Mini Article apply, Bid reserve/consume, settlement, Bildazo publish, membership/plans.
5. Enable engine **only on staging**; run one full trial→select→approve→publish→Silver CTA path.
6. Enable WIR **only after** paid-active sync is verified; confirm catalog-price allocation and idempotency.
7. Production: migrate with flags **false**, deploy code, re-verify smoke with flags false, then gradual enable.

### Safest activation order

1. Deploy code + apply migrations with both flags **false**  
2. Staging E2E with engine **on**, WIR **off**  
3. Staging WIR **on**  
4. Production migrate + deploy, flags **false**  
5. Production engine **on** (limited campaign)  
6. Production WIR **on** last  

### Still deferred

- Scheduler/cron  
- Auto article release  
- Withdrawals / claims  
- Reviewer payouts  
- Real WIR refund/reversal  
- Assigning WIR entries to campaigns/waves  


---

## 29. Phase A10 — Plan Upgrade Locks and Bid Outcome Policy (2026-08-20)

**Status:** implemented locally; **not committed**; **no new migration**.  
**Does not authorize production deploy.**

### Upgrade CTA

- Reusable FE component: `PlanUpgradeRequiredCta` (`/dashboard/freelancer/plans`).
- Shown only when plan/tier/value eligibility blocks the opportunity (pool `isLockedByPlan`, Mini Article `ARTICLE_ACCESS_LEVEL_INSUFFICIENT` / `ARTICLE_NO_USABLE_MEMBERSHIP`).
- Arabic copy: required tier when known (Silver / Pro / Elite), plus "رقِّ خطتك للحصول على هذا الطلب."
- **Not** shown for Bids, verification, training, Bildazo, campaign pause, or collection-closed reasons.
- Aligns with Silver conversion CTA (plans handoff); does not replace A6 checkout card.

### Bid outcome policy (real vs simulation)

Central helper: `marketplaceBidApplicationOutcomePolicy.js`.

| Event | Real opportunity | Simulation / training |
|---|---|---|
| Winner selected | Winner reservation remains until settlement consume | — |
| Loser / not selected | **Consume** (`lost_selection_consumed`) | Release (`simulation_closed_refund`) |
| Withdraw / admin reject | **Consume** (NONE refund) | Release |
| Article cancel / min bidders not met (no winner) | **Release** (existing no-selection refund) | Release as simulation closed |

- Does **not** rewrite Bid Credit FEFO; uses existing `consumeBidCreditReservation` / `releaseBidCreditReservation`.
- Duplicate applications still blocked by existing unique/idempotency keys (no second reserve/consume).
- Freelancer UI never says "fake" / "وهمي" / "Simulation". Neutral refund copy: "تم إغلاق الطلب وإعادة رصيد التقديم."

### Training pool expiry

- `fake_orders` applications **do not** reserve Bid Credits today.
- `expireStaleItems` calls `onTrainingPoolOpportunityExpired` (documented no-op for Bids).
- `refundPendingSimulationArticleReservations` ready for simulation-marked `marketplace_articles` if applications ever exist.

### Remaining gaps

- Wire Bid Credits onto training pool applications if product later requires reserved Bids on simulation orders.
- Live DB gate re-run for B5 loser consume after A10 (static + unit policy tests cover wiring).
- Order normal-application Bid path already consumes on apply (not reservation); A10 focus is Mini Article reservation outcomes.

---

## 30. Phase A11 — Freelancer Account Activation KYC Review (2026-08-20)

**Status:** implemented locally; **not committed**; migration **176** authored only (not applied to production).  
**Scope:** company account activation KYC (ID front/back + terms + Super Admin approve/reject).  
**Not** marketplace article activation, Bid Credits, Bildazo, Stripe/PayTabs, or Pantry.

See focused doc: [`docs/FREELANCER_ACCOUNT_ACTIVATION_KYC.md`](./FREELANCER_ACCOUNT_ACTIVATION_KYC.md).

### Summary

- Table: `freelancer_account_activation_requests` (private file keys only).
- Freelancer: `GET/POST /api/freelancer/account-activation*`.
- Super Admin: `/api/super-admin/freelancer-activation-requests` (+ secure file views).
- Immediate self-activate disabled for pending users; approval sets `company_approved` (A1 eligibility unchanged).
- Rejection stores reason; admin notes hidden from freelancer; resubmit allowed after reject.

### A11.1 hardening

- Staff `company-activate` gated: approved KYC **or** Super Admin override with reason + audit note.
- Admin plan assignment no longer auto-sets `company_approved`.
- Freelancer FE page no longer calls `/subscription/activate-account`.
- `backend/uploads/**` gitignored; uploads not served as public static.

---

## 31. Super Admin «المقالات» — single internal setup (product)

**Product:** `/dashboard/super-admin/articles` is the only operational surface for Mini Article fund / inventory / release / monitoring.

**Visible concept:** «المقالات» only — Super Admin does **not** select or manage multiple campaigns on this page.

**Internal implementation:** existing `freelancer_activation_campaigns` (and `campaign_id` FKs) remain for schema compatibility. Backend resolves one default via `getOrCreateDefaultArticleOperationsCampaign` (internal name: «إعداد المقالات الرئيسي»). Endpoints under `article-operations/*` and omitted `campaignId` on fund/inventory/release/live-articles use that default.

**Not changed:** KYC queue stays at «طلبات تفعيل المستقلين»; Stripe/PayTabs/orders/Pantry/Bildazo/Bid internals untouched.
