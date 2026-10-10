/**
 * Authenticated training-package Stripe Checkout.
 * Payment does NOT grant marketplace membership, start membership dates, or enroll LMS courses.
 * Paid state is written only from a verified Stripe webhook (or an equivalent server apply).
 */

const crypto = require("crypto");
const Stripe = require("stripe");
const { createAppError } = require("../utils/AppError");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");
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

const PURPOSE = "training_package_purchase";
const PURCHASE_TYPE = "training_package";
const CURRENCY = "JOD";

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

  const { rows: currentRows } = await db.query(
    `SELECT id, package_code
       FROM training_package_purchases
      WHERE user_id = $1 AND status = 'paid'
      ORDER BY paid_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [freelancerUserId],
  );
  if (currentRows[0]?.package_code === resolved.packageCode) {
    throw createAppError("This training package is already your current package.", 409, {
      exposeToClient: true,
      publicCode: "TRAINING_PACKAGE_ALREADY_CURRENT",
    });
  }

  const { rows: pendingRows } = await db.query(
    `SELECT id, stripe_checkout_session_id, checkout_url
       FROM training_package_purchases
      WHERE user_id = $1
        AND package_code = $2
        AND status = 'pending'
        AND checkout_url IS NOT NULL
        AND created_at > NOW() - INTERVAL '30 minutes'
      ORDER BY id DESC
      LIMIT 1`,
    [freelancerUserId, resolved.packageCode],
  );
  if (pendingRows[0]?.checkout_url) {
    return {
      checkoutUrl: pendingRows[0].checkout_url,
      sessionId: pendingRows[0].stripe_checkout_session_id,
      packageCode: resolved.packageCode,
      amountJod: resolved.priceJod,
      currency: CURRENCY,
      alreadyPending: true,
      membershipGranted: false,
      termStarted: false,
    };
  }

  const inserted = await db.query(
    `INSERT INTO training_package_purchases (
       user_id, package_code, package_name_ar, package_name_en, amount_jod, currency, status
     ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [
      freelancerUserId,
      resolved.packageCode,
      resolved.pkg.nameAr,
      resolved.pkg.nameEn,
      resolved.priceJod,
      CURRENCY,
    ],
  );
  const purchaseId = Number(inserted.rows[0].id);

  const stripe = deps.stripe || getStripeOrNull();
  if (!stripe) throwStripeNotConfigured();
  const clientUrl = requireStripeClientUrl();
  const returnUrls = buildFreelancerTrainingPackageCheckoutReturnUrls(clientUrl);
  const nonce = crypto.randomBytes(6).toString("hex");
  const metadata = mergeStripeCheckoutMetadata(
    buildFazaatStripeMetadata({
      paymentContext: PAYMENT_CONTEXT.TRAINING_PACKAGE,
      purpose: PURPOSE,
      userId: freelancerUserId,
      purchaseId,
      expectedAmountMinor: resolved.expectedAmountMinor,
      currency: CURRENCY,
      flow: PURCHASE_TYPE,
    }),
    {
      purpose: PURPOSE,
      purchase_type: PURCHASE_TYPE,
      training_package_code: resolved.packageCode,
      user_id: String(freelancerUserId),
      purchase_id: String(purchaseId),
      expectedAmountMinor: String(resolved.expectedAmountMinor),
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
              unit_amount: resolved.expectedAmountMinor,
              product_data: {
                name: productName.slice(0, 120),
                description: String(label).slice(0, 200),
              },
            },
          },
        ],
        metadata,
        payment_intent_data: {
          metadata,
          description:
            paymentIntentDescriptionForContext(PAYMENT_CONTEXT.TRAINING_PACKAGE) || productName,
        },
      },
      { idempotencyKey: `training_pkg_${purchaseId}_${nonce}` },
    );
  } catch (err) {
    await db.query(
      `UPDATE training_package_purchases
          SET status = 'failed', failed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'pending'`,
      [purchaseId],
    );
    throw err;
  }

  await db.query(
    `UPDATE training_package_purchases
        SET stripe_checkout_session_id = $2,
            checkout_url = $3,
            updated_at = NOW()
      WHERE id = $1`,
    [purchaseId, session.id, session.url],
  );

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    purchaseId: String(purchaseId),
    packageCode: resolved.packageCode,
    amountJod: resolved.priceJod,
    currency: CURRENCY,
    membershipGranted: false,
    termStarted: false,
  };
}

async function getMyTrainingPackages(freelancerUserId, deps = {}) {
  const userId = Number(freelancerUserId);
  const db = deps.db || getPool();
  const { rows } = await db.query(
    `SELECT id, package_code, package_name_ar, package_name_en, amount_jod, currency, status,
            stripe_checkout_session_id, paid_at, created_at
       FROM training_package_purchases
      WHERE user_id = $1
      ORDER BY id DESC
      LIMIT 50`,
    [userId],
  );
  const mapped = rows.map(mapPurchase);
  const paid = mapped
    .filter((row) => row.status === "paid")
    .sort((a, b) => {
      const at = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const bt = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      return bt - at;
    });
  const pending = mapped.find((row) => row.status === "pending") || null;
  return {
    current: paid[0] || null,
    pending,
    purchases: mapped,
  };
}

async function cancelTrainingPackageCheckout(input = {}, deps = {}) {
  const freelancerUserId = Number(input.freelancerUserId);
  const sessionId = String(input.sessionId || "").trim();
  if (!sessionId) return { cancelled: false };
  const db = deps.db || getPool();
  const { rows } = await db.query(
    `UPDATE training_package_purchases
        SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
      WHERE user_id = $1
        AND stripe_checkout_session_id = $2
        AND status = 'pending'
      RETURNING id`,
    [freelancerUserId, sessionId],
  );
  return { cancelled: rows.length > 0 };
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
  createTrainingPackageCheckoutSession,
  getMyTrainingPackages,
  cancelTrainingPackageCheckout,
  applyTrainingPackageCheckoutSessionCompleted,
  applyTrainingPackagePaymentFailed,
};
