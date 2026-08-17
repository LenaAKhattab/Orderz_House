# Mobile Super Admin Scope Audit — Orderz House Flutter

**Date:** 2026-08-17  
**Mode:** Analysis + recommendation only. No product implementation, no backend changes, no migrations, no deploy, no git commit.  
**Constraint:** Mobile Super Admin is **not** a clone of the web Super Admin dashboard. It should focus on urgent actions, important notifications, and quick review flows.

Related: `docs/WEB_CLEANUP_AND_LOGIC_AUDIT.md` (web route inventory), `docs/MOBILE_API_READINESS.md` (Bearer vs cookie), `docs/MOBILE_FCM_PRODUCTION_SETUP.md` (FCM release hold).

---

## 1. Executive summary

Flutter can already authenticate a Super Admin with the existing mobile Bearer login (`X-Client-Type: mobile` + `Authorization: Bearer`). Public signup still blocks `super_admin` (correct). After login today, Super Admin is treated like a **client**: `HomeScreen` falls through to `ClientHomeScreen`, `MainShell` shows client/freelancer tabs, and the notification resolver **rejects** every `admin` / `super_admin` recipient and every `/dashboard/super-admin*` link.

The useful mobile product is an **Action Center**, not `SuperAdminVisitorsDashboard` (analytics/control-center charts).

**Phase 1 MVP (recommended):**

- Super Admin role routing + dedicated shell (Action Center, inbox, account).
- In-app notification inbox with Super Admin destination mapping.
- Urgent counters: activation queue, pending financial claims, unread notifications.
- Activation queue: list + approve (with confirmation).
- Financial claims: list + detail + limited status actions (note required for reject/freeze/in-person). **No** pricing editor, **no** payout/ledger.
- Pantry / article “ready for action” lists: **read-only** in Phase 1.
- Account settings reuse. Money display **JOD only**.
- No disk cache of admin/private lists.

**Keep web-only:** CMS, plan/package/economy editors, financial center + employee ledgers, training-orders, courses/ads composers, analysis charts, admin/rate-limit management, institutions, internal-order create wizard, bid-credit package editor.

**Notification gaps (do not implement in this phase):** pantry/article threshold and min-bids events currently notify the pantry request **creator** (`recipientRole: admin`) or the **freelancer**, not all Super Admins. `minimum_not_met` has **no** notification type today. FCM is code-ready but production-hold.

---

## 2. Web Super Admin page inventory

Sources: `frontend/src/constants/superAdminNav.js`, `frontend/src/App.jsx`, `frontend/src/constants/authRoutes.js`, `frontend/src/services/api.js`, `backend/src/app.js`.

Legend for **Mobile**: **A** Phase 1 implement · **B** later · **C** read-only summary · **D** web-only · **E** notification-only.

### 2.1 Requested pages

| Path | Purpose | Main actions | Primary APIs | Sensitivity | Shape | Mobile fit | Rec |
|---|---|---|---|---|---|---|---|
| `/dashboard/super-admin` | SA home = `SuperAdminVisitorsDashboard` (product analytics, KPIs, attention) | View charts/KPIs; jump to queues | `GET /api/superadmin/dashboard/home-fast`, `home-bundle`, `executive-kpis`, `home-intelligence`, PostHog visitors | High (ops + revenue) | Chart/KPI-heavy | Full page **no**. Attention counters **yes**. | **C** for KPIs; Action Center is **A** (not a clone) |
| `/dashboard/super-admin/analysis` | Deep analytics | Filter periods, inspect tables/charts | `GET /api/superadmin/dashboard/analysis`, intelligence/* | High | Table + charts | Desktop | **D** |
| `/dashboard/super-admin/orders` | Internal admin-created orders | List/filter, claims, assign, files | `GET/PATCH /api/admin/orders*` | High | Table-heavy | Desktop review | **D**; count on home = **C**; delayed-order alert = **E** later |
| `/dashboard/super-admin/orders/create` | Internal order wizard | Multi-step create | `POST /api/admin/orders` | High | Form-heavy | Needs desktop | **D** |
| `/dashboard/super-admin/plans` | Main + page plan catalogs | CRUD plans/features | `/api/admin/plans*`, plan pages | High (pricing) | Editor | Config, low frequency | **D** |
| `/dashboard/super-admin/marketplace-plans` | Marketplace membership plans | CRUD / reorder | `/api/super-admin/marketplace-membership-plans*` | High | Editor | Config | **D** |
| `/dashboard/super-admin/training-packages` | Training packages (WhatsApp, not IAP) | CRUD / reorder | `/api/super-admin/training-packages*` | Medium | Editor | Low frequency | **D** now; optional **B** read-only later |
| `/dashboard/super-admin/marketplace-economy` | Economy knobs (Bids, fairness, deadlines). Work Token fields forced off | Save settings | `GET/PATCH /api/super-admin/marketplace-economy-settings` | **Critical** | Form + risk | Web-only config | **D** |
| `/dashboard/super-admin/marketplace-articles` | Article campaigns, min-bids, fair ranking, select/reject/relist | Create/edit article; select application (`overrideReason`); relist | `GET /api/super-admin/marketplace-articles`, applications, `POST .../select`, `reject`, `relist-bid-collection` | High | Table + fair-rank UI | Actions later; queue list now | **C** Phase 1 list; **B** Phase 2 actions |
| `/dashboard/super-admin/bid-credits` | Packages, purchases, manual review, grant | Grant (`reason` required); resolve frozen purchases | `/api/super-admin/bid-credit-*` | High (credits) | Table + grant form | Hidden from sidebar; occasional | **D** editor; **B** Phase 4 quick grant |
| `/dashboard/super-admin/subscriptions` | Full subscription table | Assign, patch, payment-hold, fee settings | `GET /api/admin/subscriptions`, assign, patch, fee settings | High | Table-heavy | Desktop | **D**; pending count **C** |
| `/dashboard/super-admin/subscriptions/activation` | Company activation queue | Search, paginate, **approve** company activation | `GET /api/admin/subscriptions/activation-queue`, `PATCH .../:id/company-activate` | High | Card/list + action | Excellent | **A** |
| `/dashboard/super-admin/financial-center` | JOD ops ledger, employees, bonuses | Create/edit financial rows | `/api/superadmin/financial-center*` | **Critical** | Wide tables | Desktop + high risk | **D** |
| `.../financial-center/employees/:personId` | Employee financial detail | Ledger drill-down | same family | **Critical** | Detail tables | Desktop | **D** |
| `/dashboard/super-admin/financial-claims` | Freelancer claims review | Status, **pricing**, **payout** | `GET/PATCH /api/super-admin/financial-claims`, `PATCH .../pricing`, `POST .../freelancer-payments` | **Critical** | Table + modals | List/action yes; editor no | **A** limited status; pricing/payout **D** |
| `/dashboard/super-admin/onboarding` | Getting-started CMS | Edit onboarding content | `/api/admin/onboarding*` | Medium | CMS | Config | **D** |
| `/dashboard/super-admin/pantry` | Pantry requests, bids, fair rank, deliveries | Create/publish, accept/reject bid (`overrideReason`), approve/revision, relist | `/api/admin/pantry/requests*`, bids, deliveries | High | Table + files | Review flows yes; composer no | **C** Phase 1 queues; **B** Phase 2 actions |
| `/dashboard/super-admin/training-orders` | Training order rounds, templates, applications | Complex ops shell | `/api/admin` training-order family | High | Multi-page desktop | Too complex | **D** |
| `/dashboard/super-admin/courses` | Course composer | CRUD lessons, assign | `/api/admin/courses*` | Medium | Composer | Desktop | **D** |
| `/dashboard/super-admin/ads` | Popup/side ads composer | CRUD / publish / schedule | `/api/admin/ads*` | Medium | Composer + assets | Desktop | **D** |
| `/dashboard/super-admin/edit-website` | Website CMS (footer, FAQ, pages, how-it-works) | Rich text / media | `/api/super-admin/website*` | Medium | CMS | Desktop | **D** |
| `/dashboard/super-admin/settings` | Staff account: profile, password, notification prefs | Same as `StaffAccountSettingsPage` | `/api/profile/me`, password, prefs | Medium (PII) | Forms | Already have Flutter account settings | **A** reuse |
| `/dashboard/super-admin/notifications` | In-app inbox | List, read, unread count | `GET /api/notifications`, unread-count, mark read | Medium | List | Exists in Flutter; destinations blocked | **A** |

### 2.2 Extra web pages (not in the original list; still Super Admin)

| Path | Purpose | Rec |
|---|---|---|
| `/dashboard/super-admin/admins` | Delegated admin users / permissions | **D** — high risk, rare |
| `/dashboard/super-admin/rate-limit-exemptions` | Rate-limit allowlist | **D** — security config |
| `/dashboard/super-admin/feedback` (+ topics, `:id`) | Problems/suggestions | **E** (`feedback.created` already notifies SA); optional **B** inbox later |
| `/dashboard/super-admin/institutions` | Institution management | **D** |
| `/dashboard/super-admin/institutional-order-storage` (+ pending) | Storage + pending approvals | **D** now; pending-approvals could be **B** if ops need it |

---

## 3. Mobile suitability matrix

| Surface | A | B | C | D | E | Notes |
|---|---|---|---|---|---|---|
| Action Center home | ✓ | | | | | Counters + deep links into review screens |
| Notifications inbox | ✓ | | | | | Must unlock SA destinations; never for client/freelancer |
| Activation queue | ✓ | | | | | Paginated; approve + confirm |
| Financial claims review | ✓ | | | | | Status + note; no pricing/payout |
| Pantry ready lists | | | ✓ | | | Phase 1 read-only |
| Article ready lists | | | ✓ | | | Phase 1 read-only |
| Pantry approve/revision/select/relist | | ✓ | | | | Phase 2; override reason |
| Article select/reject/relist | | ✓ | | | | Phase 2; override reason |
| Platform order counts (open/in progress/done) | | | ✓ | | | From `home-fast` summary |
| Revenue / claims JOD snapshot | | ✓ | ✓ | | | Phase 3 summary only; never ledger edit |
| Bid credits grant | | ✓ | | | | Phase 4; reason + confirm |
| Full analytics / visitors | | | | ✓ | | `SuperAdminVisitorsDashboard` |
| Plans / economy / CMS / courses / ads | | | | ✓ | | Web configuration |
| Financial center / employee detail | | | | ✓ | | High risk |
| Training orders | | | | ✓ | | Desktop complexity |
| Internal order create | | | | ✓ | | Wizard |
| Pantry/article threshold push | | | | | ✓ | Types incomplete today (see §8) |

---

## 4. Recommended mobile information architecture

Do **not** reuse the five-tab client/freelancer `MainShell`. Super Admin should not see marketplace, client create-order, or freelancer courses as primary nav.

### 4.1 Super Admin shell (3–4 destinations)

1. **Action Center** (home)
2. **Notifications**
3. **Account** (profile, password, notification prefs, JOD display locked)
4. Optional later: **Queues** hub if Action Center becomes crowded

### 4.2 Action Center contents

Pull **live** (no SharedPreferences cache of admin payloads):

| Card | Source today | Phase 1 |
|---|---|---|
| Activation requests awaiting company approval | `home-fast.summary.attention.subscriptionsAwaitingActivation` **or** activation-queue `pagination.total` | Show count → list |
| Pending financial claims | `home-fast.summary.attention.financialClaimsPending` | Show count → list `status=pending` |
| Unread / failed-attention notifications | `home-fast.summary.attention.unreadNotifications` | Show count → inbox |
| Internal orders with pending claims | `home-fast.summary.attention.internalOrdersPendingClaims` | Count only; tap opens **web reminder** or Phase 2 (not a mobile orders table) |
| Pantry deliveries needing review | **Not in home-fast** | Client-side `GET /api/admin/pantry/deliveries?status=submitted` length (cap 200) **or** later DTO count |
| Pantry collections eligible for assignment / min not met | **Not in home-fast**; list has `bidCollection` extras | Filter `GET /api/admin/pantry/requests` (cap 200) **or** later DTO |
| Article collections eligible / min not met | **Not in home-fast**; article list has no `bid_collection_status` query filter | Fetch articles + inspect round **or** later DTO |
| Paid subscriptions needing follow-up | `home-fast.paidSubscriptions.needsFollowUpCount` | Count; full table stays web |
| Platform order snapshot | `home-fast.summary.platformOrders` | Read-only JOD-free counts |

Quick links: Activation · Claims · Pantry queue · Articles queue · Notifications.

### 4.3 Quick review screens (Phase 1)

- Activation: paginated cards (name, plan, payment/activation status) → confirm → `PATCH company-activate`.
- Claims: filter pending → detail → status change with confirmation; `adminNote` required for `rejected` / `frozen` / `requires_in_person_review`. Do **not** call pricing or freelancer-payments.
- Pantry/article queues: titles, counts, deadline, collection status. **View only.**
- Notifications: existing `NotificationsScreen` with Super Admin resolver.
- Account: existing account settings; hide client create-order / freelancer claims shortcuts.

### 4.4 Read-only summaries (Phase 1–3)

Phase 1: order counts + queue counts.  
Phase 3: JOD claims/revenue **snapshot** from existing intelligence financial section **if** sliced safely — still no ledger editing.

---

## 5. Phase 1 MVP scope

**Goal:** Super Admin can log in on Android/iOS, see what needs action today, approve activations, triage claims, and open the inbox — without cloning the web dashboard.

### Screens

| Screen | Role guard | Notes |
|---|---|---|
| `SuperAdminHome` (Action Center) | `super_admin` only | Counters + links |
| `SuperAdminNotifications` | reuse inbox + SA resolver | Block web URLs |
| `SuperAdminActivationList` + confirm sheet | `super_admin` | Approve only |
| `SuperAdminClaimsList` / `ClaimDetail` | `super_admin` | Status + note |
| `SuperAdminPantryQueue` | `super_admin` | Read-only |
| `SuperAdminArticleQueue` | `super_admin` | Read-only |
| Account / settings | reuse | Strip client/freelancer CTAs |

**Out of Phase 1:** pantry accept/approve, article select, override reasons, relist, bid grants, financial center, plans, CMS, analysis, training orders, delegated `admin` role.

### Flutter files to extend (document only — not implemented)

| Area | Current files | Needed |
|---|---|---|
| Role model | `lib/features/auth/domain/auth_user.dart` | `usesSuperAdminExperience` (`effectiveRole == super_admin`). Do **not** treat SA as client. |
| Home routing | `lib/features/home/presentation/home_screen.dart` | Branch to SuperAdmin home |
| Shell | `lib/features/shell/main_shell.dart` | SA destinations; hide marketplace/orders/courses |
| Router | `lib/core/router/app_router.dart` | SA routes; redirect non-SA away; redirect SA away from client/freelancer-only paths |
| Notifications | `lib/features/notifications/navigation/notification_action_resolver.dart` | Today `_hasRecipientRoleMismatch` returns **true** for `admin`/`super_admin` (always mismatch). Invert **only** when current user is Super Admin. Keep blocking `/dashboard/admin` and `/dashboard/super-admin` **web** paths; map to Flutter routes. |
| Profile | `lib/features/profile/domain/profile_actions.dart` | SA label exists; quick actions still client-shaped |
| Auth | `auth_repository.dart`, `secure_token_storage.dart`, `dio_provider.dart` | Reuse Bearer; no cookie; no weaker auth |
| API | new repositories under `lib/features/super_admin/` | Activation, claims, pantry list, articles list, home-fast |
| Money | currency display | Force JOD for Super Admin; do not use preferred display currency for admin amounts |
| Cache | ads dismiss / currency session cache | **Never** persist SA lists to SharedPreferences |

### Tests needed (Phase 1, when implemented)

- Login as SA never opens `ClientHomeScreen` / client create-order.
- Client/freelancer cannot open SA routes (router + API 403).
- Notification resolver: SA can open activation/claims; client cannot open SA payloads even if `actionUrl` is forged.
- Activation approve confirmation required; failed API surfaces Arabic `message`/`code`.
- Claims reject without `adminNote` blocked in UI (mirrors backend 400).
- No admin JSON written to SharedPreferences.

**Remains web-only in Phase 1:** everything in §7.

**Risk:** Medium. Actions exist on backend but are irreversible (activation, claim status). Mitigate with confirm dialogs and Super-Admin-only guards. Do not add new backend endpoints unless a tiny count DTO is approved later.

---

## 6. Phase 2+ scope

### Phase 2 — Pantry + Article action flows

**Screens:** pantry request detail, bid list + fair ranking, accept/reject with override reason, delivery approve/request-revision (files), relist with reason; article applications + fair ranking + select/reject/relist.

**APIs:** existing `/api/admin/pantry/*` and `/api/super-admin/marketplace-articles*` / `article-applications*`.

**Risk:** High — fair-selection override, bid credits already reserved, file URLs. Must collect `overrideReason` when not selecting rank 1. No auto-assign.

**Tests:** override required when recommended ≠ selected; freelancer never sees admin pantry endpoints; delivery revision message required.

**Still web-only:** pantry **create/publish** composer, article **create/edit** campaign editor, economy settings.

### Phase 3 — Financial / subscription summaries

**Screens:** JOD-only snapshot (pending claims value, paid this period if already in intelligence), activation/subscription **counts** (not full table).

**APIs:** slice of `home-fast` / `home-intelligence` financial — **or** a future slim DTO. Do not call financial-center write APIs.

**Risk:** High if full intelligence payload is cached or shown to wrong role. No ledger editing, no `freelancer-payments`, no pricing PATCH.

**Still web-only:** financial center, employee detail, subscription assign/patch, activation-fee settings, mark-paid-offline.

### Phase 4 — Optional admin tools

- Bid credits **quick grant** (`POST /api/super-admin/bid-credits/grants` — `reason` + `expiresAt` required) and frozen-purchase review.
- Training packages **read-only**.
- Ads/courses: still prefer web; only if a tiny “pause ad” action is proven necessary.

**Still web-only:** package/plan editors, CMS, rate limits, admins, analysis charts.

---

## 7. Web-only exclusions

| Page / feature | Why web-only |
|---|---|
| Full SA home analytics (`SuperAdminVisitorsDashboard`, PostHog, executive KPIs) | Table/chart-heavy; low mobile action value |
| `/analysis` and intelligence drill-downs | Needs desktop review |
| Internal orders list + create wizard | Table-heavy; create is multi-step; `ordersService` must not change |
| Plans, marketplace plans, training package editors | Web-only admin configuration; pricing risk |
| Marketplace economy | High risk; leftover Work Token knobs must stay off |
| Article/pantry **composers** (create/edit campaign) | Desktop forms; min-bids acknowledgement UX |
| Bid-credit **package** CRUD | Config; grant can wait until Phase 4 |
| Full subscriptions table, fee settings, assign plan, mark-paid-offline | Table-heavy + payment-adjacent; do not change subscription backend |
| Financial center + employee detail | High risk, table-heavy, JOD ledger |
| Claims **pricing** + **payout** | Payment/wallet-adjacent; stay web |
| Onboarding CMS, edit-website CMS | Web-only configuration |
| Courses / ads composers | Desktop + media |
| Training-orders shell | Too complex; low frequency on phone |
| Admins + rate-limit exemptions | Security / high risk |
| Institutions + storage (except maybe later pending-approvals) | Desktop |
| Delegated `admin` mobile app | Out of scope; Super Admin only |

---

## 8. Notification priority matrix

### 8.1 Current plumbing

- In-app: `GET /api/notifications` (any authenticated user, **own** rows only). Flutter already uses this.
- Push: `notificationService` queues FCM via `fcmPushService`. Payload: `notificationId`, `type`, `entityType`, `entityId`, `actionUrl`, `recipientRole`. **Production hold** (`docs/MOBILE_FCM_PRODUCTION_SETUP.md`). In-app inbox still works.
- Device tokens: `POST /api/devices/push-token` (any auth role, including Super Admin) — safe to register when FCM is enabled.
- Flutter resolver **currently drops** SA notifications (`recipientRole` admin/super_admin → mismatch) **and** blocks `/dashboard/super-admin*` links.

`notifyAdmins()` resolves **role `admin` only**, not `super_admin`. `notifySuperAdmins()` is separate.

### 8.2 What Super Admin already receives

| Type | Recipient | Notes |
|---|---|---|
| `financial_claim.created` (+ status/pricing/paid) | `super_admin` | Good for Phase 1 |
| `subscription.company.activation.pending` | `admin` and sometimes `super_admin` (Stripe webhook paths) | Also **email** via `subscriptionAdminNotificationService` (not push) |
| `feedback.created` | `super_admin` | P3 unless product wants inbox |
| `plan.created/updated/deleted` | `super_admin` | P3 |
| `bid_pool.returned_unused` | `super_admin` | Economy; P3 / web |
| `article_campaign_auto_stopped` | `super_admin` | P2 |
| `order.applications.admin_review_required` | admin + SA (normal-order deadline policy) | P2; destination is web orders |

### 8.3 Gaps (recommended later — do not implement now)

| Event | Today | Gap |
|---|---|---|
| New pantry bid / target reached / delivery submitted | `recipientUserId` = pantry **creator**, `recipientRole: admin`, link `/dashboard/super-admin/pantry` | Other Super Admins may see **nothing**. Role is `admin`, which Flutter currently treats as mismatch. |
| Pantry / article **minimum not met** | Collection status updates in DB | **No notification type found** |
| Article bid threshold / eligible for assignment | Freelancer gets `article_application_submitted` only | Super Admin **not** notified |
| Fair override / relist requiring review | Audit/log + UI | No dedicated SA push |
| Payment/refund operational failure | Some payment types exist for **client**; SA operational alerts are incomplete | Only add if an existing type already targets SA |

### 8.4 Priority matrix (target product)

| P | Event | Recipient | Destination (Flutter) | Action | Payload | Safety |
|---|---|---|---|---|---|---|
| **1** | New / pending company activation | `super_admin` | Activation list/detail | Approve on web or app | `entityType=subscription`, `entityId`, no secrets | Do not put payment tokens in payload |
| **1** | `financial_claim.created` or needs admin status | `super_admin` | Claim detail | Review status | `entityId=claimId` | Do not include bank details in push body |
| **1** | Pantry delivery submitted | all Super Admins (today: creator only) | Pantry delivery/request | Approve/revision (Phase 2) | `pantry_request` / `pantry_delivery` id | File URLs stay behind auth |
| **1** | Pantry/article threshold reached (eligible) | all Super Admins | Queue detail | Assign later | request/article id + round | No auto-assign |
| **1** | Pantry/article minimum not met | all Super Admins | Queue detail | Relist later | id + outcome | No silent relist |
| **2** | Claim status/pricing/paid (FYI) | `super_admin` | Claim detail | Optional | claim id | Prefer in-app if noisy |
| **2** | Activation rejected / needs escalation | `super_admin` | Activation | Review | subscription id | Reject is web-only today |
| **2** | Override recorded / relist | `super_admin` | Pantry/article detail | Review | id + reason truncated | Never put full PII in push |
| **2** | `feedback.created` | `super_admin` | Inbox (web feedback later) | Read | feedback id | |
| **3** | Plan CRUD, bid pool returns, course ads | `super_admin` | Action Center only | None | — | No push |
| **3** | Unread count / internal pending orders | dashboard | Count | Open web if needed | — | No push |

Until backend notifies all Super Admins, **Action Center polling of counts is the reliable P1 signal**.

---

## 9. API readiness matrix

Auth for all rows below: existing `requireAuth` accepts **Bearer** (mobile) and cookie (web). Super Admin must not use cookie-only endpoints. `originGuard` allows Flutter (`X-Client-Type: mobile`, no Origin).

| Feature | Endpoint | SA role? | Mobile-friendly? | Pagination | Filters | Safe action | Confirm/reason | Shape | Errors | Files | Classification |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Login | `POST /api/auth/login` | Any existing user | Yes if `X-Client-Type: mobile` → `accessToken` | n/a | n/a | n/a | n/a | Stable | Arabic + code | no | **Usable as-is** (do not weaken) |
| Me | `GET /api/auth/me` or `/api/profile/me` | Auth | Yes | n/a | n/a | n/a | n/a | `primaryRole` | 401 | no | **Usable as-is** |
| Home counters | `GET /api/superadmin/dashboard/home-fast` | `admin`/`super_admin` + overview perm (SA bypasses) | Payload is **web-sized** (KPIs + attention). Server TTL cache 15–30s is OK; **do not** persist on device | n/a | n/a | no | n/a | Nested `summary.attention`, `paidSubscriptions`, intelligence | sectionErrors | no | **Usable as-is** for counters; **small DTO later** if payload too heavy |
| Unread | `GET /api/notifications/unread-count` | Own user | Yes | n/a | n/a | no | n/a | Yes | Yes | no | **Usable as-is** |
| Inbox | `GET /api/notifications` | Own user | Yes | existing | type? | mark read | n/a | Yes | Yes | no | **Usable as-is** |
| Activation list | `GET /api/admin/subscriptions/activation-queue` | admin/SA + activation/subscriptions perm | Yes | page/limit (max 100) + search | search | no | n/a | `{ subscriptions, pagination }` | Yes | no | **Usable as-is** |
| Activation approve | `PATCH /api/admin/subscriptions/:id/company-activate` | same | Yes | n/a | n/a | **approve only** | UI confirm (API has no reason body) | `{ subscription }` | Yes | no | **Usable as-is**; reject stays **web-only** |
| Claims list | `GET /api/super-admin/financial-claims` | admin/SA + claims perm | Array up to **500**; no page | `q`, `status`, `payoutStatus` | no | n/a | `{ claims }` | Yes | no | **Usable as-is** with client filter; **needs pagination** later |
| Claim detail | `GET /api/super-admin/financial-claims/:id` | same | Yes | n/a | n/a | no | n/a | `{ claim }` | 404 | maybe attachments | **Usable as-is** |
| Claim status | `PATCH /api/super-admin/financial-claims/:id/status` | same | Yes | n/a | n/a | status enum | `adminNote` required for reject/freeze/in-person; accept needs completion date + pricing already set | `{ claim }` | 400/409 Arabic | no | **Usable as-is** (limited); **do not** expose `paid` from mobile |
| Claim pricing | `PATCH .../pricing` | same | n/a | n/a | n/a | money edit | n/a | — | — | no | **Web-only** |
| Freelancer payout | `POST /api/super-admin/freelancer-payments` | same | n/a | n/a | n/a | money | n/a | — | — | no | **Web-only** |
| Pantry requests | `GET /api/admin/pantry/requests` | admin/SA + pantry perm | Cap **200**, no page | `status` (request status, not collection outcome) | no | n/a | `{ requests }` + bidCollection extras | Yes | no | **Usable as-is** for read-only queue; **needs pagination** + collection-status filter DTO later |
| Pantry detail | `GET /api/admin/pantry/requests/:id` | same | Yes | n/a | n/a | no | n/a | request + optional bids/deliveries | 404 | yes | **Usable as-is** (Phase 2) |
| Pantry deliveries | `GET /api/admin/pantry/deliveries` | same | Cap **200** | `status` (e.g. `submitted`) | approve/revision exist | revision message | `{ deliveries }` + file URLs | Yes | **yes** | **Usable as-is** read-only; files need authenticated fetch, not public cache |
| Pantry accept bid | `POST .../bids/:bidId/accept` | same | n/a | n/a | **action** | `overrideReason` when not fair #1 | — | 409 | no | Phase 2 **usable as-is** |
| Pantry delivery approve/revision | `POST .../deliveries/:id/approve` or `request-revision` | same | n/a | n/a | **action** | revision reason | — | Yes | files | Phase 2 **usable as-is** |
| Relist pantry/article | `POST .../relist-bid-collection` | same | n/a | n/a | **action** | payload reason | — | Yes | no | Phase 2 **usable as-is**; do not change collection backend |
| Articles list | `GET /api/super-admin/marketplace-articles` | **requireSuperAdmin** | limit/offset (max 200) | `status`, `articleLevel` — **not** collection status | no | n/a | articles | Yes | no | **Usable as-is** weakly; **needs filter DTO** for eligible/min-not-met |
| Article applications | `GET .../marketplace-articles/:id/applications` | SA | validators include list params | per article | select/reject | override on select | — | Yes | no | Phase 2 **usable as-is** |
| Fair ranking | `GET .../fair-ranking` | SA / pantry admin | Yes | n/a | n/a | n/a | ranking | Yes | no | Phase 2 **usable as-is** |
| Bid grant | `POST /api/super-admin/bid-credits/grants` | SA | Yes | n/a | n/a | **action** | `reason` + `expiresAt` required | — | Yes | no | Phase 4 **usable as-is** |
| Economy / plans / CMS / financial-center | various | SA | n/a | — | writes | — | — | — | — | **Web-only** |
| Notifications stream | `GET /api/notifications/stream` | special stream auth | SSE; Flutter uses poll/FCM | — | — | — | — | — | no | **Web-oriented**; skip on mobile |

**Not cookie-only:** inspected Super Admin REST routes sit behind `requireAuth` (Bearer OK). Do not add a mobile-only auth bypass.

---

## 10. Flutter architecture changes needed

### 10.1 Current state (problem)

| Piece | Behavior |
|---|---|
| `AuthUser.usesFreelancerExperience` | true only for `freelancer` |
| `AuthUser.usesClientExperience` | true only for `client` |
| `HomeScreen` | freelancer home **else ClientHomeScreen** — Super Admin → **client home** |
| `MainShell` | client vs freelancer tabs only |
| `app_router` redirect | authenticated splash/auth → `home`; pantry locations freelancer-only; **no SA guard** |
| Register | `super_admin` blocked in `register_payload.dart` |
| Account label | `super_admin` → Arabic label already |
| Notifications | SA recipient always mismatch; SA dashboard links blocked |
| Push | Optional FCM; register token after login for **any** role |
| Secure storage | access token only — correct |
| Interceptors | `X-Client-Type: mobile` + Bearer |

### 10.2 Required (when implementing)

1. **Role enum/helpers** on `AuthUser`: `isSuperAdmin`, `usesSuperAdminExperience`. Delegated `admin` should **not** get this shell in Phase 1 (open question).
2. **Post-login routing** to Super Admin home; never client marketplace or create-order.
3. **SA shell** (Action Center / Notifications / Account).
4. **Route guards:** SA routes require `super_admin`; client/freelancer routes reject SA (or redirect to Action Center).
5. **Notification resolver** allowlist for Super Admin only; map entity types to Flutter routes; keep blocking `http(s)`, `javascript:`, `..`, and raw web dashboard URLs.
6. **Repositories** for Phase 1 endpoints; parse `{ success, data, message, code }`.
7. **Confirm dialogs** for activation approve and claim status.
8. **JOD-only** for all SA money fields.
9. **No public/TTL disk cache** of admin lists. In-memory per session only. Do not reuse guest pool cache patterns.
10. **Popup ads host:** Super Admin should not see freelancer/client popup ads on the action shell (hide `PopupAdsHost` for SA).

---

## 11. Security boundaries

- **Do not** expose Super Admin data to client/freelancer. Backend already uses `requireSuperAdmin` / `requireAnyRole` + permissions. Flutter must still hide routes and ignore forged notification links.
- **Do not** weaken login, JWT expiry, or skip `X-Client-Type` distinction (web must stay cookie-only).
- **Do not** store admin payloads in SharedPreferences, Hive, or screenshot-prone logs.
- **Do not** download pantry/claim files to public storage without auth.
- **Do not** implement auto-assign, Work Tokens, Article Tokens, `program_admin`, merchant signup, or a dedicated Freelancer Pantry UI.
- **Do not** change Stripe webhook, `ordersService`, payment/JOD/wallet/claims/subscription **backend logic**, min-bids, or pantry/article collection **backend logic**.
- Claim **paid** / pricing / payout stay web. Activation **reject** and fee settings stay web.
- Fair override reasons stay required on Phase 2 select/accept.
- FCM `actionUrl` is a web path; Flutter must **map**, never `launchUrl` admin dashboards.
- Server `home-fast` cache is user-keyed and short TTL — acceptable. Mobile must still treat it as private.

---

## 12. Testing plan (for implementation phases)

### 12.1 Flutter

- Role routing matrix: client, freelancer, super_admin (and admin if in-scope).
- Notification resolver unit tests: SA destinations; client cannot follow SA `actionUrl`.
- Activation confirm + error codes.
- Claims note validation.
- JOD formatting; no preferred-currency conversion on admin amounts.
- Secure storage contains token only.

### 12.2 API (existing; no backend change this phase)

- Confirm SA Bearer can call `home-fast`, activation-queue, claims, pantry, articles (staging).
- Confirm client token gets 403 on those routes.
- Confirm activation-queue pagination and claims `status=pending`.

### 12.3 Manual QA

- Physical device: SA login, Action Center counts vs web, approve one **staging** activation, mark one **staging** claim, open inbox.
- Verify FCM only after production-hold lift; until then in-app only.

---

## 13. Open questions / user decisions needed

1. **Delegated `admin` on mobile?** Recommendation: Super Admin only. Delegated admins stay on web (`AdminDashboardHome`).
2. **Activation reject on mobile?** Web queue is **approve-only** (`PATCH company-activate`). Reject would need the full subscriptions editor — recommend web-only.
3. **Claim statuses allowed on mobile?** Recommend: `accepted` (if backend preconditions met), `rejected`, `requires_in_person_review`, `frozen` — **not** `paid`.
4. **Internal orders on Action Center:** show count only, or omit until a mobile orders slice exists?
5. **Should Phase 1 include pantry/article read-only queues** even without collection-status query filters (client-side filter of 200 rows), or wait for a small count DTO?
6. **Notify all Super Admins** for pantry delivery/threshold (today: creator only)? Product yes; backend later, not this phase.
7. **Add `minimum_not_met` / article-threshold notification types?** Recommended P1 product; missing today.
8. **FCM for Super Admin** while Play FCM is on release hold? Recommendation: in-app first; same hold as client/freelancer.
9. **Hide popup ads** for Super Admin? Recommendation: yes.
10. **Financial JOD snapshot in Phase 1 or wait for Phase 3?** Recommendation: wait; Action Center counts are enough.

---

## Appendix A — Classification cheat sheet (requested pages)

| Page | Rec |
|---|---|
| Super Admin home (analytics) | **C** / Action Center **A** |
| Analysis | **D** |
| Orders | **D** (+ **C** count) |
| Orders create | **D** |
| Plans | **D** |
| Marketplace plans | **D** |
| Training packages | **D** (**B** read-only later) |
| Marketplace economy | **D** |
| Marketplace articles | **C** then **B** |
| Bid credits | **D** (**B** grant later) |
| Subscriptions | **D** (**C** count) |
| Subscriptions activation | **A** |
| Financial center | **D** |
| Employee financial detail | **D** |
| Financial claims | **A** limited |
| Onboarding | **D** |
| Pantry | **C** then **B** |
| Training orders | **D** |
| Courses | **D** |
| Ads | **D** |
| Edit website | **D** |
| Settings | **A** |
| Notifications | **A** |

## Appendix B — Constraints honored

This document does not implement Flutter/backend product code, does not run git add/commit/push, does not deploy, migrate, db push/reset, or touch production data. It does not modify Stripe webhook, `ordersService`, payment/JOD/wallet/claims/subscription logic, min-bids, pantry/article collection logic, or auto-assign.

## Phase 1A implementation notes

**Date:** 2026-08-17  
**Mode:** Flutter-first. Existing backend APIs only. No backend/DB/deploy/commit.

### Screens added

| Screen | Route | Notes |
|---|---|---|
| Super Admin shell (الرئيسية / الإشعارات / الحساب) | `/home` when role is `super_admin` | `SuperAdminShell` — not a 5-tab client clone |
| Action Center | inside shell tab 0 | `SuperAdminActionCenterScreen` |
| Notifications inbox | shell tab 1 + `/notifications` | Existing inbox; mark read unchanged |
| Account | shell tab 2 | Existing `ProfileScreen` with Super Admin actions |
| Activation queue | `/super-admin/activation` | Read-only cards |
| Financial claims queue | `/super-admin/claims` | Read-only; JOD only |
| Pantry attention | `/super-admin/pantry` | Read-only |
| Articles attention | `/super-admin/articles` | Read-only |

Popup ads are hidden for Super Admin (`shouldShowPopupAdsForRole`).

### APIs used

- `GET /api/superadmin/dashboard/home-fast`
- `GET /api/notifications` + unread-count + mark-read (existing)
- `GET /api/admin/subscriptions/activation-queue`
- `GET /api/super-admin/financial-claims?status=pending`
- `GET /api/admin/pantry/requests`
- `GET /api/admin/pantry/deliveries?status=submitted`
- `GET /api/super-admin/marketplace-articles`

If an endpoint fails, the matching card shows **غير متاح حاليًا** (no fake counts). No POST/PATCH from Super Admin API client.

### Unavailable APIs / TODOs

- Activation **approve** (`PATCH company-activate`) — Phase 1B
- Claim **status** PATCH (with confirmation + note) — Phase 1B
- Pantry accept / delivery approve / relist / override — Phase 2
- Article select / reject / relist — Phase 2
- Notify-all-Super-Admins + `minimum_not_met` types — backend later
- Slim Action Center DTO — optional later (`home-fast` is used as-is)
- Collection-status query filters — client-side filter of existing lists

### Notification mappings (Super Admin only)

| Web path / entity | Flutter route |
|---|---|
| `/dashboard/super-admin` | `/home` (Action Center) |
| `/dashboard/super-admin/notifications` | `/notifications` |
| `/dashboard/super-admin/subscriptions/activation` | `/super-admin/activation` |
| `/dashboard/super-admin/financial-claims` | `/super-admin/claims` |
| `/dashboard/super-admin/pantry` | `/super-admin/pantry` |
| `/dashboard/super-admin/marketplace-articles` | `/super-admin/articles` |
| `/dashboard/super-admin/settings` | `/account/settings` |
| Other `/dashboard/super-admin*` | Action Center + snackbar «هذه المهمة ستتوفر قريبًا على التطبيق.» |
| `http(s)`, `javascript:`, `..`, `/dashboard/admin*` | rejected |

Client/freelancer resolvers are unchanged: they still cannot follow Super Admin destinations. Recipient `admin`/`super_admin` is allowed **only** when the logged-in user is Super Admin.

### Security boundaries

- Super Admin routes require `super_admin`; others are redirected to `/home`
- Super Admin is redirected away from marketplace / my-orders / courses / client / freelancer / pool paths
- No disk cache of admin lists (Riverpod in-memory only)
- Bearer + `X-Client-Type: mobile` unchanged
- No pricing, payout, ledger, or financial-center writes
- Public signup still client/freelancer only (`program_admin` added to blocked set)

### Tests / build

### Tests / build

- `flutter analyze` — no issues
- `flutter test` — 417 passed
- `flutter build apk --debug` — succeeded (`app-debug.apk`)

See also `docs/MOBILE_SUPER_ADMIN_QA.md` and `test/phase_sa_1a_super_admin_test.dart`.

## Phase 1B implementation notes

**Date:** 2026-08-17  
**Mode:** Flutter-first. Existing backend APIs only. No backend/DB/deploy/commit.

### Actions added

| Action | Where | Confirmation | Notes |
|---|---|---|---|
| Approve company activation | Activation queue card — **اعتماد التفعيل** | Required (`تأكيد الاعتماد` / `هل تريد اعتماد هذا الحساب؟`) | Eligible pending items only. In-flight lock. No reject in this phase. |
| Update financial claim status | Claims queue card — **تحديث حالة المطالبة** | Required | Allowed: `accepted`, `rejected`, `frozen`, `requires_in_person_review`. Note ≥ 3 chars for reject / freeze / in-person. JOD display only. |

On success: Arabic snackbar **تم تنفيذ الإجراء بنجاح**, quiet refresh of the queue and Action Center counts, user stays in the Super Admin shell. On failure: **تعذر تنفيذ الإجراء** (or the API Arabic message / access-denied). Buttons disable while a request is in flight.

### Endpoints used

- `GET /api/admin/subscriptions/activation-queue` (unchanged)
- `PATCH /api/admin/subscriptions/:id/company-activate` (no body; same as web)
- `GET /api/super-admin/financial-claims?status=pending` (unchanged)
- `PATCH /api/super-admin/financial-claims/:id/status` with `{ status, adminNote? }` (same as web)

No new backend routes. No DTO changes.

### Actions deferred

- Activation **reject** (no simple web-equivalent endpoint with required reason)
- Claim status **`paid`** (payout-adjacent)
- Claim **pricing** (`PATCH .../pricing`)
- Freelancer **payout** (`POST .../freelancer-payments`)
- Financial center / ledger / employee edits
- Pantry relist (count shown; action deferred)
- Article select / reject / relist
- Auto-assign

### Security boundaries

- Super Admin exclusive routes unchanged: client/freelancer redirected from `/super-admin/*`
- Client/freelancer cannot see or call these actions from the app
- Notification resolver still maps activation → `/super-admin/activation` and claims → `/super-admin/claims`; unknown Super Admin paths stay on Action Center; http(s)/javascript/`/dashboard/admin*` remain rejected
- No disk cache of admin/private lists
- Super Admin API client does not log request bodies
- No pricing, payout, or ledger controls in Flutter

### Tests / build

- `test/phase_sa_1b_super_admin_test.dart` — approve button, confirmation, double-submit, queue refresh, claim note length, JOD, no pricing/payout, routing, resolver
- `flutter analyze` — no issues
- `flutter test` — 435 passed
- `flutter build apk --debug` — succeeded (`app-debug.apk`)

### Phase 1C-B TODOs (Articles)

- Article attention actions (select/reject/relist) with confirmation
- Fair-ranking recommended applicant + override reason (10–500)
- Keep pricing / payout / ledger / financial-center on web
- Optional claim detail (read-only) if ops need completion-date context before **قبول**

## Phase 1C-A implementation notes

**Date:** 2026-08-17  
**Mode:** Flutter-first. Existing backend APIs only. No backend/DB/deploy/commit. Articles not in this phase.

### Actions added

| Action | Where | Confirmation | Notes |
|---|---|---|---|
| View pantry attention queue | `/super-admin/pantry` | — | Cards with collection/delivery chips, `current / required`, relist count **فرصة معاد طرحها** |
| Bid review | `/super-admin/pantry/requests/:id` | Accept / reject required | Accept recommended = confirm only. Non-recommended = override 10–500 chars. |
| Delivery review | `/super-admin/pantry/deliveries/:id` | Approve required; revision requires note ≥ 3 | File **names** listed only (no new download). No archive/payout. |

Relist **action** is deferred (endpoint exists; count is shown). Auto-assign and override history are not exposed.

### Endpoints used

- `GET /api/admin/pantry/requests`
- `GET /api/admin/pantry/requests/:id` (request + bids + deliveries + fairRanking)
- `GET /api/admin/pantry/deliveries` (optional `status`)
- `POST /api/admin/pantry/requests/:id/bids/:bidId/accept` `{ overrideReason? }`
- `POST /api/admin/pantry/requests/:id/bids/:bidId/reject`
- `POST /api/admin/pantry/deliveries/:deliveryId/approve` `{}` (no `archive`)
- `POST /api/admin/pantry/deliveries/:deliveryId/request-revision` `{ feedback }`

Audited but not called from mobile: `GET .../fair-ranking` (ranking comes on request detail), `GET .../bids` (bids come on request detail), `POST .../relist-bid-collection`, create/patch/publish request.

### Notification resolver

- `/dashboard/super-admin/pantry` → pantry queue
- `/dashboard/super-admin/pantry/:id` or `.../requests/:id` → request detail
- `/dashboard/super-admin/pantry/deliveries/:id` → delivery detail
- unknown pantry admin path → Action Center + «هذه المهمة ستتوفر قريبًا على التطبيق.»
- entity `pantry_request` / `pantry_delivery` with numeric id → matching detail
- client/freelancer still cannot follow Super Admin pantry destinations
- http(s), javascript, `..`, `/dashboard/admin*` remain blocked

### Security boundaries

- Super Admin exclusive `/super-admin/pantry*`
- Freelancer pantry hub unchanged (no admin actions)
- No disk cache; no payload logging
- 401/403 → access denied Arabic
- Backend authorization unchanged

### Tests / build

- `test/phase_sa_1c_a_pantry_test.dart`
- `flutter analyze` — no issues
- `flutter test` — 447 passed
- `flutter build apk --debug` — succeeded (`app-debug.apk`)

## Phase 1C-B implementation notes

**Date:** 2026-08-17  
**Mode:** Flutter-first. Existing backend APIs only. No backend/DB/deploy/commit. Pantry flows unchanged.

### Actions added

| Action | Where | Confirmation | Notes |
|---|---|---|---|
| View article attention queue | `/super-admin/articles` | — | Cards with title, status, `current / required`, collection status/outcome, assigned state, relist count **فرصة معاد طرحها**, dates when present |
| Application review | `/super-admin/articles/:id` | Select required | Recommended applicant = confirm only. Non-recommended = override 10–500 chars. |
| Relist bid collection | same detail screen | Relist required | Shown only when `canRelistBidCollection` / `minimum_not_met` and no selected applicant. |

Reject application is **deferred** (Phase 1D/later). The web endpoint `POST /api/super-admin/article-applications/:id/reject` exists and releases bid reservations; it is not exposed in Flutter because it is bid-credit adjacent and has no reason flow. Auto-assign and override history are not exposed.

### Endpoints used

- `GET /api/super-admin/marketplace-articles` (`limit`, `offset`, `includeFake=true`)
- `GET /api/super-admin/marketplace-articles/:id`
- `GET /api/super-admin/marketplace-articles/:id/applications` (applications + `bidCollection` + `fairRanking`)
- `POST /api/super-admin/article-applications/:applicationId/select` `{ overrideReason? }`
- `POST /api/super-admin/marketplace-articles/:id/relist-bid-collection` `{}`

Audited but **not** called from mobile: `GET .../fair-ranking` (ranking comes on applications), `GET /article-applications/:applicationId`, `POST .../reject`, `POST .../finalize-approval`, create/patch article.

### Notification resolver

- `/dashboard/super-admin/marketplace-articles` → article queue
- `/dashboard/super-admin/marketplace-articles/:id` (numeric) → article detail
- unknown article admin path (e.g. `/new`) → Action Center + «هذه المهمة ستتوفر قريبًا على التطبيق.»
- entity `marketplace_article` with numeric id → detail; `marketplace_article_application` → queue
- client/freelancer still cannot follow Super Admin article destinations
- http(s), javascript, `..`, `/dashboard/admin*` remain blocked

### Security boundaries

- Super Admin exclusive `/super-admin/articles*`
- Applicant display name + status + submitted date + rank only (no email, bid-credit economics, or override history)
- No disk cache; no payload logging
- 401/403 → access denied Arabic
- Backend authorization unchanged
- No Article collection backend changes

### Tests / build

- `test/phase_sa_1c_b_articles_test.dart`
- `flutter analyze` — no issues
- `flutter test` — 461 passed
- `flutter build apk --debug` — succeeded (`app-debug.apk`)

## Final implemented mobile scope

**Date:** 2026-08-17  
Flutter Super Admin Action Center is implemented through Phase 1C-B. It is not a clone of the web dashboard.

### Implemented (Phase 1)

| Area | What ships on Flutter |
|---|---|
| Shell | Super Admin 3-tab shell on `/home`: مركز المهام / الإشعارات / الحساب. Popup ads hidden. |
| Action Center | Live counts from `home-fast` + pantry/article list filters. Failed cards: **غير متاح حاليًا**. Pull-to-refresh. JOD only. No disk cache. |
| Notifications | Existing inbox. Super Admin web URLs map to Flutter queues/details. Unsafe links blocked. Unknown SA paths → Action Center + coming-soon snackbar. |
| Activation | Queue + **اعتماد التفعيل** with confirmation and in-flight guard. No reject. |
| Financial claims | Pending queue + status `accepted` / `rejected` / `frozen` / `requires_in_person_review`. Note ≥ 3 for reject/freeze/in-person. No `paid`, pricing, payout, or ledger. |
| Pantry | Attention queue, bid accept/reject (override 10–500 for non-recommended), delivery approve + revision (note ≥ 3). Relist **count** only. |
| Articles | Attention queue, application cards + fair ranking, select (override 10–500 for non-recommended), relist when `canRelistBidCollection` / `minimum_not_met` and no selected applicant. Reject deferred. |
| Account | Existing profile + settings. No client create-order or freelancer claims shortcuts. |
| Path aliases | `/super-admin` → home; `/super-admin/notifications` → inbox; `/super-admin/account` → settings; `/super-admin/financial-claims` → claims queue. |

### Deferred / web-only

Analytics/visitors, analysis charts, internal orders + create wizard, plans/economy/CMS, bid-credit package editor and grant, financial center + employee ledgers, claims pricing/payout, article/pantry composers, training-orders, courses/ads composers, admins, rate-limits, institutions, delegated `admin` app.

Also deferred on mobile: article reject, pantry relist **action**, auto-assign, Work Tokens / Article Tokens, `program_admin`, merchant public signup, dedicated Freelancer Pantry admin UI.

### Remaining future phases

- **Phase 3:** JOD-only financial/subscription **summaries** (still no ledger edit).
- **Phase 4:** Optional bid-credit quick grant (reason required).
- **Later:** notify-all Super Admins for pantry/article threshold and `minimum_not_met`; slim Action Center DTO; FCM production enablement.

### Tests / build (final QA)

- `test/phase_sa_final_qa_test.dart`
- `flutter analyze` — no issues
- `flutter test` — 474 passed
- `flutter build apk --debug` — succeeded (`app-debug.apk`)

