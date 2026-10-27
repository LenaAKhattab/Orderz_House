/**
 * Marketplace membership Checkout attempts (SILVER / PRO / ELITE / ANNUAL_BASIC / special offer).
 *
 * One row per Stripe Checkout Session in `marketplace_membership_checkout_attempts`. The canonical rule is
 * at most ONE unresolved ('pending') attempt per freelancer + marketplace plan: purchase requests are
 * serialized per user+plan (advisory transaction lock, backed by a partial unique index) and every
 * unresolved attempt is reconciled with its Stripe Checkout Session — Stripe is the source of truth:
 *   open → resume the same session · expired / missing → close, a new checkout may be created ·
 *   complete+paid → grant through the trusted checkout.session.completed dispatch ·
 *   complete+unpaid → processing · provider unreachable → unknown (no new session, no state change).
 * Rows are never deleted (history); only the 'pending' row drives the purchase UX.
 */

const { createAppError } = require("../utils/AppError");
const { isCheckoutSessionPaymentSuccessful } = require("../utils/stripeSessionPaymentStatus");
const { isSpecialOfferMembershipTier } = require("../constants/marketplaceMembershipPlans");

const CHECKOUT_STATE = Object.freeze({
  OPEN: "open",
  PROCESSING: "processing",
  PAID: "paid",
  CLOSED: "closed",
  UNKNOWN: "unknown",
});

/** A row without a Stripe session older than this cannot be mid-creation (fallback only). */
const SESSIONLESS_ATTEMPT_GRACE_MS = 10 * 60 * 1000;
/** Bounded provider lookups per status read. */
const MAX_RECONCILE_PER_READ = 5;

function getPool() {
  return require("../config/db").pool;
}

function logAttempt(fields) {
  // Ids and states only — never the checkout URL, email or card data.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ component: "marketplace_membership_checkout_reconcile", ...fields }));
}

function isStripeSessionMissingError(err) {
  return (
    err?.type === "StripeInvalidRequestError" &&
    (err?.code === "resource_missing" || Number(err?.statusCode) === 404)
  );
}

function throwAlreadyOwned(planCode) {
  throw createAppError("This marketplace package is already your current plan.", 409, {
    exposeToClient: true,
    publicCode: "MARKETPLACE_MEMBERSHIP_ALREADY_CURRENT",
    details: { planCode },
  });
}

function throwPaymentProcessing() {
  throw createAppError("جارٍ تأكيد الدفع لهذه الباقة. حدّث الصفحة بعد قليل.", 409, {
    exposeToClient: true,
    publicCode: "MARKETPLACE_MEMBERSHIP_PAYMENT_PROCESSING",
  });
}

function throwPaymentStatusUnavailable() {
  throw createAppError("تعذر التحقق من حالة الدفع حاليًا. حاول مرة أخرى بعد قليل.", 503, {
    exposeToClient: true,
    publicCode: "MARKETPLACE_MEMBERSHIP_PAYMENT_STATUS_UNAVAILABLE",
  });
}

/** Resolve a pending attempt (history kept). Returns true when this call changed it. */
async function resolveAttempt(db, attemptId, status, reason) {
  const { rows } = await db.query(
    `UPDATE marketplace_membership_checkout_attempts
        SET status = $2,
            resolution_reason = $3,
            resolved_at = COALESCE(resolved_at, NOW()),
            updated_at = NOW()
      WHERE id = $1
        AND status = 'pending'
      RETURNING id`,
    [attemptId, status, reason],
  );
  return rows.length > 0;
}

/**
 * Grant a provider-confirmed paid session through the same dispatch as checkout.session.completed
 * (membership grant + referral bridge), then mark the attempt paid.
 */
async function applyPaidSession(session, deps) {
  const apply =
    deps.applyCheckoutSessionCompleted ||
    ((s) => require("../controllers/stripeWebhookController").applyCheckoutSessionCompleted(s));
  return apply(session);
}

/**
 * Reconcile one pending attempt with its Stripe Checkout Session. Never creates a session.
 * @param {object} row attempt row (id, plan_code, stripe_checkout_session_id, created_at)
 * @param {{ db?: object, stripe?: object, userLocked?: boolean, applyCheckoutSessionCompleted?: Function }} deps
 */
async function reconcileMembershipAttempt(row, deps = {}) {
  const db = deps.db || getPool();
  const attemptId = Number(row.id);
  const planCode = String(row.plan_code || "");
  const result = (state, providerStatus, extra = {}) => {
    logAttempt({ attemptId, planCode, previousState: "pending", providerStatus, action: state });
    return { attemptId: String(attemptId), planCode, state, ...extra };
  };

  const sessionId = row.stripe_checkout_session_id ? String(row.stripe_checkout_session_id).trim() : "";
  if (!sessionId) {
    const ageMs = Date.now() - new Date(row.created_at || 0).getTime();
    if (!deps.userLocked && ageMs < SESSIONLESS_ATTEMPT_GRACE_MS) {
      return result(CHECKOUT_STATE.UNKNOWN, "no_session_recent");
    }
    // No provider session was recorded, so nothing can be paid on this attempt.
    await resolveAttempt(db, attemptId, "failed", "no_session");
    return result(CHECKOUT_STATE.CLOSED, "no_session");
  }

  const stripe = deps.stripe;
  if (!stripe) return result(CHECKOUT_STATE.UNKNOWN, "stripe_not_configured");

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    if (isStripeSessionMissingError(err)) {
      await resolveAttempt(db, attemptId, "expired", "stripe_session_missing");
      return result(CHECKOUT_STATE.CLOSED, "missing");
    }
    return result(CHECKOUT_STATE.UNKNOWN, "unreachable");
  }

  const status = String(session?.status || "").toLowerCase();
  if (status === "open" && session.url) {
    return result(CHECKOUT_STATE.OPEN, "open", { checkoutUrl: session.url, sessionId });
  }
  if (status === "expired" || (status === "open" && !session.url)) {
    await resolveAttempt(db, attemptId, "expired", "stripe_expired");
    return result(CHECKOUT_STATE.CLOSED, status);
  }
  if (status === "complete") {
    if (!isCheckoutSessionPaymentSuccessful(session)) {
      // e.g. an asynchronous payment method still settling — the webhook confirms it later.
      return result(CHECKOUT_STATE.PROCESSING, `complete_${session.payment_status || "unknown"}`);
    }
    const applied = await applyPaidSession(session, deps);
    if (applied?.status === "applied" || applied?.status === "already_applied") {
      await resolveAttempt(db, attemptId, "paid", "stripe_complete_paid");
      return result(CHECKOUT_STATE.PAID, "complete_paid");
    }
    // Paid at the provider but not applicable locally: never sell it again; webhook/ops resolve it.
    return result(CHECKOUT_STATE.PROCESSING, `complete_paid_${applied?.reason || "not_applied"}`);
  }
  return result(CHECKOUT_STATE.UNKNOWN, status || "unknown");
}

/**
 * Serialize purchase requests for one freelancer + plan (double click, two tabs, retries).
 * Narrow key; different plans and different users never wait on each other.
 */
async function withMembershipCheckoutLock(pool, freelancerUserId, marketplacePlanId, fn) {
  if (typeof pool.connect !== "function") return fn(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('marketplace_membership_checkout:' || $2::text), $1::int)`,
      [Number(freelancerUserId), String(marketplacePlanId)],
    );
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Inside the lock: reconcile every unresolved attempt for this user + plan.
 * @returns {Promise<{ resumable: null | { attemptId: string, sessionId: string, checkoutUrl: string } }>}
 *   throws 409 already-owned / processing, 503 provider unknown.
 */
async function reconcileForPurchase(tx, { freelancerUserId, marketplacePlanId, planCode, stripe, deps = {} }) {
  const { rows } = await tx.query(
    `SELECT id, plan_code, stripe_checkout_session_id, created_at
       FROM marketplace_membership_checkout_attempts
      WHERE freelancer_user_id = $1
        AND marketplace_plan_id = $2
        AND status = 'pending'
      ORDER BY id DESC`,
    [freelancerUserId, marketplacePlanId],
  );
  let resumable = null;
  for (const row of rows) {
    const rec = await reconcileMembershipAttempt(row, { ...deps, db: tx, stripe, userLocked: true });
    if (rec.state === CHECKOUT_STATE.PAID) throwAlreadyOwned(planCode);
    if (rec.state === CHECKOUT_STATE.PROCESSING) throwPaymentProcessing();
    if (rec.state === CHECKOUT_STATE.UNKNOWN) throwPaymentStatusUnavailable();
    if (rec.state !== CHECKOUT_STATE.OPEN) continue;
    if (!resumable) {
      resumable = { attemptId: rec.attemptId, sessionId: rec.sessionId, checkoutUrl: rec.checkoutUrl };
      continue;
    }
    // Defensive: a second open session for the same target is expired so only one stays payable.
    try {
      await stripe.checkout.sessions.expire(String(row.stripe_checkout_session_id));
      await resolveAttempt(tx, Number(row.id), "cancelled", "superseded_duplicate");
    } catch {
      /* stays open until Stripe expires it; reconciled on a later read */
    }
  }
  return { resumable };
}

async function insertPendingAttempt(tx, { freelancerUserId, marketplacePlanId, planCode, amountMinor, currency }) {
  const { rows } = await tx.query(
    `INSERT INTO marketplace_membership_checkout_attempts (
       freelancer_user_id, marketplace_plan_id, plan_code, status, amount_minor, currency
     ) VALUES ($1, $2, $3, 'pending', $4, $5)
     RETURNING id`,
    [freelancerUserId, marketplacePlanId, planCode, amountMinor, currency],
  );
  return Number(rows[0].id);
}

async function attachSessionToAttempt(tx, attemptId, sessionId) {
  await tx.query(
    `UPDATE marketplace_membership_checkout_attempts
        SET stripe_checkout_session_id = $2,
            updated_at = NOW()
      WHERE id = $1`,
    [attemptId, sessionId],
  );
}

async function markAttemptFailed(tx, attemptId, reason) {
  return resolveAttempt(tx, attemptId, "failed", reason);
}

/**
 * Freelancer's unresolved membership checkouts, reconciled with Stripe (bounded).
 * @returns {Promise<{ attempts: Array<{ marketplacePlanId: string, planCode: string, specialOffer: boolean, state: string }>, membershipChanged: boolean }>}
 */
async function listMembershipCheckoutAttempts(freelancerUserId, deps = {}) {
  const db = deps.db || getPool();
  const { rows } = await db.query(
    `SELECT id, marketplace_plan_id, plan_code, stripe_checkout_session_id, created_at
       FROM marketplace_membership_checkout_attempts
      WHERE freelancer_user_id = $1
        AND status = 'pending'
      ORDER BY id DESC
      LIMIT $2`,
    [Number(freelancerUserId), MAX_RECONCILE_PER_READ],
  );
  const attempts = [];
  let membershipChanged = false;
  if (rows.length) {
    const stripe = deps.stripe || require("./marketplaceMembershipCheckoutService").getStripeOrNull();
    for (const row of rows) {
      let state = CHECKOUT_STATE.UNKNOWN;
      try {
        ({ state } = await reconcileMembershipAttempt(row, { ...deps, db, stripe }));
      } catch {
        /* provider/DB hiccup: keep the attempt, report unknown */
      }
      if (state === CHECKOUT_STATE.PAID) membershipChanged = true;
      if (state === CHECKOUT_STATE.OPEN || state === CHECKOUT_STATE.PROCESSING || state === CHECKOUT_STATE.UNKNOWN) {
        attempts.push({
          marketplacePlanId: String(row.marketplace_plan_id),
          planCode: String(row.plan_code),
          specialOffer: isSpecialOfferMembershipTier(row.plan_code),
          state,
        });
      }
    }
  }
  return { attempts, membershipChanged };
}

function sessionAttemptId(session) {
  const meta = session?.metadata && typeof session.metadata === "object" ? session.metadata : {};
  const id = Number(meta.checkoutAttemptId || meta.checkout_attempt_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** checkout.session.completed applied → attempt paid (idempotent; no-op for pre-ledger sessions). */
async function markAttemptPaidForSession(session, dbPool = null) {
  const sessionId = session?.id != null ? String(session.id).trim() : "";
  if (!sessionId) return { updated: false };
  const db = dbPool || getPool();
  const { rows } = await db.query(
    `UPDATE marketplace_membership_checkout_attempts
        SET status = 'paid',
            resolution_reason = 'webhook_completed',
            resolved_at = COALESCE(resolved_at, NOW()),
            updated_at = NOW()
      WHERE stripe_checkout_session_id = $1
        AND status = 'pending'
      RETURNING id`,
    [sessionId],
  );
  return { updated: rows.length > 0 };
}

/** checkout.session.expired webhook for a membership session (idempotent; history kept). */
async function applyMembershipCheckoutSessionExpired(session, dbPool = null) {
  const sessionId = session?.id != null ? String(session.id).trim() : "";
  const attemptId = sessionAttemptId(session);
  if (!sessionId) return { status: "ignored", reason: "marketplace_membership_missing_session_id" };
  const db = dbPool || getPool();
  const { rows } = await db.query(
    `UPDATE marketplace_membership_checkout_attempts
        SET status = 'expired',
            resolution_reason = 'webhook_expired',
            resolved_at = COALESCE(resolved_at, NOW()),
            updated_at = NOW()
      WHERE stripe_checkout_session_id = $1
        AND status = 'pending'
      RETURNING id`,
    [sessionId],
  );
  logAttempt({
    attemptId,
    previousState: "pending",
    providerStatus: "expired_webhook",
    action: rows.length ? CHECKOUT_STATE.CLOSED : "noop",
  });
  return { status: "applied", duplicate: rows.length === 0 };
}

module.exports = {
  CHECKOUT_STATE,
  reconcileMembershipAttempt,
  withMembershipCheckoutLock,
  reconcileForPurchase,
  insertPendingAttempt,
  attachSessionToAttempt,
  markAttemptFailed,
  listMembershipCheckoutAttempts,
  markAttemptPaidForSession,
  applyMembershipCheckoutSessionExpired,
};
