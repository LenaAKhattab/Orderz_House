# Web design cleanup plan (Phase 0.5 follow-on)

**Status:** Visual Phase A done in 1A. Scoped CSS→Tailwind done in **Phase 1A.1**. Remaining items stay in Phase B/C.  
**Baseline:** `docs/DESIGN_TOKENS.md`, `frontend/src/index.css`, `frontend/src/styles/dashboardTokens.css`.  
**Related:** `docs/WEB_CLEANUP_AND_LOGIC_AUDIT.md` (Phase 0 + 0.5).

Do **not** redesign the marketing home, dashboard shell geometry, Stripe/payment UIs, min-bids flows, or freelancer pantry as a separate product.

---

## Design risk map (priority)

| Page / component | Audience | Issue type | Severity | Desktop | Mobile | Suggested fix | Safe now? | Approval? |
|---|---|---|---|---|---|---|---|---|
| `/dashboard/admin/settings` | Admin | FIXED in 1A | — | Routed | Routed | `AdminSettingsPage` + admin menu | Done | — |
| Freelancer articles pages | Freelancer | FIXED in 1A (routes + token cards) | — | Live | Live | Apply UI only; no admin override | Done | — |
| `.client-order-modal-overlay` | Client | FIXED in 1A | — | `--oh-z-wizard` 1350 | Same | Above ads/dialogs | Done | — |
| Popup ads vs create-order | All | FIXED in 1A | — | Scale in tokens | Same | Ads 1300, wizard 1350, toast 9999 | Done | — |
| Onboarding help `z-index` | Freelancer | FIXED in 1A | — | `--oh-z-overlay` | Same | 1100 | Done | — |
| Create-order stepper @420px | Client | FIXED in 1A | — | — | Wrap + 0.8rem | No 0.65rem | Done | — |
| Dashboard shell ≤1023 overlay | All dash | MOBILE ISSUE | Medium | — | 768–1023 | Manual QA; don’t rewrite grid yet | No | — |
| Pool filters hide ≤1120 | Client/FL | MOBILE ISSUE | Low–Med | Fine | Filter sheet | Keep; ensure `is-open` scroll | No | — |
| `freelancerOnboarding.css` | Freelancer | CONVERTED 1A.1 | — | Tailwind utilities | Same | File deleted | Done | — |
| Training packages admin CSS | Super-admin | CONVERTED 1A.1 | — | Tailwind fields | Forms OK | File deleted | Done | — |
| `pantryPages.css` tabs | Admin | CONVERTED 1A.1 | — | Tailwind tab buttons | Same | Rest of pantry CSS kept | Done | — |
| `:root --text-muted` = primary | Public | ACCESSIBILITY | Medium | Muted ≠ muted | Same | Use `#667085` | Later | Yes (global) |
| Training packages admin CSS | Super-admin | CONVERTED 1A.1 | Low | Tailwind fields | Forms OK | File deleted | Done | — |
| Financial center tables | Super-admin | MOBILE ISSUE | Medium | clip + cards | Horizontal table scroll | Keep overflow-x wrappers | No | — |
| Admin ads/courses CSS size | Staff | DUPLICATED COMPONENT | Low | Dense | Composer cramped | Don’t merge in first polish | No | Yes to restyle |
| Dual `DashboardEmptyState` vs hub empty | Dash | DUPLICATED | Low | Mixed | Mixed | Prefer hub empty | Later | No |
| Auth split card | Public | Healthy | — | Visual column ≥768 | Single column | Keep | — | — |
| Register radiogroup | Public | Healthy a11y | — | — | Chips wrap via `authChoiceGroup` | Keep | — | — |
| Public `/plans` + training tab | Public | LOW PRIORITY POLISH | Low | nowrap badges | `plans-mobile-page.css` | Don’t merge catalogs | No | — |
| `legacy-application.css` (~9k lines) | Global | OUTDATED STYLE | Medium | Toast + leftovers | — | Don’t delete; peel tokens slowly | No | Yes |

---

## Recommended phases

### Visual Phase A (first) — tokens + stacking only — **DONE in Phase 1A**

- [x] Publish a **z-index scale** in `dashboardTokens.css` (`drawer` 45, `overlay` 1100, `modal` 1200, `popup` 1300, `wizard` 1350, `toast` 9999).
- [x] Raise create-order overlay above ads (`--oh-z-wizard`).
- [x] Pantry tab + onboarding link/CTA colors → `--dash-primary`.
- [x] Route restores were included in Phase 1A (articles + admin settings) — still no deletions.

### Visual Phase A.1 — scoped CSS → Tailwind — **DONE**

- [x] Convert onboarding + training-packages-admin scoped CSS to utilities and delete those files.
- [x] Convert pantry tab styles to Tailwind; keep remaining pantry page CSS.
- [x] Move create-order stepper wrap/label rules to `max-[420px]:*` utilities; keep overlay + `::before`/`::after` in `createOrderModal.css`.

### Visual Phase B — shared primitives

- Tables: pantry/subscriptions use `DashboardTable` wrapper + overflow.
- Empty/loading: one dashboard pattern.
- Training-packages admin fields → existing admin input classes.

### Visual Phase C — screenshot QA

- Add Playwright (or manual device) shots at 375 and 1366 for: home, plans, login, register, pool marketplace, create-order, pantry admin, articles admin, financial center, onboarding.
- Save under `docs/design-audit/screenshots/`.

### Do not do in visual cleanup

- New marketing homepage.
- New dashboard IA.
- Flutter visual parity rewrite.
- Payment/JOD/claims visual overhaul beyond tokens.
- Reintroducing pantry tab, Work Tokens, merchant signup.

---

## Pages visually “healthy” (code)

Public: Home (dedicated hero CSS), About/Services, Plans, Login/Register/ForgotPassword shells, legal CMS pages, how-it-works.  
Dashboard: freelancer/client shells, hub homes, account-pages.css settings, notifications, marketplace (modern pool CSS with mobile filters).

## Pages needing polish (not full redesign)

Admin pantry, training-packages admin, marketplace-economy, bid-credits, onboarding getting-started, articles (if restored), financial-center/claims tables, ads/courses composers, create-order stepper on 320px.

## Verification this audit

- `npm test`: 138 pass  
- `npm run build`: success  
- Lint: not run (likely noisy vs Tailwind/legacy CSS)  
- Screenshots: none
