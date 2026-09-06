# Production release — Marketplace Membership (M1–M5 + M4.1 + M4.2)

Preparation / runbook only. **Do not treat this document as authorization to deploy.**

This release adds paid marketplace membership checkout (SILVER/PRO/ELITE), webhook grant to `purchased_pending_start`, gated usability, package bid allowance without double-grant, and freelancer plans UI.

---

## Explicit warnings

- **No** `db push` / `db reset` / Prisma-style schema push.
- **No** broad reconcile tick for memberships unless explicitly approved later.
- **No** random live Stripe checkout “just to try.”
- **No** Bildazo publish as part of this release.
- **No** seed against Production.
- Apply migrations **only** via the guarded production migrate path after backup confirmation.
- Success URL **never** grants membership; only the Stripe webhook does.

---

## 1. Preconditions before push

- [ ] Local package is complete (M1–M5 + M4.1 + M4.2).
- [ ] Backend membership tests pass (M1–M4.2 + eligibility).
- [ ] Frontend M5 / related UI tests pass.
- [ ] `frontend` `npm run build` succeeds.
- [ ] `backend/.env` / `backend/.env.staging` are **not** staged.
- [ ] Migration `181_*.sql` is included in the commit set.
- [ ] Migration `180_*.sql` is already in the repo (apply order still matters on Production).
- [ ] Operator understands: push ≠ deploy ≠ migrate.

---

## 2. Manual commit safety checklist (when you choose to commit)

**Do commit (code + migration + docs):**

- Modified tracked source under `backend/src`, `backend/test`, `frontend/src`, `.gitignore`, `backend/.gitignore`
- Untracked membership files listed in the pre-release report
- Optional: this runbook `docs/PRODUCTION_RELEASE_MARKETPLACE_MEMBERSHIP.md`

**Never commit:**

- `backend/.env`
- `backend/.env.staging`
- Any real `.env`, `.env.local`, credential dumps, Stripe live keys, DB URLs
- Generated `dist/` / build artifacts unless the project already tracks them (it should not)

**Allowed examples (already tracked):**

- `backend/.env.example`, `backend/.env.staging.example`, `frontend/.env.example`, etc.

Suggested message (operator decides):

```text
feat: add pending-start marketplace membership checkout flow
```

---

## 3. Production env checklist (masked)

Set / verify on the **production hosting** environment (not local `.env`):

| Variable | Expected shape | Notes |
|----------|----------------|-------|
| `CLIENT_URL` | `https://orderzhouse.com` | HTTPS apex only. **Not** localhost. **Not** `www` as canonical. |
| `STRIPE_SECRET_KEY` | `sk_live_***` | Live mode for production payments. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_***` | Must match the **Live** Dashboard endpoint signing secret. |
| `BACKEND_PUBLIC_URL` | `https://orderzhouse.com` (or same public API origin) | Used for mobile return bridge; must not be localhost. |
| `DATABASE_URL` | existing Production Neon | **Do not replace** with staging. |
| `JWT_SECRET` / existing secrets | unchanged | Keep current production values. |
| Frontend `VITE_API_BASE_URL` | `/api` (same-origin) | Per `docs/production-origin-canonical.md`. |

**Hard rules for `CLIENT_URL`:**

1. Must not be `localhost` / `127.0.0.1`.
2. Must be `https://`.
3. Must be the real production SPA origin (canonical: `https://orderzhouse.com`).

Checkout success/cancel URLs are built from `CLIENT_URL`:

- Success: `{CLIENT_URL}/dashboard/freelancer/plans?membershipCheckout=success&session_id={CHECKOUT_SESSION_ID}`
- Cancel: `{CLIENT_URL}/dashboard/freelancer/plans?membershipCheckout=cancelled&session_id={CHECKOUT_SESSION_ID}`

---

## 4. Stripe Dashboard checklist (Live mode)

Do **not** run a real payment yet.

1. Open Stripe Dashboard → **Live mode** (not Test).
2. Developers → Webhooks → endpoint for production backend:
   - URL: `https://orderzhouse.com/api/webhooks/stripe`  
     (or `https://<backend-production-domain>/api/webhooks/stripe` if API is on a separate host)
3. Confirm path in code: `backend/src/app.js` mounts `app.use("/api/webhooks/stripe", …)` and `stripeWebhookRoutes` POSTs `/`.
4. Enable event: **`checkout.session.completed`** (required for membership grant; other existing events may already be enabled — leave them).
5. Copy endpoint **signing secret** → set as production `STRIPE_WEBHOOK_SECRET` (`whsec_***`).
6. Confirm `STRIPE_SECRET_KEY` is the matching Live secret (`sk_live_***`).
7. Do **not** create a live checkout “smoke payment” until post-deploy smoke is intentionally approved.

---

## 5. Future Production migration order

Apply **only after** code is deployed (or immediately before app traffic that needs the columns — prefer migrate then traffic). Guarded production migrate only.

| Order | File | Role |
|------:|------|------|
| 1 | `180_freelancer_activation_inventory_visibility_duration_hours_p1.sql` | Additive column + check (activation inventory). |
| 2 | `181_marketplace_membership_purchased_pending_start_m1.sql` | Additive membership pending-start columns/statuses. |

Confirm before apply:

- Both files exist in the deployed artifact.
- No duplicate migration numbers.
- Scan shows no `DROP TABLE` / `DELETE FROM` / `TRUNCATE` for destructive wipe.

**Status (2026-08-25):** Production migrations **180 and 181 were applied** on Neon `ep-wandering-cherry…` via `db:migrate:production:next` (one at a time). `db:migrate:status` reported **Pending migrations: 0**. Code upload/deploy may proceed separately; do not re-apply these versions.

**Do not** use db push/reset.

---

## 6. Future deploy order (after upload)

1. **Commit + push** code (operator).
2. **Deploy backend + frontend** to Production hosts (operator / CI).
3. Confirm Production env: `CLIENT_URL`, Stripe Live keys, webhook secret.
4. Confirm Stripe Live webhook URL + `checkout.session.completed`.
5. **Backup** Production DB; set required migrate confirmation env vars.
6. Apply migrations in order: **180 → 181**.
7. Restart / verify API health.
8. Smoke checklist below (no random live paid checkout unless approved).

---

## 7. Smoke checklist (post-deploy)

Safe / read-mostly first:

- [ ] Freelancer plans page loads.
- [ ] STARTER CTA does **not** open Stripe (activation / free path).
- [ ] SILVER/PRO/ELITE CTA hits checkout API and returns a Stripe URL (optional: stop before paying).
- [ ] Cancel return shows `membershipCheckout=cancelled` UI (can cancel Stripe Checkout without paying).
- [ ] Webhook route responds to Stripe signature verification (Dashboard “Send test webhook” only if safe / already used for other events — prefer not inventing live money).
- [ ] Existing non-membership Stripe flows still work (regression).

Paid smoke (only if explicitly approved):

- [ ] One controlled Live Checkout → webhook → membership `purchased_pending_start`.
- [ ] Term dates still null until first **real** order/article selection.
- [ ] Pending-start has full package bid allowance; Priority Bid still active-only.
- [ ] First real selection starts term; fake/training does not.
- [ ] No double-grant of bids on term start.

---

## 8. Product logic (expected)

| Rule | Expected |
|------|----------|
| STARTER | Does **not** open Stripe |
| SILVER / PRO / ELITE | Open Stripe Checkout (`mode: payment`) |
| Webhook | Grants `purchased_pending_start` |
| Term start | **Not** at payment |
| Success URL | Banner only — **no** grant |
| Apply gates | Identity + training still required |
| Pending-start bids | Normal package `monthlyBidAllowance` |
| Priority Bid | Active membership only |
| Term trigger | First real order / article selection |
| Fake / training / simulation | Does **not** start term |
| Cycle unlock on start | Adopt pending-start grant — **no double-grant** |

---

## 9. Rollback / mitigation notes

- **Code rollback:** redeploy previous backend/frontend artifact. Additive migrations generally stay; new columns are unused by old code if written carefully.
- **Webhook misconfig:** disable or fix Live endpoint; membership grants stop until fixed (payments may still succeed in Stripe — reconcile carefully later, do not run broad ticks blindly).
- **Wrong `CLIENT_URL`:** users land on wrong success/cancel host; fix env and redeploy/restart. Does not grant membership by itself.
- **Partial migration:** if 180 applied and 181 fails, fix 181 and retry; do not reset DB.
- **Accidental double grant suspicion:** inspect membership + cycle ledger rows; do not mass-reconcile without a written plan.

---

## 10. Confirmations for preparation sessions

When preparing only (no upload):

- No `git add` / `git commit` / `git push`
- No deploy
- No Production DB writes / migrations
- No seed / db push / reset
- No real Stripe / PayTabs checkout
- No Bildazo publish
)
