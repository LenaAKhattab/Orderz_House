# Mobile Release Build — Orderz House Flutter

دليل بناء تطبيق Flutter للإصدار التجريبي والإنتاج (Phase 5C+).

> **Stripe keys ليست داخل التطبيق.** الدفع يتم عبر Stripe Checkout في المتصفح الخارجي.  
> **Backend الإنتاج يجب أن يكون HTTPS** مع `BACKEND_PUBLIC_URL` و`CLIENT_URL` مضبوطين.

---

## 1. بيئات التشغيل

| البيئة | API | Web |
|--------|-----|-----|
| **Dev (افتراضي)** | `http://10.0.2.2:5000/api` (Android emu) | `http://10.0.2.2:5173` |
| **Staging** | `https://staging-api.example.com/api` | `https://staging.example.com` |
| **Production** | `https://orderzhouse.com/api` | `https://orderzhouse.com` |

> **Production API (Phase 5C-2):** الـ endpoint المُتحقَّق حاليًا هو `https://orderzhouse.com/api`  
> (`GET /api/health` → `success: true`, `message: "API is running"`).  
> لا تستخدم `https://api.orderzhouse.com/api` إلا بعد تفعيله وتأكيد `/api/health` عليه.

### أولوية قراءة URLs في التطبيق

1. `--dart-define=API_BASE_URL` / `WEB_BASE_URL` (أعلى أولوية)
2. في **debug/profile فقط**: قيم من `.env.example` المحمّل عبر dotenv (إن وُجد)
3. في **debug/profile**: fallback محلي (`10.0.2.2` / `localhost`)
4. في **release**: fallback إنتاج HTTPS فقط — **لا localhost ولا http**

---

## 2. أوامر التطوير (Dev)

```bash
cd mobile/orderzhouse_app
flutter pub get
flutter run
```

### تجاوز URLs محليًا بدون تعديل ملفات

```bash
flutter run --dart-define-from-file=.env
```

أو:

```bash
flutter run \
  --dart-define=API_BASE_URL=http://192.168.1.10:5000/api \
  --dart-define=WEB_BASE_URL=http://192.168.1.10:5173
```

> ملف `.env` المحلي **غير مضمّن** في APK release. انسخ `.env.example` للتجربة المحلية فقط.

---

## 3. Staging

```bash
flutter run --release \
  --dart-define=API_BASE_URL=https://YOUR_STAGING_API/api \
  --dart-define=WEB_BASE_URL=https://YOUR_STAGING_WEB
```

---

## 4. Android signing (Phase 5D)

**لا ترفع إلى git:**

- `android/key.properties`
- `android/app/*.jks` أو أي `*.keystore`

### إنشاء keystore محليًا (مرة واحدة)

من مجلد `mobile/orderzhouse_app/android`:

```bash
keytool -genkey -v \
  -keystore app/upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias upload
```

> استبدل كلمات المرور عند المطالبة — **لا تشاركها ولا ترفعها إلى git.**

### إعداد `key.properties`

```bash
cd mobile/orderzhouse_app/android
cp key.properties.example key.properties
```

عدّل `key.properties` (محلي فقط):

```properties
storePassword=YOUR_STORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=upload
storeFile=app/upload-keystore.jks
```

**بدون `key.properties`:** `flutter build apk --release` و `appbundle` **يفشلان** برسالة واضحة — لا يُستخدم debug signing.

---

## 5. أوامر البناء

### Debug (فريق داخلي / QA)

```bash
cd mobile/orderzhouse_app
flutter build apk --debug
```

المخرجات: `build/app/outputs/flutter-apk/app-debug.apk`

### Staging release APK

```bash
flutter build apk --release \
  --dart-define=API_BASE_URL=https://staging-api.example.com/api \
  --dart-define=WEB_BASE_URL=https://staging.example.com
```

### Production release APK

```bash
cd mobile/orderzhouse_app
flutter build apk --release \
  --dart-define=API_BASE_URL=https://orderzhouse.com/api \
  --dart-define=WEB_BASE_URL=https://orderzhouse.com
```

المخرجات: `build/app/outputs/flutter-apk/app-release.apk`

### Production AAB (Google Play)

```bash
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://orderzhouse.com/api \
  --dart-define=WEB_BASE_URL=https://orderzhouse.com
```

المخرجات: `build/app/outputs/bundle/release/app-release.aab`

---

## 6. تحذيرات مهمة

| ⚠️ | التفاصيل |
|----|----------|
| لا تبنِ release بدون التحقق من URLs | بدون `--dart-define` يستخدم التطبيق fallback إنتاج HTTPS — لكن **تأكد دائمًا** قبل التوزيع |
| لا تضمّن `.env` محليًا | `.env` ليس في `pubspec.yaml` assets |
| release يرفض `http://` | API وWEB وStripe checkout |
| cleartext HTTP | **debug/profile فقط** على Android |
| Backend | يجب أن يكون HTTPS في الإنتاج |

---

## 7. التحقق بعد التثبيت

1. **Login** — عميل ومستقل
2. **Home** — تحميل الإحصائيات/البيانات
3. **Notifications** — قائمة + unread badge
4. **Payment** (لاحقًا مع backend prod) — fixed order checkout + `orderzhouse://payment` return
5. **Profile** — لا تظهر بطاقة "بيئة التطوير" في release

### تحقق سريع من API

إذا فشل الاتصال في release، تأكد أن التطبيق لا يحاول `10.0.2.2` أو `http://`.

---

## 8. Android release safety (Phase 5C + 5D)

| الإعداد | debug/profile | release |
|---------|---------------|---------|
| `INTERNET` permission | ✅ main manifest | ✅ |
| `usesCleartextTraffic` | `true` | `false` |
| `.env` في assets | لا (فقط `.env.example` للـ dev) | لا |

| `applicationId` | `com.orderzhouse.orderzhouse_app` (ثابت) |
| Release signing | يتطلب `android/key.properties` محليًا |

### فحص merged manifest (بعد build)

```bash
# Debug — مثال مسار Gradle intermediates
# build/app/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml
```

تحقق من:

- `android.permission.INTERNET`
- `usesCleartextTraffic` — `true` في debug، `false` في release
- `android:label` = أوردرز هاوس
- deep link: `orderzhouse` / `payment`

---

## 9. Backend dependencies (قبل الإطلاق الحقيقي)

- `https://orderzhouse.com/api` (production API — verified `/api/health`)
- `BACKEND_PUBLIC_URL` HTTPS — bridge `/mobile/payment-return`
- `CLIENT_URL` HTTPS واحد
- `MOBILE_APP_SCHEME=orderzhouse`
- Stripe **live** keys + webhook production على السيرفر فقط
- `ALLOW_QA_SEED=false` في الإنتاج

---

## 10. الاختبارات قبل البناء

```bash
flutter analyze
flutter test
```

اختياري:

```bash
flutter build apk --debug
```
