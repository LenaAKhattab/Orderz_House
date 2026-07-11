# Orderz House — Flutter Client MVP

تطبيق Flutter للعميل (Orderz House mobile).

## التشغيل

```bash
cd mobile/orderzhouse_app
cp .env.example .env   # optional — for --dart-define-from-file=.env
flutter pub get
flutter run -d emulator-5554
```

> **Release builds:** راجع [`docs/MOBILE_RELEASE.md`](../../docs/MOBILE_RELEASE.md) — لا يُضمَّن `.env` المحلي في APK.

> للتطوير: يُحمَّل `.env.example` تلقائيًا في debug. لتجاوز URLs استخدم `--dart-define-from-file=.env`.

## عنوان الـ API (`API_BASE_URL`)

الأولوية:

1. `--dart-define=API_BASE_URL=...` (أعلى أولوية)
2. قيمة `API_BASE_URL` في ملف `.env`
3. الافتراضي حسب المنصة (Android emulator → `10.0.2.2`)

### أمثلة في `.env`

| البيئة | `API_BASE_URL` |
|--------|----------------|
| Android Emulator | `http://10.0.2.2:5000/api` |
| iOS Simulator / Desktop | `http://localhost:5000/api` |
| جهاز فعلي (نفس الشبكة) | `http://YOUR_COMPUTER_IP:5000/api` |
| Production | `https://orderzhouse.com/api` |

عدّل `.env` ثم أعد تشغيل التطبيق (hot restart).

### بدون تعديل `.env`

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:5000/api
```

## عنوان الويب (`WEB_BASE_URL`)

يُستخدم لفتح صفحات الويب العامة (مثل باقات المستقل) من المتصفح الخارجي.

الأولوية:

1. `--dart-define=WEB_BASE_URL=...` (أعلى أولوية)
2. قيمة `WEB_BASE_URL` في ملف `.env`
3. الافتراضي حسب المنصة (Android emulator → `10.0.2.2`)

### أمثلة في `.env`

| البيئة | `WEB_BASE_URL` |
|--------|----------------|
| Android Emulator | `http://10.0.2.2:5173` |
| iOS Simulator / Desktop | `http://localhost:5173` |
| Production | `https://orderzhouse.com` |

```bash
flutter run --dart-define=WEB_BASE_URL=https://orderzhouse.com
```

## Auth (Mobile)

- Header: `X-Client-Type: mobile`
- `POST /auth/login` → `accessToken` في `flutter_secure_storage`
- `GET /auth/me` مع `Authorization: Bearer`
- عند `401` → مسح التوكن والتوجيه لتسجيل الدخول

## الهيكل

`lib/core` — theme, network, router, storage  
`lib/features` — auth, orders, client flows
