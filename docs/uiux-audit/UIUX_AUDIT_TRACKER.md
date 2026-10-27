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

## Phase 2 — Freelancer dashboard

Staging fixtures: 3 QA freelancers (pending-start SILVER with full order history, new account, active SILVER), 1 QA client, 7 orders; cleaned after capture. 276 BEFORE / 276 AFTER; authenticated Production screenshots not captured (no legitimate Production freelancer session).

| ROUTE | SURFACE | ROLE | AR/EN | DESKTOP | MOBILE | BEFORE CAPTURED | AUDITED | CHANGED | AFTER CAPTURED | DEPLOYED | NOTES |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/dashboard/freelancer` | Overview | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | Shared DashboardButton icon overflowed onto CTA label; EN tip clipped (6 equal columns); mobile KPIs one long column → 2-up. Action priority (courses first) unchanged |
| `/dashboard/freelancer/orders` | Available orders | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Locked-order upgrade CTA was a primary button (wall of upsells) → outline secondary; 10px helper → 11.5px; applied rows get a submitted state |
| `/dashboard/freelancer/orders/:id` | Order details (+ apply modal) | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Dangling '— مزايدة' in summary; shared FileList: bidi-isolated 2-line names + type chip |
| `/dashboard/freelancer/my-orders` | My orders | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Rainbow CTAs; 'waiting for review' status rendered as a filled button → brand primary / amber / outline 'view order' |
| `/dashboard/freelancer/my-orders/:id` | Order workspace (in progress, delivered, revision, completed, delivery form) | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | MODERNIZE | ✓ | ✓ | Native file input ('No file chosen' in Arabic UI) → shared OrderFilesPicker; delivery before history; duplicate history heading removed; safe localized errors |
| `/dashboard/freelancer/plans` | Membership (pending start, active, none) | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | Backend Arabic statusMessageAr leaked into EN (purchased_pending_start); status truncated; 2 plan columns at 390px → 1 (dashboard-scoped) |
| `/dashboard/freelancer/financial-claims` | Wallet & claims (+ empty) | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Four empty groups as full cards → compact one-line headers |
| `/dashboard/freelancer/activate-account` | Identity / KYC (verified, not submitted) | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | Duplicate title → status badge; duplicate hint; Arabic messageAr shown in EN; policy panel title hardcoded Arabic + empty box (policy items 1–45 not supplied — content gap) |
| `/dashboard/freelancer/notifications` | Notifications (+ empty) | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ |  |
| `/dashboard/freelancer/settings` | Settings | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ |  |
| `/dashboard/freelancer/feedback` | Problems & suggestions | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Text messaging surface; no change |
| `/dashboard/freelancer/articles` | Articles | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ |  |
| `/dashboard/freelancer/courses` | Courses | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ |  |
| `/dashboard/freelancer/getting-started` | Getting started | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ |  |
| `/dashboard/freelancer/institution-orders` | Institution orders | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ |  |
| `/dashboard/freelancer/pantry` | Pantry | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Uses the pool rows (inherits pool polish) |
| `/dashboard/referrals` | Referrals | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Program disabled |
| `/dashboard/freelancer/convert-account` | Convert account | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ |  |
| `(shell)` | Sidebar collapsed / mobile drawer | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ |  |
| `/dashboard/freelancer/courses/:id, articles/:id, elite-offers/:id` | Detail sub-pages | Freelancer | — | — | — | — | — | — | — | — | Not captured: require course/article/elite-offer fixtures; deferred to Phase 5 (shared) |

## Phase 3 — Client dashboard

Staging fixtures: 2 QA clients (9 orders across every lifecycle state, and a new client with none) + 1 QA freelancer (bid, deliveries, resubmission); cleaned after QA. No client Draft feature exists (unpaid fixed orders are purged when checkout fails/cancels) — not invented. Authenticated Production screenshots not captured (no legitimate Production client session).

| ROUTE | SURFACE | ROLE | AR/EN | DESKTOP | MOBILE | BEFORE CAPTURED | AUDITED | CHANGED | AFTER CAPTURED | DEPLOYED | NOTES |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/dashboard/client` | Overview (populated, new client) | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | Create order was a tiny orphan link → hero primary (opens the modal); 'needs attention' counted open orders with no offers → shared next-step rule; follow-ups deep-link `?orderId=`; duplicate star icons |
| `/dashboard/client/my-orders` | My orders (populated, empty) | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | MODERNIZE | ✓ | ✓ | Narrow 3-col chip cards → full-width rows with status badge, per-state 'next step' strip, one primary action, details toggle; filter tabs with counts; 'needs your action' stat; `?orderId=` opens + highlights the order; delivery/revision actions only when the API accepts them |
| `/dashboard/client/orders/create` | Create order modal (empty, validation, files, review) | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Files step → shared OrderFilesPicker (per-file remove, type icon, size, inline size error); no disabled 'Previous' on step 1; review lists file names + 'amount due now' summary before Stripe |
| `/dashboard/client/my-orders` (expanded) | Order details (pending payment, open + offer, available, in progress, delivered, revision, resubmitted, completed, cancelled) | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | MODERNIZE | ✓ | ✓ | Expansion only revealed the full description → description, dates, client attachments (view/download), revision note, history; timeline follows UI direction with i18n badges (was hard-coded RTL + Arabic-only server labels); amber revision card |
| `(dialog)` | Delivery review (delivered, resubmitted, revision with files) | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | MODERNIZE | ✓ | ✓ | Native 'No file chosen' input in Arabic UI; everything stacked; one-click approve → OrderDialog, FileList rows, collapsible history, revision as second view with OrderFilesPicker, approve behind ConfirmDialog (double-click guarded); bottom sheet on phones |
| `(dialog)` | Revision request (empty, filled) | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | Could not attach files although the API accepts them; offered before any delivery (API 409) → OrderDialog + OrderFilesPicker, sent with files, shown only after a delivery; safe errors |
| `(dialog)` | Bid offers | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Inline-styled card-in-card → OrderDialog, amount prominent, freelancer message shown, reject as quiet text action |
| `/dashboard/client/my-orders?paid|cancelled` | Stripe return toasts | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | EN toast rendered RTL (body hard-coded `direction: rtl`) → body follows `<html dir>`; copy unchanged (pinned by test); trusted server confirmation unchanged |
| `/dashboard/client/financial` | Finance (populated, empty) | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | Raw 'pending' payment status; wide table scrolled sideways on phones hiding Pay now → localized statuses; labelled row cards ≤640px |
| `/dashboard/client/notifications` | Notifications (populated, empty) | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | Category + unread dot shown twice per card (shared component → Freelancer fixed too) |
| `/dashboard/client/profile` | Profile | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | EN page right-aligned/RTL → global body direction fix |
| `/register` (side effect) | Register validation | Public | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | With body now truly LTR in English, focusing the first invalid field scrolled it under the floating header → focus without scroll + centre the field (same in AR/EN). Phase 1 pixel regression: login/plans 0.00%, register static 0.00%; validation states differ only by fixed-header position in full-page captures |
| `/dashboard/client/settings` | Settings | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Safe error messages only |
| `/dashboard/client/feedback` | Problems & suggestions | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Shared with Freelancer |
| `/dashboard/referrals` | Referrals | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Program disabled |
| `/dashboard/client/convert-account` | Convert account | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ |  |
| `/dashboard/client/orders` | Request marketplace | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Shared pool (Phase 2) |
| `/dashboard/client/orders/:id` | Marketplace order | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Shared detail page; dormant Elite Direct panel calls `/api/api/...` (404) — reported, not activated |
| `(shell)` | Sidebar collapsed / mobile drawer | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Same shell as Freelancer |

## Phase 4 — Super Admin / Admin control center

Staging fixtures: [UIUX-P4] client, freelancer (Annual SILVER, deliveries/revision files, pending financial claim) and a restricted freelancer (bids + messaging); existing Staging staff accounts for read-only navigation; cleaned after QA. 322 BEFORE / 322 AFTER; no authenticated Production screenshots. Modules named in the brief but not present in the product (disputes, ERP/CRM, bookings, HR, organizations/contacts, communications, people leads, agreements, report pages) were not invented. Shared change: DashboardPageHeader adopts the existing compact control-center header inside the admin shell (redundant eyebrow hidden); DashboardStatCard scorecards tightened inside the admin shell.

| ROUTE | SURFACE | ROLE | AR/EN | DESKTOP | MOBILE | BEFORE CAPTURED | AUDITED | CHANGED | AFTER CAPTURED | DEPLOYED | NOTES |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/dashboard/super-admin` | Overview | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | مركز تحكم قوي: مؤشرات، نبض المتابعة، تحميل مرحلي — مرجع تصميمي |
| `/dashboard/super-admin/analysis` | Analytics | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | مرجع تصميمي (رأس مضغوط، جداول وأشرطة) |
| `/dashboard/super-admin/users` | Users | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | لوحة تفاصيل المستخدم تعرض «لا يوجد قيد نشط» قبل وصول نتيجة التحقق — لمستقل مقيَّد فعلاً (طلب القيود يستغرق 2–4.5 ث على Staging); زر «إضافة إلى قائمة القيود» يظهر أثناء التحميل لمستخدم مقيَّد; خلايا الجدول بمحاذاة يمين ثابتة في الإنجليزية |
| `/dashboard/super-admin/account-restrictions` | Account restrictions | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | مسار الشريط العلوي «الرئيسية» فقط; جداول المستخدمين/الباقات بمحاذاة يمين في الإنجليزية |
| `/dashboard/super-admin/orders` | Internal requests | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | MODERNIZE | ✓ | ✓ | عرض البطاقات: كل بطاقة ~340px بفراغ كبير (min-height بطاقة المعرض); عرض الجدول: أعمدة مطوّرين خام (assignedFreelancerId, createdAt, files, skills)، قيم true/false، تاريخ ISO، «fixed» و«1 days» غير مترجمة، عرض أدنى 1200px; عنوان صفحة ضخم بأسلوب تسويقي |
| `/dashboard/super-admin/financial-center` | Financial center | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | رأس ضخم (عنوان ~30px + سطر «لوحة المدير الأعلى» مكرر) |
| `/dashboard/super-admin/financial-claims` | Financial claims | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | رأس ضخم ومكرر |
| `/dashboard/super-admin/fazat-settlements` | FAZAT settlements | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/referrals` | Referrals | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | 11 بطاقة مؤشر طويلة; المسار العلوي «الرئيسية» فقط |
| `/dashboard/super-admin/training-orders` | Training requests | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/pantry` | Pantry | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | مسار علوي مضاف فقط |
| `/dashboard/super-admin/articles` | Articles | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ |  |
| `/dashboard/super-admin/plans` | Plans | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/marketplace-plans` | Marketplace membership plans | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | بطاقات الباقات بلا تنسيق عند الفتح المباشر — ملف CSS كان مستورداً فقط في صفحات أخرى |
| `/dashboard/super-admin/training-packages` | Training packages | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/marketplace-economy` | Marketplace economy | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/freelancer-activation-requests` | Identity / activation requests | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | MODERNIZE | ✓ | ✓ | جدول خام بأنماط مضمّنة: لا حدود، الحالة نص، «عرض» رابط نصي; التواريخ عربية دائماً حتى في الإنجليزية; عنوان ضخم وحده |
| `/dashboard/super-admin/bildazo-author-links` | Bildazo author links | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/subscriptions` | Freelancer subscriptions | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | عمود الإجراءات مقصوص: الجدول 1088px داخل لوحة 1051px، فـ«إلغاء» خارج الشاشة; على 1024–1359 الجدول يحتاج تمريراً أفقياً لرؤية الإجراءات; الجدول مثبت على RTL في الإنجليزية؛ أسماء الباقات «الاش…» |
| `/dashboard/super-admin/courses` | Courses | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/ads` | Ads | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/edit-website` | Edit website | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/institutions` | Institutions | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/institutional-order-storage` | Institutional order storage | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/admins` | Admins | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/rate-limit-exemptions` | Rate-limit exemptions | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/onboarding` | Onboarding | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/feedback` | Problems & suggestions | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin/notifications` | Notifications | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | المكوّن المشترك (أُصلح تكرار الفئة في المرحلة 3)؛ مسار علوي مضاف |
| `/dashboard/super-admin/settings` | Account settings | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/admin` | Admin task center | Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | بطاقات مهام مع عدادات واضحة |
| `/dashboard/admin/articles` | Admin articles review | Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | كل تحميل يطلب نقطة حملات التفعيل الخاصة بالمدير الأعلى فيعود 403 |
| `/dashboard/admin/settings` | Admin settings | Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ |  |
| `/dashboard/super-admin` | Navigation | Super Admin | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | 8 مجموعات منطقية، حالة نشطة واضحة، طي وقائمة جوال سليمة — لم يُعد تنظيم الوحدات |

## Phase 5 — Shared components (pending)
## Phase 6 — Final (pending)
