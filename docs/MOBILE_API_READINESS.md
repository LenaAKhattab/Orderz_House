# Mobile API Readiness — Orderz House

توثيق الوضع الحالي للـ API استعدادًا لتطبيق Flutter.  
**Phase 2A:** دعم Bearer token للموبايل مع إبقاء الويب على HttpOnly cookie.

---

## Base URL

- Frontend: `VITE_API_BASE_URL` (افتراضي `http://localhost:5000/api`)
- جميع المسارات أدناه نسبية من `/api`

---

## Auth — ويب vs موبايل (Phase 2A)

| العميل | آلية الجلسة | Login response |
|--------|-------------|----------------|
| **Web** (افتراضي) | HttpOnly cookie `orderz_access_token` | `{ success, message, data: { user } }` فقط — **بدون** token في body |
| **Mobile** | `Authorization: Bearer <accessToken>` | `{ success, message, data: { user, accessToken, tokenType, expiresIn } }` — **بدون** Set-Cookie |

### تمييز عميل الموبايل

أرسل header صريحًا في كل طلب auth (login و OTP):

```http
X-Client-Type: mobile
```

- لا يعتمد على User-Agent.
- الويب **لا** يرسل هذا الـ header — يبقى على cookie كما كان.

### تسجيل دخول Flutter (لاحقًا)

1. `POST /auth/login` مع `X-Client-Type: mobile`
2. خزّن `data.accessToken` في `flutter_secure_storage` (ليس localStorage)
3. أرفق في كل طلب محمي:

```http
Authorization: Bearer <accessToken>
```

4. عند `401` / `INVALID_TOKEN` → شاشة تسجيل الدخول (re-login)
5. `POST /auth/logout` اختياري — يمسح cookie إن وُجد؛ الموبايل يحذف التوكن محليًا

### Refresh token

**مؤجّل** — Phase 2A يكتفي بـ access token واحد (`JWT_EXPIRES_IN` افتراضي `7d`). لا جدول sessions بعد.

### الويب (بدون تغيير)

| البند | التفاصيل |
|--------|----------|
| آلية الجلسة | JWT في **HttpOnly cookie** `orderz_access_token` |
| Legacy | Bearer في `localStorage` (`orderz_auth_token`) — يُمسح عند login جديد |
| Axios | `withCredentials: true` |
| Bootstrap | `GET /auth/me` عند تحميل التطبيق (مع session hint) |
| Login | `POST /auth/login` → يضبط cookie، body = `{ user }` فقط |
| Logout | `POST /auth/logout` → يمسح cookie |

---

## أمثلة curl

### Web login (cookie)

```bash
curl -c cookies.txt -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"your-password"}'

# Response: { "success": true, "data": { "user": { ... } } }
# Set-Cookie: orderz_access_token=...

curl -b cookies.txt http://localhost:5000/api/auth/me
```

### Mobile login (Bearer)

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Client-Type: mobile" \
  -d '{"email":"user@example.com","password":"your-password"}'

# Response:
# {
#   "success": true,
#   "message": "تم تسجيل الدخول بنجاح.",
#   "data": {
#     "user": { ... },
#     "accessToken": "eyJ...",
#     "tokenType": "Bearer",
#     "expiresIn": 604800
#   }
# }

curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

### Mobile OTP verification

```bash
curl -X POST http://localhost:5000/api/auth/verify-register-otp \
  -H "Content-Type: application/json" \
  -H "X-Client-Type: mobile" \
  -d '{"email":"user@example.com","otp":"123456"}'
```

نفس شكل response مثل mobile login (مع `accessToken`، بدون cookie).

---

## Stripe (redirect-based)

| التدفق | Endpoint تقريبي | السلوك |
|--------|-----------------|--------|
| دفع طلب ثابت / بعد اختيار عرض | `POST /client/orders/:id/checkout` | يرجع `checkoutUrl` |
| اشتراك باقة مستقل | مسارات `/freelancer/subscriptions/*` | redirect لـ Stripe Hosted Checkout |
| Webhook | `POST /webhooks/stripe` | server-side فقط — **لا يلمسه التطبيق** |

### Flutter لاحقًا

- `url_launcher` أو `webview_flutter` / Custom Tabs لفتح `checkoutUrl`
- Deep link / return URL بعد الدفع للعودة للتطبيق
- الاعتماد على webhook لتحديث الحالة — ليس على عودة المستخدم فقط

---

## APIs جاهزة للاستخدام (MVP عميل)

| Method | Path | Auth | الاستخدام |
|--------|------|------|-----------|
| POST | `/auth/register` | ❌ | تسجيل |
| POST | `/auth/verify-register-otp` | ❌ | تأكيد OTP |
| POST | `/auth/login` | ❌ | دخول |
| POST | `/auth/logout` | optional | خروج |
| GET | `/auth/me` | ✅ | المستخدم الحالي |
| GET | `/categories/*` | ❌/✅ | تصنيفات الخدمات |
| GET | `/plans` | ❌ | الباقات العامة |
| GET | `/orders/pool` | optional | سوق الطلبات |
| GET | `/orders/pool/:id` | optional | تفاصيل طلب في السوق |
| POST | `/client/orders` | ✅ client | إنشاء طلب |
| POST | `/client/orders/:id/checkout` | ✅ client | Stripe checkout |
| GET | `/client/orders` | ✅ client | طلباتي |
| GET | `/client/orders/:id` | ✅ client | تفاصيل |
| POST | `/client/orders/:id/approve` | ✅ client | قبول تسليم |
| GET | `/notifications` | ✅ | إشعارات |
| GET/PATCH | `/profile/*` | ✅ | الملف الشخصي |
| GET | `/public/site-pages` | ❌ | صفحات قانونية/عامة |

---

## APIs جاهزة (MVP مستقل — مرحلة 2)

| Method | Path | Auth | الاستخدام |
|--------|------|------|-----------|
| GET | `/orders/pool` | ✅ freelancer | سوق مفلتر حسب الباقة |
| POST | `/freelancer/orders/pool/:id/claim` | ✅ freelancer | أخذ طلب ثابت |
| POST | `/freelancer/orders/:id/bids` | ✅ freelancer | تقديم عرض |
| POST | `/freelancer/orders/:id/deliver` | ✅ freelancer | تسليم |
| GET | `/freelancer/my-orders` | ✅ freelancer | طلباتي |
| GET | `/freelancer/subscriptions/*` | ✅ freelancer | باقات واشتراك |
| GET | `/portal/financial-claims/*` | ✅ freelancer | مطالبات مالية |

---

## أمان سوق الطلبات للضيف (Phase 1 — مراجعة)

Endpoints:

- `GET /api/orders/pool` — `optionalAuth`
- `GET /api/orders/pool/:id` — `optionalAuth`

للزائر غير المسجل يُطبَّق `sanitizePublicPoolOrder` (allowlist):

- **لا يُرجع:** بريد، هاتف، `createdByUserId`, `paymentStatus`, ملفات، روابط تحميل مباشرة
- **يُرجع:** عنوان، وصف، تصنيف، ميزانية، حالة عامة، عدد المتقدمين، `hasAssignedFreelancer` (boolean)

اختبارات موجودة: `backend/test/phase4aSecurity.test.js`, `poolOrderSanitize.test.js`.

**لا تعديل مطلوب في Phase 1** — السلوك آمن حسب المراجعة.

---

## APIs تحتاج تحسين لاحقًا (ليس Phase 1)

| البند | السبب |
|--------|--------|
| ~~Login response~~ | ✅ Phase 2A — Bearer للموبايل عبر `X-Client-Type: mobile` |
| شكل الـ response | توحيد `{ success, data, message }` عبر كل الـ domains |
| رفع الملفات | multipart + progress للموبايل |
| إشعارات push | FCM غير مدمج — in-app فقط حاليًا |
| Admin / Super Admin | ~50+ endpoint — خارج نطاق تطبيق المستخدم |
| Translation API | عام — يحتاج rate limit / auth review للإنتاج |

---

## Endpoints عامة (لا تحتاج Auth)

- `GET /health`
- `GET /public/*` (home stats, ads, site-pages, website pages)
- `GET /plans`, categories عامة
- `GET /orders/pool` (بيانات marketplace-safe فقط)

---

## CORS و Cookies

- CORS: origins محددة في `CLIENT_URL` + localhost في dev
- `credentials: true` مطلوب للويب
- Flutter native: **لا يعتمد على CORS** — يعتمد على Bearer + HTTPS

---

## MVP مقترح للتطبيق

1. **المرحلة 1:** عميل فقط (تسجيل، طلبات، دفع WebView، متابعة)
2. **المرحلة 2:** مستقل (سوق، claim، تسليم، باقات)
3. **لاحقًا:** إشعارات push، offline cache، admin mobile (اختياري)

---

## Checklist قبل بدء Flutter

- [x] Bearer token flow موثّق ومُنفَّذ في API (Phase 2A — backend)
- [ ] Stripe return URLs للموبايل
- [ ] `docs/DESIGN_TOKENS.md` → Flutter ThemeData
- [ ] اختبار pool guest على جهاز حقيقي
- [ ] توحيد error messages للعرض في التطبيق

---

*آخر تحديث: Phase 2A — Mobile Auth (backend Bearer support)*
