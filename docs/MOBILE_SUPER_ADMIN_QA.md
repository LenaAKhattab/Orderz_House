# Mobile Super Admin — Phase 1A QA

Manual checks after a Super Admin login on a device or emulator. Do not use production data.

## Setup

- Flutter app pointed at staging (or local) API
- Existing Super Admin account (public register cannot create this role)
- A client account and a freelancer account for negative tests

## Super Admin

1. Log in as Super Admin.
2. Confirm home is **مركز المهام** (Action Center), not client create-order / freelancer marketplace.
3. Bottom tabs are only: الرئيسية، الإشعارات، الحساب.
4. Confirm **no popup ads**.
5. Pull to refresh Action Center.
6. Cards show counts or **غير متاح حاليًا** — never invented numbers.
7. Open الإشعارات, mark one read, mark all read.
8. Tap a Super Admin notification whose web link is `/dashboard/super-admin/financial-claims` → claims queue (read-only).
9. Tap `/dashboard/super-admin/subscriptions/activation` → activation queue (read-only).
10. Tap `/dashboard/super-admin/pantry` and `/dashboard/super-admin/marketplace-articles` → read-only lists.
11. Tap an unknown Super Admin path (e.g. analysis) → Action Center + snackbar: «هذه المهمة ستتوفر قريبًا على التطبيق.»
12. Open each queue from Action Center. Confirm **no** pricing / payout / ledger controls. Activation may show **اعتماد التفعيل** for pending items. Claims may show **تحديث حالة المطالبة**. Pantry and articles stay read-only.
13. Claims amounts show **د.أ** only.
14. Open الحساب → إعدادات الحساب still works. No «طلب جديد».

## Phase 1B — Super Admin actions

Do not use production data.

### Login as Super Admin

1. Log in as Super Admin. Home is still **مركز المهام**.
2. Open **طلبات تفعيل بانتظار المراجعة**.
3. For a pending item, tap **اعتماد التفعيل**. Confirm the dialog **تأكيد الاعتماد** / **هل تريد اعتماد هذا الحساب؟** is required (Cancel does not call the API).
4. Confirm again. Button shows loading and cannot be tapped twice. Success snackbar **تم تنفيذ الإجراء بنجاح**. Queue and Action Center counts refresh. You remain in the Super Admin shell.
5. Open **مطالبات مالية تحتاج إجراء**.
6. Confirm amounts show **د.أ**. Confirm there is **no** تسعير, صرف, ledger, or payout UI.
7. Tap **تحديث حالة المطالبة**. Choose **قبول** (no note) or **رفض / تجميد / مراجعة حضورية** (note required).
8. For reject/freeze/in-person: a 1–2 character note keeps **تأكيد** disabled. A note of 3+ characters allows confirm.
9. Confirm an allowed status. Loading disables the button. Success refreshes the pending list.
10. Tap a Super Admin notification for activation or financial claims → the matching queue (now with actions). Unknown Super Admin paths still open Action Center.

### Negative — client / freelancer

1. Log in as client. Super Admin action routes (`/super-admin/activation`, `/super-admin/claims`) return to home. No اعتماد التفعيل / تحديث حالة المطالبة.
2. Log in as freelancer. Same: cannot open Super Admin action screens or follow Super Admin notification destinations.

### Pass criteria (Phase 1B)

- Confirmation dialogs are required for both actions.
- Double submit does not fire two API calls.
- Client/freelancer cannot access Super Admin actions.
- No pricing / payout / ledger controls exist in the Flutter Super Admin UI.

## Phase 1C-A — Pantry actions

Do not use production data.

### Login as Super Admin

1. Log in as Super Admin. Open **بيت المونة** from مركز المهام.
2. Confirm cards (not tables), chips, and `current / required` when present. Relisted items show **فرصة معاد طرحها**.
3. Open a pantry request that is ready for assignment.
4. Accept the **المرشح الأول** bid: confirmation only, then success snackbar and refresh.
5. Accept a non-recommended bid: override reason required. Fewer than 10 characters keeps confirm disabled. 10+ characters submits.
6. Reject a pending bid: confirmation required.
7. Open a submitted delivery. Confirm **اعتماد التسليم** uses a confirmation dialog.
8. **طلب تعديل** requires a note of at least 3 characters.
9. Confirm no تسعير / صرف / ledger / payout controls.
10. Notification `/dashboard/super-admin/pantry` opens the queue. A numeric pantry path opens request detail. Unknown pantry admin paths fall back to مركز المهام.

### Negative — client / freelancer

1. Client cannot open `/super-admin/pantry` or request/delivery action screens.
2. Freelancer cannot follow Super Admin pantry notification destinations. Freelancer pantry hub has no admin accept/approve actions.

### Pass criteria (Phase 1C-A)

- Bid and delivery actions require confirmation.
- Override reason is required for non-recommended accepts.
- Double submit does not fire two API calls.
- Client/freelancer cannot access pantry Super Admin actions.

## Phase 1C-B — Article actions

Do not use production data.

### Login as Super Admin

1. Log in as Super Admin. Open **المقالات** from مركز المهام.
2. Confirm cards (not tables), chips, and `current / required` when present. Relisted items show **فرصة معاد طرحها**. Threshold / جاهز للإسناد / لم يكتمل الحد الأدنى chips appear when those states exist.
3. Open an article that is ready for assignment.
4. Select the **المرشح الأول** applicant: confirmation only (**تأكيد الاختيار**), then success snackbar and refresh of detail, queue, and Action Center.
5. Select a non-recommended applicant: **سبب تجاوز المرشح الأول** required. Fewer than 10 characters keeps confirm disabled. 10+ characters submits.
6. Attempt a short override reason and confirm the action stays blocked.
7. Open a `minimum_not_met` article with `canRelistBidCollection`. Confirm **إعادة طرح المناقصة** uses a confirmation dialog. Relist is hidden when the article is not eligible or already has a selected applicant.
8. Confirm no تسعير / صرف / ledger / payout / auto-assign / Work Token / Article Token controls. Reject application is not shown.
9. Notification `/dashboard/super-admin/marketplace-articles` opens the queue. A numeric article path opens detail. Unknown article admin paths fall back to مركز المهام with «هذه المهمة ستتوفر قريبًا على التطبيق.»

### Negative — client / freelancer

1. Client cannot open `/super-admin/articles` or `/super-admin/articles/:id`.
2. Freelancer cannot follow Super Admin article notification destinations.

### Pass criteria (Phase 1C-B)

- Recommended select requires confirmation only.
- Non-recommended select requires override reason (10–500).
- Relist appears only when eligible and requires confirmation.
- Double submit does not fire two API calls.
- Client/freelancer cannot access article Super Admin actions.


## Negative — client / freelancer

1. Log in as client. Confirm client home. Manually opening `/super-admin/claims` (if possible) returns to home.
2. Log in as freelancer. Confirm freelancer home. Super Admin notification URLs do not show an open-action to admin queues.
3. Register screen still offers only عميل / مستقل.

## Unsafe links

1. Notification with `https://…` or `javascript:` must not show an in-app open button.
2. `/dashboard/admin/orders` stays blocked.

## Pass criteria

- Super Admin never lands on client home.
- Client/freelancer never see Super Admin queues.
- No admin JSON persisted beyond the normal access token.

## Final QA results (2026-08-17)

Automated regression of Phases 1A–1C-B plus path-alias fix. No production data. No backend/DB/deploy/commit.

### Overall: PASS

Device/staging login is still recommended before release (see remaining manual checks). Automated routing, role, notification, action, and source-guard tests passed.

### Passed routes

| Requested path | Result |
|---|---|
| `/super-admin` | Alias → `/home` (Action Center / Super Admin shell) |
| `/super-admin/notifications` | Alias → `/notifications` |
| `/super-admin/account` | Alias → `/account/settings` |
| `/super-admin/activation` | Activation queue |
| `/super-admin/financial-claims` | Alias → `/super-admin/claims` |
| `/super-admin/claims` | Claims queue |
| `/super-admin/pantry` | Pantry attention queue |
| `/super-admin/pantry/requests/:id` | Bid review |
| `/super-admin/pantry/deliveries/:id` | Delivery review |
| `/super-admin/articles` | Article attention queue |
| `/super-admin/articles/:id` | Application review |

No failed routes after aliases. Loading / empty / error states are implemented on Action Center and all queues. App locale is Arabic RTL (`Directionality` in `app.dart`).

### Manual QA checklist status

| Area | Status |
|---|---|
| Super Admin routes / no blank page / no loop | **PASS** (automated + code review) |
| Role boundaries, signup, popup ads | **PASS** |
| Action Center counts / غير متاح حاليًا / JOD / no disk cache | **PASS** |
| Notification mappings + unsafe URL block | **PASS** |
| Activation approve + confirm + double-submit guard | **PASS** |
| Claims status + note + no pricing/payout/paid | **PASS** |
| Pantry queue / bid / delivery actions | **PASS** |
| Article queue / select / override / relist | **PASS** |
| Client/freelancer regression tests | **PASS** |
| Live Super Admin login on staging device | **Remaining** — do not use production data |

### Known limitations

- Article **reject** is deferred (bid-credit adjacent).
- Pantry **relist action** is deferred (relist **count** is shown).
- No auto-assign, pricing, payout, ledger, CMS, plans, ads, or course editors.
- `/super-admin/notifications` and `/super-admin/account` open full-screen inbox/settings rather than switching the in-shell tab index.
- Attention queues filter existing list APIs client-side; `home-fast` has no pantry/article attention DTO.
- FCM production hold unchanged. `minimum_not_met` Super Admin notify-all remains a backend gap.
- Delegated `admin` role is out of scope.

### Analyze / test / build

- `flutter analyze` — no issues
- Targeted: `phase_sa_1a`, `phase_sa_1b`, `phase_sa_1c_a`, `phase_sa_1c_b`, `phase_sa_final_qa` — passed
- `flutter test` — 474 passed
- `flutter build apk --debug` — succeeded (`app-debug.apk`)

