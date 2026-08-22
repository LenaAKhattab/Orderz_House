# Mobile ↔ Web Parity

Tracking Android (Flutter) vs web/backend parity for Freelancer Activation, KYC, claims safety, Mini Articles, and plan upgrade UX.

## M1 — Covered (critical sync)

| Area | Mobile behavior |
|------|-----------------|
| **KYC account activation** | Freelancer screen at `/freelancer/account-activation` using `GET/POST /api/freelancer/account-activation` (+ multipart submit). States: not submitted, pending review, rejected (+ reason + resubmit), approved. |
| **Eligibility → KYC** | Ineligible banner / pool detail show **إكمال تفعيل الحساب** (or resubmit CTA when rejected) and route to KYC screen. Profile quick action **تفعيل الحساب**. |
| **Super Admin activation** | Old in-app `PATCH .../company-activate` **disabled**. Queue shows: «مراجعة الهوية تتم من لوحة الويب حالياً». KYC approve/reject remains web-only. |
| **Financial claims errors** | Maps `FREELANCER_KYC_*`, `FINANCIAL_CLAIM_PRICING_NOT_ALLOWED`, `FINANCIAL_CLAIM_PAYMENT_LEDGER_REQUIRED` to Arabic. Create payload still forbids pricing fields. |
| **Plan upgrade CTA** | On plan-locked pool orders: headline + «رقِّ خطتك…» + optional Silver/Pro/Elite hint. Opens web plans URL externally (`WebConstants.freelancerPlansUrl`). Not shown for Bids / Bildazo / training / verification / campaign / collection blocks. |

### KYC mobile flow

1. Freelancer opens **تفعيل الحساب** (profile or eligibility CTA).
2. App loads status (`canSubmit` / `pending_review` / `rejected` / `company_approved`).
3. Submit requires front + back images + terms checkbox; multipart fields `idFront`, `idBack`, `termsAccepted`, optional `termsVersion`.
4. Never displays storage keys or private file URLs.

### Super Admin activation limitation

- In-app company activation approve is **not** a KYC review path.
- After A11.1, staff must review ID documents on the web Super Admin KYC queue.
- Mobile still lists legacy activation-queue items for awareness only.

### Claims error handling

Client maps backend `code` (publicCode) before falling back to message text. Create payload still forbids pricing fields. Create claim body remains `{ mode, projectId, freelancerNote? }` only.

### Plan upgrade CTA

Uses `poolEligibility.isLockedByPlan` (+ tier/plan labels when present). Native `/freelancer/plans` still redirects to profile (Play compliance); CTA opens the **website** plans page in the external browser.

---

## M2 — Freelancer Mini Articles (covered)

| Area | Mobile behavior |
|------|-----------------|
| **List** | `/freelancer/mini-articles` — released/available Mini Articles from `GET /marketplace-articles`. Shows title, status, **full article value** (`قيمة المقال: X.XXX JOD`), bidder progress when present. No fund balance, campaign budget, fairness weights, or admin internals. |
| **Detail** | `/freelancer/mini-articles/:id` via `GET /freelancer/marketplace-articles/:id/application`. Shows requirements, full value, breakdown (إجمالي / صافي المستقل / تدقيق / منصة), application state, eligibility lock reason. Gross value is **not** labeled as withdrawable earning. |
| **Apply + Bid policy** | `POST /freelancer/marketplace-articles/:id/applications`. UI explains Bid is used on apply; copy does **not** promise Bid return on loss. Duplicate apply blocked when application already exists. Maps `INSUFFICIENT_BID_CREDITS`, collection closed, campaign paused, trial, KYC, Bildazo codes to Arabic. Bid balance shown only from backend eligibility fields. |
| **Bildazo gate** | `GET /freelancer/bildazo-author-link/me` compact linked/unlinked state. On `BILDAZO_AUTHOR_LINK_REQUIRED`: Arabic product copy + CTA opening web articles hub (`WebConstants.freelancerArticlesUrl` → `/dashboard/freelancer/articles`). Native create/link form not required in M2. |
| **مقالاتي portfolio (web)** | Web-only `/dashboard/freelancer/my-articles` lists all freelancer article work (not only public opportunities) with review + Bildazo publish status. Mobile: detail/earned-balance show publish URL + writer profile when API returns them. |
| **Earned Balance** | `GET /freelancer/activation/earned-balance` panel: **writer net only**, optional Bildazo URL. Pending trial earnings show **locked** state (🔒 «معلّق · غير قابل للسحب»), headline/disclaimer, and **«اشترك لتفعيل السحب»** CTA (Silver checkout/plans). After trial expiry: grace countdown («متبقي X يوم…»). After grace without Silver: **closed/forfeited** copy (no harsh «مصادرة»). Forfeited totals shown as «رصيد سابق مُغلق». |
| **Trial / Silver** | Hub shows trial summary (`GET /freelancer/activation-trial`) + activate (`POST .../activate`) when applicable; Silver CTA via conversion API + external checkout/plans URL. |
| **Plan lock CTA** | Same M1 `PlanUpgradeRequiredCta` only when eligibility reason is plan/tier (`ARTICLE_ACCESS_LEVEL_INSUFFICIENT`, `ARTICLE_NO_USABLE_MEMBERSHIP`). **Not** shown for Bids, Bildazo, KYC, training, campaign paused, collection closed. |
| **Navigation** | Profile quick action **المقالات المصغّرة**; freelancer home tile; notification deep links for `/dashboard/freelancer/articles` (+ `/:id`). |

### Bid policy text (Arabic)

- «سيتم استخدام Bid عند التقديم على هذا المقال.»
- «في حال عدم اختيارك قد لا يعود رصيد التقديم حسب سياسة الفرصة.»
- «لا تملك رصيد Bids كافياً للتقديم.»

### Bildazo gate behavior

- Gate status from backend; secrets/integration internals never shown.
- Unlinked + gate enabled → product copy: «لتتمكن من تنفيذ المقالات ونشر أعمالك باسمك، فعّل ملف الكاتب الخاص بك على Bildazo.» + CTA «تفعيل حساب الكاتب على Bildazo» (opens web flow).
- Linked → «حساب Bildazo: مفعّل ✓»; «مشاهدة ملفي ككاتب» when profile URL exists.
- Published article on detail/earned balance → «تم نشر مقالك بنجاح على Bildazo.» + «مشاهدة المقال» / «مشاهدة ملفي ككاتب» when URLs exist.

### Web «مقالاتي» (Phase 1)

- Route: `/dashboard/freelancer/my-articles`
- API: `GET /freelancer/my-articles`
- Status groups: بانتظار التنفيذ · تحت التدقيق · مطلوب تعديل · مقبولة · منشورة على Bildazo · مرفوضة
- No campaign/fund/admin internals on freelancer UI.

### Super Admin Bildazo (web)

- Compact «تكامل Bildazo» summary per freelancer on **ربط حسابات Bildazo** page (`GET /super-admin/freelancers/:id/bildazo-integration`).
- No dedicated freelancer profile page; no new S2S sync endpoint in this phase.

### Earned Balance behavior

- Frozen writer settlement amount from API entries (`amountJod`).
- Never show company/reviewer shares as user earnings on this panel.
- Never treat gross article value as earned balance.
- **Trial pending lock:** `totalLockedPendingJod` / `lockPolicy` from API drive locked UI; pending trial earnings are not withdrawable until Silver (or eligible paid plan).
- **40-day grace:** after `trial.ends_at`, API may return grace countdown in `lockPolicy.messages.ar`.
- **Forfeiture/close:** after grace without paid activation, API returns `forfeited_closed` + `totalForfeitedJod`; UI shows closed copy only (audit/company retention is web Super Admin only).
- Manuscript terms **v2** (`mini_article_submission_terms_2026-08-v2`) must be accepted before new submissions; forfeiture policy applies only to entries linked to v2+ accepted terms.

### Super Admin A9 (web-only)

Fund / release / allocation / auto-assign / live monitoring / article ops remain **web-only** unless product later requires mobile. Mobile Super Admin article queue (awareness) is separate from freelancer Mini Articles.

**Web placement:** Article operations are managed from Super Admin → **المقالات** (sidebar, directly under بيت المونة). Freelancer Activation is no longer the primary place for article fund/inventory/release tools.

---

## Remaining mobile gaps (post-M2)

- [ ] Native in-app Bildazo author create/link/change forms (currently web handoff)
- [ ] Web «مقالاتي» full portfolio page on mobile (web-only in Phase 1)
- [ ] Full Bid Credits wallet UI beyond eligibility `availableBids` display
- [ ] Freelancer article delivery / revision submit flows if product requires parity beyond apply
- [ ] Super Admin KYC document review (approve/reject) on mobile — optional; web-only by design
- [ ] Activation Engine article ops (fund, inventory, release, monitoring) — web-only under Super Admin «المقالات» (single internal setup; no multi-campaign UX)

---

## Related docs

- `docs/FREELANCER_ACCOUNT_ACTIVATION_KYC.md`
- `docs/FINANCIAL_CLAIMS_SAFETY.md`
- `docs/MOBILE_SUPER_ADMIN_SCOPE.md`
- `docs/MOBILE_RELEASE.md`
- `docs/FREELANCER_ACTIVATION_ENGINE_PLAN.md`
