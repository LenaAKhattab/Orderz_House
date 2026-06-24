const { pool } = require("../config/db");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");

const SUBSCRIPTION_ACTIVATION_FEE_JOD = 25;
const ACTIVATION_FEE_VALIDITY_DAYS = 365;

const ACTIVATION_FEE_SOURCES = {
  STRIPE: "stripe",
  ADMIN_OFFLINE: "admin_offline",
  MIGRATION: "migration",
};

const CHECKOUT_KIND = {
  SUBSCRIPTION: "subscription",
  ACTIVATION_FEE_ONLY: "activation_fee_only",
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

function activationFeeMinorUnits() {
  return amountMajorToStripeMinor(SUBSCRIPTION_ACTIVATION_FEE_JOD, "JOD");
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

async function getActivationFeePaidAt(userId, client) {
  return getLatestActivationFeePaidAt(userId, client);
}

async function freelancerNeedsSubscriptionActivationFee(userId, client, now = new Date()) {
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
  const minor = amountMinor != null ? Number(amountMinor) : activationFeeMinorUnits();
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
  return recordActivationFeePayment(
    { userId, paidAt, source: ACTIVATION_FEE_SOURCES.STRIPE, amountMinor: activationFeeMinorUnits() },
    client,
  );
}

async function recordActivationFeeFromStripeSession(
  { freelancerUserId, stripeSessionId, stripePaymentIntentId, activationFeeMinor, paidAt = new Date() },
  client,
) {
  const minor = Number(activationFeeMinor);
  if (!Number.isFinite(minor) || minor < 1) {
    return { recorded: false, skipped: true, reason: "no_activation_fee_in_session" };
  }

  const needsFee = await freelancerNeedsSubscriptionActivationFee(freelancerUserId, client, paidAt);
  if (!needsFee) {
    return { recorded: false, skipped: true, reason: "activation_fee_already_current" };
  }

  return recordActivationFeePayment(
    {
      userId: freelancerUserId,
      stripeSessionId,
      stripePaymentIntentId,
      amountMinor: minor,
      paidAt,
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
      amountMinor: activationFeeMinorUnits(),
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
  const paidAt = await getLatestActivationFeePaidAt(userId, client);
  const isCurrent = isActivationFeeCurrent(paidAt);
  const validUntil = activationFeeValidUntil(paidAt);
  return {
    amountJod: SUBSCRIPTION_ACTIVATION_FEE_JOD,
    validityDays: ACTIVATION_FEE_VALIDITY_DAYS,
    paidAt: paidAt || null,
    validUntil: validUntil || null,
    isCurrent,
    needsPayment: !isCurrent,
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

function buildActivationFeeStripeLineItem(locale = "ar") {
  const unitAmount = activationFeeMinorUnits();
  if (unitAmount == null || unitAmount < 1) {
    const err = new Error("Invalid subscription activation fee amount.");
    err.statusCode = 500;
    throw err;
  }
  return {
    quantity: 1,
    price_data: {
      currency: "jod",
      unit_amount: unitAmount,
      product_data: {
        name: activationFeeLineItemName(locale),
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
  ACTIVATION_FEE_VALIDITY_DAYS,
  ACTIVATION_FEE_SOURCES,
  CHECKOUT_KIND,
  CHECKOUT_SESSION_STATUS,
  PURPOSE_ACTIVATION_FEE_ONLY,
  PURPOSE_SUBSCRIPTION_PURCHASE,
  activationFeeMinorUnits,
  isActivationFeeCurrent,
  activationFeeValidUntil,
  getActivationFeePaidAt,
  getLatestActivationFeePaidAt,
  freelancerNeedsSubscriptionActivationFee,
  recordActivationFeePayment,
  recordSubscriptionActivationFeePaid,
  recordActivationFeeFromStripeSession,
  markActivationFeePaidOffline,
  getActivationFeeStatus,
  lockFreelancerForCheckout,
  listOpenCheckoutSessionsForFreelancer,
  expireStripeCheckoutSession,
  supersedeOpenCheckoutSessions,
  trackFreelancerCheckoutSession,
  markCheckoutSessionStatus,
  prepareFreelancerCheckoutSessionCreation,
  activationFeeLineItemName,
  buildActivationFeeStripeLineItem,
  isFreeDisplayPlanEligibleForActivationFeeCheckout,
};
