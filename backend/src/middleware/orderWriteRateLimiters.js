/**
 * Dedicated write limiters for orders / bids / admin mutations.
 * Mount AFTER requireAuth so keys can use userId.
 */

const rateLimit = require("express-rate-limit");
const { rateLimitJsonHandler, userOrIpKey } = require("./rateLimitHelpers");

function parsePositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

const ORDER_CREATE_MSG = "تم إرسال عدد كبير من الطلبات. انتظر قليلًا ثم حاول مرة أخرى.";
const ORDER_BID_MSG = "تم إرسال عدد كبير من العروض/الاستلامات. انتظر قليلًا ثم حاول مرة أخرى.";
const ADMIN_WRITE_MSG = "تم تجاوز حد عمليات الإدارة. انتظر قليلًا ثم حاول مرة أخرى.";
const NOTIFICATIONS_MSG = "تم تجاوز حد طلبات الإشعارات. انتظر قليلًا ثم حاول مرة أخرى.";

/** Client create order — short window (burst). Default 5 / min / user. */
const clientOrderCreateBurstLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parsePositiveInt("ORDER_CREATE_CLIENT_MAX_PER_MIN", 5),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => userOrIpKey("order_create_client_min", req),
  handler: rateLimitJsonHandler("order_create", ORDER_CREATE_MSG, { windowMsFallback: 60 * 1000 }),
});

/** Client create order — hourly ceiling. Default 25 / hour / user. */
const clientOrderCreateHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parsePositiveInt("ORDER_CREATE_CLIENT_MAX_PER_HOUR", 25),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => userOrIpKey("order_create_client_hour", req),
  handler: rateLimitJsonHandler("order_create", ORDER_CREATE_MSG, { windowMsFallback: 60 * 60 * 1000 }),
});

/** Admin / super_admin create internal or training fake order. Default 20 / min / user. */
const adminOrderCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parsePositiveInt("ORDER_CREATE_ADMIN_MAX_PER_MIN", 20),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => userOrIpKey("order_create_admin", req),
  handler: rateLimitJsonHandler("order_create", ORDER_CREATE_MSG, { windowMsFallback: 60 * 1000 }),
});

/** Training bulk generators (force-generate / start round) — stricter. Default 3 / 5 min / user. */
const trainingBulkGenerateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: parsePositiveInt("TRAINING_BULK_GENERATE_MAX_PER_5MIN", 3),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => userOrIpKey("training_bulk", req),
  handler: rateLimitJsonHandler(
    "admin_write",
    "تم تجاوز حد توليد الطلبات التدريبية. استخدم إدخالًا تدريجيًا أو انتظر ثم حاول.",
    { windowMsFallback: 5 * 60 * 1000 },
  ),
});

/** Freelancer bid / take pool. Default 15 / min / user. */
const orderBidTakeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parsePositiveInt("ORDER_BID_TAKE_MAX_PER_MIN", 15),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => userOrIpKey("order_bid", req),
  handler: rateLimitJsonHandler("order_bid", ORDER_BID_MSG, { windowMsFallback: 60 * 1000 }),
});

/** Broader admin write (ads/courses/settings mutations). Default 60 / min / user. */
const adminWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parsePositiveInt("ADMIN_WRITE_MAX_PER_MIN", 60),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => userOrIpKey("admin_write", req),
  handler: rateLimitJsonHandler("admin_write", ADMIN_WRITE_MSG, { windowMsFallback: 60 * 1000 }),
});

/** Soft guard for unread-count polling storms. Default 120 / min / user. */
const notificationsReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parsePositiveInt("NOTIFICATIONS_READ_MAX_PER_MIN", 120),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => userOrIpKey("notifications", req),
  handler: rateLimitJsonHandler("notifications", NOTIFICATIONS_MSG, { windowMsFallback: 60 * 1000 }),
});

module.exports = {
  clientOrderCreateBurstLimiter,
  clientOrderCreateHourlyLimiter,
  adminOrderCreateLimiter,
  trainingBulkGenerateLimiter,
  orderBidTakeLimiter,
  adminWriteLimiter,
  notificationsReadLimiter,
};
