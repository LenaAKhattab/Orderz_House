# Freelancer Account Activation KYC (Phase A11)

Account activation for freelancers requires ID front/back upload, terms acceptance, and Super Admin review. This is **not** marketplace article activation, Bid Credits, Bildazo, or payment checkout.

## Flow

1. Freelancer opens `/dashboard/freelancer/activate-account`.
2. Uploads ID front + ID back (JPEG/PNG/WebP, max 5MB each).
3. Accepts activation terms.
4. Submits `POST /api/freelancer/account-activation/submit`.
5. Request status becomes `pending_review`; subscription `activation_status` → `company_pending`.
6. Super Admin reviews at `/dashboard/super-admin/freelancer-activation-requests`.
7. **Approve** → request `approved` + `activateAccountAfterKycApproval` sets `company_approved` and starts subscription period / STARTER sync.
8. **Reject** → request `rejected` + `company_rejected`; rejection reason required; freelancer can resubmit with new images.

## Statuses

| Layer | Values |
|-------|--------|
| Request (`freelancer_account_activation_requests.status`) | `draft`, `pending_review`, `approved`, `rejected`, `cancelled` |
| Subscription (`freelancer_subscriptions.activation_status`) | `company_pending`, `company_approved`, `company_rejected` |

Activation Engine A1 eligibility continues to require `activation_status === company_approved` only.

## Immediate self-activate

`POST /api/freelancer/subscription/activate-account` no longer grants `company_approved` for pending freelancers. The freelancer activate-account page uses **only** the KYC GET/submit APIs.

## A11.1 hardening — no staff bypass

| Path | Behavior |
|------|----------|
| Freelancer self-activate | Blocked (`ACCOUNT_ACTIVATION_REQUIRES_KYC_REVIEW`) unless already `company_approved` (STARTER sync only) |
| `PATCH /api/admin/subscriptions/:id/company-activate` | Requires an **approved** KYC request, **or** Super Admin + `overrideReason` (audited in subscription notes as `KYC_ADMIN_OVERRIDE`) |
| Admin plan assign / offline payment | Leaves `activation_status = company_pending` (does not auto-approve) |
| Financial Center `activate-account` | Unrelated (financial person `isActive` only — not freelancer KYC) |
| Super Admin KYC approve | Primary path → `activateAccountAfterKycApproval` |

Error codes: `FREELANCER_KYC_REQUIRED`, `FREELANCER_KYC_PENDING_REVIEW`, `FREELANCER_KYC_REJECTED`.

## Privacy / storage

- Store **private file keys** only (`cloudinary:…` authenticated or `local:kyc/…` under `backend/uploads/kyc/`).
- No public URLs in DB; no base64 in DB; images not in git.
- Super Admin views images via authenticated endpoints:
  - `GET /api/super-admin/freelancer-activation-requests/:id/files/front`
  - `GET /api/super-admin/freelancer-activation-requests/:id/files/back`
- Freelancer status API never returns admin notes or raw file keys.

## APIs

### Freelancer

- `GET /api/freelancer/account-activation`
- `POST /api/freelancer/account-activation/submit` (multipart: `idFront`, `idBack`, `termsAccepted`, `termsVersion`)

### Super Admin

- `GET /api/super-admin/freelancer-activation-requests`
- `GET /api/super-admin/freelancer-activation-requests/:id`
- `POST /api/super-admin/freelancer-activation-requests/:id/approve`
- `POST /api/super-admin/freelancer-activation-requests/:id/reject` (`rejectionReason` required, `adminNotes` optional)

## Migration

- `backend/sql/migrations/176_freelancer_account_activation_kyc_a11.sql`
- Additive only. Do not apply to production from this phase alone without staging E2E.

## Staging checklist

1. Apply migration 176 on staging.
2. Register / use a freelancer with `company_pending`.
3. Submit KYC with both images + terms → pending UI.
4. As Super Admin, open requests list → view images → reject with reason → freelancer sees reason and can resubmit.
5. Resubmit → approve → freelancer sees approved; Activation Engine eligibility sees `company_approved`.
6. Confirm images are not publicly reachable without auth.
7. Confirm paid membership / Bid Credits / Pantry / Bildazo unchanged.
