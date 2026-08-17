# Web Performance Audit (Phase 0 + Phase 1)

## 1) Executive summary

- Status: **Phase 0–4 completed**; **Phase 5 live browser measurement completed (PARTIAL)**. Initial CSS is ~236 kB; initial `index` JS is **387 kB**. Live measurement shows **slow public APIs**, not remaining JS weight, are now the user-perceived bottleneck. See Phase 5.
- Main remaining bottlenecks are **slow/duplicated public API calls** (orders pool, home-stats, how-it-works probes, site-pages), plus large hero/logo images. JS/CSS splitting did not cause runtime crashes on measured routes.
- No product logic, security controls, Stripe webhook, payment logic, ordersService, or backend business rules were changed.
- Safe quick wins were applied to reduce repeated public fetches, reduce startup competition, and remove avoidable rerender churn.

## 2) Baseline observations

### Build-level baseline (local)

- `frontend npm run build` succeeds.
- Largest chunks:
  - `dist/assets/index-*.js`: ~804 kB minified (~226 kB gzip).
  - `dist/assets/vendor-posthog-*.js`: ~184 kB minified (~61 kB gzip).
  - `dist/assets/index-*.css`: ~407 kB minified (~71.5 kB gzip).
- Vite warning present: chunks larger than 500 kB.
- Plugin timing warning is CSS-heavy (`vite:css` dominates build time).

### Runtime/stability baseline

- Targeted `no-undef` lint sweep on critical routes/components: no runtime `ReferenceError` regressions found.
- Previously fixed crash routes remain protected in code:
  - `/plans?type=membership`
  - `/dashboard/freelancer/orders`
- Frontend test suite passes (`204/204`).

### Route-level baseline (code + local run observations)

- Public (`/`, `/orders`, `/plans`, `/login`, `/register`):
  - Route-level lazy loading already in place.
  - `/orders` and `/plans` are data-heavy and rely on async API hydration after paint.
  - Public plans/training content can still trigger repeated fetches across remounts.
- Client/Freelancer dashboards:
  - `DashboardPage` routes are lazy-loaded with Suspense fallback.
  - Heavy list pages (`/dashboard/client/orders`, `/dashboard/freelancer/orders`) are paginated and include skeletons.
  - Some dashboard views perform significant `useMemo` composition on each summary refresh.
- Admin/Super Admin:
  - Route guards are preserved and lazy routes are used.
  - Pages are mostly chunked by feature, but global CSS still contributes to first-load cost.

## 3) Slowest/highest-risk pages

- `/dashboard/freelancer/orders`: larger list UI + periodic refresh + filters + modals.
- `/dashboard/client/orders`: shared marketplace list shell, list rendering cost.
- `/dashboard/super-admin/financial-center`: dense controls and data formatting.
- `/dashboard/super-admin/marketplace-articles` and `/dashboard/super-admin/pantry`: heavier admin workflows and list UIs.
- `/plans`: dynamic content + tabbed rendering, sensitive to initial JS/CSS payload.

## 4) Bundle/chunk observations

- Good:
  - Route-level lazy loading is broadly adopted through `src/routes/lazyPages.js`.
  - Large feature pages are emitted as separate chunks.
- Bottlenecks:
  - `index` main bundle remains high.
  - Large global stylesheet (`index.css`) is loaded up front.
  - `vendor-posthog` chunk is sizable and initialized early relative to user-visible route content.

## 5) API duplication observations

- Public training packages hook fetched on every mount before this phase.
- Plans/public content already uses cache helpers and graceful fallback patterns.
- Open orders pages already use AbortController and keep-previous-data patterns during refetch, reducing full-blank flashes.

## 6) Rendering/list performance observations

- Open orders marketplace:
  - Pagination, skeletons, and non-blocking background refresh already implemented.
  - Row actions and eligibility checks are computed per item; acceptable with current pagination limits.
- Freelancer dashboard home:
  - Heavy derived blocks are memoized, but one dependency source was unstable and caused avoidable recomputation warning.

## 7) Perceived-speed fixes applied in this phase

1. Deferred non-critical analytics initialization to idle time in `src/App.jsx`:
   - Startup checks still run.
   - PostHog init now runs via `requestIdleCallback` (or short timeout fallback), reducing startup contention.

2. Added lightweight client-side cache with TTL + in-flight dedupe for public training packages in `src/hooks/usePublicTrainingPackages.js`:
   - Avoids repeated network calls across remounts in short sessions.
   - Uses safe fallback behavior and does not cache private user data.

3. Stabilized pending actions dependency in `src/pages/dashboard/FreelancerDashboardHome.jsx`:
   - Prevents avoidable recalculation churn and resolves hooks warning.

## 8) Security-preserving caching rules

### Allowed

- Cache public, non-sensitive display data with bounded TTL:
  - Public training packages list.
  - Public plans display content.
  - Display-only currency metadata where already designed.
- Keep authenticated data in component/session state for the current user only.
- Keep previous same-user data visible during in-flight refresh to avoid blank UI.

### Not allowed

- No public/shared cache for authenticated dashboard data.
- No cross-user admin/client/freelancer data caching.
- No auth/authorization shortcutting for speed.
- No stale financial/payment/claims/subscription data shown as final truth.
- No bypass of server-side validation.

## 9) Fixes made in this phase

- `src/App.jsx`: deferred analytics init to idle.
- `src/hooks/usePublicTrainingPackages.js`: TTL cache + request dedupe.
- `src/pages/dashboard/FreelancerDashboardHome.jsx`: stable memo input for `pendingActions`.

## 10) Deferred performance opportunities (next phase)

- Split or isolate heavier global CSS paths to reduce first-route CSS parse cost.
- Further split the large `index` chunk by extracting more non-critical shared modules.
- Add route-level live measurements (Lighthouse + DevTools Performance + Network waterfall) for each dashboard role path on real devices/networks.
- Audit image delivery policy (sizes/formats) for hero and marketing assets.
- Consider prefetch hints for most-visited authenticated routes after idle.

## 11) Tests/build results

- `frontend npm test`: pass (204 tests).
- `frontend npm run build`: pass (Vite warns about chunk size > 500 kB; no build failure).
- Targeted `eslint no-undef` sweep on critical pages/components: no errors.

## 12) Pages still needing live browser/Lighthouse/device measurement

- Public: `/`, `/orders`, `/plans`, `/login`, `/register`
- Client: `/dashboard/client`, `/dashboard/client/my-orders`, `/dashboard/client/orders`, `/dashboard/client/orders/create`, `/dashboard/client/financial`
- Freelancer: `/dashboard/freelancer`, `/dashboard/freelancer/orders`, `/dashboard/freelancer/articles`, `/dashboard/freelancer/my-orders`, `/dashboard/freelancer/financial-claims`, `/dashboard/freelancer/getting-started`
- Admin/Super Admin: `/dashboard/super-admin`, `/dashboard/super-admin/pantry`, `/dashboard/super-admin/marketplace-articles`, `/dashboard/super-admin/training-packages`, `/dashboard/super-admin/financial-center`, `/dashboard/super-admin/financial-claims`

## Performance Phase 2 — Initial Bundle and CSS Cost Reduction

### 1) Before/after chunk sizes

| Chunk | Phase 1 (before) | Phase 2 (after) | Delta |
| --- | --- | --- | --- |
| `index-*.js` | 803.95 kB / 226.35 kB gzip | 709.62 kB / 200.88 kB gzip | **-94.3 kB / -25.5 kB gzip** |
| `index-*.css` | 407.48 kB / 71.50 kB gzip | 269.74 kB / 47.93 kB gzip | **-137.7 kB / -23.6 kB gzip** |
| `vendor-posthog-*.js` | 183.93 kB / 61.32 kB gzip | 183.93 kB / 61.32 kB gzip | unchanged (still idle-init) |
| `vendor-router-*.js` | 42.37 kB / 15.04 kB gzip | 42.37 kB / 15.04 kB gzip | unchanged |
| `vendor-embla-*.js` | 28.86 kB / 11.08 kB gzip | 28.86 kB / 11.08 kB gzip | unchanged (now with Home, not index) |

New route-scoped chunks (loaded when needed, not on `/login` `/plans` etc.):

- `Home-*.js`: 56.26 kB / 15.84 kB gzip
- `Home-*.css`: 87.05 kB / 15.57 kB gzip
- `Services-*.css`: 14.93 kB / 3.21 kB gzip
- `HowItWorksPage-*.css`: 2.75 kB / 0.96 kB gzip
- `PopupAdModal-*.css`: 1.55 kB / 0.65 kB gzip

Vite still warns that some chunks are larger than 500 kB (`index` JS remains ~710 kB minified). Build succeeds.

### 2) JS splitting changes

- `Home` moved from eager `App.jsx` import to `lazyPages.js` (`export const Home = lazy(...)`).
  - PublicLayout still paints Navbar/Footer immediately; Home content uses the existing route Suspense fallback.
- `PopupAdsHost` is now lazy + `<Suspense fallback={null}>`. Popup CSS/JS no longer sit in the initial public graph.
- `Unauthorized` remains eagerly imported (previous cleanup contract unchanged).
- Route guards, auth providers, and dashboard lazy pages were not changed.
- Create-order modal was already lazy behind `ClientCreateOrderModalProvider`; left as-is.
- Admin/finance/training-order pages were already behind `lazyPages.js`; left as-is.

### 3) CSS splitting/pruning changes

- Extracted public navbar + footer rules from `servicesPage.css` / how-it-works dropdown rules from `howItWorksPage.css` into `src/styles/publicChrome.css`.
  - `Navbar` and `Footer` import `publicChrome.css`.
  - `Services.jsx` still imports the remaining services-only CSS.
  - `HowItWorksPage.jsx` still imports the remaining how-it-works page CSS.
- Extracted home wallpaper / `.home-desktop-only` shell into `src/styles/publicHomeShell.css` for `PublicLayout`.
  - Hero internals stay in Home-only CSS (`home-landing-top.css`, `home-mobile-page.css`, `home-hero-loading.css`).
- Removed `PublicLayout` global import of full `servicesPage.css` and hero-loading CSS.
- Removed unused `home-skeleton.css` import from `Navbar`.
- Removed `order-details-page.css` import from the shared `Skeleton.jsx` barrel (order-details pages already import that CSS).

Not deleted: `legacy-application.css` remains globally imported from `main.jsx` (toast/navbar remnants/shared helpers still live there; too broad to prune in this phase).

### 4) Perceived-speed improvements

- `/` now shows public chrome (nav) while the Home chunk loads, instead of paying Home JS/CSS on every public route.
- Popup ads no longer contend with first paint.
- Route Suspense fallback (`RouteSuspenseFallback` / `AuthRouteSkeleton`) is unchanged and still avoids a blank white page.
- Home wallpaper shell CSS stays with `PublicLayout` so the home canvas does not flash unstyled.

### 5) Files intentionally kept global

- `src/index.css` (Tailwind + design tokens + base)
- `src/styles/typography.css`
- `src/styles/legacy-application.css` (toast + remaining shared/legacy rules)
- `src/styles/publicChrome.css` (navbar/footer; needed on every public page)
- `src/styles/publicHomeShell.css` (home layout wallpaper; scoped classes, small file)

### 6) Security boundaries preserved

- No auth/role/CSRF/CORS/rate-limit changes.
- No public cache for private dashboard data.
- No Stripe / payment / JOD / claims / subscription / min-bids / pantry collection backend changes.
- Popup ads still only fetch after auth (existing `usePopupAds` behavior).

### 7) Deferred opportunities

- Split `legacy-application.css` into public vs dashboard (largest remaining CSS cost after Tailwind).
- Further shrink `index` JS (i18n dashboard locale JSON, `api.js` surface, remaining shared providers).
- Live Lighthouse / throttled-network measurements per role route.
- Optional idle prefetch of `/orders` and `/plans` after first home paint.
- Image format/size audit for hero wallpaper and logos.

### 8) Tests/build results

- `frontend npm test`: pass (**209/209**, includes `phase2_performance.test.js`).
- `frontend npm run build`: pass.
- Targeted `eslint no-undef` sweep on PlanCard, OpenOrdersMarketplace, client financial/my-orders, freelancer articles, admin pantry/articles, training packages, finance pages: no errors.

## Performance Phase 3 — legacy CSS split

### 1) What was moved

Only blocks with a single proven import owner were extracted. Selectors were searched in `frontend/src` before moving. Unused rules inside those blocks were **not** deleted.

| Block | New home | Imported by |
| --- | --- | --- |
| About page (`.about-page`, `.about-reveal`, `.about-hero`, `.about-steps`, …) | `frontend/src/styles/aboutPage.css` | `pages/About.jsx` |
| Merged Services.css (`.services-error`, `.services-muted`, `.services-pill-row`, `.services-sub-grid`, skeletons, …) | appended to `frontend/src/styles/servicesPage.css` | `pages/Services.jsx` (already imported) |
| Unscoped `.pricing` / `.pricing-card` base | `frontend/src/styles/publicPlans.css` | `PricingSection.jsx` + `TrainingPlansSection.jsx` |
| Super-admin outlet compact (`.oh-sa-outlet .page-content`, compact `.card`/`.btn`/wizard density) | appended to `frontend/src/styles/adminDashboardShell.css` | `AdminLayout`, `SuperAdminLayout`, `FinancialUserLayout` (already imported) |

No Tailwind rewrite of large page styles. Auth password-eye styles were already Tailwind in `authTw.js`; the leftover `.auth-password-toggle` rules stay global and were not deleted.

### 2) What stayed global (and why)

Kept in `frontend/src/styles/legacy-application.css` (still imported from `main.jsx`):

- Toast stack (`.toast-stack`, z-index 9999) — app-wide.
- `html`/`body`/`direction: rtl`, `.container`, shared primitives (`.oh-skel`, `.form-grid`, chips).
- Old `.navbar-shell` rules — `Navbar` still has `navbar-shell`; parent `.navbar--at-top` looks unused but the standalone shell rules are live.
- Home hero (`.home-hero`, …) — `LocaleTransitionSkeleton` can render home-hero classes from any route during EN⇄AR switch.
- Marketplace / orders / assigned cards / order-details / client+freelancer my-orders / claims — mixed public + dashboard usage.
- Create-order panel/modal/JOD suffix/overflow (including `.form-co-flow`) — client modal + admin wizard page; wizard does not uniquely own `createOrderModal.css`.
- Remaining earlier `.oh-sa-outlet .container.page-content` rules — overlap admin density but sit inside mixed dashboard sections.
- `.pricing-card--skeleton` hover grouping — shared selector with pool/assigned/order skeletons.
- Password-toggle leftovers — unused in JSX after Tailwind auth, but not deleted in this phase.

### 3) Why risky sections were deferred

- **Do not convert the whole file at once** — remaining blocks are multi-route or used by locale overlay / skeletons.
- Moving home hero with lazy `Home` would unstyle the locale-switch overlay on non-home routes.
- Moving create-order CSS into `createOrderModal.css` would miss `AdminInternalOrderWizard` full-page mode unless the import graph is widened.
- Broad `.navbar` / `.btn` / `.card` / `.page-content` rules are still shared chrome.

### 4) Before/after CSS sizes

Phase 2 → Phase 3 (`frontend npm run build`):

| Chunk | Phase 2 | Phase 3 | Delta |
| --- | --- | --- | --- |
| `index-*.css` | 269.74 kB / 47.93 kB gzip | 235.98 kB / 42.01 kB gzip | **-33.76 kB / -5.92 kB gzip** |
| `index-*.js` | 709.62 kB / 200.88 kB gzip | 709.65 kB / 200.92 kB gzip | unchanged (hash noise) |
| `Services-*.css` | 14.93 kB / 3.21 kB gzip | 31.22 kB / 5.65 kB gzip | +16.29 kB (route-scoped Services.css) |
| `About-*.css` | (none) | 6.48 kB / 1.85 kB gzip | new About chunk |
| `Home-*.css` | 87.05 kB / 15.57 kB gzip | 87.05 kB / 15.57 kB gzip | unchanged |
| `adminDashboardHub-*.css` | ~46.2 kB / ~7.9 kB gzip | 51.75 kB / 8.72 kB gzip | +compact outlet styles on lazy admin shell |
| `useDefaultCatalogPlans-*.css` | ~32.7 kB / ~5.8 kB gzip | 37.91 kB / 6.74 kB gzip | +unscoped pricing base on plans graph |

Vite still warns that some chunks are larger than 500 kB (`index` JS remains ~710 kB). Build succeeds.

Built index CSS no longer contains `.about-page`, `.services-error`, unscoped `.pricing{`, or `.oh-sa-outlet .page-content`. It still contains `.toast-stack`, `.home-hero`, `.navbar-shell`.

### 5) Routes checked

Code + tests + production build (not live Lighthouse):

- Public: `/`, `/plans`, `/login`, `/register`, `/orders` — public chrome still `publicChrome.css`; Home CSS still Home-only; plans pricing CSS now on the plans graph; login/register still Tailwind + `auth-pages.css`.
- Client: `/dashboard/client`, `/dashboard/client/orders`, `/dashboard/client/my-orders` — no CSS import removed from those pages; marketplace/my-orders rules remain global.
- Freelancer: `/dashboard/freelancer`, `/dashboard/freelancer/orders`, `/dashboard/freelancer/articles` — same; freelancer plans still get `publicPlans.css` via `PricingSection`.
- Admin/Super Admin: `/dashboard/super-admin/pantry`, `/marketplace-articles`, `/training-packages`, `/financial-center` — compact outlet CSS loads with lazy `AdminLayout` / `SuperAdminLayout` / `FinancialUserLayout`.

Runtime safety (static):

- No missing CSS imports for moved blocks.
- `Unauthorized` remains eager; Navbar/Footer still import `publicChrome.css`.
- Toast z-index 9999 remains global (no modal stacking change).
- RTL `direction` on `body` remains global.
- High-risk JSX identifiers (`MembershipPlanCardBody`, `MarketplaceOrderListRow`) still imported.
- ESLint on changed files + listed high-risk pages: no new errors. Pre-existing `Plans.jsx` hooks lint is unrelated and was not changed.

### 6) Tests/build results

- `frontend npm test`: pass (**215/215**, includes `phase3_performance.test.js`).
- `frontend npm run build`: pass.
- Backend tests not run (backend unchanged).

### 7) Remaining CSS opportunities

- Peel home-hero only after locale-overlay CSS is owned by `LocaleTransitionSkeleton`.
- Peel create-order overflow after `AdminInternalOrderWizard` imports the same stylesheet as the client modal.
- Prove unused `.navbar--at-top` / `.navbar--scrolled` parent selectors, then keep `.navbar-shell` only.
- Marketplace pool/assigned/order-card CSS is still the largest mixed-role leftover in `legacy-application.css`.
- Optional: delete proven-unused password-toggle CSS after a visual pass on Login/Register.

## Performance Phase 4 — Initial JS Chunk Reduction

### 1) Initial JS bottlenecks found

Definitely in the Phase 3 `index` graph (~710 kB):

- Entire `services/api.js` (~100 kB source) because Auth, currency, analytics, Navbar/Footer public hooks, and NotificationsBell imported any export from that module.
- Dashboard locale JSON (~275 kB source across ar/en `dashboard`, `freelancerDashboard`, `trainingOrders`) via `i18n/resources.js` → `LanguageProvider`.
- Plan catalog + `freelancerSessionCache` fetch helpers via `AuthContext` invalidate imports (auth only needed cache reset).
- Lucide featured-service icons via `LocaleTransitionSkeleton` → `CategoriesSkeleton` → `homeFeaturedServices.js`.
- NotificationsBell JS on every public page (even guests).

Suspected / left in index on purpose:

- `authRoutes.js` title maps and `dashboardPermissions` (needed by eager `AuthGuards` / `App.jsx` route tree).
- Public locale JSON (nav/auth/home/plans/orders).
- Axios (now a separate `vendor-axios` chunk still loaded with the shell).
- Toast, PublicLayout, Unauthorized, locale overlay (generic + home/plans/services/orders skeletons).
- PostHog remains a separate vendor chunk and still idle-inits.

### 2) Files/modules split or moved

- `services/httpClient.js` — axios instance + session keys.
- `services/authSessionApi.js` — `/auth/me` bootstrap, login/register/logout/otp.
- `services/publicChromeApi.js` — currency display, footer/site-pages, how-it-works nav probe, public pageview.
- `services/notificationsApi.js` — bell/list/read helpers.
- `api.js` re-exports those helpers so lazy pages keep existing import paths. Payment/JOD/checkout helpers were not rewritten.
- `freelancerSessionCacheStore.js` — invalidate-only; `AuthContext` no longer loads plan catalog.
- Dashboard locales load from `i18n/dashboardResources.js` imported by lazy `MainLayout`.
- Lucide icon map moved to `homeFeaturedServiceIcons.js`; skeleton only needs the count.
- `NotificationsBell` is lazy inside `Navbar` (logged-in desktop only).
- Vite `manualChunks`: `vendor-axios`.

Route guards, `Unauthorized` eager import, Stripe/checkout request shapes, and permission constants were not changed.

### 3) What stayed global and why

- `LanguageProvider` + public namespaces (needed for first paint and locale overlay).
- `AuthGuards` + `dashboardPermissions` + `ROLE` (route tree in `App.jsx`).
- PublicLayout / Navbar / Footer / toast / currency provider.
- Axios client (session bootstrap + public chrome fetches).
- Locale overlay home/plans/services/orders skeletons (language switch on public routes).

### 4) Before/after JS sizes

Phase 3 → Phase 4 (`frontend npm run build`):

| Chunk | Phase 3 | Phase 4 | Delta |
| --- | --- | --- | --- |
| `index-*.js` | 709.65 kB / 200.92 kB gzip | **387.41 kB / 115.92 kB gzip** | **-322.2 kB / -85.0 kB gzip** |
| `index-*.css` | 235.98 kB / 42.01 kB gzip | 235.98 kB / 42.01 kB gzip | unchanged |
| `vendor-posthog-*.js` | 183.93 / 61.32 | 183.93 / 61.32 | unchanged (still idle-init) |
| `vendor-router-*.js` | 42.37 / 15.04 | 42.37 / 15.04 | unchanged |
| `vendor-axios-*.js` | (inside index) | 36.49 / 14.47 | split out of index |
| `MainLayout-*.js` | small layout chunk | 235.55 / 61.74 | dashboard locales + admin nav now with dashboard shell |
| `Home-*.js` | 56.26 / 15.84 | 59.23 / 17.09 | lucide featured icons with Home |
| `api-*.js` | (inside index) | 41.45 / 8.31 | remaining API helpers for lazy pages |
| `NotificationsBell-*.js` | (inside index) | 4.62 / 1.94 | logged-in nav only |

Vite **no longer warns** that the main chunk is > 500 kB. Build succeeds.

### 5) Any new route chunks

- `vendor-axios-*`, `api-*`, `NotificationsBell-*`, `freelancerSessionCache-*`.
- `MainLayout-*` grew because dashboard locale JSON moved there (authenticated routes only).

### 6) Runtime safety checks

- `api.js` still re-exports split functions; checkout path `/client/orders/${orderId}/pay-checkout` unchanged.
- PlanCard / OpenOrdersMarketplace JSX identifiers still imported.
- `Unauthorized` remains eager.
- Navbar still imports BrandLogo / publicChrome; bell is lazy + Suspense.
- ESLint on changed files: no new `no-undef`. Pre-existing hooks/fast-refresh lints on `HomeFeaturedServicesGrid` / `CurrencyDisplayContext` were not introduced by this phase.
- Arabic/English: public namespaces stay eager; dashboard namespaces merge when `MainLayout` loads, so dashboard `t()` works after login and locale switch on dashboard still has both ar/en dashboard JSON.

### 7) Tests/build results

- `frontend npm test`: pass (**220/220**, includes `phase4_performance.test.js`).
- `frontend npm run build`: pass; no >500 kB chunk warning.
- Backend tests not run.

### 8) Deferred opportunities

- Split remaining `authRoutes` title maps out of the public graph if DocumentTitle/Navbar stop needing them.
- Lazy `LanguageSwitcher` (currently imported but hidden).
- Further split `api.js` leftover for lazy pages (admin/finance) — not needed for first public paint.
- Locale overlay home skeletons still sit in index (needed for EN⇄AR on `/`).
- Live Lighthouse on `/login` vs `/dashboard/freelancer` after this split.

## Performance Phase 5 — Live Browser Measurement and Route Smoke

Production-like frontend: `frontend npm run build` then `npm run preview` on `http://localhost:4173` (proxied `/api` to the already-running local backend). No deploy, no migrations, no backend/DB/payment changes. Headless Chrome (CDP) with cache disabled.

### 1) Routes measured

Public (full render): `/`, `/plans`, `/orders`, `/login`, `/register`, `/services`.

Crash sweep (full render): `/plans?type=membership`, `/plans?type=training`.

Authenticated (guest session only — no local test login used):

- Client: `/dashboard/client`, `/dashboard/client/orders`, `/dashboard/client/my-orders`, `/dashboard/client/financial`
- Freelancer: `/dashboard/freelancer`, `/dashboard/freelancer/orders`, `/dashboard/freelancer/articles`, `/dashboard/freelancer/getting-started`
- Super Admin: `/dashboard/super-admin/pantry`, `/dashboard/super-admin/marketplace-articles`, `/dashboard/super-admin/training-packages`, `/dashboard/super-admin/financial-center`
- Financial: `/dashboard/my-bonuses`

Lazy-chunk evaluation (dynamic `import()` after the SPA loaded): `MainLayout`, client home/orders/my-orders/financial, freelancer home/articles/getting-started, admin pantry, super-admin marketplace-articles/training-packages/financial-center, financial bonuses, `Plans`, `Home`. All **15/15 ok**.

### 2) Throttle / device settings used

| Profile | Viewport | Network | CPU |
| --- | --- | --- | --- |
| Mobile Fast 3G | 375×812, DPR 2 | Chrome Fast 3G (562.5 ms RTT, 1.6 Mbps down, 750 kbps up) | 4× |
| Desktop Slow 4G (pass 1) | 1366×768 | ~150 ms RTT, 4 Mbps down | 1× |
| Desktop unthrottled (pass 2) | 1366×768 | local LAN, no CPU throttle | 1× |

Cache disabled on every navigation. Arabic default locale (`dir=rtl`, `lang=ar`).

### 3) Main findings

JS/CSS splitting **did not** produce blank pages, missing CSS, or undefined-component crashes on public routes. Shell paint is fast when the network is local.

Unthrottled desktop FCP: **148–252 ms** (`/login` 148, `/plans` 152, `/orders` 160, `/services` 164, `/` 252).

Mobile Fast 3G + 4× CPU FCP (user-perceived first paint):

| Route | FCP | Load | First-paint impression |
| --- | --- | --- | --- |
| `/` | 2.7 s | 2.3 s | Hero + search + category icons visible; RTL correct |
| `/plans?type=membership` | 6.0 s | 5.9 s | STARTER plan card + MembershipPlanTitle visible |
| `/plans?type=training` | 2.3 s | 2.2 s | Training package card + JOD/USD visible |
| `/orders` | 2.3 s | 2.2 s | Marketplace **skeleton** still showing at 16 s (list waiting on API) |
| `/login` | 6.6 s (pass 1) | 6.5 s | Login form visible; no crash |
| `/register` | 2.3 s | 2.2 s | Register stepper visible |
| `/services` | 2.3 s | 2.2 s | Services copy visible |

Largest **document** requests on Fast 3G: `index-*.js` ~115 kB gzip / 1.6–2.7 s transfer; `index-*.css` ~42 kB gzip. Route chunks (`Home` 17 kB gzip, `Plans` 8.6 kB, `OpenOrdersMarketplace` 9.7 kB) are small next to API wait.

Unthrottled API TTFB is now the real bottleneck (local backend, not Fast 3G):

- `GET /api/orders/pool` **9.0–11.4 s** (home teaser + `/orders` list)
- `GET /api/public/home-stats` **8.0 s**
- `GET /api/public/pages/how-it-works-client` and `...-freelancer` **4.3–5.4 s each**, on **every** public page including `/login`
- `GET /api/public/site-pages` **twice** per page (~2.3–2.8 s each) — Navbar and Footer each call `usePublicSitePages()` with no shared in-flight cache
- `GET /api/public/faq` **twice** on home
- `GET /api/public/footer-settings` ~2.2–2.5 s

Images: `/hero/background.webp` **2.5 MB, requested twice** on home desktop (CSS `url()` in both `publicHomeShell.css` and `home-hero-marketing.css`, plus `useHeroWallpaperReady` preload). `logo.png` ~116 kB 2–3×; `fullLogp.png` ~210 kB on home/login.

`vendor-embla` (~11 kB gzip) loaded on `/login` and `/plans`, not only Home. `vendor-posthog` (~61 kB gzip) still arrives after idle on public routes.

### 4) Console / runtime errors

No:

- `MembershipPlanTitle is not defined`
- `MarketplaceOrderListRow is not defined`
- failed dynamic import (chunk evaluation)
- undefined JSX component errors
- auth redirect loops (all dashboard URLs → `/login` once)

One non-crash rejection on `/plans?type=membership` (Fast 3G): `AxiosError: timeout of 8000ms exceeded` for a how-it-works nav probe that took ~8.6 s. Page still rendered.

`/logo.png` `ERR_ABORTED` on two guest dashboard redirects — aborted navigation, not a missing lazy chunk.

### 5) Remaining real bottlenecks

| Severity | Category | Evidence |
| --- | --- | --- |
| **critical** | slow API | `/api/orders/pool` 9–11 s; `/orders` still skeleton at 16 s on Fast 3G |
| **critical** | slow API | `/api/public/home-stats` 8 s |
| **high** | repeated request | `site-pages` ×2 (Navbar+Footer); `faq` ×2 on home; how-it-works client+freelancer probes on every public route |
| **high** | image loading | `background.webp` 2.5 MB ×2 on `/` |
| **medium** | CSS blocking | `index-*.css` 42 kB gzip still on the critical path (Fast 3G ~0.9–1.9 s) |
| **medium** | large route-adjacent JS | `index` 116 kB gzip still the biggest JS; PostHog 61 kB gzip after idle |
| **medium** | render delay | `/orders` marketplace CSS (`dashboardHub` + `OpenOrdersMarketplace`) loads with the public list |
| **low** | post-login route load | `MainLayout` 236 kB / 62 kB gzip (dashboard locales) — not measured logged-in |
| **low** | mobile layout jank | none observed on screenshots; RTL intact |

Do **not** treat remaining index JS as the next user-facing win. Live data says APIs and images first.

### 6) Quick fixes applied

None. Duplicate `site-pages` is two legitimate hook consumers, not an unstable `useEffect` dependency. No missing import, no broken lazy path, no blank-page Suspense hole on measured public routes. Large API/image work is deferred (out of Phase 5 scope).

### 7) Recommended next performance phase or stop point

**Phase 6 (frontend-only, still no backend logic change):** share in-flight/TTL cache for public chrome (`site-pages`, footer-settings, how-it-works nav probes) the same way Phase 1 cached training packages; stop double-fetching `faq`; serve one copy of `background.webp` (single CSS url + no extra preload, or compress/resize).

**Stop further JS splitting** until a logged-in dashboard session is measured. Optional later: logged-in smoke of client/freelancer/admin dashboards with a local test user (still no production writes).

Backend pool/home-stats latency is the largest win but is **out of scope** for this frontend-only track unless a separate backend performance pass is requested.

Phase 5 tests: no frontend source change, so tests were not re-run. Last known: **220/220**. This session’s `npm run build` succeeded; preview smoke of public + crash routes passed; authenticated routes passed guest-guard smoke + lazy-chunk import only.


