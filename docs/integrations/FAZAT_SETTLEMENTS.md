# FAZAT Settlements — Orderz Admin Review + Freelancer Wallet Credit

**Status:** implemented (admin QA ready)  
**Partner code:** `FAZAT`  
**Audience:** Orderz finance admins + FAZ3AT backend engineers

---

## Purpose

When FAZAT completes an order executed by an Orderz freelancer, FAZAT must **not** credit the Orderz wallet directly.

Instead:

1. FAZAT sends a **signed** settlement request to Orderz.
2. Orderz stores it as `PENDING_REVIEW`.
3. Orderz Admin / Super Admin reviews on **تسويات فزعات**.
4. On approve → Orderz credits the freelancer **JOD cash ledger** (white-label text).
5. On reject → no credit; reason recorded; optional webhook to FAZAT.
6. Super Admin may adjust amount + approve with a required reason.

---

## Discovery note (why a cash ledger exists)

Orderz previously had **no** automatic JOD available-balance wallet:

| System | Role |
|--------|------|
| `financial_claims` + `financial_freelancer_payments` | Offline claim → admin payment recording |
| Article financial entries | Mini Article earned balance |
| Bid Credits / Work Tokens | Not cash |

For FAZAT managed-order credits we added a **minimal additive** cash wallet:

- `freelancer_cash_wallets`
- `freelancer_cash_ledger_entries`

Pattern mirrors Work Token: lock → idempotent ledger → balance.  
Does **not** replace claims, Stripe, or payouts.

---

## Lifecycle / statuses

| Status | Arabic | Meaning |
|--------|--------|---------|
| `PENDING_REVIEW` | بانتظار المراجعة | Inbound; no credit yet |
| `APPROVED_CREDITED` | معتمد وتمت إضافة الرصيد | Credited at original amount |
| `ADJUSTED_APPROVED` | معدل ومعتمد | Credited at adjusted amount |
| `REJECTED` | مرفوض | No credit |
| `CREDIT_FAILED` | فشل إضافة الرصيد | Approve attempted; credit failed — retryable |
| `VOIDED` | ملغى | Reserved |

---

## Inbound API

```http
POST /api/integrations/fazat/settlements
```

Auth: existing FAZAT HMAC (`requireFazatPartnerAuth`).

Headers: `X-Orderz-Partner-Key`, `X-Orderz-Timestamp`, `X-Orderz-Nonce`, `X-Orderz-Signature`, optional `X-Idempotency-Key`.

Body (no client PII, no Stripe):

```json
{
  "fazatSettlementId": "fs_…",
  "fazatOrderId": "…",
  "fazatExternalAssignmentId": "…",
  "orderzPartnerOrderId": null,
  "orderzOrderId": null,
  "freelancerId": 123,
  "amountMinor": 5000,
  "currency": "JOD",
  "sourceLabel": "managed order completion",
  "completedAt": "2026-09-05T12:00:00.000Z"
}
```

Behavior:

- Creates `PENDING_REVIEW` only.
- Duplicate `fazatSettlementId` / idempotency key → returns existing (no duplicate).
- Unknown freelancer → `404 FREELANCER_NOT_FOUND`.
- Invalid HMAC → partner auth codes (`INVALID_SIGNATURE`, etc.), not JWT messages.

---

## Admin UI

Route: `/dashboard/super-admin/fazat-settlements`  
Title: **تسويات فزعات**  
Permission: `dashboard.super_admin.financial_claims`  
Adjust / adjust-and-approve: **Super Admin** role only.

APIs:

- `GET /api/super-admin/fazat-settlements`
- `POST .../:id/approve`
- `POST .../:id/reject` `{ reason }`
- `POST .../:id/adjust` `{ adjustedAmountMinor, reason }` (super_admin)
- `POST .../:id/adjust-and-approve` (super_admin)

---

## Approval / wallet credit

Inside a DB transaction:

1. Lock settlement (`FOR UPDATE`).
2. Require `PENDING_REVIEW` or `CREDIT_FAILED`.
3. Final amount = `adjustedAmountMinor` if set, else `amountMinor`.
4. `creditAvailableBalance` with idempotency `fazat-settlement-credit:{id}`.
5. Public ledger text: **أرباح طلب مُدار** (never FAZAT/FAZ3AT).
6. Store `wallet_ledger_entry_id`, set status, audit.
7. Webhook to FAZAT (non-blocking; missing URL does not fail credit).

Double approve is idempotent (no double credit).

---

## Rejection

- Reason required.
- No wallet credit.
- Does not cancel Orderz or FAZAT client order.
- FAZAT meaning: external settlement rejected / needs corrected resubmit via FAZAT finance.

Cannot reject after credited — message:

> لا يمكن رفض تسوية تم اعتمادها مسبقًا. استخدم إجراء تصحيح مالي.

(No automatic reversal rail yet.)

---

## Freelancer privacy

Freelancer wallet (`GET /api/portal/cash-wallet` + financial-claims page section):

**Allowed:** أرباح طلب مُدار / رصيد من طلب مُدار عبر Orderz  

**Forbidden:** FAZAT, FAZ3AT, settlement ids, client PII, Stripe details.

Admin UI may show FAZAT references.

---

## Webhooks back to FAZAT

Reuses `fazatWebhookOutboundService` / `partner_webhook_events`.

Events:

- `settlement.approved`
- `settlement.adjusted_approved`
- `settlement.rejected`
- `settlement.credit_failed`

If `FAZAT_WEBHOOK_URL` empty → delivery `skipped`; wallet credit still succeeds.

---

## Audit actions

- `fazat_settlement.received`
- `fazat_settlement.approved`
- `fazat_settlement.adjusted_approved`
- `fazat_settlement.rejected`
- `fazat_settlement.credit_failed`
- `fazat_settlement.webhook_sent` / `fazat_settlement.webhook_failed`

---

## Migration

File: `backend/sql/migrations/185_fazat_settlements.sql` (additive).

```bash
cd backend
npm run db:migrate:fazat-settlements
```

Uses `runSqlFile.js` — do not run seeds or destructive scripts.

---

## Env

Same FAZAT integration env as workforce API. Optional:

- `FAZAT_WEBHOOK_URL` — outbound settlement events

---

## QA

```bash
cd backend
npm run test:fazat-integration
npm run qa:fazat-integration
npm run qa:fazat-settlements
```

---

## What rejection means on FAZAT side

Orderz rejection is **finance settlement only**. FAZAT should keep the amount as “external settlement rejected / needs review”, allow a corrected settlement later, and handle refunds/cancellations in FAZAT’s own flows.
