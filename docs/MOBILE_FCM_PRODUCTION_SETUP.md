# Mobile FCM — Production Setup & Release Hold

**Status: RELEASE HOLD**

FCM push is implemented in code, but **do not ship a Google Play build that relies on FCM / `POST_NOTIFICATIONS` until** the checklist below is complete and Real-device QA passes.

| Do now | Do **not** do yet |
|--------|-------------------|
| Keep in-app notifications as-is | Build / upload a Play AAB “for FCM” |
| Add Firebase credentials locally / on server (outside git) | Commit `google-services.json` or service-account JSON |
| Run Real-device QA on a physical Android device | Change Stripe, `ordersService`, or payment/auth flows |

When this hold is lifted: complete §6 Real-device QA, review Play Data safety (§7), then follow `docs/MOBILE_RELEASE.md` for signing and AAB.

---

## 1. Release hold criteria (must all be true)

- [ ] Real `android/app/google-services.json` present **locally** (not in git)
- [ ] Backend staging/production has `FIREBASE_SERVICE_ACCOUNT_PATH` **or** `FIREBASE_SERVICE_ACCOUNT_JSON`
- [ ] Migration `110_user_device_tokens` applied on that environment
- [ ] Physical Android device QA passed (foreground / background / killed / tap / logout)
- [ ] Play Console **Data safety** reviewed for Firebase / device tokens / push (if declaring new data practices)

Until then: treat mobile push as **code-ready, production-not-enabled**.

---

## 2. Firebase Console setup

1. Open [Firebase Console](https://console.firebase.google.com/) → create or select the Orderz House project.
2. Add an **Android** app:
   - **Package name:** `com.orderzhouse.app` (must match `applicationId` / `namespace`)
   - App nickname: optional (e.g. `Orderz House Android`)
3. Download **`google-services.json`**.
4. Enable **Cloud Messaging** (FCM) for the project if not already enabled.
5. (Backend) Project settings → **Service accounts** → Generate new private key  
   → save as e.g. `firebase-service-account.json` on the **server only** (never commit).

---

## 3. Android client (`google-services.json`)

| Item | Value |
|------|--------|
| Package / applicationId | `com.orderzhouse.app` |
| Local path | `mobile/orderzhouse_app/android/app/google-services.json` |
| Example (placeholders only) | `mobile/orderzhouse_app/android/app/google-services.json.example` |
| Git | **Ignored** — do not commit the real file |

Copy:

```text
# From machine with the downloaded file
mobile/orderzhouse_app/android/app/google-services.json
```

Gradle applies the Google Services plugin **only if** that file exists (`android/app/build.gradle.kts`).

Manifest already declares `POST_NOTIFICATIONS`. Runtime permission is requested **after login** (`PushNotificationService.onAuthenticated`). If the user denies, the app continues with **in-app notifications only**.

---

## 4. Backend Firebase Admin (outside git)

Prefer a file path on the host (easier rotation than stuffing JSON into process env):

```bash
# Example layout on the server (adjust to your deploy layout)
/var/secrets/orderzhouse/firebase-service-account.json
chmod 600 /var/secrets/orderzhouse/firebase-service-account.json
```

**Never** put the service account under the git working tree that gets committed. Repo ignore rules cover:

- `backend/secrets/`
- `**/firebase-service-account*.json`
- `**/serviceAccount*.json`

### Environment variables

Documented in `backend/.env.example`:

```bash
# Prefer path:
FIREBASE_SERVICE_ACCOUNT_PATH=/var/secrets/orderzhouse/firebase-service-account.json

# Or inline JSON (escape carefully in your process manager):
# FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

If both are unset, `fcmPushService` **skips push safely** (`fcm_not_configured`). In-app notifications and SSE still work; createNotification must not fail because of FCM.

### Migration

```bash
cd backend
# Prefer full migrate, or run this file alone:
node scripts/runSqlFile.js sql/migrations/110_user_device_tokens.sql
# or: npm run db:migrate
```

Verify table exists: `user_device_tokens` (unique on `token`, active index on `user_id`).

### API (auth required)

- `POST /api/devices/push-token` — register / upsert FCM token  
- `DELETE /api/devices/push-token` — deactivate one token  
- `POST /api/devices/push-token/deactivate-all` — deactivate all for user  

Do **not** log full FCM tokens, service-account JSON, or `Authorization` / cookies.

---

## 5. Test commands (safe / automated)

```bash
# Backend contracts (no secrets required)
cd backend
node --test test/deviceTokensAndFcmPush.test.js

# Flutter unit tests for token repo + safe tap resolver
cd mobile/orderzhouse_app
flutter test test/phase_mobile_fcm_push_test.dart
flutter analyze lib
```

Optional live DB checks (staging): confirm upsert → one row on duplicate token; deactivate sets `is_active=false`; create a notification while FCM is unset and confirm the DB row still appears.

---

## 6. Real-device QA checklist (Android physical device)

Prerequisites: real `google-services.json`, backend FCM credentials on the API the app hits, USB debugging / installable build.

- [ ] Fresh install
- [ ] Login
- [ ] Accept notification permission (Android 13+)
- [ ] Backend has an **active** row in `user_device_tokens` for that user (inspect DB; do not paste token into chat/logs)
- [ ] Trigger a real notification for that user (normal product path or admin/tooling you already use)
- [ ] **Foreground:** no duplicate system tray spam; unread badge / in-app list updates
- [ ] **Background:** system notification appears
- [ ] **App killed:** system notification appears
- [ ] **Tap:** opens a **safe in-app route** via `notification_action_resolver` (not a raw https URL)
- [ ] **Logout:** token deactivated (`is_active=false` / revoked); further pushes do not restore an old session
- [ ] **Permission denied:** app still usable with in-app notifications only

Only after this list is green: lift the hold and proceed with Play release steps.

---

## 7. Google Play — Data safety reminder

When FCM goes live, review **Play Console → App content → Data safety** for practices such as:

- Device or other IDs (FCM registration token / device id if collected)
- Push notifications
- Data shared with Google (Firebase / FCM)

Align declarations with what the app and backend actually store (`user_device_tokens`, notification payloads without sensitive payment data).

Also re-check merged release permissions before upload:

- `INTERNET` — expected  
- `POST_NOTIFICATIONS` — expected once shipping FCM  
- `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / `MANAGE_EXTERNAL_STORAGE` — must **not** appear in the merged release manifest  

---

## 8. Later activation sequence (short)

1. Place `google-services.json` locally; place service account on server; set env.  
2. Run migration `110` on staging → production.  
3. Install on a real device; complete §6.  
4. Update Data safety if needed.  
5. Bump `version` / `versionCode` only as needed vs last Play upload (see `docs/MOBILE_RELEASE.md`).  
6. Build signed AAB and upload — **not before** §6 passes.

---

## Related docs

- `docs/MOBILE_RELEASE.md` — signing, AAB, env dart-defines  
- `docs/MOBILE_LOCAL_QA.md` — general mobile QA  
- `backend/.env.example` — `FIREBASE_SERVICE_ACCOUNT_*` comments  
- `mobile/orderzhouse_app/android/app/google-services.json.example` — placeholder shape only  
