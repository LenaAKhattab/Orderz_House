/**
 * Optional Firebase Cloud Messaging sender.
 * Disabled when FIREBASE_SERVICE_ACCOUNT_JSON (or path) is unset — in-app notifications still work.
 */

const deviceTokensService = require("./deviceTokensService");

let messaging = null;
let initAttempted = false;
let initErrorLogged = false;

function truncate(text, max) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function loadServiceAccount() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson && String(rawJson).trim()) {
    return JSON.parse(String(rawJson));
  }
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (pathEnv && String(pathEnv).trim()) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const fs = require("node:fs");
    const path = require("node:path");
    const abs = path.isAbsolute(pathEnv) ? pathEnv : path.join(process.cwd(), pathEnv);
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  }
  return null;
}

function getMessaging() {
  if (initAttempted) return messaging;
  initAttempted = true;
  try {
    const sa = loadServiceAccount();
    if (!sa) {
      messaging = null;
      return null;
    }
    // Lazy require so unit tests / hosts without the package still boot when push is unused.
    // eslint-disable-next-line global-require
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(sa),
      });
    }
    messaging = admin.messaging();
    return messaging;
  } catch (err) {
    messaging = null;
    if (!initErrorLogged) {
      initErrorLogged = true;
      // eslint-disable-next-line no-console
      console.error("[fcm] init failed:", String(err?.message || err).slice(0, 200));
    }
    return null;
  }
}

function isPushConfigured() {
  return Boolean(getMessaging());
}

function buildPushPayload(notification) {
  const title = truncate(notification?.title || "Orderz House", 80);
  const body = truncate(notification?.message || "لديك إشعار جديد", 140);
  const data = {
    notificationId: String(notification?.id || ""),
    type: String(notification?.type || ""),
    entityType: String(notification?.entityType || ""),
    entityId: notification?.entityId != null ? String(notification.entityId) : "",
    actionUrl: notification?.link ? String(notification.link).slice(0, 500) : "",
    recipientRole: notification?.recipientRole ? String(notification.recipientRole) : "",
  };
  if (String(notification?.entityType || "").toLowerCase() === "order" && notification?.entityId != null) {
    data.orderId = String(notification.entityId);
  }
  // FCM data values must be strings; strip empties.
  Object.keys(data).forEach((k) => {
    if (!data[k]) delete data[k];
  });
  return { title, body, data };
}

function isInvalidTokenError(err) {
  const code = String(err?.code || err?.errorInfo?.code || "");
  return (
    code.includes("registration-token-not-registered") ||
    code.includes("invalid-registration-token") ||
    code.includes("messaging/registration-token-not-registered") ||
    code.includes("messaging/invalid-registration-token")
  );
}

/**
 * Fire-and-forget safe: never throws to callers of notification creation.
 */
async function sendPushForNotification(notification) {
  try {
    if (!notification?.recipientUserId) return { sent: 0, skipped: true, reason: "no_recipient" };
    const msg = getMessaging();
    if (!msg) return { sent: 0, skipped: true, reason: "fcm_not_configured" };

    const devices = await deviceTokensService.listActiveTokensForUser(notification.recipientUserId);
    if (!devices.length) return { sent: 0, skipped: true, reason: "no_devices" };

    const { title, body, data } = buildPushPayload(notification);
    const invalid = [];
    let sent = 0;

    // Send individually so one bad token does not block others.
    for (const device of devices) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await msg.send({
          token: device.token,
          notification: { title, body },
          data,
          android: {
            priority: "high",
            notification: {
              channelId: "orderzhouse_default",
              clickAction: "FLUTTER_NOTIFICATION_CLICK",
            },
          },
        });
        sent += 1;
      } catch (err) {
        if (isInvalidTokenError(err)) {
          invalid.push(device.token);
        } else {
          // eslint-disable-next-line no-console
          console.error(
            "[fcm] send failed platform=%s code=%s",
            device.platform,
            String(err?.code || err?.message || "unknown").slice(0, 120),
          );
        }
      }
    }

    if (invalid.length) {
      await deviceTokensService.deactivateTokensByValues(invalid);
    }

    return { sent, invalid: invalid.length, skipped: false };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[fcm] push pipeline failed:", String(err?.message || err).slice(0, 200));
    return { sent: 0, skipped: true, reason: "error" };
  }
}

function queuePushForNotification(notification) {
  setImmediate(() => {
    sendPushForNotification(notification).catch(() => {});
  });
}

module.exports = {
  isPushConfigured,
  buildPushPayload,
  sendPushForNotification,
  queuePushForNotification,
  isInvalidTokenError,
  truncate,
};
