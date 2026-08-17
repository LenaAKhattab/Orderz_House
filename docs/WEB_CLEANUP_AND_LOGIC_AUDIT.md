# Web cleanup and logic audit (Phase 0)

**Date:** 2026-08-16  
**Scope:** Frontend route/page inventory, leftover product concepts, logic consistency vs current product decisions.  
**Mode:** Audit only. No files deleted. No routes removed. No migrations, deploy, git commit, or database cleanup.

## 1. Executive summary

The web app still has a large, working dashboard surface. Public auth, plans catalogs, admin pantry, merged freelancer pantry-into-orders, onboarding, training packages (WhatsApp), and currency display are wired.

The highest-risk inconsistency is **freelancer Marketplace Articles**: full page components exist and still compile, but `App.jsx` **redirects** `/dashboard/freelancer/articles` and `.../:id` to the freelancer home. Super-admin article min-bids UI remains. Freelancers therefore cannot open the article apply UI on web from those URLs. That needs a product decision before any cleanup.

Secondary issues: **admin account settings URL is declared but not routed**; duplicate pantry/footer URLs; `lazyPages.js` still lazy-loads unused modules (so they ship in the production bundle).

Work Tokens / `program_admin` / merchant public signup are not active product UI. Economy form still contains **forced-off** Work Token fields in payload helpers (must not be re-exposed).

Flutter onboarding is still absent (TODO). Flutter register now matches web `accountType` client/freelancer.

## 2. Overall status: **PARTIAL**

Not FAIL: app builds, npm tests pass, core product paths exist.  
Not PASS: article freelancer routes are stubs, admin settings route gap, leftover lazy pages, stale Work Token internals.

## 3. Route inventory summary

Source of truth: `frontend/src/App.jsx` (`path=` appears **100** times, including nested training-order child routes, wildcards, and redirects).

Layouts:

- **PublicLayout** — marketing, auth, legal, how-it-works.
- **RequireAuth + MainLayout** — all `/dashboard/*`.

Guards used: `GuestOnly`, `HomeForGuestsOnly`, `RequireAuth`, `RequireRole`, `RequireStaffPage`, `RequirePermission`.

Role constants: `frontend/src/constants/authRoutes.js` (`ROLE` has super_admin, admin, freelancer, client, financial_user — **no program_admin, no merchant**).

`frontend/src/authRoutes.js` and `frontend/src/lazyPages.js` **do not exist**. Canonical files are `constants/authRoutes.js` and `routes/lazyPages.js`.

### 3.1 Public (PublicLayout)

| Path | Component | Guard | Nav | Status | Notes |
|---|---|---|---|---|---|
| `/` | `pages/Home.jsx` (eager) | HomeForGuestsOnly | yes | ACTIVE | Logged-in users redirected to role dashboard |
| `/about` | About | public | yes | ACTIVE | |
| `/services` | Services | public | yes | ACTIVE | |
| `/orders` | Orders | public | yes | ACTIVE | Guest marketplace |
| `/plans`, `/plans/:slug` | Plans | public | via plans UX | ACTIVE | Training tab WhatsApp; membership checkout on web |
| `/login` | Login | GuestOnly | yes | ACTIVE | |
| `/register` | Register | GuestOnly | yes | ACTIVE | client/freelancer only |
| `/forgot-password` | ForgotPassword | public | from login | ACTIVE | |
| `/privacy-policy` | PrivacyPolicy → PublicSitePage | public | footer | ACTIVE | |
| `/terms-conditions` | TermsConditions | public | footer | ACTIVE | |
| `/account-deletion` | AccountDeletion | public | legal | ACTIVE | App-store deletion page |
| `/guarantee` `/help-center` `/find-work` `/community` `/blog` | PublicSiteSlugPages | public | CMS/footer | ACTIVE | Dynamic CMS slugs |
| `/how-it-works/freelancer` `/how-it-works/client` | HowItWorksPage | public | how-it-works nav | ACTIVE | |
| `/unauthorized` | Unauthorized | public | no | ACTIVE | Guard fallback |
| `*` (under PublicLayout) | NotFoundPage | public | no | ACTIVE | |

Legacy public redirects inside Plans: `/plans/freelancers` → `/plans`; `/plans/client-offer` → legacy slug. **LEGACY but keep** (bookmarks).

### 3.2 Super-admin (MainLayout, staff/super_admin)

All deep-linkable. Sidebar: `constants/superAdminNav.js`. Training packages also via `admin/plans/planCatalogNav.js` (not a top-level sidebar key).

| Path | Page | Guard | Nav | Status |
|---|---|---|---|---|
| `/dashboard` | DashboardRedirect | auth | no | ACTIVE |
| `/dashboard/super-admin` | DashboardPage | overview permission | yes | ACTIVE |
| `/dashboard/super-admin/analysis` | SuperAdminAnalysisPage | analytics | yes | ACTIVE |
| `/dashboard/super-admin/plans` | SuperAdminPlansPage | SUPER_ADMIN | yes | ACTIVE | main + page catalogs |
| `/dashboard/super-admin/marketplace-plans` | SuperAdminMarketplacePlansPage | SUPER_ADMIN | yes | ACTIVE |
| `/dashboard/super-admin/training-packages` | SuperAdminTrainingPackagesPage | SUPER_ADMIN | plan-catalog nav | ACTIVE |
| `/dashboard/super-admin/marketplace-economy` | SuperAdminMarketplaceEconomyPage | SUPER_ADMIN | yes | ACTIVE BUT NEEDS REVIEW | Work Token knobs forced off in patch |
| `/dashboard/super-admin/marketplace-articles` | SuperAdminMarketplaceArticlesPage | SUPER_ADMIN | yes | ACTIVE | min-bids / fair / override |
| `/dashboard/super-admin/bid-credits` | SuperAdminBidCreditsPage | SUPER_ADMIN | yes | ACTIVE |
| `/dashboard/super-admin/subscriptions` | SuperAdminSubscriptionsPage | subscriptions perm | yes | ACTIVE |
| `/dashboard/super-admin/subscriptions/activation` | AdminSubscriptionsActivationPage | activation perm | yes | ACTIVE |
| `/dashboard/super-admin/financial-center` | SuperAdminFinancialCenterPage | financialCenter | yes | ACTIVE | JOD ops |
| `/dashboard/super-admin/financial-center/employees/:personId` | FinancialEmployeeDetailPage | financialCenter | deep | ACTIVE |
| `/dashboard/super-admin/financial-claims` | SuperAdminFinancialClaimsPage | financialClaims | yes | ACTIVE |
| `/dashboard/super-admin/notifications` | NotificationsPage | SUPER_ADMIN | yes | ACTIVE |
| `/dashboard/super-admin/settings` | SuperAdminSettingsPage | SUPER_ADMIN | footer | ACTIVE |
| `/dashboard/super-admin/courses` | AdminCoursesPage | courses perm | yes | ACTIVE |
| `/dashboard/super-admin/ads` | AdminAdsPage | ads perm | yes | ACTIVE |
| `/dashboard/super-admin/orders` | AdminOrdersPage | orders perm | yes | ACTIVE |
| `/dashboard/super-admin/orders/create` | AdminCreateOrderPage | createOrder perm | yes | ACTIVE |
| `/dashboard/super-admin/admins` | SuperAdminAdminsPage | adminsManage | yes | ACTIVE |
| `/dashboard/super-admin/rate-limit-exemptions` | SuperAdminRateLimitExemptionsPage | SUPER_ADMIN | yes | ACTIVE |
| `/dashboard/super-admin/onboarding` | SuperAdminOnboardingPage | SUPER_ADMIN | yes | ACTIVE |
| `/dashboard/super-admin/feedback` + `/topics` + `/:id` | feedback pages | SUPER_ADMIN | yes | ACTIVE |
| `/dashboard/super-admin/institutions` + `/:institutionId` | institutions | institutions perm | yes | ACTIVE |
| `/dashboard/super-admin/institutional-order-storage` + `/pending` + `/:storageId` | storage pages | storage perm | yes | ACTIVE |
| `/dashboard/super-admin/edit-website` and footer/faq/pages/how-it-works children | website CMS | editWebsite | yes | ACTIVE |
| `/dashboard/super-admin/edit-website/footer-app-downloads` | same as `.../footer/app-downloads` | editWebsite | deep | DUPLICATE | two URLs, one page |
| `/dashboard/super-admin/training-orders` + settings/templates/applications | training orders shell | trainingOrders | yes | ACTIVE |
| `/dashboard/super-admin/training-orders/rounds` | Navigate to `#round-history` | trainingOrders | deep | LEGACY redirect |
| `/dashboard/super-admin/pantry` | AdminPantryPage | pantry perm | yes | ACTIVE | min-bids / fair / override |

### 3.3 Admin role

| Path | Page | Nav | Status |
|---|---|---|---|
| `/dashboard/admin` | DashboardPage | yes | ACTIVE |
| `/dashboard/admin/notifications` | NotificationsPage | yes | ACTIVE |
| `/dashboard/admin/orders` + `/create` | same admin order pages | yes | ACTIVE |
| `/dashboard/admin/subscriptions` | activation page | yes | ACTIVE |
| `/dashboard/admin/courses` `/ads` | same as SA | yes | ACTIVE |
| `/dashboard/admin/pantry` | AdminPantryPage | admin nav actually points to **super-admin** pantry URL | DUPLICATE path | Keep until nav unified |
| `/dashboard/admin/settings` | **no Route in App.jsx** | `getAccountSettingsPath(admin)` returns this | **BROKEN / RISKY** | `AdminSettingsPage.jsx` exists, lazy export unused |

### 3.4 Freelancer

| Path | Page | Nav | Status |
|---|---|---|---|
| `/dashboard/freelancer` | DashboardPage → FreelancerDashboardHome | yes | ACTIVE |
| `/dashboard/freelancer/orders` | OpenOrdersMarketplace | yes | ACTIVE | pantry merged |
| `/dashboard/freelancer/orders/:id` | FreelancerOrderDetailsPage | deep | ACTIVE | also allowed for CLIENT |
| `/dashboard/freelancer/institution-orders` | InstitutionOrdersPoolPage | gated | ACTIVE |
| `/dashboard/freelancer/my-orders` | FreelancerMyOrdersPage via DashboardPage | yes | ACTIVE |
| `/dashboard/freelancer/my-orders/:id` | FreelancerMyOrderDetailsPage | deep | ACTIVE |
| `/dashboard/freelancer/pantry` | FreelancerPantryPage → Navigate orders | no | LEGACY redirect | **must keep** for bookmarks |
| `/dashboard/freelancer/elite-offers/:offerId` | FreelancerEliteOfferPage | deep | ACTIVE |
| `/dashboard/freelancer/financial-claims` | FreelancerFinancialClaimsPage | yes | ACTIVE |
| `/dashboard/freelancer/plans` | FreelancerPlansPage | yes | ACTIVE | **web Stripe checkout** — must not copy to Flutter IAP |
| `/dashboard/freelancer/courses` + `/:id` | courses | yes | ACTIVE | catalog, not training-package checkout |
| `/dashboard/freelancer/getting-started` | FreelancerGettingStartedPage | yes | ACTIVE |
| `/dashboard/freelancer/activate-account` | FreelancerActivateAccountPage | no (linked) | ACTIVE |
| `/dashboard/freelancer/convert-account` | ConvertAccountPage | no | ACTIVE |
| `/dashboard/freelancer/settings` | FreelancerSettingsPage | footer | ACTIVE |
| `/dashboard/freelancer/notifications` | NotificationsPage | yes | ACTIVE |
| `/dashboard/freelancer/feedback` | ProblemsSuggestionsPage | yes | ACTIVE |
| `/dashboard/freelancer/articles` + `/:id` | **Navigate to `/dashboard/freelancer`** | title leftover in nav helper | **BROKEN / RISKY** | Pages exist but unused by router |

### 3.5 Client

| Path | Page | Nav | Status |
|---|---|---|---|
| `/dashboard/client` | ClientDashboardHome | yes | ACTIVE |
| `/dashboard/client/my-orders` | ClientMyOrdersPage | yes | ACTIVE |
| `/dashboard/client/my_orders` | Navigate hyphenated | deep | LEGACY alias | keep |
| `/dashboard/client/financial` | ClientFinancialPage | yes | ACTIVE |
| `/dashboard/client/orders` | OpenOrdersMarketplace | yes | ACTIVE | browse |
| `/dashboard/client/orders/create` | ClientCreateOrderOpenAndRedirect | no | ACTIVE | modal |
| `/dashboard/client/orders/:id` | FreelancerOrderDetailsPage | deep | ACTIVE BUT NEEDS REVIEW | shared component name |
| `/dashboard/client/notifications` `/settings` `/profile` `/feedback` | respective pages | mixed | ACTIVE |
| `/dashboard/client/convert-account` | ConvertAccountPage | no | ACTIVE |

### 3.6 Financial user

| Path | Page | Nav | Status |
|---|---|---|---|
| `/dashboard/my-bonuses` | FinancialUserMyBonusesPage | role home | ACTIVE |
| `/dashboard/financial-user` | Navigate my-bonuses | deep | LEGACY alias | keep |

Catch-all: `/dashboard/*` → NotFoundPage inside MainLayout.

## 4–7. Active pages by audience

**Public:** Home, About, Services, Orders, Plans, Login, Register, ForgotPassword, legal/CMS/how-it-works, Unauthorized, 404.

**Client:** home, my-orders, financial, marketplace browse, create-order redirect, notifications, settings, profile, feedback, convert-account.

**Freelancer:** home, available orders (incl. pantry rows), my-orders, claims, plans (web checkout), courses, getting-started, activate, settings, notifications, feedback, elite offer, institution pool.

**Admin / Super-admin:** control center, analysis, internal orders, training orders, pantry, claims, financial center, three plan catalogs + training packages + economy + articles + bid credits, subscriptions, courses, ads, website CMS, institutions/storage, admins, rate limits, onboarding, feedback.

## 8. Legacy / suspicious / possibly unused

| Item | Classification | Evidence |
|---|---|---|
| `FreelancerMarketplaceArticlesPage.jsx` + Detail | **risky / needs user decision** | Implemented; App redirects away; still in `lazyPages.js` and production chunks |
| `TrainingOrderRoundsPage.jsx` | needs cleanup later | Component only redirects; App already redirects; still lazy-exported |
| `AdminSettingsPage.jsx` | risky | File + lazy export; **no matching Route**; `getAccountSettingsPath` still returns `/dashboard/admin/settings` |
| Duplicate footer app-downloads paths | needs cleanup later | Two routes, one component |
| Duplicate admin pantry URLs (`/admin/pantry` vs `/super-admin/pantry`) | needs cleanup later | Same `AdminPantryPage` |
| `DASHBOARD_TITLE` `/dashboard/freelancer/articles` | needs cleanup later | Title leftover after redirect |
| `lazyPages.js` unused exports (`AdminSettingsPage`, article pages, `TrainingOrderRoundsPage`) | needs cleanup later | Side-effect `lazy()` still bundles them (confirmed in `vite build` output) |
| `docs/MARKETPLACE_WORK_TOKEN_PHASE4.md` | safe to keep as history | Documentation only |
| Economy `workToken*` form fields | **must not remove blindly** | Forced `workTokensEnabled: false` on patch; removing without backend contract review is risky |
| `currencyDisplayConfig.js` TODO about live rates | stale comment | Live `/public/currency-display` already exists |

## 9. Duplicated or overlapping flows

- **Pool marketplace:** `/orders` (public), `/dashboard/freelancer/orders`, `/dashboard/client/orders` all use `OpenOrdersMarketplace` (intentional).
- **Order details:** client pool detail reuses `FreelancerOrderDetailsPage`.
- **Staff pantry:** two URLs.
- **Plans:** public `/plans` vs freelancer `/dashboard/freelancer/plans` vs admin catalogs vs training-packages admin — **separate by design**.
- **Training packages vs courses:** public WhatsApp packages ≠ freelancer course catalog ≠ training **orders** (fake/experimental orders).

## 10. Old concepts still found in code

| Concept | Where | Classification |
|---|---|---|
| Work Token | `marketplaceEconomyFormUtils.js`, tests asserting UI is gone, old docs | internals forced off — **must not reintroduce UI** |
| Article Token | not found as product UI | — |
| `program_admin` | **zero matches** in repo frontend/backend search | gone |
| Merchant public signup | Register only client/freelancer | **must not add** |
| Freelancer pantry hub | redirect-only page | **must keep redirect; must not restore tab** |
| Fake/training orders | active super-admin training-orders | **must not remove** |
| `default_plan_catalog` | still used for membership/page plans | **must not remove**; training packages explicitly **not** this catalog (`planCatalogNav.js`) |

## 11. Broken or risky logic

1. **Freelancer articles unreachable** while admin article min-bids is live. Product gap, not a compile error.
2. **Admin settings 404** if something navigates to `getAccountSettingsPath('admin')`.
3. `canRoleAccessPath` exact map is incomplete vs App routes (pantry, onboarding, bid-credits, articles, financial-center, etc.). **Prefix rules** (`/dashboard/super-admin`, `/dashboard/freelancer`) still allow access — not a hole, but drift will confuse future cleanup.
4. Flutter: no onboarding routes (intentional TODO). Register payload aligned with web.
5. Vite: `Unauthorized.jsx` both lazy and static import (`AuthGuards`) — ineffective code-split, not a logic bug.

Min-bids / pantry / fair ranking: admin pages and tests (`fairOverrideReason`, `AdminPantryMinRequiredBids.test.js`) still require override for non-#1. No auto-assign UI found. **Do not change that logic in cleanup.**

Currency: `JodMoneyDisplay` + `CurrencyDisplayProvider`; admin financial copy still JOD-labelled. Display-only.

## 12. Pages safe to remove later (after Phase 1 confirmation)

Only **after** product decisions:

- `TrainingOrderRoundsPage.jsx` **if** App child route stays as `Navigate` (or drop both).
- Unused **lazy exports** that App never imports.
- Possibly article freelancer pages **if** product confirms articles stay admin-only / web-hidden.

Do **not** remove in Phase 0.

## 13. Pages that must not be removed

Register/Login/ForgotPassword, Plans, OpenOrdersMarketplace, AdminPantryPage, FreelancerPantryPage **redirect**, training packages public+admin, onboarding pages, financial claims/center, Stripe-related **web** checkout (`useFreelancerPlansCheckout`, client order pay), currency display, legal pages, pantry merge mapper.

## 14. Cleanup phases recommendation

### Phase 1 — safe dead code (no behavior)

- Stop exporting unused `lazy()` entries that App does not import (reduces bundle).
- Align comments (`currencyDisplayConfig` TODO).
- Do not delete article pages until decision.

### Phase 2 — route/nav cleanup (needs approval)

- Either **restore** freelancer article list/detail routes **or** delete pages + nav titles + lazy exports.
- Add `/dashboard/admin/settings` Route **or** change `getAccountSettingsPath` to a working URL.
- Collapse duplicate pantry and footer-app-downloads paths (keep redirects).
- Sync `DASHBOARD_PATH_TO_ROLES` with App.jsx.

### Phase 3 — logic hardening

- Keep Work Token engines forced off; do not surface UI.
- Confirm pantry public `bidCollection` on freelancer list API for Flutter progress copy.
- Keep training packages out of `default_plan_catalog` / Stripe.

### Phase 4 — regression QA

- Public register client/freelancer.
- Freelancer orders includes pantry rows, no pantry tab.
- Article min-bids admin + (if restored) freelancer apply.
- `/plans` membership checkout + training WhatsApp.
- Admin settings.
- Currency JOD-first.
- Flutter register + no IAP/training checkout.

## 15. Tests / build results

| Check | Result |
|---|---|
| `frontend` `npm test` (scripted suite) | **138 pass / 0 fail** |
| `frontend` `npm run build` | **success** (~6s). Chunk size warning on `index-*.js`. Ineffective dynamic import on Unauthorized. |
| `npm run lint` | not run (optional; not required to complete audit) |
| Backend | not modified; no extra suite run this phase |
| Database | **not touched** |

Note: several extra tests exist (`trainingPackagesAdmin.test.js`, `b7bLegacyRuntimeCleanup.test.js`, etc.) that are **not** in the default `npm test` script.

## 16. Exact files inspected

- `frontend/src/App.jsx`
- `frontend/src/routes/lazyPages.js`
- `frontend/src/constants/authRoutes.js`
- `frontend/src/constants/superAdminNav.js`, `adminNav.js`, `freelancerNav.js`, `clientNav.js`
- `frontend/src/admin/plans/planCatalogNav.js`
- `frontend/src/components/layout/Navbar.jsx`, `Footer.jsx`, `PublicLayout.jsx`
- `frontend/src/pages/Register.jsx`, `Plans.jsx`, `dashboard/FreelancerPantryPage.jsx`, `DashboardPage.jsx`
- `frontend/src/components/open-orders/OpenOrdersMarketplace.jsx`
- `frontend/src/pages/dashboard/FreelancerMarketplaceArticlesPage.jsx`
- `frontend/src/admin/marketplaceEconomy/marketplaceEconomyFormUtils.js`
- `frontend/package.json`
- Flutter: no onboarding; pantry merge + register payload from prior work

## 17. Recommended for later removal (do not remove yet)

1. `frontend/src/pages/dashboard/trainingOrders/TrainingOrderRoundsPage.jsx` (if redirect stays in App).
2. Unused `lazyPages.js` exports: `AdminSettingsPage`, `FreelancerMarketplaceArticlesPage`, `FreelancerMarketplaceArticleDetailPage`, `TrainingOrderRoundsPage` — **only if** corresponding files/routes are retired.
3. Duplicate route `/dashboard/super-admin/edit-website/footer-app-downloads` (keep one canonical + redirect).
4. Duplicate `/dashboard/admin/pantry` **or** super-admin pantry — keep one canonical + redirect.

## 18. User decisions needed

1. **Marketplace Articles for freelancers on web:** restore list/detail routes (recommended if min-bids apply is a freelancer product), **or** confirm admin-only and then delete freelancer article pages.
2. **Admin settings:** wire `AdminSettingsPage` to `/dashboard/admin/settings`, or point staff admins at super-admin settings (probably wrong).
3. Whether default `npm test` should include the newer admin/min-bids/training-package tests.

---

**Confirmations:** no DB data cleaned; no migrations; no deploy; no git add/commit/push; Stripe webhook / `ordersService` / payment / min-bids / pantry collection **not changed**; dedicated freelancer pantry UI **not reintroduced**; Work Tokens / program_admin **not reintroduced**.

---

## Phase 0.5 Visual / UX Design Audit

**Date:** 2026-08-16  
**Method:** Code-level CSS/layout/component sweep against `docs/DESIGN_TOKENS.md` and `frontend/src/index.css`. No Playwright in the repo; **no screenshots generated**. Auth-gated dashboards were not live-clicked; risks below are from CSS, z-index, breakpoints, and component usage.

### 1. Visual design summary

**Status: PARTIAL**

Baseline is present and mostly coherent:

- Arabic-first `body { direction: rtl }` + Cairo via `--font-sans`.
- Primary `#2f3b65`, accent `#76cfdf`, page canvas `#f3f4f4`.
- Dashboard shells (`oh-sa-shell`, `fdl-shell`) share `dashboardTokens.css` (neutral SaaS cards, focus rings, semantic status).
- Public marketing uses dedicated hero/services/plans CSS (conversion-oriented).
- Auth uses a polished split card (`auth-pages.css`) with RTL form panel overrides.

Fragmentation: **~89 CSS files**. Public vs dashboard vs “utility gray” admin pages (pantry `#101828` tabs, onboarding `#2f6fed` links, article list **inline styles**) do not all consume dashboard tokens. `--text-muted` on `:root` is `#2f3b65` (same as primary), while dashboard muted text is `#667085`.

### 2. Responsive design summary

| Viewport | Code-level finding |
|---|---|
| 320 / 375 / 430 | Auth page `overflow-x: clip`, create-order overlay padding 12px and stacked fields at ≤768 / stepper labels shrink at ≤420. Pool cards stack at ≤1120. Admin/freelancer shells switch to overlay sidebar at ≤1023. |
| 768 tablet | Pool filters hidden (mobile filter button). Dashboard still uses **desktop two-column grid until 1023px**, so 768–1023 is the riskiest band (sidebar overlay + content). |
| 1024 / 1366 | Intended desktop: sticky RTL-order sidebar (`direction: ltr` grid, sidebar `order: 2`). Financial center uses `overflow-x: clip` + wrapping summary cards; wide tables still `overflow-x: auto` in several admin CSS files. |

`html { overflow-x: clip }` reduces page-level horizontal scroll; inner tables still scroll locally (expected).

### 3. Pages with broken design

| Page | Issue | Severity |
|---|---|---|
| `/dashboard/admin/settings` | **Not routed** — cannot render (Phase 0). | Critical (product), N/A visually |
| `/dashboard/freelancer/articles` | Redirects to home; if restored, list uses **unstyled inline cards** vs hub cards. | High if restored |
| Create-order modal vs ads | Overlay `z-index: 400` vs popup ads `1300` vs `DashboardModal` `z-[1200]` vs toasts `9999`. Create-order can sit **under** ads/other dialogs. | High |
| Onboarding help dialog | `z-index: 80` vs dashboard sticky chrome `40` and toasts `9999`. Help layer can be covered by toasts/ads. | Medium |

No compile-breaking CSS typo found; no tiny layout fix applied this phase.

### 4. Pages with inconsistent design

- **Admin pantry** (`pantryPages.css`): black active tabs, generic gray borders — not `--dash-primary`.
- **Training packages admin**: form fields now use Tailwind utilities on `TrainingPackageFormModal` (marketplace-plan modal chrome still from `marketplace-membership-plans.css`).
- **Onboarding panel**: navy CTA `#172033` and link blue `#2f6fed` (not brand turquoise/primary).
- **Marketplace economy / bid-credits / articles admin**: each has its own dense admin form language vs hub `Dashboard*` components.
- **Courses / ads composer**: large dedicated CSS (ads ~3k lines) — visually “app within an app”.
- **Plans public**: polished; **freelancer plans** separate stylesheet (`freelancerPlans.css`).
- Dual empty/loading: `DashboardEmptyState` / hub empty vs ad-hoc page copy.

### 5. Components causing inconsistency

| Pattern | Issue type |
|---|---|
| `DashboardButton` / hub vs raw `<button>` + page CSS | DUPLICATED COMPONENT |
| `DashboardModal` (z 1200, focus trap) vs `.client-order-modal-overlay` (z 400) vs native `<dialog>` popup ads | INCONSISTENT + MOBILE ISSUE |
| `DashboardTable` vs `.pantry-table` vs financial-center tables vs subscriptions overflow wrappers | DUPLICATED / OUTDATED STYLE |
| Page headers: `DashboardPageHeader` vs pantry custom header vs public `PublicPageHeader` | INCONSISTENT (acceptable public vs dash) |
| `--text-muted` (root) vs `--dash-text-muted` | ACCESSIBILITY ISSUE (muted not actually muted on public) |
| Breakpoints: 560 / 640 / 768 / 900 / 960 / 1023 / 1120 / 340 | INCONSISTENT |

### 6. Accessibility / UX issues

- Register account type uses `role="radiogroup"` / `role="radio"` — good.
- `DashboardModal` has focus trap, Escape, `aria-modal` — good.
- Create-order modal: lower z-index; stepper labels become 0.65rem at 420px — **readability**.
- Root `--text-muted` equals primary — poor “muted” contrast differentiation.
- Onboarding links `#2f6fed` on white: OK contrast, off-brand.
- Destructive actions: not fully inventoried; pantry/article override dialogs exist (keep copy, don’t restyle as part of min-bids logic).
- Keyboard: many custom filter buttons; pool mobile filters use `.is-open` rather than a dialog with focus trap.

### 7. Top 10 visual fixes recommended

1. Raise create-order overlay z-index into the 1200–1290 band (below ads 1300 or coordinated) — **approval** (behavior-adjacent).
2. Align pantry tabs/buttons to `--dash-primary` / dashboard tokens — **safe later**, no product logic.
3. If articles routes restored: replace inline styles with `DashboardSection` / hub cards.
4. Wire or restyle admin settings using `StaffAccountSettingsPage` (already used by super-admin).
5. Unify onboarding CTA/link colors to primary/secondary.
6. Soften public `--text-muted` toward `#667085` without changing `--primary` — **approval** (global public contrast).
7. Stepper label strategy on 320px (icon-only or wrap, not 0.65rem).
8. Confirm 768–1023 dashboard overlay sidebar doesn’t cover CTAs (manual QA).
9. Tokenize pantry/training-packages/onboarding CSS onto `dashboardTokens.css`.
10. Screenshot pass (Playwright) once a QA login exists.

### 8. Screenshots path

Not generated. Tooling: **no Playwright** in the repo. Would use `docs/design-audit/screenshots/` later.

### 9. What should not be redesigned

- Brand colors, Cairo, RTL body.
- Public home hero / services marketing compositions.
- Dashboard shell grid (LTR grid + RTL content) — high regression risk.
- Stripe checkout UI, claims/wallet layouts beyond token alignment.
- Min-bids / fair-ranking / override dialog **copy and flow**.
- Pantry-as-pool-row (no dedicated freelancer pantry chrome).

### 10. Recommended design cleanup phases

See `docs/WEB_DESIGN_CLEANUP_PLAN.md`.

**First visual cleanup phase:** token alignment on pantry + onboarding + z-index layering map only — no new features, no route deletes.

---

## Phase 1A — Critical Route and Visual Safety Fixes

**Date:** 2026-08-16  
**Status:** COMPLETE (code + tests/build). Live screenshot QA still not done.  
**Mode:** Route rendering + scoped visual safety. No deletions. No migrations, deploy, git commit, or database cleanup.

### What was fixed

- **Freelancer articles:** `/dashboard/freelancer/articles` and `.../:id` now render `FreelancerMarketplaceArticlesPage` / `FreelancerMarketplaceArticleDetailPage` under `RequireRole` freelancer (no home redirect). Nav + `canRoleAccessPath` include these paths. UI is apply/list/progress only (`formatArticleBidCollectionLabel` for applicant count / closed / minimum_not_met). Empty/error states if the API fails. No fair-ranking or override controls.
- **Admin settings:** `/dashboard/admin/settings` mounts `AdminSettingsPage` (`StaffAccountSettingsPage`) under `RequireRole` admin. Super Admin remains `/dashboard/super-admin/settings`. Admin user menu links to `getAccountSettingsPath`.
- **Z-index:** Semantic scale on dashboard tokens (`--oh-z-drawer` 45, `--oh-z-overlay` 1100, `--oh-z-modal` 1200, `--oh-z-popup` 1300, `--oh-z-wizard` 1350, `--oh-z-toast` 9999). Create-order overlay uses wizard (above ads). DashboardModal / popup ads / help overlay / mobile drawers use the tokens. Toasts left at 9999 in existing toast CSS.
- **Create-order stepper (≤420px):** wrap labels, `0.8rem` type, hide connectors, clip overlay overflow.
- **Token polish:** pantry tabs use `--dash-primary`; onboarding CTAs/links use `--dash-primary`; training-packages admin inputs min-height/border aligned with plan admin.

### What was not changed

- No page/route deletions (unused lazy exports, `TrainingOrderRoundsPage`, duplicate pantry/footer URLs kept).
- No Stripe, webhook, `ordersService`, payment/JOD/wallet/claims/subscription logic.
- No min-bids **backend**, Pantry/Article **collection backend**.
- No Work Tokens, Article Tokens, `program_admin`, merchant signup, Freelancer Pantry UI, auto-assign.
- No global `--text-muted` public contrast change.
- No full redesign.

### Remaining visual cleanup

- Public `--text-muted` vs primary (needs approval).
- Dual empty-state components; ads/courses CSS duplication.
- Financial center table mobile polish.
- Playwright/screenshot pass.
- 768–1023 overlay sidebar vs CTAs (manual QA).

### Remaining deletion candidates (deferred)

- Unused `lazyPages.js` exports that still ship in the bundle.
- `TrainingOrderRoundsPage` if confirmed unused.
- Duplicate `/dashboard/admin/pantry` vs super-admin pantry URLs.
- Duplicate footer-app-downloads admin URLs.

### Tests

Focused: `src/phase1a_routes.test.js`, `canRoleAccessPath.test.js`, `marketplaceArticleFormUtils.test.js`. Full `frontend` `npm test` + `npm run build` in this phase. Lint not a gate.

---

## Phase 1A.1 — CSS to Tailwind scoped cleanup

**Date:** 2026-08-16  
**Status:** COMPLETE for scoped Phase 1A CSS. Large legacy/global CSS intentionally kept.  
**Mode:** Convert newly added/scoped CSS to Tailwind utilities. No redesign, no route deletes, no DB/Stripe/backend changes.

### Inventory (Phase 1A CSS)

| Path | Importers | Scoped? | Action |
|---|---|---|---|
| `frontend/src/components/onboarding/freelancerOnboarding.css` | Onboarding panel, help trigger, getting-started | Yes | Converted + **deleted** |
| `frontend/src/admin/trainingPackages/training-packages-admin.css` | Training packages page / form modal | Yes | Converted + **deleted** |
| `frontend/src/pages/dashboard/pantryPages.css` | `AdminPantryPage` | Page-scoped but many table/stat classes | Tabs → Tailwind; **file kept** |
| `frontend/src/styles/createOrderModal.css` | Create-order + training/institutional overlays | Shared overlay/stepper + `::before`/`::after` | Stepper wrap/labels → Tailwind; **file kept** |
| `frontend/src/styles/dashboardTokens.css` | Dashboard layouts | Global tokens + z-index scale | **Kept** |
| `frontend/src/components/ads/popupAdModal.css` | Popup ads | Shared popup | **Kept** (z-index token only) |
| `frontend/src/styles/adminDashboardShell.css` / `freelancerDashboardShell.css` | Dashboard shells | Broad layout | **Kept** (drawer z-index token) |
| `frontend/src/index.css`, `legacy-application.css` | App-wide | Tailwind entry / legacy | **Not converted** |

### CSS files converted to Tailwind

- Onboarding panel, help dialog, getting-started cards.
- Training-package form fields/checkboxes.
- Pantry tab buttons (active/inactive).
- Create-order stepper wrap + label size at `max-[420px]`.

### CSS files deleted

- `frontend/src/components/onboarding/freelancerOnboarding.css`
- `frontend/src/admin/trainingPackages/training-packages-admin.css`

### CSS files intentionally kept

- **dashboardTokens.css** — `:root`/shell tokens and z-index scale.
- **createOrderModal.css** — overlay layout, stepper connectors (`::before`/`::after` cannot be expressed as utilities on the legacy stepper).
- **pantryPages.css** — remaining table/stats/header (not Phase 1A-only).
- **popupAdModal.css**, dashboard shells, **index.css**, **legacy-application.css** — global/shared.

### Pages verified (code)

`/dashboard/freelancer/articles`, `.../:id`, `/dashboard/admin/settings`, `/dashboard/super-admin/training-packages`, `/dashboard/freelancer/getting-started`, pantry admin, create-order modal/stepper. Super-admin onboarding page was already tokenized via the shared panel component. No live screenshot pass.

### Remaining CSS cleanup (later)

- Peel `legacy-application.css`.
- Public home/plans/services marketing CSS.
- Rest of `pantryPages.css` tables.
- Dashboard shell CSS.
- Marketplace/open-orders CSS.

---

## Phase 1B — Safe Dead Code and Lazy Cleanup

**Date:** 2026-08-16  
**Status:** COMPLETE for safe dead code. No active product pages removed.  
**Mode:** Unused lazy export + redirect-only duplicate. No Stripe/backend/DB/deploy/commit.

### Lazy export inventory

- **A used:** All App-imported `lazyPages` entries (public pages, dashboards, pantry, training orders except rounds, articles, admin settings, etc.).
- **B restored and used:** `FreelancerMarketplaceArticlesPage`, `FreelancerMarketplaceArticleDetailPage`, `AdminSettingsPage`.
- **C truly unused:** `TrainingOrderRoundsPage` (App already used inline `Navigate`).
- **D unsafe to remove:** `FreelancerPantryPage` (bookmark redirect), payment/order pages, Work Token internals.

### Removed

- Lazy export `TrainingOrderRoundsPage` from `frontend/src/routes/lazyPages.js`.
- File `frontend/src/pages/dashboard/trainingOrders/TrainingOrderRoundsPage.jsx`.

### Redirects / aliases kept

- Canonical footer apps: `/dashboard/super-admin/edit-website/footer/app-downloads`.
- Alias `/dashboard/super-admin/edit-website/footer-app-downloads` now **Navigate**s to the canonical path (bookmark-safe).
- `/dashboard/client/my_orders` → `/dashboard/client/my-orders` (unchanged).
- `/dashboard/super-admin/training-orders/rounds` → `#round-history` (unchanged; no longer uses a wrapper component).
- `/dashboard/admin/pantry` **kept as a live admin route** (not deleted). Super-admin pantry remains `/dashboard/super-admin/pantry`. Same page component, different role URLs.
- `/dashboard/freelancer/pantry` still redirects to available orders.

### Access map / titles

Exact `DASHBOARD_PATH_TO_ROLES` + titles synced for pantry, onboarding, bid-credits, financial-center, marketplace-articles, freelancer articles/getting-started. Onboarding and bid-credits are **super_admin only** (stricter than the `/dashboard/super-admin` staff prefix). Admin pantry stays admin-only.

### Stale comments

`currencyDisplayConfig.js`: TODO removed; comment notes live `/public/currency-display` plus env fallback.

### Intentionally deferred

- Unused `lazyPages` that App still imports (e.g. `Unauthorized` also statically imported by AuthGuards).
- Work Token docs (`MARKETPLACE_WORK_TOKEN_PHASE4.md`) — historical.
- Economy `workToken*` payload internals.
- Broad CSS/legacy cleanup.
- Freelancer pantry tab (must not restore).

### Tests

`frontend npm test` + `npm run build` in this phase. Lint not a gate.

---

## Phase 1C.1 — Public/Auth/Role Routing Logic Hardening

**Date:** 2026-08-16  
**Status:** COMPLETE for public/auth/role routing. Dashboards deferred to 1C.2.  
**Mode:** Logic hardening only. No Stripe/backend/DB/deploy/commit. No route removals.

### Pages reviewed

Public: `/`, `/about`, `/services`, `/orders`, `/plans`, `/plans/:slug`, `/how-it-works/*`.  
Auth: `/login`, `/register`, `/forgot-password`.  
Legal/CMS: privacy, terms, account-deletion, guarantee, help-center, find-work, community, blog.  
Guards: `/unauthorized`, public `NotFoundPage`, `GuestOnly`, `HomeForGuestsOnly`, `RequireAuth`.  
Shared: PublicLayout, Navbar, Footer.

### Issues found

- Guest pool details used `/orders/:id`, which has **no public route** (404 after login).
- `GuestOnly` / home bounce sent admins to `/dashboard/admin` instead of first permitted page (login already used first-permitted).
- `Unauthorized` was both lazy (`lazyPages`) and static (`AuthGuards`) — ineffective split.
- Forgot-password lacked a submit lock (login/register already had one).
- Training public list did not drop `isVisible: false` packages if the API returned them.

### Fixes

- Public marketplace details `from` path → `/dashboard/freelancer/orders/:id` (client+freelancer can access).
- `getPostAuthHomePath` shared by GuestOnly, home, login, unauthorized, 404, RequireRole bounce.
- Eager `Unauthorized` import in `App.jsx`; removed lazy export.
- Forgot-password `submittingRef`; register categories whitelist; CMS title fallback; hide non-visible training packages with catalog fallback.

### Intentionally unchanged

Membership Stripe checkout; Flutter Bearer token header; password rules; CMS slug pages; no new public `/orders/:id` browse page; no dashboard 1C.2 work.

---

## Phase 1C.2 — Client Dashboard, Order Creation, and Payment-facing UI Hardening

**Date:** 2026-08-16  
**Status:** COMPLETE for client-authenticated pages and client payment-facing UI. Freelancer/admin/super-admin dashboards deferred to 1C.3.  
**Mode:** Logic hardening + narrow UI fixes. No Stripe webhook, ordersService, payment backend, JOD ledger, min-bids backend, Pantry collection, DB, deploy, or commit.

### Pages reviewed

- `/dashboard/client`
- `/dashboard/client/my-orders` and alias `/dashboard/client/my_orders`
- `/dashboard/client/orders` (browse)
- `/dashboard/client/orders/create`
- `/dashboard/client/orders/:id` (shared pool details)
- `/dashboard/client/financial`
- `/dashboard/client/notifications`
- `/dashboard/client/settings`
- `/dashboard/client/profile`
- `/dashboard/client/feedback`
- `/dashboard/client/convert-account`
- Shared: client nav, `RequireRole` client, `DashboardRedirect` / `getPostAuthHomePath`, `OpenOrdersMarketplace` (client), `ClientCreateOrderOpenAndRedirect`, `ClientCreateOrderModal` + `AdminInternalOrderWizard` `audience="client"`, `ClientOrderCardCompact`, `FreelancerOrderDetailsPage` when used by client, Pay Now / Stripe return toasts on my-orders, `JodMoneyDisplay`

### Issues found

- Unpaid `pending_payment` fixed orders had **no Pay Now** CTA; frontend had `pay-confirm` / `pay-cancel` but did not call existing `/client/orders/:id/pay-checkout`.
- Empty-state “إنشاء طلب” on the client home pointed at my-orders instead of `/dashboard/client/orders/create`.
- Shared pool details always sent clients **back** (and on load error) to `/dashboard/freelancer/orders`.
- Notification `link` was passed to `navigate()` without an internal-path check.
- Feedback submit used React state only (race on double-click).
- Create-order 409 `PRICING_CHANGED` had no dedicated user-facing mapper (API message still used when present).

### Fixes made

- Frontend wrapper `createClientFixedOrderCheckoutRequest` + `ClientFixedOrderPayNowButton` on my-orders cards and financial table (hosted Stripe URL only; amount from server session).
- Client home first-order CTA → create-order route.
- Pool details `backTo` / error redirect uses client marketplace when role is client.
- `resolveSafeInternalNavPath` on notifications page and bell.
- Feedback `submittingRef`.
- `getOrderCreateErrorMessage` maps `PRICING_CHANGED` / `PRICING_MISMATCH`.
- Financial table extra action column + overflow class.

### Intentionally unchanged

- Stripe webhook, `ordersService`, checkout amount/currency (JOD) on the server.
- Bid-selection checkout (still via existing accept-bid `checkoutUrl`).
- Training package / membership / IAP checkout not added to client financial.
- Pantry merge remains freelancer-dashboard-only (`mergePantryIntoPool`).
- No dedicated freelancer pantry UI; no Work Tokens / Article Tokens.
- Broad CSS conversion; website redesign; route removals.
- Resume checkout for `awaiting_payment_after_bid_selection` (no matching pay-checkout for bidding; client re-opens bid offers).

### Payment / Stripe boundaries confirmed

- Pay Now posts to existing `POST /client/orders/:id/pay-checkout` and redirects to `checkoutUrl`.
- Approximate FX remains `JodMoneyDisplay` display-only.
- Client financial lists order payment states; no freelancer `startCheckout`.

### Tests / build

`frontend npm test` (includes `phase1c2_client_dashboard.test.js`) and `frontend npm run build` in this phase.

### Remaining for Phase 1C.4

Admin/super-admin dashboards, pantry/articles **admin** UI, financial center, staff create-order internals.

---

## Phase 1C.3 — Freelancer Dashboard, Orders, Articles, and Pantry-merged Flow Hardening

**Date:** 2026-08-16  
**Status:** COMPLETE for freelancer-authenticated pages. Admin/super-admin dashboards deferred to 1C.4.  
**Mode:** Logic hardening + narrow UI fixes. No Stripe webhook, ordersService, payment backend, JOD ledger, min-bids backend, Pantry collection backend, DB, deploy, or commit.

### Pages reviewed

- `/dashboard/freelancer`
- `/dashboard/freelancer/orders` and `/:id`
- `/dashboard/freelancer/my-orders` and `/:id`
- `/dashboard/freelancer/pantry` (redirect)
- `/dashboard/freelancer/articles` and `/:id`
- `/dashboard/freelancer/financial-claims`
- `/dashboard/freelancer/plans`
- `/dashboard/freelancer/courses` and `/:id`
- `/dashboard/freelancer/getting-started`
- `/dashboard/freelancer/activate-account`
- `/dashboard/freelancer/convert-account`
- `/dashboard/freelancer/settings`
- `/dashboard/freelancer/notifications`
- `/dashboard/freelancer/feedback`
- `/dashboard/freelancer/elite-offers/:offerId`
- `/dashboard/freelancer/institution-orders`
- Shared: freelancer nav, `OpenOrdersMarketplace`, pantry mapper, article apply UI, claims, plans checkout hook (read-only), `JodMoneyDisplay`, notification resolver (1C.2)

### Issues found

- Pantry-merged rows did not surface public bid-collection progress (current/required, closed, minimum_not_met) even when the list API included those fields.
- Closed/threshold pantry opportunities could still open bid/take from the card/details shim.
- Article apply lacked a ref-based duplicate-submit lock and still showed apply when collection was closed if `eligible` was stale.
- Getting Started `ctaUrl` was passed to `<Link>` without an internal-path check.
- Financial claims create could double-submit.

### Fixes made

- Mapper copies `bidCollection` (or synthesizes from counts); `collectionClosed` disables take/bid; generic progress chip + “updated opportunity” when `relistCount > 0`. No “بيت المونة” copy.
- Article apply/withdraw `busyRef`; hide apply when collection closed; defensive nulls on list/detail.
- Getting Started uses `resolveSafeInternalNavPath`.
- Claims `submittingRef`.

### Intentionally unchanged

- Pantry/Article **collection backend**; fair ranking / override (admin only).
- Dedicated freelancer pantry UI (still redirect-only).
- Stripe webhook, membership/plans hosted checkout behavior, Bid Credits purchase APIs.
- Work Tokens / Article Tokens; auto-assign.
- Flutter / IAP; public training checkout on freelancer plans.

### Pantry / article boundaries confirmed

- Freelancer pantry route remains redirect to available orders.
- Merge is freelancer dashboard marketplace only.
- Article freelancer pages still use `formatArticleBidCollectionLabel` and have no admin override UI.

### Tests / build

`frontend npm test` (includes `phase1c3_freelancer_dashboard.test.js`) and `frontend npm run build`.

### Remaining for Phase 1C.5

Financial center, financial claims, subscriptions/activation financial logic, wallet/claims/payment ledgers.

---

## Phase 1C.4A — Admin/Super Admin Operational Dashboard Hardening

**Date:** 2026-08-16  
**Status:** COMPLETE for operational admin/super-admin pages. Finance-heavy pages deferred to 1C.5.  
**Mode:** Logic hardening + narrow UI fixes. No Stripe webhook, ordersService, payment backend, JOD ledger, min-bids backend, Pantry collection backend, DB, deploy, or commit.

### Pages reviewed

Admin: home, orders, orders/create, subscriptions (route only), courses, ads, pantry, settings, notifications.  
Super Admin: home, analysis, orders, orders/create, plans, marketplace-plans, training-packages, marketplace-economy, marketplace-articles, bid-credits, onboarding, pantry, training-orders, settings, courses, ads.  
Shared: nav, `canRoleAccessPath`, override dialog, pantry/article admin panels.

### Issues found

- Fair-ranking override dialog used `z-index: 80` (under dashboard overlays) and kept the previous reason when reopened.
- Onboarding save had no submit lock; enable/disable had no error handling; CTA URLs were not validated as internal paths.
- Bid-credit create/grant/toggle and training-package save could double-submit.
- Pantry accept/relist and article select/relist lacked in-flight guards.

### Fixes made

- Override dialog: `z-[1200]`, reset reason on open, scrollable on small screens.
- Onboarding: `resolveSafeInternalNavPath` for CTA, save/toggle guards, table overflow.
- Duplicate-submit guards on bid credits, training packages, pantry accept/relist, article act/relist.
- Admin page title covers pantry and settings.

### Intentionally unchanged

- Financial center/claims/subscription payment logic (1C.5).
- Stripe checkout; Work Token internals (still forced off in economy patch).
- Min-required-bids allowed values 10/15/20/30 and acknowledgement copy.
- Fair ranking remains advisory; no auto-assign.
- Dedicated freelancer pantry UI (redirect only).
- Deep training-order business rules.

### Boundaries confirmed

- Admin cannot open SA-only plans/economy/articles/bid-credits/onboarding/training-packages.
- Admin pantry + SA pantry remain protected; freelancer nav has no pantry item.
- Training package code disabled on edit.
- Economy page has no Work Token / Article Token UI.

### Tests / build

`frontend npm test` (includes `phase1c4a_admin_ops.test.js`) and `frontend npm run build`.

### Remaining for Phase 1C.5

Financial center, financial claims, subscriptions/activation financial UI, wallet/claims ledgers.

---

## Phase 1C.5 — Finance, Claims, Subscriptions, and Financial-user Hardening

**Date:** 2026-08-16  
**Status:** COMPLETE for finance-sensitive UI. No payment/ledger backend changes.  
**Mode:** UI/logic hardening only.

### Pages reviewed

- `/dashboard/super-admin/financial-center` and `/employees/:personId`
- `/dashboard/super-admin/financial-claims`
- `/dashboard/super-admin/subscriptions` and `/subscriptions/activation`
- `/dashboard/admin/subscriptions`
- `/dashboard/my-bonuses` and `/dashboard/financial-user` redirect
- Shared consistency: client financial, freelancer financial-claims
- Nav/`canRoleAccessPath`/JOD display/`getSafeApiErrorMessage`

### Issues found

- Super Admin claims amounts had no JOD suffix (ambiguous).
- Claims status/pricing/payment could double-submit; reject/freeze had no required note.
- Activation `activate()` had no in-flight guard.
- Financial-center save/bonus/account-toggle could double-submit.
- Employee detail ignored missing `personId` instead of a not-found state.
- Financial-user load used raw error text and assumed `items` was always an array.

### Fixes made

- Claims amounts labeled `د.أ` (official ledger, no FX widget).
- Claims actionBusy guards + reject/freeze note ≥ 3 chars; safer API errors.
- Activation duplicate-click guard.
- Financial center/employee `actionBusy` guards; missing personId → not found.
- Financial-user safe error mapper + array fallback.
- `getDashboardTitle` prefix for financial-center employee URLs.

### JOD / approximate currency

- Admin financial center continues to format official JOD (`د.أ`) without `JodMoneyDisplay` FX.
- Client/freelancer bonus/claim cards may still show display-only approx via `JodMoneyDisplay`.
- No FX amounts posted to finance APIs.

### Subscription / training package boundaries

- Activation/subscription pages use `listAssignablePlansAdminRequest` only.
- Training packages admin is not mixed into checkout/activation catalogs.
- Stripe checkout not changed.

### Intentionally unchanged

- Stripe webhook, `ordersService`, payment/wallet/claims/subscription **backend**.
- Financial-center calculation helpers (preview math).
- Delegated admin access to financial center when `financialCenter` permission is assigned (`RequireStaffPage`).

### Tests / build

`frontend npm test` (includes `phase1c5_finance.test.js`) and `frontend npm run build`.

### Remaining (final cleanup / regression)

Broad CSS conversion, leftover uncommitted 1A–1C work, production deploy, optional visual QA on live finance tables.

---

## Performance Phase 0 + 1 (Web Audit)

- Performance baseline, safe quick wins, and security-preserving caching rules are documented in:
  - `docs/WEB_PERFORMANCE_AUDIT.md`
- Scope intentionally stayed frontend-safe without changing backend business logic, Stripe webhook, payment/JOD/claims/subscription logic, or role/security boundaries.

## Performance Phase 2 (Initial bundle / CSS)

- Route-level Home + popup-ad lazy loading and public CSS chrome split are documented in:
  - `docs/WEB_PERFORMANCE_AUDIT.md` → “Performance Phase 2 — Initial Bundle and CSS Cost Reduction”
- No backend, Stripe, payment, or role-guard changes.

## Performance Phase 3 (legacy CSS split)

- Safe, proven-owner splits from `legacy-application.css` (About, Services helpers, unscoped pricing base, admin outlet compact) are documented in:
  - `docs/WEB_PERFORMANCE_AUDIT.md` → “Performance Phase 3 — legacy CSS split”
- Mixed-role / overlay / create-order CSS stayed global. No backend, Stripe, payment, or role-guard changes.

## Performance Phase 4 (initial JS)

- Safe index-JS splits (API client vs public/auth helpers, dashboard locales behind `MainLayout`, lucide icons off the home skeleton, lazy NotificationsBell) are documented in:
  - `docs/WEB_PERFORMANCE_AUDIT.md` → “Performance Phase 4 — Initial JS Chunk Reduction”
- No backend, Stripe, payment, or role-guard changes.

