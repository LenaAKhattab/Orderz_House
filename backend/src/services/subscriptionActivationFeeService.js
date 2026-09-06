const { pool } = require("../config/db");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");
const systemSettingsService = require("./systemSettingsService");

/** Canonical committed product default: 25 JOD (JOD × 1000 Stripe minor units). */
const DEFAULT_ACTIVATION_FEE_AMOUNT_MINOR = 25000;
const DEFAULT_ACTIVATION_FEE_ENABLED = true;
/** @deprecated Use getActivationFeeConfig().amountJod — retained for test/default documentation only. */
const SUBSCRIPTION_ACTIVATION_FEE_JOD = DEFAULT_ACTIVATION_FEE_AMOUNT_MINOR / 1000;
const ACTIVATION_FEE_VALIDITY_DAYS = 365;

/** Max configurable fee: 10_000 JOD. */
const MAX_ACTIVATION_FEE_AMOUNT_MINOR = 10_000_000;

const ACTIVATION_FEE_SETTING_KEYS = Object.freeze({
  ENABLED: "subscription_activation_fee_enabled",
  AMOUNT_MINOR: "subscription_activation_fee_amount_minor",
});

const ACTIVATION_FEE_SOURCES = {
  STRIPE: "stripe",
  ADMIN_OFFLINE: "admin_offline",
  MIGRATION: "migration",
};

const CHECKOUT_KIND = {
  SUBSCRIPTION: "subscription",
  ACTIVATION_FEE_ONLY: "activation_fee_only",
  RECURRING_SUBSCRIPTION: "recurring_subscription",
};

const CHECKOUT_SESSION_STATUS = {
  OPEN: "open",
  COMPLETED: "completed",
  EXPIRED: "expired",
  SUPERSEDED: "superseded",
};

const ACTIVATION_FEE_LINE_ITEM_NAMES = {
  ar: "رسوم تفعيل الاشتراك",
  en: "Subscription activation fee",
};

const PURPOSE_ACTIVATION_FEE_ONLY = "freelancer_activation_fee_only";
const PURPOSE_SUBSCRIPTION_PURCHASE = "freelancer_subscription_purchase";

function amountMinorToJod(amountMinor) {
  const n = Number(amountMinor);
  if (!Number.isFinite(n)) return null;
  return n / 1000;
}

function parseEnabledSetting(raw) {
  if (raw == null || String(raw).trim() === "") return DEFAULT_ACTIVATION_FEE_ENABLED;
  const s = String(raw).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  return DEFAULT_ACTIVATION_FEE_ENABLED;
}

function parseAmountMinorSetting(raw) {
  if (raw == null || String(raw).trim() === "") return DEFAULT_ACTIVATION_FEE_AMOUNT_MINOR;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isInteger(n) || n < 1 || n > MAX_ACTIVATION_FEE_AMOUNT_MINOR) {
    return DEFAULT_ACTIVATION_FEE_AMOUNT_MINOR;
  }
  return n;
}

function normalizeActivationFeeConfig({ enabled, amountMinor }) {
  const minor = Number(amountMinor);
  const safeMinor =
    Number.isInteger(minor) && minor >= 1 && minor <= MAX_ACTIVATION_FEE_AMOUNT_MINOR
      ? minor
      : DEFAULT_ACTIVATION_FEE_AMOUNT_MINOR;
  return {
    enabled: Boolean(enabled),
    amountMinor: safeMinor,
    amountJod: amountMinorToJod(safeMinor),
    validityDays: ACTIVATION_FEE_VALIDITY_DAYS,
  };
}

/**
 * Single runtime source of truth for current activation-fee configuration.
 * Absent setting rows → production defaults (enabled=true, 25 JOD).
 * DB/query failures propagate (do not silently make checkout free).
 */
async function getActivationFeeConfig(client) {
  const [enabledRaw, amountRaw] = await Promise.all([
    systemSettingsService.getSetting(ACTIVATION_FEE_SETTING_KEYS.ENABLED, client),
    systemSettingsService.getSetting(ACTIVATION_FEE_SETTING_KEYS.AMOUNT_MINOR, client),
  ]);
  return normalizeActivationFeeConfig({
    enabled: parseEnabledSetting(enabledRaw),
    amountMinor: parseAmountMinorSetting(amountRaw),
  });
}

/**
 * Public-safe config snapshot (no secrets).
 */
async function getPublicActivationFeeConfig(client) {
  const cfg = await getActivationFeeConfig(client);
  return {
    enabled: cfg.enabled,
    amountJod: cfg.amountJod,
    amountMinor: cfg.amountMinor,
    validityDays: cfg.validityDays,
  };
}

/**
 * Validate and persist Super Admin activation fee settings.
 * When disabled, preserves the last configured amount (does not force 0).
 * Supersedes open fee-bearing checkout sessions locally in the same transaction.
 *
 * Stripe remote expire is intentionally NOT awaited inside this request: hundreds of
 * open sessions would hang the HTTP call past the client timeout and hold a DB
 * transaction open. Remote expire is best-effort after COMMIT (never fails the save).
 */
async function updateActivationFeeSettings(
  { enabled, amountJod, amountMinor = null, updatedByUserId = null, stripe = null },
  client,
) {
  const runner = client || pool;
  const ownClient = !client;
  const db = ownClient ? await pool.connect() : runner;

  try {
    if (ownClient) await db.query("BEGIN");

    const current = await getActivationFeeConfig(db);
    const nextEnabled = Boolean(enabled);

    let nextMinor = current.amountMinor;
    if (amountMinor != null && amountMinor !== "") {
      const parsed = Number.parseInt(String(amountMinor), 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_ACTIVATION_FEE_AMOUNT_MINOR) {
        const err = new Error("Invalid activation fee amount.");
        err.statusCode = 400;
        err.exposeToClient = true;
        throw err;
      }
      nextMinor = parsed;
    } else if (amountJod != null && amountJod !== "") {
      const major = Number(amountJod);
      if (!Number.isFinite(major) || major <= 0) {
        const err = new Error("قيمة رسوم التفعيل يجب أن تكون أكبر من صفر.");
        err.statusCode = 400;
        err.exposeToClient = true;
        throw err;
      }
      const converted = amountMajorToStripeMinor(major, "JOD");
      if (converted == null || !Number.isInteger(converted) || converted < 1 || converted > MAX_ACTIVATION_FEE_AMOUNT_MINOR) {
        const err = new Error("قيمة رسوم التفعيل غير صالحة.");
        err.statusCode = 400;
        err.exposeToClient = true;
        throw err;
      }
      nextMinor = converted;
    }

    if (nextEnabled && nextMinor < 1) {
      const err = new Error("عند تفعيل رسوم التفعيل يجب أن تكون القيمة أكبر من صفر.");
      err.statusCode = 400;
      err.exposeToClient = true;
      throw err;
    }

    const opts = { updatedByUserId };
    await systemSettingsService.setSetting(
      ACTIVATION_FEE_SETTING_KEYS.ENABLED,
      nextEnabled ? "true" : "false",
      opts,
      db,
    );
    await systemSettingsService.setSetting(
      ACTIVATION_FEE_SETTING_KEYS.AMOUNT_MINOR,
      String(nextMinor),
      opts,
      db,
    );

    const settingsChanged =
      current.enabled !== nextEnabled || Number(current.amountMinor) !== Number(nextMinor);

    let superseded = [];
    if (settingsChanged) {
      // Local DB only inside the transaction — never call Stripe here.
      superseded = await supersedeAllOpenFeeBearingCheckoutSessions({ stripe: null }, db);
    }

    if (ownClient) await db.query("COMMIT");

    // Best-effort remote expire after settings are durable. Do not await / fail the API.
    // Only schedule on the owning-transaction path (real HTTP request); injected clients
    // (tests) skip so hanging Stripe mocks cannot leak into the test runner.
    if (
      ownClient &&
      settingsChanged &&
      stripe &&
      Array.isArray(superseded) &&
      superseded.length > 0
    ) {
      const sessionIds = superseded
        .map((row) => row?.stripeSessionId)
        .filter((sid) => sid != null && String(sid).trim() !== "");
      setImmediate(() => {
        void expireStripeCheckoutSessionsBestEffort(stripe, sessionIds).catch(() => {});
      });
    }

    const config = normalizeActivationFeeConfig({ enabled: nextEnabled, amountMinor: nextMinor });
    return {
      config,
      previous: current,
      supersededCount: Array.isArray(superseded) ? superseded.length : 0,
      superseded,
    };
  } catch (err) {
    if (ownClient) {
      try {
        await db.query("ROLLBACK");
      } catch (_) {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (ownClient) db.release();
  }
}

/**
 * Current configured amount in Stripe minor units (ignores enabled flag).
 * Prefer getActivationFeeConfig() for full decisions.
 */
async function activationFeeMinorUnits(client) {
  const cfg = await getActivationFeeConfig(client);
  return cfg.amountMinor;
}

function isActivationFeeCurrent(paidAt, now = new Date()) {
  if (!paidAt) return false;
  const paid = paidAt instanceof Date ? paidAt : new Date(paidAt);
  if (Number.isNaN(paid.getTime())) return false;
  const elapsedMs = now.getTime() - paid.getTime();
  return elapsedMs < ACTIVATION_FEE_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
}

async function getLatestActivationFeePaidAt(userId, client) {
  const runner = client || pool;
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return null;
  const { rows } = await runner.query(
    `SELECT
       u.subscription_activation_fee_paid_at AS user_paid_at,
       (
         SELECT MAX(p.paid_at)
         FROM subscription_activation_fee_payments p
         WHERE p.user_id = u.id
       ) AS audit_paid_at
     FROM users u
     WHERE u.id = $1
     LIMIT 1`,
    [uid],
  );
  const row = rows[0];
  if (!row) return null;
  const userPaid = row.user_paid_at ? new Date(row.user_paid_at) : null;
  const auditPaid = row.audit_paid_at ? new Date(row.audit_paid_at) : null;
  if (userPaid && auditPaid) {
    return userPaid.getTime() >= auditPaid.getTime() ? userPaid : auditPaid;
  }
  return userPaid || auditPaid || null;
}

async function getLatestActivationFeePayment(userId, client) {
  const runner = client || pool;
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return null;
  const { rows } = await runner.query(
    `SELECT id, user_id, amount_minor, currency, paid_at, source, stripe_session_id, stripe_payment_intent_id
     FROM subscription_activation_fee_payments
     WHERE user_id = $1
     ORDER BY paid_at DESC, id DESC
     LIMIT 1`,
    [uid],
  );
  return rows[0] || null;
}

async function getActivationFeePaidAt(userId, client) {
  return getLatestActivationFeePaidAt(userId, client);
}

/**
 * Whether Checkout / eligibility should require the fee now.
 * Globally disabled → false (bypass requirement; does not invent a paid timestamp).
 */
async function freelancerNeedsSubscriptionActivationFee(userId, client, now = new Date()) {
  const cfg = await getActivationFeeConfig(client);
  if (!cfg.enabled) return false;
  const paidAt = await getLatestActivationFeePaidAt(userId, client);
  return !isActivationFeeCurrent(paidAt, now);
}

async function syncUserActivationFeePaidAt(userId, paidAt, client) {
  const runner = client || pool;
  const uid = Number(userId);
  const when = paidAt instanceof Date ? paidAt : new Date(paidAt);
  await runner.query(
    `UPDATE users
     SET subscription_activation_fee_paid_at = GREATEST(
           COALESCE(subscription_activation_fee_paid_at, '-infinity'::timestamptz),
           $2::timestamptz
         ),
         updated_at = NOW()
     WHERE id = $1`,
    [uid, when],
  );
}

/**
 * Idempotent audit insert. Returns { recorded, duplicate, payment }.
 */
async function recordActivationFeePayment(
  {
    userId,
    stripeSessionId = null,
    stripePaymentIntentId = null,
    amountMinor = null,
    currency = "JOD",
    paidAt = new Date(),
    source = ACTIVATION_FEE_SOURCES.STRIPE,
    createdByAdminId = null,
    notes = null,
  },
  client,
) {
  const runner = client || pool;
  const uid = Number(userId);
  let minor = amountMinor != null ? Number(amountMinor) : null;
  if (minor == null || !Number.isFinite(minor)) {
    minor = await activationFeeMinorUnits(runner);
  }
  const when = paidAt instanceof Date ? paidAt : new Date(paidAt);
  const sid =
    stripeSessionId != null && String(stripeSessionId).trim() !== ""
      ? String(stripeSessionId).trim()
      : null;
  const piId =
    stripePaymentIntentId != null && String(stripePaymentIntentId).trim() !== ""
      ? String(stripePaymentIntentId).trim()
      : null;

  if (!Number.isInteger(uid) || uid < 1 || !Number.isFinite(minor) || minor < 1) {
    const err = new Error("Invalid activation fee payment payload.");
    err.statusCode = 500;
    throw err;
  }

  if (sid) {
    const { rows: existing } = await runner.query(
      `SELECT id FROM subscription_activation_fee_payments WHERE stripe_session_id = $1 LIMIT 1`,
      [sid],
    );
    if (existing[0]) {
      return { recorded: false, duplicate: true, payment: existing[0] };
    }
  }

  if (piId) {
    const { rows: existingPi } = await runner.query(
      `SELECT id FROM subscription_activation_fee_payments WHERE stripe_payment_intent_id = $1 LIMIT 1`,
      [piId],
    );
    if (existingPi[0]) {
      return { recorded: false, duplicate: true, payment: existingPi[0] };
    }
  }

  const { rows } = await runner.query(
    `INSERT INTO subscription_activation_fee_payments (
       user_id, stripe_session_id, stripe_payment_intent_id,
       amount_minor, currency, paid_at, source, created_by_admin_id, notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      uid,
      sid,
      piId,
      minor,
      String(currency || "JOD").toUpperCase(),
      when,
      String(source),
      createdByAdminId != null ? Number(createdByAdminId) : null,
      notes != null ? String(notes) : null,
    ],
  );

  if (!rows[0]) {
    return { recorded: false, duplicate: true, payment: null };
  }

  await syncUserActivationFeePaidAt(uid, when, runner);
  return { recorded: true, duplicate: false, payment: rows[0] };
}

/** @deprecated Use recordActivationFeePayment */
async function recordSubscriptionActivationFeePaid(userId, paidAt = new Date(), client) {
  const minor = await activationFeeMinorUnits(client);
  return recordActivationFeePayment(
    { userId, paidAt, source: ACTIVATION_FEE_SOURCES.STRIPE, amountMinor: minor },
    client,
  );
}

/**
 * Record fee from a completed Stripe session using the session's own activationFeeMinor
 * (historical amount at Checkout creation — never re-read current settings).
 */
async function recordActivationFeeFromStripeSession(
  { freelancerUserId, stripeSessionId, stripePaymentIntentId, activationFeeMinor, paidAt = new Date() },
  client,
) {
  const minor = Number(activationFeeMinor);
  if (!Number.isFinite(minor) || minor < 1) {
    return { recorded: false, skipped: true, reason: "no_activation_fee_in_session" };
  }

  const paidAtDate = paidAt instanceof Date ? paidAt : new Date(paidAt);
  const paidAtExisting = await getLatestActivationFeePaidAt(freelancerUserId, client);
  if (isActivationFeeCurrent(paidAtExisting, paidAtDate)) {
    return { recorded: false, skipped: true, reason: "activation_fee_already_current" };
  }

  return recordActivationFeePayment(
    {
      userId: freelancerUserId,
      stripeSessionId,
      stripePaymentIntentId,
      amountMinor: minor,
      paidAt: paidAtDate,
      source: ACTIVATION_FEE_SOURCES.STRIPE,
    },
    client,
  );
}

async function markActivationFeePaidOffline(
  { adminUserId, freelancerUserId, notes = null, paidAt = new Date() },
  client,
) {
  const runner = client || pool;
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) {
    const err = new Error("Invalid freelancer user id.");
    err.statusCode = 400;
    throw err;
  }

  const cfg = await getActivationFeeConfig(runner);
  if (!cfg.enabled) {
    return {
      recorded: false,
      skipped: true,
      reason: "activation_fee_disabled",
      alreadyPaid: false,
    };
  }

  const needsFee = await freelancerNeedsSubscriptionActivationFee(uid, runner, paidAt);
  if (!needsFee) {
    const paidAtCurrent = await getLatestActivationFeePaidAt(uid, runner);
    return {
      recorded: false,
      alreadyPaid: true,
      paidAt: paidAtCurrent,
    };
  }

  const result = await recordActivationFeePayment(
    {
      userId: uid,
      amountMinor: cfg.amountMinor,
      paidAt,
      source: ACTIVATION_FEE_SOURCES.ADMIN_OFFLINE,
      createdByAdminId: adminUserId,
      notes,
    },
    runner,
  );

  return {
    recorded: result.recorded,
    alreadyPaid: result.duplicate,
    payment: result.payment,
  };
}

function activationFeeValidUntil(paidAt, now = new Date()) {
  if (!paidAt) return null;
  const paid = paidAt instanceof Date ? paidAt : new Date(paidAt);
  if (Number.isNaN(paid.getTime())) return null;
  if (!isActivationFeeCurrent(paid, now)) return null;
  return new Date(paid.getTime() + ACTIVATION_FEE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

async function getActivationFeeStatus(userId, client) {
  const cfg = await getActivationFeeConfig(client);
  const paidAt = await getLatestActivationFeePaidAt(userId, client);
  const payment = await getLatestActivationFeePayment(userId, client);
  const isCurrent = isActivationFeeCurrent(paidAt);
  const validUntil = activationFeeValidUntil(paidAt);
  const lastPaidAmountMinor =
    payment?.amount_minor != null && Number.isFinite(Number(payment.amount_minor))
      ? Number(payment.amount_minor)
      : null;
  return {
    enabled: cfg.enabled,
    amountJod: cfg.amountJod,
    amountMinor: cfg.amountMinor,
    validityDays: ACTIVATION_FEE_VALIDITY_DAYS,
    paidAt: paidAt || null,
    validUntil: validUntil || null,
    isCurrent,
    needsPayment: Boolean(cfg.enabled && !isCurrent),
    lastPaidAmountMinor,
    lastPaidAmountJod: lastPaidAmountMinor != null ? amountMinorToJod(lastPaidAmountMinor) : null,
  };
}

async function lockFreelancerForCheckout(userId, client) {
  const runner = client || pool;
  const { rows } = await runner.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [Number(userId)]);
  return Boolean(rows[0]);
}

async function listOpenCheckoutSessionsForFreelancer(freelancerUserId, client, { feeBearingOnly = false } = {}) {
  const runner = client || pool;
  const values = [Number(freelancerUserId), CHECKOUT_SESSION_STATUS.OPEN];
  let feeClause = "";
  if (feeBearingOnly) {
    feeClause = " AND includes_activation_fee = TRUE";
  }
  const { rows } = await runner.query(
    `SELECT id, stripe_session_id, includes_activation_fee, checkout_kind
     FROM freelancer_subscription_checkout_sessions
     WHERE freelancer_user_id = $1
       AND status = $2
       ${feeClause}
     ORDER BY created_at ASC`,
    values,
  );
  return rows;
}

async function expireStripeCheckoutSession(stripe, stripeSessionId) {
  if (!stripe || !stripeSessionId) return { expired: false, reason: "no_stripe" };
  try {
    const session = await stripe.checkout.sessions.retrieve(String(stripeSessionId));
    const status = String(session.status || "").toLowerCase();
    if (status === "open") {
      await stripe.checkout.sessions.expire(String(stripeSessionId));
      return { expired: true, previousStatus: status };
    }
    return { expired: false, reason: `session_${status}` };
  } catch (err) {
    return { expired: false, reason: err?.message || "stripe_expire_failed" };
  }
}

/**
 * Best-effort remote expire for already-superseded local tracking rows.
 * Never throws; safe to run after settings COMMIT without blocking the HTTP response.
 */
async function expireStripeCheckoutSessionsBestEffort(stripe, stripeSessionIds) {
  if (!stripe || !Array.isArray(stripeSessionIds) || stripeSessionIds.length === 0) {
    return { attempted: 0, expired: 0 };
  }
  let expired = 0;
  for (const sid of stripeSessionIds) {
    const result = await expireStripeCheckoutSession(stripe, sid);
    if (result?.expired) expired += 1;
  }
  return { attempted: stripeSessionIds.length, expired };
}

async function supersedeOpenCheckoutSessions(
  { stripe, freelancerUserId, exceptStripeSessionId = null, feeBearingOnly = false },
  client,
) {
  const runner = client || pool;
  const openRows = await listOpenCheckoutSessionsForFreelancer(freelancerUserId, runner, { feeBearingOnly });
  const results = [];

  for (const row of openRows) {
    const sid = String(row.stripe_session_id);
    if (exceptStripeSessionId && sid === String(exceptStripeSessionId)) continue;

    let stripeResult = { expired: false };
    if (stripe) {
      stripeResult = await expireStripeCheckoutSession(stripe, sid);
    }

    const nextStatus = stripeResult.expired
      ? CHECKOUT_SESSION_STATUS.EXPIRED
      : CHECKOUT_SESSION_STATUS.SUPERSEDED;

    await runner.query(
      `UPDATE freelancer_subscription_checkout_sessions
       SET status = $2, updated_at = NOW()
       WHERE id = $1 AND status = $3`,
      [Number(row.id), nextStatus, CHECKOUT_SESSION_STATUS.OPEN],
    );

    results.push({
      stripeSessionId: sid,
      includesActivationFee: Boolean(row.includes_activation_fee),
      status: nextStatus,
      stripe: stripeResult,
    });
  }

  return results;
}

/**
 * After admin changes fee amount/enabled: invalidate all OPEN fee-bearing checkout tracking.
 * Completed/paid sessions are never touched.
 *
 * Uses a single bulk UPDATE for local supersession (fast even with hundreds of rows).
 * Optional Stripe expire runs only when `stripe` is provided — callers that must not
 * block (settings save) should pass stripe:null and expire asynchronously afterward.
 */
async function supersedeAllOpenFeeBearingCheckoutSessions({ stripe = null } = {}, client) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `UPDATE freelancer_subscription_checkout_sessions
     SET status = $2, updated_at = NOW()
     WHERE status = $1
       AND includes_activation_fee = TRUE
     RETURNING id, stripe_session_id, includes_activation_fee, checkout_kind, freelancer_user_id`,
    [CHECKOUT_SESSION_STATUS.OPEN, CHECKOUT_SESSION_STATUS.SUPERSEDED],
  );

  const results = [];
  for (const row of rows) {
    const sid = String(row.stripe_session_id);
    let stripeResult = { expired: false, reason: "local_supersede_only" };
    let status = CHECKOUT_SESSION_STATUS.SUPERSEDED;
    if (stripe) {
      stripeResult = await expireStripeCheckoutSession(stripe, sid);
      if (stripeResult.expired) {
        status = CHECKOUT_SESSION_STATUS.EXPIRED;
        await runner.query(
          `UPDATE freelancer_subscription_checkout_sessions
           SET status = $2, updated_at = NOW()
           WHERE id = $1`,
          [Number(row.id), CHECKOUT_SESSION_STATUS.EXPIRED],
        );
      }
    }

    results.push({
      stripeSessionId: sid,
      freelancerUserId: Number(row.freelancer_user_id),
      includesActivationFee: true,
      status,
      stripe: stripeResult,
    });
  }
  return results;
}

async function trackFreelancerCheckoutSession(
  {
    freelancerUserId,
    stripeSessionId,
    displayPlanId = null,
    checkoutPlanId = null,
    checkoutKind = CHECKOUT_KIND.SUBSCRIPTION,
    includesActivationFee = false,
  },
  client,
) {
  const runner = client || pool;
  await runner.query(
    `INSERT INTO freelancer_subscription_checkout_sessions (
       freelancer_user_id, stripe_session_id, display_plan_id, checkout_plan_id,
       checkout_kind, includes_activation_fee, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      Number(freelancerUserId),
      String(stripeSessionId),
      displayPlanId != null ? Number(displayPlanId) : null,
      checkoutPlanId != null ? Number(checkoutPlanId) : null,
      String(checkoutKind),
      Boolean(includesActivationFee),
      CHECKOUT_SESSION_STATUS.OPEN,
    ],
  );
}

async function markCheckoutSessionStatus(stripeSessionId, status, client) {
  const runner = client || pool;
  await runner.query(
    `UPDATE freelancer_subscription_checkout_sessions
     SET status = $2, updated_at = NOW()
     WHERE stripe_session_id = $1`,
    [String(stripeSessionId), String(status)],
  );
}

async function prepareFreelancerCheckoutSessionCreation({ stripe, freelancerUserId }, client) {
  const uid = Number(freelancerUserId);
  const locked = await lockFreelancerForCheckout(uid, client);
  if (!locked) {
    const err = new Error("User not found.");
    err.statusCode = 404;
    throw err;
  }

  const superseded = await supersedeOpenCheckoutSessions(
    { stripe, freelancerUserId: uid, feeBearingOnly: false },
    client,
  );

  const needsActivationFee = await freelancerNeedsSubscriptionActivationFee(uid, client);
  return { needsActivationFee, superseded };
}

function activationFeeLineItemName(locale = "ar") {
  const key = String(locale || "ar").toLowerCase().startsWith("en") ? "en" : "ar";
  return ACTIVATION_FEE_LINE_ITEM_NAMES[key];
}

async function buildActivationFeeStripeLineItem(locale = "ar", { productName = null, amountMinor = null, client } = {}) {
  const unitAmount =
    amountMinor != null && Number.isFinite(Number(amountMinor))
      ? Number(amountMinor)
      : await activationFeeMinorUnits(client);
  if (unitAmount == null || unitAmount < 1) {
    const err = new Error("Invalid subscription activation fee amount.");
    err.statusCode = 500;
    throw err;
  }
  const name =
    productName != null && String(productName).trim() !== ""
      ? String(productName)
      : activationFeeLineItemName(locale);
  return {
    quantity: 1,
    price_data: {
      currency: "jod",
      unit_amount: unitAmount,
      product_data: {
        name: String(name).slice(0, 120),
      },
    },
  };
}

function isFreeDisplayPlanEligibleForActivationFeeCheckout(displayPlanRow) {
  if (!displayPlanRow || displayPlanRow.deleted_at) return false;
  if (!displayPlanRow.is_active || !displayPlanRow.is_visible) return false;
  const price = displayPlanRow.price_jod != null ? Number(displayPlanRow.price_jod) : 0;
  return Number.isFinite(price) && price === 0;
}

module.exports = {
  SUBSCRIPTION_ACTIVATION_FEE_JOD,
  DEFAULT_ACTIVATION_FEE_AMOUNT_MINOR,
  DEFAULT_ACTIVATION_FEE_ENABLED,
  MAX_ACTIVATION_FEE_AMOUNT_MINOR,
  ACTIVATION_FEE_VALIDITY_DAYS,
  ACTIVATION_FEE_SETTING_KEYS,
  ACTIVATION_FEE_SOURCES,
  CHECKOUT_KIND,
  CHECKOUT_SESSION_STATUS,
  PURPOSE_ACTIVATION_FEE_ONLY,
  PURPOSE_SUBSCRIPTION_PURCHASE,
  amountMinorToJod,
  getActivationFeeConfig,
  getPublicActivationFeeConfig,
  updateActivationFeeSettings,
  activationFeeMinorUnits,
  isActivationFeeCurrent,
  activationFeeValidUntil,
  getActivationFeePaidAt,
  getLatestActivationFeePaidAt,
  getLatestActivationFeePayment,
  freelancerNeedsSubscriptionActivationFee,
  recordActivationFeePayment,
  recordSubscriptionActivationFeePaid,
  recordActivationFeeFromStripeSession,
  markActivationFeePaidOffline,
  getActivationFeeStatus,
  lockFreelancerForCheckout,
  listOpenCheckoutSessionsForFreelancer,
  expireStripeCheckoutSession,
  expireStripeCheckoutSessionsBestEffort,
  supersedeOpenCheckoutSessions,
  supersedeAllOpenFeeBearingCheckoutSessions,
  trackFreelancerCheckoutSession,
  markCheckoutSessionStatus,
  prepareFreelancerCheckoutSessionCreation,
  activationFeeLineItemName,
  buildActivationFeeStripeLineItem,
  isFreeDisplayPlanEligibleForActivationFeeCheckout,
};
