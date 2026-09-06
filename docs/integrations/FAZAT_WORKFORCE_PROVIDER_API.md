# FAZ3AT Workforce Provider API — Contract Lock (Orderz House)

**Status:** contract for FAZ3AT ↔ Orderz local/staging E2E  
**Partner code:** `FAZAT`  
**Audience:** FAZ3AT backend engineers + Orderz integration owners

Both sides MUST use these exact paths, headers, signature rules, enums, and event names.

---

## 1. Base URL

| Environment | Base URL |
|-------------|----------|
| Orderz local | `http://localhost:5000` |
| Orderz staging | `https://<orderz-staging-api-host>` |

Integration prefix (always):

```text
{ORDERZ_PUBLIC_API_URL}/api/integrations/fazat
```

Example local:

```text
http://localhost:5000/api/integrations/fazat
```

FAZ3AT frontend / browser / mobile apps must **never** call this API.

---

## 2. Auth headers (every request)

| Header | Required | Example / notes |
|--------|----------|-----------------|
| `X-Orderz-Partner-Key` | yes | value of `FAZAT_INTEGRATION_API_KEY` |
| `X-Orderz-Timestamp` | yes | Unix seconds (string), e.g. `1735689600` |
| `X-Orderz-Nonce` | yes | unique string, length 8–128 |
| `X-Orderz-Signature` | yes | lowercase hex HMAC-SHA256 |
| `X-Idempotency-Key` | recommended on POST create | opaque string; same key → same order |
| `Content-Type` | yes on JSON bodies | `application/json` |

### HMAC canonical string

```text
${timestamp}.${nonce}.${METHOD}.${pathWithQuery}.${sha256Hex(rawBody)}
```

Rules:

* `METHOD` is uppercase (`GET`, `POST`, `PATCH`).
* `pathWithQuery` includes the `/api/...` path **and** query string if present.  
  Example: `/api/integrations/fazat/freelancers?limit=50`
* `rawBody` is the **exact HTTP body bytes** used in the request.  
  For GET/HEAD use empty string `""` (hash of empty).
* Signature = `HMAC_SHA256_HEX(FAZAT_INTEGRATION_SHARED_SECRET, canonicalString)` (lowercase hex).
* Timestamp skew: `|now - timestamp| <= FAZAT_REQUEST_MAX_SKEW_SEC` (default **300** seconds).
* Nonce replay: each `(partnerCode, nonce)` may be used **once**; reuse → `REPLAY_REJECTED`.

### Error response format (auth / validation)

```json
{
  "success": false,
  "code": "UNAUTHORIZED",
  "message": "Invalid signature."
}
```

Common `code` values:

| code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | bad key / missing headers / bad timestamp format |
| `INVALID_SIGNATURE` | 401 | HMAC mismatch |
| `TIMESTAMP_REJECTED` | 401 | skew too large |
| `REPLAY_REJECTED` | 401 | nonce reused |
| `FAZAT_DISABLED` | 503 | integration disabled |
| `FAZAT_MISCONFIGURED` | 503 | missing secret/key |
| `FAZAT_FREELANCER_UNAPPROVED` | 403 | rank not assignable |
| `FAZAT_ACTOR_MISSING` | 503 | no admin actor for order create |

Business errors may also use Express error middleware shape with `success: false` and `message`.

---

## 3. Rank enum (exact)

```text
UNAPPROVED
APPROVED
TRUSTED
```

| Rank | `isAssignable` for FAZAT tasks |
|------|--------------------------------|
| `UNAPPROVED` | false (cannot receive partner orders) |
| `APPROVED` | true |
| `TRUSTED` | true (preferred in FAZAT admin selection) |

---

## 4. Order status enums (exact)

### 4.1 Partner mapping status (`partner_orders.status`)

Used in partner API / webhooks `status` field (string):

```text
created
assigned
delivery_submitted
revision_requested
completed
cancelled
```

(Additional free-form updates may appear via `status_changed`; treat unknown values as opaque.)

### 4.2 Orderz order status (`orders.order_status`) — returned as `orderStatus` when present

```text
draft
published
pending_payment
open_for_bids
awaiting_payment_after_bid_selection
assigned
in_progress
ready_for_work
pending_client_review
completed
cancelled
```

FAZAT partner-created assigned tasks typically start as `in_progress`.

### 4.3 Settlement status (finance — no auto payout)

```text
pending_internal_settlement
```

(Only value used in this phase.)

### 4.4 Delivery representation status (integration deliveries payload)

Not a separate DB enum. Derived from order + files:

| Concept | How FAZAT should read it |
|---------|--------------------------|
| No delivery yet | `deliveries: []`, `orderStatus` usually `in_progress` |
| Submitted awaiting review | `orderStatus: pending_client_review`, delivery files present |
| Revision requested | partner `status: revision_requested`, `orderStatus: in_progress` |
| Completed | `orderStatus: completed` |

File purpose values on delivery items:

```text
delivery
revision_request
```

---

## 5. Endpoints (exact paths)

Base: `/api/integrations/fazat`

### 5.1 `GET /freelancers`

Query (optional): `limit`, `offset`, `rank`

**200 response example:**

```json
{
  "success": true,
  "partnerCode": "FAZAT",
  "count": 1,
  "data": [
    {
      "providerFreelancerId": "2404",
      "publicCode": "10042",
      "rank": "APPROVED",
      "isAssignable": true,
      "displayName": "أحمد مثال",
      "skills": ["تصميم"],
      "ratingSummary": null,
      "completedCount": 3,
      "availability": "available"
    }
  ]
}
```

### 5.2 `PATCH /freelancers/:freelancerId/rank`

**Request:**

```json
{
  "rank": "TRUSTED",
  "notesInternal": "staging seed"
}
```

**200 response:** `{ "success": true, "data": { ...profile } }`

### 5.3 `POST /orders`

Headers: include `X-Idempotency-Key` for retries.

**Request example:**

```json
{
  "externalAssignmentId": "fazat-asg-001",
  "externalOrderId": "fazat-ord-001",
  "title": "مهمة تصميم شعار",
  "sanitizedBrief": "صمم شعارًا بسيطًا بدون ذكر اسم العميل الأصلي.",
  "selectedFreelancerId": 2404,
  "categoryId": 1,
  "durationValue": 3,
  "durationUnit": "days",
  "budget": 25,
  "preferredSkills": ["تصميم"],
  "priority": "normal",
  "internalAdminNotes": "staging only"
}
```

**201** (or **200** on idempotent replay):

```json
{
  "success": true,
  "idempotentReplay": false,
  "data": {
    "partnerCode": "FAZAT",
    "partnerOrderId": "12",
    "orderzOrderId": "42599",
    "externalAssignmentId": "fazat-asg-001",
    "externalOrderId": "fazat-ord-001",
    "freelancerId": "2404",
    "status": "assigned",
    "settlementStatus": "pending_internal_settlement",
    "orderStatus": "in_progress",
    "title": "مهمة تصميم شعار",
    "dueAt": "2026-08-07T12:00:00.000Z",
    "createdAt": "2026-08-04T15:00:00.000Z",
    "updatedAt": "2026-08-04T15:00:00.000Z"
  }
}
```

Duplicate `externalAssignmentId` or same `X-Idempotency-Key` → **no second Orderz order** (`idempotentReplay: true`).

### 5.4 `GET /orders/:orderId`

`:orderId` = **Orderz order id** (`orderzOrderId`).

### 5.5 `POST /orders/:orderId/messages`

```json
{
  "message": "يرجى توضيح المقاسات.",
  "externalMessageId": "fazat-msg-1"
}
```

### 5.6 `GET /orders/:orderId/messages`

Returns proxy messages with white-label `displaySenderLabel` (never FAZ3AT identity).

### 5.7 `GET /orders/:orderId/deliveries`

**Current phase:** metadata + protected path **hints** only.

```json
{
  "success": true,
  "data": {
    "partnerOrder": { "...": "..." },
    "orderStatus": "pending_client_review",
    "submissionHistory": null,
    "deliveries": [
      {
        "id": "88",
        "purpose": "delivery",
        "originalName": "logo.pdf",
        "mimeType": "application/pdf",
        "sizeBytes": 12345,
        "uploadedAt": "2026-08-04T16:00:00.000Z",
        "downloadPath": "/api/integrations/fazat/orders/42599/files/88"
      }
    ]
  }
}
```

**Important:** `downloadPath` is a **hint**. Full authenticated file relay on this path is **not** implemented in this phase. Do not treat these as public URLs. Freelancer delivery files remain behind existing Orderz auth download routes.

### 5.8 `POST /orders/:orderId/revision`

```json
{ "note": "يرجى تعديل الألوان." }
```

---

## 6. Webhooks (Orderz → FAZ3AT)

Configure `FAZAT_WEBHOOK_URL` on Orderz (FAZ3AT local/staging receiver).

### Event names (exact)

```text
orderz.partner_order.created
orderz.partner_order.assigned
orderz.partner_order.status_changed
orderz.partner_message.created
orderz.partner_delivery.submitted
orderz.partner_delivery.updated
orderz.partner_order.cancelled
```

### Webhook request headers

| Header | Meaning |
|--------|---------|
| `Content-Type` | `application/json` |
| `X-Orderz-Partner-Code` | `FAZAT` |
| `X-Orderz-Timestamp` | unix seconds |
| `X-Orderz-Nonce` | unique |
| `X-Orderz-Signature` | HMAC of canonical string |
| `X-Orderz-Event-Id` | same as payload `eventId` |
| `X-Orderz-Event-Type` | same as payload `eventType` |

Canonical signing for webhooks (Orderz outbound):

```text
${timestamp}.${nonce}.POST./webhooks/orderz.${sha256Hex(rawBody)}
```

FAZ3AT should verify using the shared secret. Path constant in signature is `/webhooks/orderz` (logical path for signing), regardless of the full absolute `FAZAT_WEBHOOK_URL`.

### Webhook payload example

```json
{
  "eventId": "fazat_1735689600_ab12cd34",
  "eventType": "orderz.partner_order.assigned",
  "occurredAt": "2026-08-04T15:00:00.000Z",
  "partnerCode": "FAZAT",
  "externalAssignmentId": "fazat-asg-001",
  "externalOrderId": "fazat-ord-001",
  "orderzOrderId": "42599",
  "freelancerId": "2404",
  "status": "assigned"
}
```

Rules:

* `eventId` is unique; FAZ3AT must treat delivery as **idempotent** by `eventId`.
* Never includes secrets, Stripe keys, wallet, ledger, or FAZ3AT client PII beyond mapping ids already known to FAZ3AT.

### Settlement review (Orderz admin credit)

See `docs/integrations/FAZAT_SETTLEMENTS.md`.

```http
POST /api/integrations/fazat/settlements
```

Creates `PENDING_REVIEW` only. Wallet credit happens after Orderz admin approval on **تسويات فزعات**.

* Outbox table: `partner_webhook_events` (`pending` → `sent` | `failed` | `skipped`).

---

## 7. Freelancer white-label rules

Freelancer APIs/UI must NOT show:

* `FAZ3AT`, `FAZAT`, `partnerCode`, `externalAssignmentId`, `externalOrderId`
* FAZ3AT client identity / URLs
* payment / wallet / Stripe linkage for partner source

Freelancer SHOULD see:

* managed alias: `طلب مُدار من Orderz` (`clientDisplayName`)
* task brief, status, delivery upload (existing Orderz freelancer flows)
* proxy messages via API/notifications (full chat UI may still be incomplete)

---

## 8. Environment (Orderz)

```bash
FAZAT_INTEGRATION_ENABLED=true
FAZAT_INTEGRATION_API_KEY=<redacted>
FAZAT_INTEGRATION_SHARED_SECRET=<redacted>
FAZAT_WEBHOOK_URL=http://localhost:<fazat-port>/webhooks/orderz
ORDERZ_PUBLIC_API_URL=http://localhost:5000
FAZAT_INTEGRATION_ACTOR_USER_ID=<admin_user_id>
FAZAT_DEFAULT_CATEGORY_ID=<category_id>
FAZAT_REQUEST_MAX_SKEW_SEC=300
```

### Environment (FAZ3AT calling Orderz)

```bash
ORDERZ_PROVIDER_BASE_URL=http://localhost:5000
ORDERZ_PROVIDER_API_PREFIX=/api/integrations/fazat
ORDERZ_PARTNER_KEY=<same as FAZAT_INTEGRATION_API_KEY>
ORDERZ_SHARED_SECRET=<same as FAZAT_INTEGRATION_SHARED_SECRET>
ORDERZ_REQUEST_MAX_SKEW_SEC=300
```

---

## 9. Safe DB / migration

See **[FAZAT_LOCAL_E2E_SETUP.md](./FAZAT_LOCAL_E2E_SETUP.md)** for local Postgres / Neon branch steps.

Migration file:

```text
backend/sql/migrations/125_fazat_workforce_provider.sql
```

Additive only (`CREATE TABLE IF NOT EXISTS`, no DROP of existing product tables).

**Do not run against production / live Neon.**

```bash
cd backend
npm run check:fazat-db-safety
npm run migrate:fazat-safe
npm run seed:fazat-staging
```

Env template (no secrets): `backend/.env.fazat-e2e.example`  
Webhook URL for FAZ3AT local: `http://localhost:3000/api/v1/integrations/orderz/webhooks`

---

## 10. Limitations (contract honesty)

* No automatic cross-platform payouts.
* Integration file download route is **metadata hint only** in this phase.
* Freelancer in-app chat UI for partner messages may be incomplete; API + notification path exists.
* Stripe / fake-training automation unchanged.

---

## 11. Purpose reminder

Orderz is a white-label workforce provider for FAZ3AT. Internally Orderz admins may see partner mappings; freelancers must not.
