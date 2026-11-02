/**
 * Optional Firebase Cloud Messaging sender (Android app; the web client has no FCM).
 * Disabled when FIREBASE_SERVICE_ACCOUNT_JSON (or path) is unset — in-app notifications still work.
 *
 * Push is best-effort and never blocks notification creation: created notifications are queued and drained
 * in bounded batches (one token query per batch, `sendEach` ≤ 500 messages per call, one batch at a time).
 * Permanently invalid tokens are deactivated; temporary FCM failures are counted, not retried here.
 * Lock-screen text: only types with static (or count-only) copy send their title/body; types whose body
 * carries user text send the title with a generic body; anything else is fully generic.
 */

const deviceTokensService = require("./deviceTokensService");

let messaging = null;
let initAttempted = false;
let initErrorLogged = false;

const NOTIFICATIONS_PER_BATCH = 200;
const FCM_SEND_EACH_MAX = 500;
const QUEUE_MAX = 50000;

const GENERIC_TITLE = "Orderz House";
const GENERIC_BODY = "لديك إشعار جديد — افتح التطبيق لعرض التفاصيل.";

/** Title and body are fixed copy (or a count) — safe on a lock screen. */
const STATIC_TEXT_TYPES = new Set([
  "order.pool.summary",
  "order.created",
  "order.assigned",
  "order.claim.withdrawn",
  "order.freelancer.assigned",
  "order.freelancer.rejected",
  "order.bid.selected",
  "order.bid.rejected",
  "order.payment.started",
  "order.delivery.submitted",
  "order.delivery.approved",
  "payment.client_order.succeeded",
  "payment.client_order.failed",
  "payment_success",
  "payment_failed",
  "payment_cancelled",
  "subscription.assigned",
  "subscription.started",
  "subscription.company.activated",
  "subscription.payment.started",
  "financial_claim.created",
  "financial_claim.paid",
  "user.registered",
  "user.account.activated",
  "user.account.deactivated",
  "user.account.suspended",
  "user.account.reactivated",
]);

/** Fixed title, but the body carries user-written text (chat message, revision note). */
const STATIC_TITLE_ONLY_TYPES = new Set(["order.message.received", "order.revision.requested"]);

const PERMANENT_TOKEN_ERRORS = ["registration-token-not-registered", "invalid-registration-token"];

const stats = {
  queued: 0,
  dropped: 0,
  batches: 0,
  notConfigured: 0,
  noDevice: 0,
  attempted: 0,
  accepted: 0,
  failed: 0,
  invalidRemoved: 0,
  temporary: 0,
};
const queue = [];
let draining = false;

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
  const type = String(notification?.type || "");
  let title = GENERIC_TITLE;
  let body = GENERIC_BODY;
  if (STATIC_TEXT_TYPES.has(type)) {
    title = truncate(notification?.title || GENERIC_TITLE, 80);
    body = truncate(notification?.message || GENERIC_BODY, 140);
  } else if (STATIC_TITLE_ONLY_TYPES.has(type)) {
    title = truncate(notification?.title || GENERIC_TITLE, 80);
  }
  const data = {
    notificationId: String(notification?.id || ""),
    type,
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

function errorCode(err) {
  return String(err?.code || err?.errorInfo?.code || "");
}

/** Firebase says the token will never work again (uninstalled / rotated / malformed). */
function isInvalidTokenError(err) {
  const code = errorCode(err);
  return PERMANENT_TOKEN_ERRORS.some((c) => code.includes(c));
}

function buildMessage(token, payload) {
  return {
    token,
    notification: { title: payload.title, body: payload.body },
    data: payload.data,
    android: {
      priority: "high",
      notification: {
        channelId: "orderzhouse_default",
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
    },
  };
}

/**
 * Sends one batch of notifications: one token lookup, `sendEach` in chunks, invalid tokens deactivated.
 * Never throws. Returns aggregate counts only.
 */
async function sendPushBatch(notifications) {
  const result = { notifications: 0, messages: 0, accepted: 0, failed: 0, invalidRemoved: 0, temporary: 0, noDevice: 0, skipped: false, reason: null, errorCodes: {} };
  const list = (Array.isArray(notifications) ? notifications : []).filter((n) => n && n.recipientUserId);
  result.notifications = list.length;
  if (!list.length) return result;
  try {
    const msg = getMessaging();
    if (!msg) {
      stats.notConfigured += list.length;
      return { ...result, skipped: true, reason: "fcm_not_configured" };
    }
    const devices = await deviceTokensService.listActiveTokensForUsers(list.map((n) => Number(n.recipientUserId)));
    const byUser = new Map();
    for (const d of devices) {
      if (!byUser.has(d.userId)) byUser.set(d.userId, []);
      byUser.get(d.userId).push(d);
    }
    const messages = [];
    for (const n of list) {
      const targets = byUser.get(Number(n.recipientUserId)) || [];
      if (!targets.length) {
        result.noDevice += 1;
        continue;
      }
      const payload = buildPushPayload(n);
      for (const d of targets) messages.push({ token: d.token, message: buildMessage(d.token, payload) });
    }
    result.messages = messages.length;
    const invalid = [];
    for (let i = 0; i < messages.length; i += FCM_SEND_EACH_MAX) {
      const chunk = messages.slice(i, i + FCM_SEND_EACH_MAX);
      let responses;
      try {
        // eslint-disable-next-line no-await-in-loop
        ({ responses } = await msg.sendEach(chunk.map((m) => m.message)));
      } catch (err) {
        // Whole call failed (network / auth / FCM down): best-effort, count and move on.
        result.temporary += chunk.length;
        const code = errorCode(err) || "send_failed";
        result.errorCodes[code] = (result.errorCodes[code] || 0) + chunk.length;
        continue;
      }
      responses.forEach((r, idx) => {
        if (r.success) {
          result.accepted += 1;
          return;
        }
        result.failed += 1;
        const code = errorCode(r.error) || "unknown";
        result.errorCodes[code] = (result.errorCodes[code] || 0) + 1;
        if (isInvalidTokenError(r.error)) invalid.push(chunk[idx].token);
        else result.temporary += 1;
      });
    }
    if (invalid.length) {
      result.invalidRemoved = await deviceTokensService.deactivateTokensByValues(invalid);
    }
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[fcm] push batch failed:", String(err?.code || err?.message || err).slice(0, 120));
    return { ...result, skipped: true, reason: "error" };
  }
}

function recordBatch(r) {
  stats.batches += 1;
  stats.noDevice += r.noDevice;
  stats.attempted += r.messages;
  stats.accepted += r.accepted;
  stats.failed += r.failed;
  stats.invalidRemoved += r.invalidRemoved;
  stats.temporary += r.temporary;
  if (r.messages > 0 || r.failed > 0 || r.reason === "error") {
    // Aggregates only — no tokens, no recipients, no notification text.
    // eslint-disable-next-line no-console
    console.log(
      `[fcm] push batch notifications=${r.notifications} no_device=${r.noDevice} attempted=${r.messages} accepted=${r.accepted} failed=${r.failed} invalid_removed=${r.invalidRemoved} temporary=${r.temporary}${Object.keys(r.errorCodes).length ? ` codes=${JSON.stringify(r.errorCodes)}` : ""}`,
    );
  }
}

async function drainQueue() {
  try {
    while (queue.length) {
      const batch = queue.splice(0, NOTIFICATIONS_PER_BATCH);
      // eslint-disable-next-line no-await-in-loop
      recordBatch(await sendPushBatch(batch));
    }
  } finally {
    draining = false;
  }
}

/** Single-notification send (kept for callers/tests); same path as the queue. */
async function sendPushForNotification(notification) {
  if (!notification?.recipientUserId) return { sent: 0, skipped: true, reason: "no_recipient" };
  const r = await sendPushBatch([notification]);
  if (r.skipped) return { sent: 0, skipped: true, reason: r.reason };
  if (r.noDevice) return { sent: 0, skipped: true, reason: "no_devices" };
  return { sent: r.accepted, invalid: r.invalidRemoved, failed: r.failed, skipped: false };
}

/** Fire-and-forget: never awaited by notification creation; bounded memory and concurrency. */
function queuePushForNotification(notification) {
  if (!notification?.recipientUserId) return;
  if (queue.length >= QUEUE_MAX) {
    stats.dropped += 1;
    return;
  }
  queue.push(notification);
  stats.queued += 1;
  if (!draining) {
    draining = true;
    setImmediate(() => {
      void drainQueue();
    });
  }
}

function getPushStats() {
  return { ...stats, queueLength: queue.length, configured: Boolean(messaging) };
}

module.exports = {
  isPushConfigured,
  buildPushPayload,
  sendPushBatch,
  sendPushForNotification,
  queuePushForNotification,
  getPushStats,
  isInvalidTokenError,
  truncate,
  STATIC_TEXT_TYPES,
  STATIC_TITLE_ONLY_TYPES,
  NOTIFICATIONS_PER_BATCH,
  FCM_SEND_EACH_MAX,
  QUEUE_MAX,
};
