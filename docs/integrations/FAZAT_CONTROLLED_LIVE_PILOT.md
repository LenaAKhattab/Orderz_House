# Orderz Controlled Live FAZAT Pilot

Related: [FAZAT_WORKFORCE_PROVIDER_API.md](./FAZAT_WORKFORCE_PROVIDER_API.md) · [FAZAT_LIVE_DB_ROLLOUT.md](./FAZAT_LIVE_DB_ROLLOUT.md)

## Scope

- Live DB may receive controlled writes (ranks, 1 pilot order, messages, webhooks, audit).
- **No deletes / truncates / seed / mass rank updates / Stripe changes.**
- Freelancer must not see FAZAT/FAZ3AT source.

## Required production env

```bash
FAZAT_INTEGRATION_ENABLED=true
FAZAT_INTEGRATION_API_KEY=<secure>
FAZAT_INTEGRATION_SHARED_SECRET=<secure 32+ chars>
FAZAT_WEBHOOK_URL=https://<public-fazat-or-tunnel>/api/v1/integrations/orderz/webhooks
ORDERZ_PUBLIC_API_URL=https://orderzhouse.com
FAZAT_INTEGRATION_ACTOR_USER_ID=<admin id>
FAZAT_DEFAULT_CATEGORY_ID=<category id>
FAZAT_PILOT_FREELANCER_IDS=<id1>,<id2>
```

`FAZAT_WEBHOOK_URL` must be **public**. Do not use `localhost` from live Orderz — use ngrok/cloudflared if FAZ3AT is local.

## Pilot allowlist

When `FAZAT_INTEGRATION_ENABLED=true`, `FAZAT_PILOT_FREELANCER_IDS` is **required**.

- Empty allowlist → API returns `FAZAT_PILOT_ALLOWLIST_EMPTY` (503).
- Non-allowlisted freelancer → `FAZAT_PILOT_NOT_ALLOWLISTED` (403) on create/rank via API.
- Expand rollout only by editing the allowlist env (no seed).

## Manual rank (selected ids only)

```bash
# Prefer allowlist membership:
$env:FAZAT_PILOT_FREELANCER_IDS="123,456"
npm run fazat:set-pilot-rank -- --id=123 --rank=APPROVED
npm run fazat:set-pilot-rank -- --id=456 --rank=TRUSTED

# Or single explicit confirm:
$env:FAZAT_PILOT_RANK_CONFIRM="PILOT_RANK"
npm run fazat:set-pilot-rank -- --id=123 --rank=APPROVED
```

UNAPPROVED → cannot receive FAZAT work.

## Enable partner row

Only after env + allowlist + at least one APPROVED/TRUSTED:

```bash
$env:FAZAT_ENABLE_PARTNER_CONFIRM="ENABLE_FAZAT_PARTNER"
npm run fazat:enable-partner
Remove-Item Env:FAZAT_ENABLE_PARTNER_CONFIRM
```

## Deploy note

DB tables alone are not enough. **Production Node process must load the pilot env and the allowlist code**, then restart.

## Freelancer visibility

Assigned payload uses `clientDisplayName = طلب مُدار من Orderz` and strips partner/FAZAT fields. Existing delivery upload path: `/freelancer/my-orders/:id/delivery`. Partner messages are stored in `partner_order_messages` + in-app notification (full chat UI may still be thin).

## Finance

`settlement_status = pending_internal_settlement` — no auto payouts.
