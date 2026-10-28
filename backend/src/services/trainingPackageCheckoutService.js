/**
 * Authenticated training-package Stripe Checkout.
 * Payment does NOT grant marketplace membership, start membership dates, or enroll LMS courses.
 * Paid state is written only from a verified Stripe webhook (or an equivalent server apply).
 */

const crypto = require("crypto");
const Stripe = require("stripe");
const { createAppError } = require("../utils/AppError");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");
const { withOrderzHouseStatementDescriptor } = require("../utils/stripeStatementDescriptor");
const { isCheckoutSessionPaymentSuccessful } = require("../utils/stripeSessionPaymentStatus");
const {
  getPrimaryClientUrl,
  buildFreelancerTrainingPackageCheckoutReturnUrls,
} = require("../config/clientUrl");
const { isProduction } = require("../config/env");
const {
  PAYMENT_CONTEXT,
  buildFazaatStripeMetadata,
  mergeStripeCheckoutMetadata,
  paymentIntentDescriptionForContext,
  lineItemProductNameForContext,
} = require("../utils/fazaatStripeMetadata");
const trainingPackagesService = require("./trainingPackagesService");
const { resolveReferralDiscount } = require("./referralDiscountService");
const { PAYMENT_TYPES: REFERRAL_PAYMENT_TYPES } = require("../domain/referralPolicy");

const PURPOSE = "training_package_purchase";
const PURCHASE_TYPE = "training_package";
const CURRENCY = "JOD";

/**
 * Canonical state of an unresolved checkout attempt, resolved from the Stripe Checkout Session
 * (the provider is the source of truth; a local 'pending' row alone never blocks a purchase).
 */
const CHECKOUT_STATE = Object.freeze({
  /** Session open: the user can continue the same hosted checkout. */
  OPEN: "open",
  /** Session complete but payment not confirmed yet: never create another session. */
  PROCESSING: "processing",
  PAID: "paid",
  /** Session expired / missing: attempt closed, a new checkout may be created. */
  CLOSED: "closed",
  /** Provider unreachable: keep the attempt untouched and ask the user to retry. */
  UNKNOWN: "unknown",
});

/** A row without a Stripe session older than this cannot be mid-creation (fallback only). */
const SESSIONLESS_ATTEMPT_GRACE_MS = 10 * 60 * 1000;
/** Bounded provider lookups per status read. */
const MAX_RECONCILE_PER_READ = 5;

function getPool() {
  return require("../config/db").pool;
}

function getStripeOrNull() {
  const key = process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).trim();
  if (!key) return null;
  return new Stripe(key);
}

function throwStripeNotConfigured() {
  throw createAppError(
    isProduction()
      ? "خدمة الدفع غير مفعّلة على الخادم. راجع إعداد STRIPE_SECRET_KEY أو تواصل مع الدعم."
      : "Stripe is not configured on the server (set STRIPE_SECRET_KEY).",
    503,
    { exposeToClient: true, publicCode: "TRAINING_PACKAGE_STRIPE_NOT_CONFIGURED" },
  );
}

function requireStripeClientUrl() {
  const clientUrl = getPrimaryClientUrl();
  if (!clientUrl) {
    throw createAppError("CLIENT_URL is not configured.", 500, { exposeToClient: true });
  }
  return clientUrl;
}

function throwAlreadyCurrent() {
  throw createAppError("This training package is already your current package.", 409, {
    exposeToClient: true,
    publicCode: "TRAINING_PACKAGE_ALREADY_CURRENT",
  });
}

function throwPaymentStatusUnavailable() {
  throw createAppError("تعذر التحقق من حالة الدفع حاليًا. حاول مرة أخرى بعد قليل.", 503, {
    exposeToClient: true,
    publicCode: "TRAINING_PACKAGE_PAYMENT_STATUS_UNAVAILABLE",
  });
}

function throwPaymentProcessing() {
  throw createAppError("جارٍ تأكيد الدفع لهذه الباقة. حدّث الصفحة بعد قليل.", 409, {
    exposeToClient: true,
    publicCode: "TRAINING_PACKAGE_PAYMENT_PROCESSING",
  });
}

function logCheckoutReconcile(fields) {
  // No checkout URL, email or card data — ids and states only.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ component: "training_package_checkout_reconcile", ...fields }));
}

function isStripeSessionMissingError(err) {
  return (
    err?.type === "StripeInvalidRequestError" &&
    (err?.code === "resource_missing" || Number(err?.statusCode) === 404)
  );
}

/** Close a local attempt that can no longer be paid. History is kept (status 'cancelled'). */
async function closePendingAttempt(db, purchaseId) {
  const { rows } = await db.query(
    `UPDATE training_package_purchases
        SET status = 'cancelled',
            cancelled_at = COALESCE(cancelled_at, NOW()),
            updated_at = NOW()
      WHERE id = $1
        AND status = 'pending'
      RETURNING id`,
    [purchaseId],
  );
  return rows.length > 0;
}

/**
 * Reconcile one local pending attempt with its Stripe Checkout Session.
 * Never creates a session. Paid state is only written through applyTrainingPackageCheckoutSessionCompleted
 * with the provider's own session object.
 *
 * @param {object} row training_package_purchases row (id, package_code, stripe_checkout_session_id, created_at)
 * @param {{ db?: object, pool?: object, stripe?: object, userLocked?: boolean }} [deps]
 *   userLocked: caller holds the per-user checkout lock, so a session-less row is not mid-creation.
 * @returns {Promise<{ purchaseId: string, packageCode: string, state: string, checkoutUrl?: string }>}
 */
async function reconcilePendingTrainingPurchase(row, deps = {}) {
  const db = deps.db || getPool();
  const purchaseId = Number(row.id);
  const packageCode = String(row.package_code || "");
  const result = (state, providerStatus, extra = {}) => {
    logCheckoutReconcile({ purchaseId, packageCode, previousState: "pending", providerStatus, action: state });
    return { purchaseId: String(purchaseId), packageCode, state, ...extra };
  };

  const sessionId = row.stripe_checkout_session_id ? String(row.stripe_checkout_session_id).trim() : "";
  if (!sessionId) {
    const ageMs = Date.now() - new Date(row.created_at || 0).getTime();
    if (!deps.userLocked && ageMs < SESSIONLESS_ATTEMPT_GRACE_MS) {
      return result(CHECKOUT_STATE.UNKNOWN, "no_session_recent");
    }
    // No provider session exists, so nothing can be paid on this attempt.
    await closePendingAttempt(db, purchaseId);
    return result(CHECKOUT_STATE.CLOSED, "no_session");
  }

  const stripe = deps.stripe || getStripeOrNull();
  if (!stripe) return result(CHECKOUT_STATE.UNKNOWN, "stripe_not_configured");

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    if (isStripeSessionMissingError(err)) {
      await closePendingAttempt(db, purchaseId);
      return result(CHECKOUT_STATE.CLOSED, "missing");
    }
    return result(CHECKOUT_STATE.UNKNOWN, "unreachable");
  }

  const status = String(session?.status || "").toLowerCase();
  if (status === "open" && session.url) {
    return result(CHECKOUT_STATE.OPEN, "open", { checkoutUrl: session.url });
  }
  if (status === "expired" || (status === "open" && !session.url)) {
    await closePendingAttempt(db, purchaseId);
    return result(CHECKOUT_STATE.CLOSED, status);
  }
  if (status === "complete") {
    if (!isCheckoutSessionPaymentSuccessful(session)) {
      // e.g. an asynchronous payment method still settling — the webhook confirms it later.
      return result(CHECKOUT_STATE.PROCESSING, `complete_${session.payment_status || "unknown"}`);
    }
    const applied = await applyTrainingPackageCheckoutSessionCompleted(
      session,
      session.metadata || {},
      deps.pool || getPool(),
    );
    if (applied.status === "applied") return result(CHECKOUT_STATE.PAID, "complete_paid");
    // Paid at the provider but not applicable locally (e.g. amount mismatch): never sell it again.
    return result(CHECKOUT_STATE.PROCESSING, `complete_paid_${applied.reason || "not_applied"}`);
  }
  return result(CHECKOUT_STATE.UNKNOWN, status || "unknown");
}

/**
 * Per-user checkout serialization (double click, two tabs). Narrow: one advisory lock per user,
 * released at transaction end.
 */
async function withUserCheckoutLock(pool, userId, fn) {
  if (typeof pool.connect !== "function") return fn(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('training_package_checkout'), $1::int)`, [userId]);
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

function paymentIntentIdFromSession(session) {
  const pi = session?.payment_intent;
  if (!pi) return null;
  if (typeof pi === "string") return pi;
  return pi.id ? String(pi.id) : null;
}

function mapPurchase(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    packageCode: row.package_code,
    nameAr: row.package_name_ar || null,
    nameEn: row.package_name_en || null,
    amountJod: Number(row.amount_jod),
    currency: row.currency || CURRENCY,
    status: row.status,
    stripeCheckoutSessionId: row.stripe_checkout_session_id || null,
    paidAt: row.paid_at || null,
    createdAt: row.created_at || null,
  };
}

async function resolveVisiblePackage(packageCodeRaw, deps = {}) {
  const packageCode = String(packageCodeRaw || "").trim().toLowerCase();
  if (!packageCode) {
    throw createAppError("training package code is required.", 400, {
      exposeToClient: true,
      publicCode: "TRAINING_PACKAGE_CODE_REQUIRED",
    });
  }
  const list = await trainingPackagesService.listPublicTrainingPackages(deps.settings);
  const pkg = list.find((item) => item.code === packageCode);
  if (!pkg) {
    throw createAppError("Training package is not available.", 400, {
      exposeToClient: true,
      publicCode: "TRAINING_PACKAGE_INVALID",
    });
  }
  const priceJod = Number(pkg.priceJod);
  if (!Number.isFinite(priceJod) || priceJod <= 0) {
    throw createAppError("Training package price is invalid.", 400, {
      exposeToClient: true,
      publicCode: "TRAINING_PACKAGE_INVALID_PRICE",
    });
  }
  const expectedAmountMinor = amountMajorToStripeMinor(priceJod, CURRENCY);
  if (!Number.isInteger(expectedAmountMinor) || expectedAmountMinor < 1) {
    throw createAppError("Unable to compute Stripe amount for training package.", 400, {
      exposeToClient: true,
      publicCode: "TRAINING_PACKAGE_INVALID_PRICE",
    });
  }
  return { pkg, packageCode, priceJod, expectedAmountMinor };
}

async function createTrainingPackageCheckoutSession(input = {}, deps = {}) {
  const freelancerUserId = Number(input.freelancerUserId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    throw createAppError("freelancerUserId is required.", 400, {
      exposeToClient: true,
      publicCode: "TRAINING_PACKAGE_FREELANCER_INVALID",
    });
  }

  const resolved = await resolveVisiblePackage(input.packageCode, deps);
  const db = deps.db || getPool();
  const { rows: userRows } = await db.query(
    `SELECT id, role, is_active FROM users WHERE id = $1 LIMIT 1`,
    [freelancerUserId],
  );
  const user = userRows[0];
  if (!user || user.role !== "freelancer" || user.is_active !== true) {
    throw createAppError("Freelancer account is required to purchase a training package.", 403, {
      exposeToClient: true,
      publicCode: "TRAINING_PACKAGE_FREELANCER_INVALID",
    });
  }

  const stripe = deps.stripe || getStripeOrNull();
  const outcome = await withUserCheckoutLock(db, freelancerUserId, async (tx) => {
    const { rows: currentRows } = await tx.query(
      `SELECT id, package_code
         FROM training_package_purchases
        WHERE user_id = $1 AND status = 'paid'
        ORDER BY paid_at DESC NULLS LAST, id DESC
        LIMIT 1`,
      [freelancerUserId],
    );
    if (currentRows[0]?.package_code === resolved.packageCode) throwAlreadyCurrent();

    // A local 'pending' row is not a lock: reconcile every unresolved attempt for this package with
    // Stripe first. Open → resume it; expired/missing → closed, buy again; paid/processing → no new session.
    const { rows: pendingRows } = await tx.query(
      `SELECT id, package_code, stripe_checkout_session_id, amount_jod, created_at
         FROM training_package_purchases
        WHERE user_id = $1
          AND package_code = $2
          AND status = 'pending'
        ORDER BY id DESC`,
      [freelancerUserId, resolved.packageCode],
    );
    let resumable = null;
    for (const row of pendingRows) {
      const rec = await reconcilePendingTrainingPurchase(row, { db: tx, pool: db, stripe, userLocked: true });
      if (rec.state === CHECKOUT_STATE.PAID) throwAlreadyCurrent();
      if (rec.state === CHECKOUT_STATE.PROCESSING) throwPaymentProcessing();
      if (rec.state === CHECKOUT_STATE.UNKNOWN) throwPaymentStatusUnavailable();
      if (rec.state !== CHECKOUT_STATE.OPEN) continue;
      if (!resumable) {
        resumable = { row, checkoutUrl: rec.checkoutUrl };
        continue;
      }
      // Older duplicate open session (created before this fix): expire it so one payable checkout remains.
      try {
        await stripe.checkout.sessions.expire(String(row.stripe_checkout_session_id));
        await closePendingAttempt(tx, Number(row.id));
      } catch {
        /* stays open until Stripe expires it; reconciled on a later read */
      }
    }
    if (resumable) {
      return {
        checkoutUrl: resumable.checkoutUrl,
        sessionId: resumable.row.stripe_checkout_session_id,
        purchaseId: String(resumable.row.id),
        packageCode: resolved.packageCode,
        amountJod: Number(resumable.row.amount_jod) || resolved.priceJod,
        currency: CURRENCY,
        resumed: true,
        alreadyPending: true,
        membershipGranted: false,
        termStarted: false,
      };
    }

    if (!stripe) throwStripeNotConfigured();
    const clientUrl = requireStripeClientUrl();

    // Referral discount: server-side, from the referred user's snapshotted policy only.
    const discount = await (deps.resolveReferralDiscount || resolveReferralDiscount)(
      {
        userId: freelancerUserId,
        paymentType: REFERRAL_PAYMENT_TYPES.TRAINING_PACKAGE,
        listAmountMinor: resolved.expectedAmountMinor,
      },
      tx,
    );
    const chargeMinor = discount.discountMinor > 0 ? discount.chargeMinor : resolved.expectedAmountMinor;
    const chargeJod = chargeMinor / 1000;

    const inserted = await tx.query(
      `INSERT INTO training_package_purchases (
         user_id, package_code, package_name_ar, package_name_en, amount_jod, currency, status,
         list_amount_jod, referral_discount_minor, referral_policy_version_id
       ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
       RETURNING id`,
      [
        freelancerUserId,
        resolved.packageCode,
        resolved.pkg.nameAr,
        resolved.pkg.nameEn,
        chargeJod,
        CURRENCY,
        resolved.priceJod,
        discount.discountMinor,
        discount.policyVersionId,
      ],
    );
    const purchaseId = Number(inserted.rows[0].id);

    const returnUrls = buildFreelancerTrainingPackageCheckoutReturnUrls(clientUrl);
    const metadata = mergeStripeCheckoutMetadata(
      buildFazaatStripeMetadata({
        paymentContext: PAYMENT_CONTEXT.TRAINING_PACKAGE,
        purpose: PURPOSE,
        userId: freelancerUserId,
        purchaseId,
        expectedAmountMinor: chargeMinor,
        currency: CURRENCY,
        flow: PURCHASE_TYPE,
      }),
      {
        purpose: PURPOSE,
        purchase_type: PURCHASE_TYPE,
        training_package_code: resolved.packageCode,
        user_id: String(freelancerUserId),
        purchase_id: String(purchaseId),
        expectedAmountMinor: String(chargeMinor),
        ...(discount.discountMinor > 0
          ? {
              referralDiscountMinor: String(discount.discountMinor),
              referralListAmountMinor: String(resolved.expectedAmountMinor),
            }
          : {}),
      },
    );

    const productName =
      lineItemProductNameForContext(PAYMENT_CONTEXT.TRAINING_PACKAGE) ||
      "FAZAAT - Orderz House - Training Package";
    const label = resolved.pkg.nameEn || resolved.pkg.nameAr || resolved.packageCode;

    let session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          success_url: returnUrls.successUrl,
          cancel_url: returnUrls.cancelUrl,
          client_reference_id: `training_package:${freelancerUserId}:${resolved.packageCode}:${purchaseId}`,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: CURRENCY.toLowerCase(),
                unit_amount: chargeMinor,
                product_data: {
                  name: productName.slice(0, 120),
                  description: String(label).slice(0, 200),
                },
              },
            },
          ],
          metadata,
          payment_intent_data: withOrderzHouseStatementDescriptor({
            metadata,
            description:
              paymentIntentDescriptionForContext(PAYMENT_CONTEXT.TRAINING_PACKAGE) || productName,
          }),
        },
        // Attempt-specific: a retry of this attempt is deduplicated; a new attempt gets a new key.
        { idempotencyKey: `training_pkg_checkout_${purchaseId}` },
      );
    } catch (err) {
      await tx.query(
        `UPDATE training_package_purchases
            SET status = 'failed', failed_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND status = 'pending'`,
        [purchaseId],
      );
      // Commit the failed attempt (audit trail), then surface the error.
      return { error: err };
    }

    await tx.query(
      `UPDATE training_package_purchases
          SET stripe_checkout_session_id = $2,
              checkout_url = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [purchaseId, session.id, session.url],
    );
    logCheckoutReconcile({ purchaseId, packageCode: resolved.packageCode, previousState: "none", action: "created" });

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
      purchaseId: String(purchaseId),
      packageCode: resolved.packageCode,
      amountJod: chargeJod,
      listAmountJod: resolved.priceJod,
      referralDiscountJod: discount.discountMinor / 1000,
      currency: CURRENCY,
      membershipGranted: false,
      termStarted: false,
    };
  });
  if (outcome.error) throw outcome.error;
  return outcome;
}

/**
 * Freelancer training-package state. Unresolved attempts are reconciled with Stripe on read, so a
 * checkout abandoned through browser Back / closed tab never leaves the package locked.
 * `checkouts` lists unresolved attempts by canonical state (open | processing | unknown);
 * `pending` is only an attempt whose payment is genuinely being confirmed.
 */
async function getMyTrainingPackages(freelancerUserId, deps = {}) {
  const userId = Number(freelancerUserId);
  const db = deps.db || getPool();
  const load = () =>
    db.query(
      `SELECT id, package_code, package_name_ar, package_name_en, amount_jod, currency, status,
              stripe_checkout_session_id, paid_at, created_at
         FROM training_package_purchases
        WHERE user_id = $1
        ORDER BY id DESC
        LIMIT 50`,
      [userId],
    );
  let { rows } = await load();

  const checkouts = [];
  const unresolved = rows.filter((row) => row.status === "pending").slice(0, MAX_RECONCILE_PER_READ);
  if (unresolved.length) {
    const stripe = deps.stripe || getStripeOrNull();
    for (const row of unresolved) {
      let state = CHECKOUT_STATE.UNKNOWN;
      try {
        ({ state } = await reconcilePendingTrainingPurchase(row, { db, pool: deps.pool || db, stripe }));
      } catch {
        /* provider/DB hiccup: keep the attempt, report unknown */
      }
      if (state === CHECKOUT_STATE.OPEN || state === CHECKOUT_STATE.PROCESSING || state === CHECKOUT_STATE.UNKNOWN) {
        checkouts.push({ purchaseId: String(row.id), packageCode: row.package_code, state });
      }
    }
    ({ rows } = await load());
  }

  const mapped = rows.map(mapPurchase);
  const paid = mapped
    .filter((row) => row.status === "paid")
    .sort((a, b) => {
      const at = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const bt = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      return bt - at;
    });
  const processingIds = new Set(
    checkouts.filter((c) => c.state === CHECKOUT_STATE.PROCESSING).map((c) => c.purchaseId),
  );
  const pending = mapped.find((row) => row.status === "pending" && processingIds.has(row.id)) || null;
  return {
    current: paid[0] || null,
    pending,
    checkouts,
    purchases: mapped,
  };
}

/**
 * Stripe cancel_url return. Not authoritative (browser Back / tab close never reach it): the attempt
 * is reconciled with Stripe like any read — an open session stays resumable, an expired one is closed.
 */
async function cancelTrainingPackageCheckout(input = {}, deps = {}) {
  const freelancerUserId = Number(input.freelancerUserId);
  const sessionId = String(input.sessionId || "").trim();
  if (!sessionId) return { cancelled: false };
  const db = deps.db || getPool();
  const { rows } = await db.query(
    `SELECT id, package_code, stripe_checkout_session_id, created_at
       FROM training_package_purchases
      WHERE user_id = $1
        AND stripe_checkout_session_id = $2
        AND status = 'pending'
      LIMIT 1`,
    [freelancerUserId, sessionId],
  );
  if (!rows[0]) return { cancelled: false };
  const rec = await reconcilePendingTrainingPurchase(rows[0], {
    db,
    pool: deps.pool || db,
    stripe: deps.stripe,
  });
  return { cancelled: rec.state === CHECKOUT_STATE.CLOSED, state: rec.state };
}

/**
 * checkout.session.expired webhook: close the matching local attempt (idempotent; history kept).
 */
async function applyTrainingPackageCheckoutSessionExpired(session, dbPool = null) {
  const meta = session?.metadata && typeof session.metadata === "object" ? session.metadata : {};
  if (String(meta.purpose || "") !== PURPOSE) {
    return { status: "ignored", reason: "not_training_package_purpose" };
  }
  const sessionId = session?.id != null ? String(session.id).trim() : "";
  const purchaseId = Number(meta.purchase_id || meta.purchaseId);
  if (!sessionId || !Number.isInteger(purchaseId) || purchaseId < 1) {
    return { status: "ignored", reason: "training_package_metadata_incomplete" };
  }
  const database = dbPool || getPool();
  const { rows } = await database.query(
    `UPDATE training_package_purchases
        SET status = 'cancelled',
            cancelled_at = COALESCE(cancelled_at, NOW()),
            updated_at = NOW()
      WHERE id = $1
        AND stripe_checkout_session_id = $2
        AND status = 'pending'
      RETURNING id`,
    [purchaseId, sessionId],
  );
  logCheckoutReconcile({
    purchaseId,
    previousState: "pending",
    providerStatus: "expired_webhook",
    action: rows.length ? CHECKOUT_STATE.CLOSED : "noop",
  });
  return { status: "applied", duplicate: rows.length === 0, purchaseId: String(purchaseId) };
}

async function applyTrainingPackageCheckoutSessionCompleted(session, meta = {}, dbPool = null) {
  const sessionMeta = {
    ...(session?.metadata && typeof session.metadata === "object" ? session.metadata : {}),
    ...(meta && typeof meta === "object" ? meta : {}),
  };
  const purpose = String(sessionMeta.purpose || "");
  if (purpose !== PURPOSE) {
    return { status: "ignored", reason: "not_training_package_purpose" };
  }
  if (!isCheckoutSessionPaymentSuccessful(session)) {
    return { status: "ignored", reason: "training_package_checkout_not_paid" };
  }
  const sessionId = session?.id != null ? String(session.id).trim() : "";
  const purchaseId = Number(sessionMeta.purchase_id || sessionMeta.purchaseId);
  const userId = Number(sessionMeta.user_id || sessionMeta.userId);
  const packageCode = String(sessionMeta.training_package_code || "").trim().toLowerCase();
  if (!sessionId || !Number.isInteger(purchaseId) || purchaseId < 1 || !Number.isInteger(userId)) {
    return { status: "ignored", reason: "training_package_metadata_incomplete" };
  }

  const database = dbPool || getPool();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, user_id, package_code, amount_jod, currency, status
         FROM training_package_purchases
        WHERE id = $1
        FOR UPDATE`,
      [purchaseId],
    );
    const row = rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { status: "ignored", reason: "training_package_purchase_missing" };
    }
    if (row.status === "paid") {
      await client.query("COMMIT");
      return { status: "applied", duplicate: true, purchaseId: String(row.id) };
    }
    if (row.status !== "pending") {
      await client.query("ROLLBACK");
      return { status: "ignored", reason: "training_package_not_pending" };
    }
    if (Number(row.user_id) !== userId || String(row.package_code) !== packageCode) {
      await client.query("ROLLBACK");
      return { status: "ignored", reason: "training_package_metadata_mismatch" };
    }
    const expectedMinor = amountMajorToStripeMinor(row.amount_jod, row.currency || CURRENCY);
    const amountTotal = Number(session.amount_total);
    if (!Number.isInteger(amountTotal) || amountTotal !== expectedMinor) {
      await client.query("ROLLBACK");
      return { status: "ignored", reason: "training_package_amount_mismatch" };
    }
    await client.query(
      `UPDATE training_package_purchases
          SET status = 'paid',
              paid_at = COALESCE(paid_at, NOW()),
              stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, $2),
              stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
              updated_at = NOW()
        WHERE id = $1
          AND status = 'pending'`,
      [purchaseId, sessionId, paymentIntentIdFromSession(session)],
    );
    await client.query("COMMIT");
    return { status: "applied", duplicate: false, purchaseId: String(purchaseId) };
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

async function applyTrainingPackagePaymentFailed(pi, dbPool = null) {
  const meta = pi?.metadata || {};
  if (String(meta.purpose || "") !== PURPOSE) {
    return { status: "ignored", reason: "not_training_package_purpose" };
  }
  const purchaseId = Number(meta.purchase_id || meta.purchaseId);
  if (!Number.isInteger(purchaseId) || purchaseId < 1) {
    return { status: "ignored", reason: "training_package_pi_missing_purchase" };
  }
  const database = dbPool || getPool();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE training_package_purchases
          SET status = 'failed',
              failed_at = COALESCE(failed_at, NOW()),
              stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
              updated_at = NOW()
        WHERE id = $1
          AND status = 'pending'`,
      [purchaseId, pi.id || null],
    );
    await client.query("COMMIT");
    return { status: "applied", purchaseId: String(purchaseId) };
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

module.exports = {
  PURPOSE,
  PURCHASE_TYPE,
  CHECKOUT_STATE,
  createTrainingPackageCheckoutSession,
  getMyTrainingPackages,
  cancelTrainingPackageCheckout,
  reconcilePendingTrainingPurchase,
  applyTrainingPackageCheckoutSessionExpired,
  applyTrainingPackageCheckoutSessionCompleted,
  applyTrainingPackagePaymentFailed,
};
