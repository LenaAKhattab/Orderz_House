# Mobile Local QA — Orderz House Flutter

دليل تشغيل بيئة الاختبار المحلية لتطبيق Flutter (QA-2B وما بعده).

> **حسابات الاختبار للتطوير المحلي فقط** — لا تستخدمها في الإنتاج.

---

## 1. تحرير منفذ 5000 (قبل Backend)

أحيانًا تشغّل خدمة Node أخرى المنفذ 5000 وتُرجع استجابة خاطئة. **تحقق دائمًا قبل QA.**

### Windows (PowerShell / CMD)

```bat
netstat -ano | findstr ":5000"
taskkill /PID <PID> /F
```

### تشغيل Orderz backend (Staging QA فقط)

> **مهم:** لا تستخدم `npm start` لـ QA على المحاكي.  
> `npm start` يحمّل `backend/.env` وقد يشير إلى **Production**.  
> استخدم Staging فقط:

```bash
cd backend
npm run qa:staging:preflight
npm run start:staging
```

يتطلب وجود `backend/.env.staging` مع `APP_ENV=staging` وقاعدة Staging (ليس `ep-wandering-cherry…`).

### التحقق — يجب أن يكون Orderz API الحقيقي على Staging

```bash
curl http://localhost:5000/api/health
```

**صحيح (Orderz):**

```json
{ "success": true, "message": "API is running" }
```

**خاطئ (خدمة أخرى — أوقفها وأعد تشغيل backend):**

```json
{ "ok": true, "service": "backend" }
```

---

## 2. تشغيل الخدمات

### Backend

```bash
cd backend
npm start
```

### Frontend (لزر الاشتراك عبر الويب)

```bash
cd frontend
npm run dev
```

### Android Emulator + Flutter

```bash
cd mobile/orderzhouse_app
flutter emulators
flutter emulators --launch <emulator_id>
flutter pub get
flutter run -d emulator-5554
```

---

## 3. Stripe — تحذير بيئة محلية (QA-3A)

**لا تختبر الدفع المحلي بمفتاح live.**

| المتغير | المطلوب للـ QA المحلي |
|---------|------------------------|
| `STRIPE_SECRET_KEY` | `sk_test_...` |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (test) |

### فحص سريع (لا يعدّل `.env`)

```bash
cd backend
npm run qa:check-stripe-env
```

- إذا ظهر تحذير `sk_live_` — **لا تُكمل E2E للدفع** حتى تستبدل بمفاتيح test.
- إذا كان `checkoutUrl` يبدأ بـ `cs_live_` فالبيئة **غير مناسبة للـ QA** (جلسة Stripe إنتاج).

---

## 4. إعداد `.env` (Flutter)

ملف `mobile/orderzhouse_app/.env`:

```env
API_BASE_URL=http://10.0.2.2:5000/api
```

`WEB_BASE_URL` اختياري على Android — إن تُرك فارغًا يُستخدم fallback:

- Android emulator → `http://10.0.2.2:5173`
- iOS / desktop → `http://localhost:5173`

أو صراحة:

```env
WEB_BASE_URL=http://10.0.2.2:5173
```

---

## 5.1 QA يدوي بعد A2.4 (APK مثبّت)

- استخدم APK المُثبَّت (`app-debug.apk`) وليس `flutter run`.
- لتبديل الأدوار: **الحساب → تسجيل الخروج** ثم سجّل الدخول يدوياً بلوحة مفاتيح المحاكي.
- حسابات Staging: `qa.freelancer@orderzhouse.test` / `qa.client@orderzhouse.test` — كلمة المرور `Test123456!`
- بعد تسجيل الخروج من Super Admin، تحقق من: الدورات، مقالاتي، المقالات (Mini)، الطلبات (عميل) — بدون إتمام دفع.

---

### إنشاء / تحديث الحسابات (idempotent)

```bash
cd backend
ALLOW_QA_SEED=true node scripts/seed-mobile-qa-users.js --with-pool-orders
```

أو عبر npm:

```bash
cd backend
ALLOW_QA_SEED=true npm run db:seed-mobile-qa -- --with-pool-orders
```

**الشروط:**

- `ALLOW_QA_SEED=true` مطلوب
- لا يُشغَّل في `production` بدون `ALLOW_QA_SEED=true` صريح
- السكربت **idempotent** — إعادة التشغيل تحدّث الحسابات والطلبات دون تكرار

### بيانات الدخول (محلي فقط)

| الحساب | البريد | كلمة المرور |
|--------|--------|-------------|
| Client | `qa.client@orderzhouse.test` | `Test123456!` |
| Freelancer | `qa.freelancer@orderzhouse.test` | `Test123456!` |

السكربت يطبع نفس البيانات + **order IDs / codes** في الطرفية بعد التشغيل.

### ماذا يفعل السكربت؟ (QA-3A)

1. **Client:** `role=client`, verified/active
2. **Freelancer:** `role=freelancer`, verified/active
3. **الباقة:** `orderzhouse_platinum` (نطاق قيم طلبات أوسع للـ E2E)
4. **رسوم التفعيل:** مدفوعة offline للاختبار المحلي
5. **`--with-pool-orders`:** طلبان في السوق **مملوكان لعميل QA** (ليس admin):
   - `QA-2C Pool Fixed (mobile QA)` — fixed، 75 JOD، `payment_status=paid`
   - `QA-2C Pool Bidding (mobile QA)` — bidding، `bid_budget_min=50`, `bid_budget_max=100`

إعادة تشغيل `--with-pool-orders` **تعيد ضبط** حالة الطلب (استلام/عروض/تسليم) للاختبار من جديد.

طلبات إضافية (إنشاء / دفع من التطبيق) تُنشأ يدويًا أثناء QA.

---

## 6. Health checks بعد seed

```bash
# 1) Backend health
curl http://localhost:5000/api/health

# 2) Stripe guard (اختياري)
cd backend && npm run qa:check-stripe-env

# 3) Login freelancer
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Client-Type: mobile" \
  -d "{\"email\":\"qa.freelancer@orderzhouse.test\",\"password\":\"Test123456!\"}"

# 4) Eligibility (استبدل TOKEN)
curl http://localhost:5000/api/freelancer/eligibility \
  -H "Authorization: Bearer TOKEN" \
  -H "X-Client-Type: mobile"
```

المتوقع: `{ "success": true, "data": { "eligible": true, ... } }`

### السوق — طلبات QA

```bash
curl "http://localhost:5000/api/orders/pool?page=1&limit=20"
```

يجب أن يظهر:

- `QA-2C Pool Fixed (mobile QA)`
- `QA-2C Pool Bidding (mobile QA)`

### تحقق API (بدون take فعلي — أو أعد seed بعده)

```bash
# عرض 70 على bidding (استبدل BIDDING_ID و TOKEN)
curl -X POST "http://localhost:5000/api/orders/pool/BIDDING_ID/bids" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Client-Type: mobile" \
  -d "{\"amount\":70,\"message\":\"QA bid\"}"
```

المتوقع: **200** (مع باقة platinum ونطاق 50–100).

> **ملاحظة:** `POST .../take` على fixed يغيّر حالة الطلب. لإعادة الضبط: أعد تشغيل seed مع `--with-pool-orders`.

```bash
cd backend && npm run qa:verify-mobile-seed
```

يفحص eligibility + ownership + عرض 70 على bidding (يغيّر حالة العرض — أعد seed إن لزم).

### PowerShell

```powershell
(Invoke-WebRequest http://localhost:5000/api/health -UseBasicParsing).Content
(Invoke-WebRequest "http://localhost:5000/api/orders/pool?page=1&limit=20" -UseBasicParsing).StatusCode
(Invoke-WebRequest http://localhost:5173/ -UseBasicParsing).StatusCode
```

---

## 7. سكربتات backend ذات صلة

| السكربت | الغرض |
|---------|--------|
| `scripts/seed-mobile-qa-users.js` | **حسابات + طلبات QA للموبايل** |
| `scripts/check-local-stripe-qa-env.js` | تحذير مفاتيح Stripe live |
| `scripts/assignPlanByEmail.js` | تعيين باقة لمستقل بالبريد |
| `scripts/createAdminUser.js` | إنشاء admin |

---

## 8. قائمة تحقق قبل E2E يدوي (QA-2D)

- [ ] منفذ 5000 = Orderz API (`API is running`)
- [ ] `npm run qa:check-stripe-env` بدون تحذير live
- [ ] Backend `:5000` + Frontend `:5173`
- [ ] Emulator متصل (`flutter devices`)
- [ ] `ALLOW_QA_SEED=true npm run db:seed-mobile-qa -- --with-pool-orders`
- [ ] Login client + freelancer من التطبيق
- [ ] `GET /api/freelancer/eligibility` → `eligible: true`
- [ ] طلبات QA في السوق (fixed + bidding)

---

## 9. ملاحظات

- التسجيل عبر `/api/auth/register` يتطلب **OTP بريد** — حسابات QA تُنشأ عبر seed وليس register.
- أهلية المستقل: اشتراك + `company_approved` + رسوم تفعيل — السكربت يجهّز ذلك محليًا.
- طلبات السوق المملوكة لـ **qa.client** تسمح لاحقًا بـ approve / revision / review بعد تسليم المستقل.
- لا ترفع `ALLOW_QA_SEED` أو كلمات مرور الاختبار إلى الإنتاج.

---

## 10. Backend stability / troubleshooting (QA-OPS-1)

### الأعراض

- `npm start` يعمل ثم يتوقف بعد **~50–70 دقيقة** بدون رسالة خطأ واضحة.
- `curl http://localhost:5000/api/health` لا يستجيب.
- exit code مثل **4294967295** (Windows) غالبًا يعني **إيقاف خارجي** للعملية (إغلاق terminal، sleep، `taskkill`، OOM، أو أداة IDE) — وليس بالضرورة crash داخل التطبيق.

### تحقق من المنفذ 5000

```bash
curl http://localhost:5000/api/health
```

يجب: `"message": "API is running"`.  
إذا ظهر `{ "ok": true, "service": "backend" }` — خدمة خاطئة على المنفذ.

**Windows — من يستخدم المنفذ:**

```bat
netstat -ano | findstr ":5000"
taskkill /PID <PID> /F
```

### طريقة التشغيل الموصى بها للـ QA

| الخيار | الأمر | متى |
|--------|-------|-----|
| **A (افتراضي)** | `cd backend && npm start` | terminal مخصص، لا تغلقه أثناء QA |
| **B** | `npm run dev` | nodemon — يعيد التشغيل عند تغيير الملفات فقط (لا يمنع exit بعد ساعة) |
| **C (تشخيص)** | `node --trace-warnings server.js` | تتبع تحذيرات Node |
| **D (سجل ملف)** | `npm start > ../backend-qa.log 2>&1` | مراجعة آخر سطور بعد التوقف |

**مهم:**

- `npm start` = `node server.js` مباشرة (بدون nodemon، بدون timeout مدمج).
- `fake_orders_automation` يعمل `setInterval` كل **60s** افتراضيًا في التطوير — آخر logs عادية **لا تثبت** أنه السبب.
- لتعطيل ticks محليًا (تشخيص فقط): `FAKE_ORDERS_AUTOMATION_ENABLED=false npm start`

### إذا توقف الـ backend

1. افتح آخر سطور الـ terminal أو `backend-qa.log`.
2. ابحث عن:
   - `process_lifecycle` + `unhandledRejection` / `uncaughtException`
   - `process_lifecycle` + `SIGTERM` / `SIGINT`
   - `startServer_failed`
   - `Database connection failed`
3. أعد التشغيل: `cd backend && npm start`
4. تحقق: `curl http://localhost:5000/api/health`

### logging مضاف (QA-OPS-1)

عند التشغيل، `server.js` يسجّل إشارات العملية في stderr بصيغة JSON:

```json
{ "component": "process_lifecycle", "event": "SIGTERM", ... }
```

لا يغيّر منطق الأعمال — للتشخيص فقط.

### مراقبة أطول

إذا استمر التوقف بدون أي `process_lifecycle` event:

- راقب ذاكرة النظام / إغلاق laptop / إدارة الطاقة.
- شغّل مع log file (Option D) لمدة جلسة QA كاملة.
- مرحلة إصلاح لاحقة **QA-OPS-2** إن لزم (memory profiling، تعطيل automation مؤقت للمقارنة).

---
