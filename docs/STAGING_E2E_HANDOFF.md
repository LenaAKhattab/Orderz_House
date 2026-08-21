# Staging E2E Handoff — Activation / Articles / KYC / Finance / Mobile

**Audience:** human operator performing commit, push, and **Staging** deploy.  
**Do not** use this document against Production without a separate production runbook and approvals.

**Status:** local work ready for commit. Migrations **167–177** must be applied on Staging only after code is deployed/available on that environment.

---

## 1. Do not commit

| Path / pattern | Reason |
|----------------|--------|
| `backend/.tmp/**` | Logs, screenshots, QA scratch |
| `backend/uploads/**` | Private KYC / order files |
| `.env` / secrets / service accounts | Credentials |
| `frontend/dist/**` | Build output |
| `coverage/**` | Test coverage |
| `*.apk` / `*.aab` / `*.ipa` | Mobile binaries |
| `node_modules/` | Dependencies |

Include product code, migrations **167–177** (especially untracked **177**), docs (this file + plan/parity), and tests.

---

## 2. Migration order (Staging only)

```
167 → 168 → 169 → 170 → 171 → 172 → 173 → 174 → 175 → 176 → 177
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

**From `backend/` (Staging `DATABASE_URL` only):** use the project’s non-production migrate command (e.g. `npm run db:migrate`).  
**Do not** run production migrate flags, `db push`, or `db reset`.

### Preflight

- [ ] Backup / PITR available for Staging
- [ ] `DATABASE_URL` host is Staging (not Production)
- [ ] Pending versions checked via `schema_migrations`
- [ ] Migration **177** is in the committed tree

### Postflight

- [ ] Versions 167–177 recorded in `schema_migrations`
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
3. Apply migrations **167–177** on Staging  
4. Restart service  
5. Health + Super Admin auth  
6. Scan logs for schema / KYC upload errors  

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
- [ ] Earned balance shows frozen writer **net** (not withdrawable gross)  

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
- [ ] Bildazo required opens web flow  
- [ ] Earned balance net only; no admin fund UI  

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

1. Review diff → **commit** (include migration 177; exclude `.tmp` / uploads / env / dist)  
2. **Push** branch  
3. **Staging deploy** (backend + frontend; mobile staging build if needed)  
4. **Staging migrations** 167→177  
5. Run E2E checklists above  

This handoff document does not authorize Production migration or deploy.
