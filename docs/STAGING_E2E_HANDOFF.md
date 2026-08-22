# Staging E2E Handoff — Activation / Articles / KYC / Finance / Mobile

**Audience:** human operator performing commit, push, and **Staging** deploy.  
**Do not** use this document against Production without a separate production runbook and approvals.

**Status:** local work ready for commit. Migrations **167–179** must be applied on Staging only after code is deployed/available on that environment. After **179**, run the free onboarding course seed on Staging (see §2).

---

## 0. Environment files (Production vs Staging)

| File | Purpose | Commit? |
|------|---------|---------|
| `backend/.env` | **Production** — keep unchanged for normal local dev against live DB | **Never** |
| `backend/.env.staging` | **Staging only** — Neon branch `staging-ord20` connection strings | **Never** |
| `backend/.env.staging.example` | Placeholder template (no secrets) | Yes |

**Rules**

- **Never** run `npm run db:migrate` when `backend/.env` points at Production. That command loads `.env` and is blocked for known production hosts — but the operator must still treat `.env` as Production.
- **Always** use staging commands that load **only** `backend/.env.staging`:
  - Preflight (read-only): `npm run db:migrate:status:staging`
  - Apply migrations: `npm run db:migrate:staging`
  - Seed free onboarding article course (after **179**): `npm run db:seed-free-onboarding-article-course:staging`
- Copy `backend/.env.staging.example` → `backend/.env.staging`, set `APP_ENV=staging`, and paste the Neon **staging-ord20** branch `DATABASE_URL` / `DIRECT_URL`.
- **Stop immediately** if output shows `BLOCKED: database appears to be Production.` or classification `PRODUCTION`.

**PowerShell (manual alternative, if needed)**

```powershell
cd backend
# Ensure backend/.env.staging exists with APP_ENV=staging and staging branch URLs
npm run db:migrate:status:staging   # read-only preflight
npm run db:migrate:staging          # apply pending 167–179
npm run db:seed-free-onboarding-article-course:staging   # after 179 only
```

Do **not** set `$env:DATABASE_URL` from production `.env` before these commands.

---

## 1. Do not commit

| Path / pattern | Reason |
|----------------|--------|
| `backend/.tmp/**` | Logs, screenshots, QA scratch |
| `backend/uploads/**` | Private KYC / order files |
| `.env` / `.env.*` / `backend/.env.staging` / secrets / service accounts | Credentials |
| `frontend/dist/**` | Build output |
| `coverage/**` | Test coverage |
| `*.apk` / `*.aab` / `*.ipa` | Mobile binaries |
| `node_modules/` | Dependencies |

Include product code, migrations **167–179** (especially **177–179**), docs (this file + plan/parity), and tests.

---

## 2. Migration order (Staging only)

```
167 → 168 → 169 → 170 → 171 → 172 → 173 → 174 → 175 → 176 → 177 → 178 → 179
```

| Version | Purpose (short) |
|---------|-----------------|
| 167 | Activation engine settings (engine **off** by default) |
| 168 | Trial Bid grant (additive) |
| 169 | Campaigns/waves/budget tables (internal; UI hides multi-campaign) |
| 170 | Budget reserve/release/use idempotency |
| 171 | Manuscript terms columns |
| 172 | Work inventory reserve (**off** by default) |
| 173 | Article fund + plan allocations + inventory |
| 174 | Release runs/items (no cron) |
| 175 | Auto-assign flags/tables (**disabled** by default) |
| 176 | KYC account activation requests |
| 177 | `release_interval_days` (default **1**) |
| 178 | Trial pending earnings grace (**40** days) + `forfeited` status + company forfeiture ledger/audit |
| 179 | `courses.requires_paid_membership` — lock premium writing courses for Starter/Trial |

**From `backend/` (Staging `DATABASE_URL` in `backend/.env.staging` only):**

```bash
npm run db:migrate:status:staging   # preflight — read only
npm run db:migrate:staging          # apply pending migrations
npm run db:seed-free-onboarding-article-course:staging   # after 179 — idempotent
```

**Do not** run `npm run db:seed-free-onboarding-article-course` on Staging (loads production `backend/.env`). Use the `:staging` script only.

**Do not** use `npm run db:migrate` (loads production `.env`), production migrate flags, `db push`, or `db reset`.

### Trial pending earnings (178 + code)

- Starter/trial article earnings (`writer_starter_pending`) are **visible but locked** until Silver (or eligible paid plan) activation.
- After `trial.ends_at`, a **40-day grace** window starts (`freelancer_activation_trial_pending_earnings_grace_days`, default **40**).
- If Silver is not activated before the deadline, pending trial earnings are **forfeited/company-retained** with audit ledger (`company_trial_forfeiture` + `trial_pending_earnings_forfeiture_events`). Original rows are **not deleted**; writer rows transition to `status=forfeited`.
- Forfeiture is evaluated **lazily** (earned-balance read, Silver activation check, Super Admin summary). **No cron** in this phase.
- Legacy entries accepted under manuscript terms **v1** are **not** forfeited unless v2+ policy was accepted for that submission.
- Staging must apply **178** after **177** before testing lock/grace/forfeiture E2E.

### Preflight

- [ ] Backup / PITR available for Staging
- [ ] `backend/.env.staging` exists with `APP_ENV=staging` (production `backend/.env` unchanged)
- [ ] `npm run db:migrate:status:staging` shows Staging host (not Production)
- [ ] Pending versions checked via `schema_migrations`
- [ ] Migration **179** is in the committed tree
- [ ] After **179**, plan to run `npm run db:seed-free-onboarding-article-course:staging`
- [ ] **Stop** if classification is `PRODUCTION`

### Postflight

- [ ] Versions 167–179 recorded in `schema_migrations`
- [ ] `courses.requires_paid_membership` column present (179)
- [ ] Free course «كيفية إنشاء مقال» seeded once (post-179)
- [ ] Key tables/columns present
- [ ] Defaults remain safe (below)
- [ ] No unexpected DROP/TRUNCATE

---

## 3. Safe defaults after migrate / before enabling features

| Setting | Safe initial value | Where |
|---------|-------------------|--------|
| `freelancer_activation_engine_enabled` | **false** | DB `marketplace_economy_settings` |
| Work inventory enabled | **false** | DB (WIR / 172) |
| Auto-assign | **false** | Allocation / article columns (175) |
| Release mode | **manual** | Plan allocations (173) |
| `release_interval_days` | **1** | Allocations (177) |
| Cron / unattended release | **none** | Not implemented |
| Article page campaigns | Hidden; one internal setup | `getOrCreateDefaultArticleOperationsCampaign` |

Enable engine / auto-assign / daily_auto only after Staging E2E passes.

---

## 4. Deploy checklist (operator)

### Backend

1. Install + build as usual for Staging  
2. Point env at Staging DB / secrets  
3. Apply migrations **167–179** on Staging  
4. After **179**, run `npm run db:seed-free-onboarding-article-course:staging`  
5. Restart service  
6. Health + Super Admin auth  
7. Scan logs for schema / KYC upload errors  

### Frontend

1. `npm run build`  
2. Deploy Staging  
3. Clear CDN cache if needed  
4. Smoke routes:
   - `/dashboard/super-admin/articles`
   - `/dashboard/super-admin/freelancer-activation-requests` (KYC)
   - `/dashboard/freelancer/account-activation`
   - Freelancer articles + financial claims  

### Mobile

1. Staging API / `WEB_BASE_URL` only (not Production)  
2. Flutter test build against Staging  
3. Confirm no production host in logs  

---

## 5. Web E2E checklist

### KYC

- [ ] Register freelancer → upload ID front/back → accept terms → pending  
- [ ] Super Admin opens **طلبات تفعيل المستقلين** → views images (not public URLs)  
- [ ] Reject with reason → freelancer sees reason → resubmit  
- [ ] Approve → `company_approved`  

### Articles (`/dashboard/super-admin/articles`)

- [ ] Sidebar **المقالات** directly under **بيت المونة**  
- [ ] Tabs: نظرة عامة | المقالات المنزلة | مخزون المقالات | صندوق التمويل  
- [ ] **No** campaign selector / «حملة التفعيل» / «اختر حملة»  
- [ ] Fund add/withdraw  
- [ ] Plan allocation + interval options  
- [ ] Inventory add / archive  
- [ ] Manual publish  
- [ ] Release preview / run (manual bypasses interval)  
- [ ] Monitoring + optional manual auto-assign  
- [ ] Applicant review / fair rank / approve or revision  

### Freelancer Mini Articles

- [ ] List gross value; detail shows share breakdown  
- [ ] Bildazo gate; Bid apply; duplicate blocked  
- [ ] Earned balance shows frozen writer **net** (not withdrawable gross); pending trial earnings show **locked** state + Silver CTA; after trial expiry show grace countdown; after grace without Silver show **closed/forfeited** copy (not harsh «مصادرة» wording)

### Bildazo Writer Experience Phase 1 (web + API; no new migration)

- [ ] Link Bildazo writer account (web gate on `/dashboard/freelancer/articles`)  
- [ ] Apply to Mini Article · win · submit · approve · publish to Bildazo  
- [ ] Freelancer sees work in **مقالاتي** (`/dashboard/freelancer/my-articles`) with correct status group  
- [ ] Published item shows «تم نشر مقالك بنجاح على Bildazo.» + «مشاهدة المقال» + «مشاهدة ملفي ككاتب» when URLs exist  
- [ ] Super Admin **ربط حسابات Bildazo** shows «تكامل Bildazo» summary (published/pending/failed counts)  
- [ ] Duplicate Bildazo writer ID blocked locally (`BILDAZO_AUTHOR_IDENTIFIER_IN_USE`)  
- [ ] Trial expiry does **not** delete Bildazo author links or publish records  
- [ ] Silver later keeps same writer identity (replace-link flow unchanged)

### Freelancer courses (179 + seed)

- [ ] Starter/Trial on `/dashboard/freelancer/courses`: premium writing courses (Arabic/English «كتابة المحتوى») show badge **يتطلب اشتراك**, message **يجب الاشتراك بإحدى الخطط للوصول إلى هذه الدورة.**, CTA **اشترك بإحدى الخطط** → `/dashboard/freelancer/plans`; cards are not openable  
- [ ] Free course **كيفية إنشاء مقال** is visible and openable (one YouTube lesson)  
- [ ] Silver/Pro/Elite: premium writing courses remain accessible; free course accessible  

### Bid / F1 / upgrade CTA

- [ ] Real loser consumes Bid; cancel/no-winner refunds  
- [ ] Claim blocked pre-KYC; pricing injection rejected; status PATCH cannot set `paid`  
- [ ] Official payment path can mark paid  
- [ ] Plan-lock shows upgrade CTA; non-plan errors do not  

---

## 6. Mobile E2E checklist

- [ ] Login / register / OTP  
- [ ] KYC submit + pending / rejected / approved  
- [ ] Claim KYC error mapping  
- [ ] Pool plan upgrade CTA  
- [ ] Mini Articles list + detail breakdown + Bid copy  
- [ ] Bildazo required opens web flow; detail shows publish success + article/profile links when published  
- [ ] Earned balance net only; locked pending + grace countdown + forfeited closed state; Silver CTA; writer profile link when URL returned; no admin fund UI  

---

## 7. Stop conditions

Stop Staging rollout immediately if:

- Migration fails or URL points at Production  
- `paid` can be set without payment ledger  
- Claim pricing injection accepted  
- KYC files publicly reachable  
- Wrong Bid refund/consume on real articles  
- Earned balance shown as withdrawable gross  
- Articles page shows campaign selector again  
- Mobile hits Production API during Staging test  

---

## 8. Rollback notes

- **Code:** redeploy previous Staging build / revert branch  
- **DB:** restore Staging from backup/PITR  
- Do **not** manually delete `schema_migrations` rows unless following the existing migration runbook  
- Do **not** `db reset` / destructive truncate on Staging data you need  

---

## 9. Product notes

- Super Admin operational entry for articles is **«المقالات»** only.  
- Internal `campaign_id` / campaign tables remain for compatibility; UI uses one default setup («إعداد المقالات الرئيسي»).  
- KYC remains on **طلبات تفعيل المستقلين**.  
- Legacy `article-management` / `marketplace-articles` redirect to `/dashboard/super-admin/articles`.  

---

## 10. Operator-only remaining steps

1. Review diff → **commit** (include migrations 177–178; exclude `.tmp` / uploads / env / dist)  
2. **Push** branch  
3. **Staging deploy** (backend + frontend; mobile staging build if needed)  
4. **Staging migrations** 167→179 + free course seed (`db:seed-free-onboarding-article-course:staging`)  
5. Run E2E checklists above  

This handoff document does not authorize Production migration or deploy.
