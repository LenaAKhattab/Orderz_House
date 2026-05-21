# Orderz House — Manual Staging E2E Checklist

Run on **staging** after deploy. Use **Stripe test mode** and **Resend** for email. Check each box when verified.

**Prerequisites:** `backend/.env` and `frontend` build env configured per [deployment-checklist.md](./deployment-checklist.md).

---

## Auth

| # | Scenario | Pass | Notes |
|---|----------|:----:|-------|
| 1 | Register **client** — form submits | ☐ | |
| 2 | Receive **OTP** email (6 digits) | ☐ | Requires `RESEND_API_KEY` |
| 3 | Verify OTP — account active | ☐ | |
| 4 | Register **freelancer** + OTP | ☐ | |
| 5 | **Login** — redirect to role dashboard | ☐ | |
| 6 | **Logout** — session cleared; protected routes redirect to login | ☐ | |
| 7 | Refresh page while logged in — session persists (`/auth/me`) | ☐ | HttpOnly cookie |
| 8 | Logged-in user visiting `/login` or `/register` → redirected to dashboard | ☐ | GuestOnly |
| 9 | **Forgot password** — email received | ☐ | |
| 10 | **Reset password** — login with new password | ☐ | |

---

## Client

| # | Scenario | Pass | Notes |
|---|----------|:----:|-------|
| 11 | Open `/dashboard/client` | ☐ | |
| 12 | **Create order** (modal or flow) | ☐ | |
| 13 | **Upload file** on order | ☐ | Cloudinary configured |
| 14 | Order appears in **طلباتي** (`/dashboard/client/my-orders`) | ☐ | |
| 15 | **Stripe test checkout** — complete payment | ☐ | `sk_test_` |
| 16 | Return from **success** URL — order state updated | ☐ | |
| 17 | Return from **cancel** URL — no broken state | ☐ | |
| 18 | **Accept delivery** (if order in delivered state) | ☐ | |
| 19 | **Rate freelancer** (if flow available) | ☐ | |
| 20 | **Financial** page loads | ☐ | |
| 21 | **Notifications** page loads | ☐ | |
| 22 | Client cannot open `/dashboard/admin` or super-admin URLs | ☐ | Redirect to own dashboard |
| 23 | `/dashboard/client/orders` marketplace works | ☐ | |
| 24 | `/dashboard/freelancer/orders` still works for client (legacy path) | ☐ | |

---

## Freelancer

| # | Scenario | Pass | Notes |
|---|----------|:----:|-------|
| 25 | Open `/dashboard/freelancer` | ☐ | |
| 26 | **Marketplace** lists pool orders | ☐ | |
| 27 | **Take fixed order** (if plan allows) | ☐ | Subscription active |
| 28 | **Submit bid** on bidding order | ☐ | |
| 29 | **My orders** list + order detail | ☐ | |
| 30 | **Submit delivery file** on assigned order | ☐ | |
| 31 | **Financial claim** create/list | ☐ | |
| 32 | **Courses** list + open course detail | ☐ | |
| 33 | **Settings** — profile/bank fields save | ☐ | |
| 34 | Cannot see another freelancer's financial data | ☐ | |
| 35 | Cannot submit on order not assigned to self | ☐ | |

---

## Admin

| # | Scenario | Pass | Notes |
|---|----------|:----:|-------|
| 36 | `/dashboard/admin` — hub loads real counts (not placeholder) | ☐ | |
| 37 | Sidebar: orders, courses, ads, subscriptions, notifications, settings | ☐ | |
| 38 | **Internal orders** list | ☐ | |
| 39 | **Create internal order** | ☐ | |
| 40 | **Courses** admin CRUD smoke | ☐ | |
| 41 | **Ads** admin smoke | ☐ | |
| 42 | **Subscription activation** | ☐ | |
| 43 | Admin **cannot** see super-admin-only nav (plans, training orders, analytics) | ☐ | |
| 44 | Direct URL to `/dashboard/super-admin` → denied/redirect | ☐ | |

---

## Super Admin

| # | Scenario | Pass | Notes |
|---|----------|:----:|-------|
| 45 | `/dashboard/super-admin` — analytics loads (**Recharts** chunk) | ☐ | Network: `vendor-recharts` |
| 46 | **Plans** CRUD smoke | ☐ | |
| 47 | **Subscriptions** | ☐ | |
| 48 | **Financial claims** | ☐ | |
| 49 | **Courses / Ads / Orders** | ☐ | |
| 50 | **Training orders** sub-routes (settings, templates, rounds, applications) | ☐ | |
| 51 | **Notifications / Settings** | ☐ | |
| 52 | Admin user cannot access super-admin API/pages | ☐ | |

---

## Stripe (test mode on staging)

| # | Scenario | Pass | Notes |
|---|----------|:----:|-------|
| 53 | Webhook endpoint reachable (Stripe Dashboard → send test event) | ☐ | |
| 54 | `checkout.session.completed` updates order/subscription | ☐ | |
| 55 | `payment_intent.succeeded` / `failed` handled | ☐ | |
| 56 | Duplicate webhook — no double charge (idempotency) | ☐ | |
| 57 | Webhook not blocked by rate limit or origin guard | ☐ | |

---

## Uploads

| # | Scenario | Pass | Notes |
|---|----------|:----:|-------|
| 58 | **Profile avatar** upload | ☐ | |
| 59 | **Order file** upload (pdf/image) | ☐ | |
| 60 | **Ad image** upload (admin) | ☐ | |
| 61 | **Course file** upload (if used) | ☐ | |
| 62 | Reject dangerous file (e.g. `.exe`, `.html`) — 400 | ☐ | |
| 63 | Oversized upload — 413 | ☐ | |

---

## Notifications

| # | Scenario | Pass | Notes |
|---|----------|:----:|-------|
| 64 | Bell shows **unread count** | ☐ | |
| 65 | **SSE** connects (`/api/notifications/stream`) | ☐ | DevTools → EventSource |
| 66 | SSE URL has **no** `?token=` query param | ☐ | Cookie auth only |
| 67 | New notification increments count (trigger from another action) | ☐ | |

---

## Security smoke

| # | Scenario | Pass | Notes |
|---|----------|:----:|-------|
| 68 | Response includes security headers (Helmet) | ☐ | `curl -I` API |
| 69 | Burst API calls eventually **429** (not on normal browsing) | ☐ | |
| 70 | Public pool order JSON has **no** email/phone/payment/internal IDs | ☐ | |
| 71 | `POST /api/internal/fake-orders/automation-tick` without secret → 404/403 | ☐ | |

---

## Mobile / responsive (quick)

| # | Screen | Pass | Notes |
|---|--------|:----:|-------|
| 72 | Home `/` | ☐ | No horizontal scroll |
| 73 | Login / Register | ☐ | |
| 74 | Marketplace / orders list | ☐ | Tables scroll horizontally if needed |
| 75 | Client dashboard | ☐ | |
| 76 | Freelancer dashboard | ☐ | |
| 77 | Admin tables (orders, subscriptions) | ☐ | |

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| QA / Owner | | |

**Staging go/no-go:** All critical paths (Auth 1–10, Client 11–17, Stripe 53–56, Security 68–71) must pass before production.
