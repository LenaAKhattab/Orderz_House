# Financial Claims Safety (Phase F1)

## Architecture (current)

OrderzHouse does **not** have an automatic JOD freelancer cash wallet.

| Source | Where money is recorded | Spendable / withdrawable? |
|--------|-------------------------|---------------------------|
| Completed orders | Manual `financial_claims` → Super Admin pricing → offline `financial_freelancer_payments` | Only after admin payment ledger |
| Mini Articles | `marketplace_article_settlements` + `marketplace_article_financial_entries` | Ledger / Earned Balance display only |
| Bid Credits / Work Tokens | Separate integer ledgers | Not cash |

## F1 hardening rules

1. **`paid` requires payment ledger**  
   Generic `PATCH /api/super-admin/financial-claims/:id/status` cannot set `paid`.  
   Error: `FINANCIAL_CLAIM_PAYMENT_LEDGER_REQUIRED`.  
   Use `POST /api/super-admin/freelancer-payments` only.

2. **No freelancer-supplied pricing**  
   `POST /api/portal/financial-claims` rejects pricing/amount body fields.  
   Error: `FINANCIAL_CLAIM_PRICING_NOT_ALLOWED`.  
   Admin sets pricing via `PATCH .../pricing`. For `done_project`, server may snapshot trusted `orders.budget` as total only (percentages remain for admin).

3. **KYC / company approval required for new claims**  
   Freelancer must have `freelancer_subscriptions.activation_status = company_approved`.  
   Errors: `FREELANCER_KYC_REQUIRED` | `FREELANCER_KYC_PENDING_REVIEW` | `FREELANCER_KYC_REJECTED`.  
   Existing claims remain listable; Super Admin management unchanged.

4. **Earned Balance uses frozen writer net**  
   Display prefers `writer_net_jod` / writer ledger amount over live campaign `freelancer_share_jod`.

## Starter / missing membership (unchanged policy this phase)

- If a **current** Marketplace Membership exists and Starter withdrawals are disabled → claim create still blocked (`STARTER_WITHDRAWAL_BLOCKED`).
- If **no** membership row exists → Starter gate is skipped (after KYC gate passes).  
  **Later product decision:** fail-closed when membership missing, or keep allow.

## Remaining future work

- True cash wallet (if product decides)
- Full pricing-change history audit trail
- Missing-membership claim policy
- Withdrawal automation
- Bridge article `writer_available` → claims (if desired)

## Staging checklist

1. Super Admin cannot set claim status to مدفوعة from status modal; must use تسجيل دفعة.
2. API POST claim with `totalPriceSnapshot` → 400 `FINANCIAL_CLAIM_PRICING_NOT_ALLOWED`.
3. Freelancer without `company_approved` cannot create claim.
4. Earned Balance amount stays on settlement writer net after campaign share edit.
5. Confirm Stripe / Bid Credits / Pantry / Bildazo unchanged.
