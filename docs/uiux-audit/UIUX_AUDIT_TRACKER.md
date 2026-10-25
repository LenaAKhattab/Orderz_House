# OrderzHouse UI/UX Audit Tracker

Persistent tracker for the phased UI/UX modernization. **No screenshots in Git** — artifacts live outside the
repository under `%USERPROFILE%\OrderzHouse-UIUX-Audit\<Phase>\{before,after,production,report}`.

Screenshot naming: `<page>-<ar|en>-<width>[-<state>]-<before|after>.png` (e.g. `packages-training-ar-1440-before.png`).
Before/after pairs use the same viewport, locale, route, anonymous state, Staging API data and a scroll pass
(lazy images + scroll-reveal) before full-page capture.

Classification: **KEEP** (already strong) · **POLISH** (good base, refined) · **MODERNIZE** (meaningful visual/UX
upgrade) · **FIX** (actual defect).

## Design source of truth (current strongest patterns)

| Area | Reference | Notes |
|---|---|---|
| Public page | Home hero + categories, About | Navy `#2f3b65` + cyan `#76cfdf` (+ orange accent), Cairo, 12–16px radii, soft shadows |
| Pricing / cards | Annual SILVER card | Price ≈ 2rem / 950 weight, metric rows, single CTA |
| Auth / forms | Login split card | 52px inputs, 16px radius, cyan focus ring, navy primary CTA |
| Navigation | Floating pill navbar + mobile drawer | Navy CTA pill, active underline |
| Buttons | Navy pill primary, outline secondary | Plans toggle uses brand indigo gradient (kept) |
| Mobile | Plans mobile cards, mobile drawer | Full-width CTAs, stacked cards |

## Phase 1 — Public website + Auth + Packages

| ROUTE | SURFACE | ROLE | AR/EN | DESKTOP | MOBILE | BEFORE CAPTURED | AUDITED | CHANGED | AFTER CAPTURED | DEPLOYED | NOTES |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | Home | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Removed ~100px stacked spacing between full-viewport hero and categories |
| `/plans?type=membership` | Packages — Marketplace Membership | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Price 20px→~30px; taglines/periods ≥12px; roomier cards; edge-faded glow (was a hard band); a11y `<h1>` |
| `/plans?type=training` | Packages — Training | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | 4th package orphaned + stretched to 368px → count-aware 4-up / 2×2; prices enlarged |
| `/plans?type=annual` | Packages — Annual SILVER | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Reference card; shared glow fix only. Commercial rules untouched |
| `/plans/freelancers`, `/plans/client-offer` | Legacy plan aliases | Anonymous | — | — | — | — | ✓ | FIX | — | ✓ | Rules-of-hooks bug (early `<Navigate>` before hooks) |
| `/login` | Login | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Client-side validation, field errors + `aria-invalid`, focus first invalid, single `role=alert` (was toast + banner + 400 request) |
| `/register` | Register | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Invalid field highlighted + focused; show/hide password (shared `AuthPasswordInput`) |
| `/forgot-password` | Forgot / reset password | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Shared auth panel badge fix (compact white pill — logo now visible; AR, as before) |
| `/about` | About | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Strong |
| `/services` | Services | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Strong |
| `/orders` | Public orders pool | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Strong |
| `/how-it-works/freelancer` | How it works — Freelancer | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | MODERNIZE | ✓ | ✓ | 3.5k-char centred text wall → structured start-aligned guide (headings/paragraphs) |
| `/how-it-works/client` | How it works — Client | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Shared step-text typography |
| `/guarantee` | Guarantee | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | MODERNIZE | ✓ | ✓ | Shared `RichContent` (section headings) |
| `/help-center` | Help center | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Shared `RichContent`; content itself is short (CMS) |
| `/find-work` | Find work | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Shared `RichContent` |
| `/community` | Community | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | MODERNIZE | ✓ | ✓ | Shared `RichContent` |
| `/blog` | Blog | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | MODERNIZE | ✓ | ✓ | Shared `RichContent` |
| `/privacy-policy` | Privacy | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | `•` lists were flattened into run-on paragraphs → real lists, headings, meta line |
| `/terms-conditions` | Terms | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | Same flattening (194 bullets, 58 numbered items) → lists + numbered sections |
| `/account-deletion` | Account deletion | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Already structured |
| `*` (404) | Not found | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | |
| Header / mobile drawer | Public navigation | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Compact pill; drawer clear |
| Footer | Public footer | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Dashboard rule stays scoped to `.site-footer` (no generic `footer` selector) |
| `/ref/:code`, `/freelancer/legacy-join/:slug` | Referral / campaign join | Anonymous | — | — | — | — | — | — | — | — | Out of scope: referral disabled; campaign-specific slug |

## Phase 2 — Freelancer (pending)
## Phase 3 — Client (pending)
## Phase 4 — Super Admin (pending)
## Phase 5 — Shared components (pending)
## Phase 6 — Final (pending)
