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

## Phase 5 — Shared UI, deferred states, payment trust

Staging fixtures: [UIUX-P5] client (unpaid fixed order, failed-payment order, priced bidding order with an offer), freelancer (assigned order), restricted freelancer (bids + messaging, 14-day expiry); cleaned after QA. 80 BEFORE / 80 AFTER (AR/EN, 390–1440); Arabic pixel parity verified per pair (differences traced to Staging data churn / external embeds). Report: `%USERPROFILE%\OrderzHouse-UIUX-Audit\Phase-05-Shared\report\index.html`.

| ROUTE | SURFACE | ROLE | AR/EN | DESKTOP | MOBILE | BEFORE CAPTURED | AUDITED | CHANGED | AFTER CAPTURED | DEPLOYED | NOTES |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/dashboard/freelancer/orders` | Available orders | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | Unconditional `direction: rtl` made the English pool RTL → scoped to `:where([dir="rtl"])` (zero specificity, same cascade slot) + `text-align: start`; Arabic unchanged incl. children of LTR-forced grids |
| `/dashboard/freelancer/orders/:id` | Pool order details | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | Same direction fix; raw axios error text → `getSafeApiErrorMessage` |
| `/dashboard/freelancer/plans` | Packages | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | MODERNIZE | ✓ | ✓ | Shared `SecureCheckoutNote` before Stripe (JOD, card / Apple Pay / Google Pay, page shown in English, nothing charged on return); renewal-failure copy from AR/EN keys |
| `/dashboard/client/my-orders` (offers) | Confirm selected offer | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | MODERNIZE | ✓ | ✓ | Trust note + «الطلب» terminology |
| `/dashboard/client/orders/create` (review) | Create order — amount due | Client | ✓/✓ | — | — | — | ✓ | POLISH | — | ✓ | Trust note added under the existing payment summary (covered by contract test) |
| `/dashboard/freelancer/my-orders/:id` | Order workspace | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | Raw `ready_for_work` → canonical label; delivery-lock copy explains why/when (policy unchanged) |
| `/dashboard/freelancer/elite-offers/:offerId` | Elite direct offer (dormant) | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX | ✓ | ✓ | `/api/api/...` 404 → correct paths; localized unavailable state; engine stays OFF |
| `/dashboard/freelancer/courses/:id` | Course detail | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Deferred from Phase 2; English alignment |
| `/dashboard/freelancer/articles/:id` | Article detail | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | Deferred from Phase 2; manuscript statuses via registry |
| `/dashboard/freelancer/orders` (restricted) | Restricted Freelancer | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Hold-capable by design (bids held «قيد المراجعة», no moderation details) |
| `/dashboard/freelancer/notifications` | Notifications | Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | KEEP | ✓ | ✓ | Migration 212 `idx_notifications_actor_user_id` (user deletion: 6,347 ms → 6.7 ms on Staging) |
| `/about`, `/` | About, Home | Anonymous | ✓/✓ | ✓ | ✓ | ✓ | ✓ | FIX / POLISH | ✓ | ✓ | Steps / promo ads / hero mockup no longer forced RTL; carousel follows page direction |
| `/plans?type=membership` | Special offer card | Anonymous / Freelancer | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | English grid direction; «متابعة الدفع» only for the exact offer version (`planTierCode`) |
| `/dashboard/client/financial` | Finance | Client | ✓/✓ | ✓ | ✓ | ✓ | ✓ | POLISH | ✓ | ✓ | `failed`/`expired` payment statuses via registry |
| `/dashboard/super-admin/subscriptions`, `/training-orders` | Admin dates | Super Admin | ✓/✓ | ✓ | — | ✓ | ✓ | FIX | ✓ | ✓ | Arabic «م/ص» + Arabic-Indic digits in English; AM/PM in Arabic → UI-locale formatting |
| `/dashboard/super-admin/financial-center` | Financial modals | Super Admin | ✓/✓ | ✓ | — | ✓ | ✓ | POLISH | ✓ | ✓ | Modals follow UI direction (`useTranslation().dir`) |
| `/dashboard/super-admin/users` (drawer) | Restriction summary | Super Admin | — | — | — | — | ✓ | PERFORMANCE | — | ✓ | Sequential 13 queries → concurrent groups (Staging median 1,870 → 944 ms; Production RTT ≈ 93 ms/query) |
| `/dashboard/super-admin/feedback` | Feedback list | Super Admin | — | — | — | — | ✓ | FIX | — | ✓ | First page aborted + refetched when categories loaded (`useDynamicCategoryFilter` dependency) → stable key |
| `/dashboard/super-admin/freelancer-activation-requests` | Activation KPI funnel | Super Admin | — | — | — | — | ✓ | FIX | — | ✓ | `unavailable` undefined (ReferenceError) → `unavailableMetrics` |

### Deferred inventory — final classification

| ITEM | SOURCE | STATUS |
|---|---|---|
| Freelancer detail routes (courses/:id, articles/:id, elite-offers/:id) | Phase 2 | RESOLVED |
| Restriction summary 2–4.5 s | Phase 4 | RESOLVED (PERFORMANCE: concurrent lookups, live/uncached) |
| `notifications.actor_user_id` index | Phase 4 | RESOLVED (migration 212, measured) |
| Feedback duplicate fetch | Phase 4 | RESOLVED (real app refetch, not StrictMode) |
| Elite Direct `/api/api` + raw client/freelancer UI | Phase 3 | RESOLVED (paths); activation = PRODUCT_DECISION_REQUIRED (engine OFF) |
| «فشل إنشاء المشروع» stale copy | Phase 4 | RESOLVED (dead helpers removed; «الطلب» terminology in order contexts) |
| Hard-coded RTL / dates / raw statuses / raw errors (client, freelancer, shared) | Phase 5 audit | RESOLVED |
| Admin raw errors (orders, staff settings, financial center, bid credits, analytics hooks, list loader, image pickers) | Phase 5 audit | RESOLVED (`getSafeApiErrorMessage`) |
| Admin raw statuses (article card, pantry bids, order bids, legacy subscription history, course-progress / analytics labels) | Phase 5 audit | RESOLVED (status registry / translator passed) |
| Operator diagnostic codes (bid-credit fulfil/reversal codes, campaign & article-ops run status, Arabic eligibility reason in admin) | Phase 5 audit | KEEP (internal Super Admin diagnostics) |
| Special-offer old-version «متابعة الدفع» | Payment hardening | RESOLVED |
| Statement descriptor | Payment acceptance | RESOLVED (`ORDERZHOUSE` suffix on one-time Checkout; subscriptions unchanged) |
| Arabic hosted Checkout | Payment acceptance | EXTERNAL (Stripe Checkout has no `ar`); Elements/embedded = PRODUCT_DECISION_REQUIRED (future) |
| PostHog frontend key | Phase 4 | EXTERNAL (no `VITE_POSTHOG_KEY` in the Production build) |
| Bildazo 503 on Staging | Phase 4 | EXTERNAL (Staging has no Bildazo configuration; handled 503; Production configured) |
| Activation policy terms 1–45 | Phase 2 | CONTENT_REQUIRED (owner) |
| 180 historical unpaid orders | Client payment | PRODUCT_DECISION_REQUIRED (retention); shown as «بانتظار الدفع» |
| Multi-plan membership checkouts | Payment hardening | PRODUCT_DECISION_REQUIRED (UI explains via trust note) |
| Admin create-only permission cannot view created orders | File audit | PRODUCT_DECISION_REQUIRED / PERMISSION_POLICY |
| Delivery edit while awaiting review | File audit | KEEP (policy unchanged; locked state now explained) |
| Explicit freelancer-facing restriction notice | Phase 5 audit | PRODUCT_DECISION_REQUIRED (current design hides moderation) |
| Notifications volume (11.6M rows / 11 GB in Production) | Phase 5 audit | PRODUCT_DECISION_REQUIRED (retention policy) |

## Phase 6 — Final whole-platform consistency / release candidate

Staging fixtures: [UIUX-P6] client, freelancer, restricted freelancer + tagged orders (pending, failed, bidding, assigned); cleaned after QA.
Metrics crawl (Playwright, Staging API in-process + `vite preview`): every route × 6 views (AR/EN, 390 / 768 / 1024 / 1440) —
overflow, page/console errors, failed requests, API 4xx/5xx, duplicate GETs, raw technical text, `html[dir]`.
Baseline 510 loads (85 routes) → after 510 loads + gap crawls 342 loads (56 previously uncovered route URLs) + 42 targeted re-crawl loads.
38 BEFORE / 38 AFTER captures for visual changes (Arabic pixel parity 0.00% on alignment-only pairs; remaining Arabic deltas traced to
Staging data / capture timing, or intended date fix). Report: `%USERPROFILE%\OrderzHouse-UIUX-Audit\Phase-06-Final\report\index.html`.

| ROUTE | SURFACE | ROLE | CLASS | NOTES |
|---|---|---|---|---|
| 19 admin / shared CSS files (48 rules) | Analytics, admins, rate limits, site pages, edit website, ads, articles hub, pantry, training orders, admin overview, notifications, plans, home offers / hero | All | FIX / POLISH | Last unscoped `text-align: right` → `start` + `:where([dir="rtl"])` restore (zero specificity, same cascade slot); scan now 0 |
| `/dashboard/freelancer/articles/:id` | Article detail | Freelancer | FIX | Request loop: `useArticlesT` returned a new `t` every render → 53 GETs of `/application` per minute → stable `useCallback` |
| `/dashboard/freelancer/plans` | Packages | Freelancer | FIX | Request loop: inline membership callback in the attempts-loader dependency chain → 10–11 `checkout-attempts` per visit → ref; API calls per load 24 → 13. Membership load failure no longer shown as «no active membership» (would invite a duplicate purchase) |
| Dashboard layout (all roles) | Bell + sidebar badge | All | FIX | `unread-count` fetched twice per page → `shareInFlight` (one request while pending, nothing cached after) — also membership plans, popup ads, checkout attempts, institution membership, done projects, referral overview |
| `/dashboard/super-admin` | Home / analytics | Super Admin | FIX | `executive-kpis` ×2 (hook + panel same commit) → abort-ref dedupe. `/analytics/visitors` 500 whenever PostHog timed out / unconfigured (`events = null`) and re-requested 5–6× → zeros + `meta.posthogError` (200) |
| `/dashboard/super-admin/training-orders` | Rounds / status | Super Admin | FIX | Arabic page mixed `28/10/2026 11:44` (status bar) and `10/28/2026 11:44 AM` (round cards, rounds table, last run) → one UI-locale format |
| `/dashboard/freelancer/orders/:id` | Held offer | Freelancer | POLISH | Neutral «عرضك قيد المراجعة قبل أن يظهر للعميل.» from existing `myBid.underReview` (no moderation reasons) |
| `constants/authRoutes.js` | Navigation guards | Admin / SA | FIX | 5 Super-Admin-only pages + `/dashboard/referrals` missing from the role map (offered then bounced) → mirrored App.jsx guards |
| Account settings (client, freelancer, admin, super admin) | Forms | All | FIX (a11y) | 30 labels not tied to their fields (152 unlabeled field-loads in the 1280 pass) → `htmlFor`/`id` (existing freelancer pattern); notification switches named |
| `/` | Partners | Anonymous | FIX (a11y) | Duplicate `id="home-partners-anchor"` (mobile + desktop lists) — desktop sticky-ads observer resolved the hidden mobile list → id only on the desktop section |
| Auth card (legacy join) | Footer | Anonymous | FIX (a11y) | Empty link to the current page when no footer props → footer rendered only with content |
| Stale tests | Backend / frontend | — | FIX (tests) | Rate-limit config (public GETs on `public_read`), recurring price `prices.retrieve` before reuse, «Training Packages» label, CRLF-safe source reads |

Result: duplicate GET overhead 577 → 57 extra requests per 510 loads (remaining = 30 s poll ticks inside slow pages + intermittent
`/orders` pool ×2 in 1/18 loads); total API requests 4,367 → 3,846; overflow 0; page errors 0; raw technical text 0; `dir` mismatches 0.
Desktop 1280 pass (AR/EN, 280 loads, every route) with automated accessibility counts: overflow 0, page errors 0; after the a11y fixes
images without alt 0, unnamed buttons 0, unnamed links 0, unlabeled fields 0, duplicate ids 0, `lang` correct on every load.

### Coverage map (App.jsx, 140 route patterns)

| CLASS | COUNT | ROUTES |
|---|---|---|
| AUDITED | 127 | Phases 1–5 routes + Phase 6 gap crawl (admin shell ×12, Super Admin detail / CMS / footer editors, institutions, storage, legacy campaigns, training sub-pages, `/find-work`, `/community`, `/blog`, `/plans/:slug`, `/dashboard` redirect, `/unauthorized`, 404s, legacy join, `my-bonuses` guard) |
| DISABLED | 8 | Elite Direct offer page (engine OFF), referrals ×3 (program off), `bid-credits`, `subscriptions/activation`, `admin/subscriptions`, `admin/membership-activations` (deprecated, hidden) |
| LEGACY_REDIRECT | 5 | `legacy-freelancer-invites`, `footer-app-downloads`, `training-orders/rounds`, `client/my_orders`, `financial-user` |

### Final issue register

| ITEM | STATUS |
|---|---|
| Direction / alignment (all CSS) | RESOLVED (contract tests) |
| Request storms (article page, plans page) and duplicate dashboard reads | RESOLVED (contract tests + re-crawl) |
| Super Admin visitors 500 | RESOLVED (backend test) |
| Training-orders mixed date formats | RESOLVED |
| Misleading «no membership» on load failure | RESOLVED |
| Navigation role map vs router | RESOLVED |
| `/orders` pool fetched twice in 1/18 loads | TECHNICAL_DEBT_ACCEPTED (low) |
| Settings labels, home duplicate id, empty auth footer link | RESOLVED (a11y pass) |
| Two `<h1>` on some pages (home hero + section, settings) | TECHNICAL_DEBT_ACCEPTED (low) |
| Stripe Elements / Arabic hosted checkout | PRODUCT_DECISION_REQUIRED |
| PostHog frontend key; Bildazo on Staging | EXTERNAL_CONFIGURATION |
| Activation terms 1–45 | CONTENT_REQUIRED |
| Explicit restriction notice; admin create-without-view; multi-membership | PRODUCT_DECISION_REQUIRED (PERMISSION_POLICY / business policy) |
| Unpaid-order retention; notifications volume | PRODUCT_DECISION_REQUIRED (DATA_RETENTION) |
| Elite Direct, referrals | DISABLED (verified no `/api/api`, localized unavailable state) |
