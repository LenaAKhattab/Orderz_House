/**
 * Phase B6 — Bid Credit package commercial purchases.
 *
 * Checkout: server snapshots package terms → Stripe Checkout (JOD × 1000).
 * Fulfillment: verified webhook / server session retrieve only.
 * Success redirect never grants Bids.
 * Refund/chargeback economic reversal: PRODUCT_DECISION_REQUIRED (record only).
 */

const crypto = require("crypto");
const Stripe = require("stripe");
const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");
const { isCheckoutSessionPaymentSuccessful } = require("../utils/stripeSessionPaymentStatus");
const {
  getPrimaryClientUrl,
  buildFreelancerBidPackageCheckoutReturnUrls,
} = require("../config/clientUrl");
const { isProduction } = require("../config/env");
const {
  PAYMENT_CONTEXT,
  buildFazaatStripeMetadata,
  mergeStripeCheckoutMetadata,
  paymentIntentDescriptionForContext,
  lineItemProductNameForContext,
} = require("../utils/fazaatStripeMetadata");
const {
  getMarketplaceEconomySettings,
  isBidCreditsEngineActive,
  isBidCreditPurchasesEngineActive,
} = require("./marketplaceEconomySettingsService");
const accounting = require("./marketplaceBidCreditAccountingService");
const packagesService = require("./marketplaceBidCreditPackagesService");
const {
  BID_PACKAGE_PURCHASE_PURPOSE,
  BID_PACKAGE_PURCHASE_PROVIDER,
  BID_PACKAGE_PURCHASE_CURRENCY,
  BID_PACKAGE_PURCHASE_GRANT_SOURCE,
  BID_PACKAGE_PURCHASE_LEDGER_EVENT,
  BID_PACKAGE_PURCHASE_ERROR_CODES,
  buildBidPackagePurchaseCheckoutIdempotencyKey,
  buildBidPackagePurchaseGrantIdempotencyKey,
} = require("../constants/marketplaceBidCreditPurchases");

let purchasesTableReadyCache = null;
let purchasesFlagReadyCache = null;

function getStripeOrNull() {
  const key = process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).trim();
  if (!key) return null;
  return new Stripe(key);
}

function throwStripeNotConfigured() {
  const err = new Error(
    isProduction()
      ? "خدمة الدفع غير مفعّلة على الخادم. راجع إعداد STRIPE_SECRET_KEY أو تواصل مع الدعم."
      : "Stripe is not configured on the server (set STRIPE_SECRET_KEY).",
  );
  err.statusCode = 503;
  err.exposeToClient = true;
  err.publicCode = "STRIPE_NOT_CONFIGURED";
  throw err;
}

function requireStripeClientUrl() {
  const clientUrl = getPrimaryClientUrl();
  if (!clientUrl) {
    const err = new Error("CLIENT_URL is not configured (set a single origin, e.g. https://orderzhouse.com).");
    err.statusCode = 500;
    throw err;
  }
  try {
    // eslint-disable-next-line no-new
    new URL(clientUrl);
  } catch {
    const err = new Error("CLIENT_URL must be a single valid http(s) URL.");
    err.statusCode = 500;
    err.exposeToClient = true;
    throw err;
  }
  return clientUrl;
}

async function bidCreditPurchasesSchemaReady(db = pool) {
  if (purchasesTableReadyCache === true) return true;
  if (purchasesTableReadyCache === false) return false;
  const { rows } = await db.query(
    `SELECT to_regclass('public.marketplace_bid_credit_purchases') AS t,
            EXISTS (
              SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='marketplace_economy_settings'
                 AND column_name='bid_credit_purchases_enabled'
            ) AS flag,
            EXISTS (
              SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='marketplace_bid_credit_packages'
                 AND column_name='validity_days'
            ) AS validity
    `,
  );
  purchasesTableReadyCache = Boolean(rows[0]?.t) && Boolean(rows[0]?.flag) && Boolean(rows[0]?.validity);
  purchasesFlagReadyCache = Boolean(rows[0]?.flag);
  return purchasesTableReadyCache;
}

function clearBidCreditPurchasesSchemaCache() {
  purchasesTableReadyCache = null;
  purchasesFlagReadyCache = null;
}

function mapPurchaseRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    freelancerUserId: String(row.freelancer_user_id),
    packageId: String(row.package_id),
    packageCodeSnapshot: row.package_code_snapshot,
    bidQuantitySnapshot: Number(row.bid_quantity_snapshot),
    priceJodSnapshot: Number(row.price_jod_snapshot),
    currency: row.currency,
    validityDaysSnapshot: Number(row.validity_days_snapshot),
    expectedAmountMinor: Number(row.expected_amount_minor),
    status: row.status,
    paymentReversalStatus: row.payment_reversal_status || "none",
    provider: row.provider,
    stripeCheckoutSessionId: row.stripe_checkout_session_id || null,
    stripePaymentIntentId: row.stripe_payment_intent_id || null,
    fulfilledGrantId: row.fulfilled_grant_id != null ? String(row.fulfilled_grant_id) : null,
    checkoutCreatedAt: row.checkout_created_at || null,
    paidAt: row.paid_at || null,
    fulfilledAt: row.fulfilled_at || null,
    cancelledAt: row.cancelled_at || null,
    failedAt: row.failed_at || null,
    failureReason: row.failure_reason || null,
    providerRefundRecordedAt: row.provider_refund_recorded_at || null,
    providerDisputeRecordedAt: row.provider_dispute_recorded_at || null,
    providerRefundStatus: row.provider_refund_status || null,
    providerRefundAmountMinor:
      row.provider_refund_amount_minor != null ? Number(row.provider_refund_amount_minor) : null,
    consumedBeforeReversal:
      row.consumed_before_reversal != null ? Number(row.consumed_before_reversal) : null,
    unusedRevokedAmount: Number(row.unused_revoked_amount) || 0,
    unusedFrozenAmount: Number(row.unused_frozen_amount) || 0,
    manualReviewRequired: Boolean(row.manual_review_required),
    manualReviewResolution: row.manual_review_resolution || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function assertPurchaseEnginesActive(client = pool) {
  if (!(await bidCreditPurchasesSchemaReady(client))) {
    throw createAppError("Bid package purchases schema is not applied yet.", 503, {
      exposeToClient: true,
      publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_PURCHASES_SCHEMA_NOT_READY,
    });
  }
  const settings = await getMarketplaceEconomySettings(client);
  if (!isBidCreditsEngineActive(settings)) {
    throw createAppError("Bid Credits engine is not enabled.", 409, {
      exposeToClient: true,
      publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_CREDITS_ENGINE_OFF,
    });
  }
  if (!isBidCreditPurchasesEngineActive(settings)) {
    throw createAppError("Bid package purchases are not enabled.", 409, {
      exposeToClient: true,
      publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_CREDIT_PURCHASES_ENGINE_OFF,
    });
  }
  return settings;
}

async function assertActiveFreelancer(client, freelancerUserId) {
  const { rows } = await client.query(
    `SELECT id, role, is_active, email FROM users WHERE id = $1`,
    [Number(freelancerUserId)],
  );
  const user = rows[0];
  if (!user || user.role !== "freelancer" || user.is_active !== true) {
    throw createAppError("Freelancer not found or inactive.", 403, {
      exposeToClient: true,
      publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.INVALID_FREELANCER,
    });
  }
  return user;
}

function assertPackagePurchasable(pkg) {
  if (!pkg) {
    throw createAppError("Package not found.", 404, {
      exposeToClient: true,
      publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_PACKAGE_NOT_FOUND,
    });
  }
  if (!pkg.isActive) {
    throw createAppError("Package is not active.", 409, {
      exposeToClient: true,
      publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_PACKAGE_INACTIVE,
    });
  }
  if (
    !Number.isInteger(Number(pkg.validityDays)) ||
    Number(pkg.validityDays) < 1 ||
    !(Number(pkg.priceJod) > 0) ||
    !Number.isInteger(Number(pkg.bidQuantity)) ||
    Number(pkg.bidQuantity) < 1
  ) {
    throw createAppError("Package is not purchasable (price, quantity, or validity invalid).", 409, {
      exposeToClient: true,
      publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_PACKAGE_NOT_PURCHASABLE,
    });
  }
}

/**
 * Create purchase snapshot + Stripe Checkout Session.
 * Client price/quantity/validity are ignored — only packageId is used.
 */
async function createBidCreditPackageCheckout({
  freelancerUserId,
  packageId,
  // Intentionally unused / ignored (client tampering protection):
  priceJod: _clientPrice = undefined,
  bidQuantity: _clientQty = undefined,
  validityDays: _clientValidity = undefined,
} = {}) {
  void _clientPrice;
  void _clientQty;
  void _clientValidity;

  await assertPurchaseEnginesActive();
  const stripe = getStripeOrNull();
  if (!stripe) throwStripeNotConfigured();
  const clientUrl = requireStripeClientUrl();
  const returnUrls = buildFreelancerBidPackageCheckoutReturnUrls(clientUrl);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await assertActiveFreelancer(client, freelancerUserId);
    const pkg = await packagesService.getBidCreditPackageById(packageId);
    assertPackagePurchasable(pkg);

    const expectedAmountMinor = amountMajorToStripeMinor(pkg.priceJod, BID_PACKAGE_PURCHASE_CURRENCY);
    if (!expectedAmountMinor || expectedAmountMinor < 1) {
      throw createAppError("Unable to convert package price to Stripe amount.", 500);
    }

    const nonce = crypto.randomBytes(8).toString("hex");
    const idempotencyKey = buildBidPackagePurchaseCheckoutIdempotencyKey(
      freelancerUserId,
      packageId,
      nonce,
    );

    const { rows } = await client.query(
      `INSERT INTO marketplace_bid_credit_purchases (
         freelancer_user_id, package_id,
         package_code_snapshot, bid_quantity_snapshot, price_jod_snapshot,
         currency, validity_days_snapshot, expected_amount_minor,
         status, provider, idempotency_key
       ) VALUES (
         $1, $2,
         $3, $4, $5::numeric,
         $6, $7, $8,
         'pending', $9, $10
       )
       RETURNING *`,
      [
        Number(freelancerUserId),
        Number(packageId),
        pkg.code,
        Number(pkg.bidQuantity),
        Number(pkg.priceJod).toFixed(3),
        BID_PACKAGE_PURCHASE_CURRENCY,
        Number(pkg.validityDays),
        expectedAmountMinor,
        BID_PACKAGE_PURCHASE_PROVIDER,
        idempotencyKey,
      ],
    );
    const purchase = rows[0];
    const grantIdem = buildBidPackagePurchaseGrantIdempotencyKey(purchase.id);

    const sessionMetadata = mergeStripeCheckoutMetadata(
      buildFazaatStripeMetadata({
        paymentContext: PAYMENT_CONTEXT.BID_CREDIT_PACKAGE,
        purpose: BID_PACKAGE_PURCHASE_PURPOSE,
        userId: freelancerUserId,
        userEmail: user.email,
        purchaseId: purchase.id,
        packageId: pkg.id,
        internalPaymentId: purchase.id,
        expectedAmountMinor,
        currency: BID_PACKAGE_PURCHASE_CURRENCY,
      }),
      {
        purpose: BID_PACKAGE_PURCHASE_PURPOSE,
        purchaseId: String(purchase.id),
        freelancerUserId: String(freelancerUserId),
        packageId: String(pkg.id),
        expectedAmountMinor: String(expectedAmountMinor),
      },
    );

    const productName =
      lineItemProductNameForContext(PAYMENT_CONTEXT.BID_CREDIT_PACKAGE) ||
      "FAZAAT - Orderz House - Bid Credit Package";
    const piDescription =
      paymentIntentDescriptionForContext(PAYMENT_CONTEXT.BID_CREDIT_PACKAGE) || productName;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: returnUrls.successUrl,
      cancel_url: returnUrls.cancelUrl,
      client_reference_id: `bid_pkg_purchase:${purchase.id}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "jod",
            unit_amount: expectedAmountMinor,
            product_data: {
              name: productName,
              description: `${pkg.bidQuantity} Bids · ${pkg.validityDays} days`,
            },
          },
        },
      ],
      metadata: sessionMetadata,
      payment_intent_data: {
        metadata: sessionMetadata,
        description: piDescription,
      },
    });

    const { rows: updated } = await client.query(
      `UPDATE marketplace_bid_credit_purchases
          SET status = 'checkout_created',
              stripe_checkout_session_id = $2,
              grant_idempotency_key = $3,
              checkout_created_at = NOW(),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [purchase.id, session.id, grantIdem],
    );

    await client.query("COMMIT");
    return {
      purchase: mapPurchaseRow(updated[0]),
      checkoutUrl: session.url,
      sessionId: session.id,
      // Echo ignored client tamper fields as null for clarity in tests
      clientControlledEconomics: null,
    };
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

async function findPurchaseByIdForUpdate(client, purchaseId) {
  const { rows } = await client.query(
    `SELECT * FROM marketplace_bid_credit_purchases WHERE id = $1 FOR UPDATE`,
    [Number(purchaseId)],
  );
  return rows[0] || null;
}

async function findPurchaseBySessionId(client, sessionId) {
  const { rows } = await client.query(
    `SELECT * FROM marketplace_bid_credit_purchases WHERE stripe_checkout_session_id = $1`,
    [String(sessionId)],
  );
  return rows[0] || null;
}

/**
 * Fulfill a paid purchase: create Bid grant from immutable snapshot.
 * Idempotent. Call only after payment verified.
 */
async function fulfillBidCreditPurchaseFromVerifiedPayment({
  client,
  purchaseRow,
  stripePaymentIntentId = null,
  stripeEventId = null,
  paidAt = new Date(),
  sessionAmountTotal = null,
  sessionCurrency = null,
} = {}) {
  if (!client) throw createAppError("fulfill requires open DB client", 500);
  if (!purchaseRow) {
    return { fulfilled: false, status: "ignored", reason: "purchase_not_found" };
  }

  const locked = await findPurchaseByIdForUpdate(client, purchaseRow.id);
  if (!locked) {
    return { fulfilled: false, status: "ignored", reason: "purchase_not_found" };
  }

  if (locked.status === "fulfilled" && locked.fulfilled_grant_id) {
    return {
      fulfilled: false,
      status: "already_applied",
      reason: "already_fulfilled",
      purchase: mapPurchaseRow(locked),
    };
  }

  if (locked.status === "cancelled" || locked.status === "failed") {
    // Do not resurrect cancelled/failed; fail closed if payment somehow arrives later after cancel —
    // but if already checkout_created and payment succeeds, we allow fulfill (cancel only from abandon).
    // Strict: cancelled stays cancelled.
    return {
      fulfilled: false,
      status: "ignored",
      reason: `purchase_${locked.status}`,
      purchase: mapPurchaseRow(locked),
    };
  }

  // Amount / currency validation against snapshot
  if (sessionAmountTotal != null && Number(sessionAmountTotal) !== Number(locked.expected_amount_minor)) {
    await client.query(
      `UPDATE marketplace_bid_credit_purchases
          SET status = 'failed',
              failed_at = COALESCE(failed_at, NOW()),
              failure_reason = 'amount_mismatch',
              updated_at = NOW()
        WHERE id = $1 AND status NOT IN ('fulfilled')`,
      [locked.id],
    );
    return { fulfilled: false, status: "ignored", reason: "amount_mismatch" };
  }
  if (
    sessionCurrency != null &&
    String(sessionCurrency).toLowerCase() !== "jod"
  ) {
    await client.query(
      `UPDATE marketplace_bid_credit_purchases
          SET status = 'failed',
              failed_at = COALESCE(failed_at, NOW()),
              failure_reason = 'currency_mismatch',
              updated_at = NOW()
        WHERE id = $1 AND status NOT IN ('fulfilled')`,
      [locked.id],
    );
    return { fulfilled: false, status: "ignored", reason: "currency_mismatch" };
  }

  const grantKey =
    locked.grant_idempotency_key || buildBidPackagePurchaseGrantIdempotencyKey(locked.id);
  const grantedAt = new Date(paidAt);
  const expiresAt = new Date(
    grantedAt.getTime() + Number(locked.validity_days_snapshot) * 86400000,
  );

  // Mark paid before grant for observability
  await client.query(
    `UPDATE marketplace_bid_credit_purchases
        SET status = CASE WHEN status = 'fulfilled' THEN status ELSE 'paid' END,
            paid_at = COALESCE(paid_at, $2),
            stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
            stripe_event_id = COALESCE($4, stripe_event_id),
            updated_at = NOW()
      WHERE id = $1`,
    [locked.id, grantedAt.toISOString(), stripePaymentIntentId, stripeEventId],
  );

  const created = await accounting.createBidCreditGrant({
    client,
    freelancerUserId: locked.freelancer_user_id,
    sourceType: BID_PACKAGE_PURCHASE_GRANT_SOURCE,
    amount: Number(locked.bid_quantity_snapshot),
    expiresAt,
    eventType: BID_PACKAGE_PURCHASE_LEDGER_EVENT,
    idempotencyKey: grantKey,
    reason: "bid_package_purchase",
    referenceType: "marketplace_bid_credit_purchase",
    referenceId: String(locked.id),
    metadata: {
      purchaseId: String(locked.id),
      packageId: String(locked.package_id),
      packageCode: locked.package_code_snapshot,
      validityDays: Number(locked.validity_days_snapshot),
      priceJod: Number(locked.price_jod_snapshot),
      phase: "B6",
    },
    grantedAt,
  });

  const grantId = created.grant?.id ? Number(created.grant.id) : null;
  const { rows: fulfilled } = await client.query(
    `UPDATE marketplace_bid_credit_purchases
        SET status = 'fulfilled',
            fulfilled_grant_id = COALESCE($2, fulfilled_grant_id),
            grant_idempotency_key = COALESCE(grant_idempotency_key, $3),
            fulfilled_at = COALESCE(fulfilled_at, NOW()),
            paid_at = COALESCE(paid_at, $4),
            stripe_payment_intent_id = COALESCE($5, stripe_payment_intent_id),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [locked.id, grantId, grantKey, grantedAt.toISOString(), stripePaymentIntentId],
  );

  return {
    fulfilled: Boolean(created.created || created.idempotent),
    status: created.idempotent && locked.status === "fulfilled" ? "already_applied" : "applied",
    purchase: mapPurchaseRow(fulfilled[0]),
    grant: created.grant,
  };
}

/**
 * Webhook / reconcile entry: apply checkout.session.completed for Bid packages.
 */
async function applyBidCreditPackageCheckoutSessionCompleted(session, meta = {}, dbPool = pool) {
  const purchaseId = Number(meta.purchaseId || meta.purchase_id || 0);
  const sessionId = session?.id || null;
  if (!sessionId && !purchaseId) {
    return { status: "ignored", reason: "bid_pkg_missing_purchase_ref" };
  }
  if (!isCheckoutSessionPaymentSuccessful(session)) {
    return { status: "ignored", reason: "bid_pkg_checkout_not_paid" };
  }

  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    let purchase =
      purchaseId > 0
        ? await findPurchaseByIdForUpdate(client, purchaseId)
        : await findPurchaseBySessionId(client, sessionId);
    if (!purchase && sessionId) {
      purchase = await findPurchaseBySessionId(client, sessionId);
      if (purchase) {
        purchase = await findPurchaseByIdForUpdate(client, purchase.id);
      }
    }
    if (!purchase) {
      await client.query("COMMIT");
      return { status: "ignored", reason: "bid_pkg_purchase_not_found" };
    }
    if (sessionId && purchase.stripe_checkout_session_id && purchase.stripe_checkout_session_id !== sessionId) {
      await client.query("COMMIT");
      return { status: "ignored", reason: "bid_pkg_session_mismatch" };
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null;

    const result = await fulfillBidCreditPurchaseFromVerifiedPayment({
      client,
      purchaseRow: purchase,
      stripePaymentIntentId: paymentIntentId,
      paidAt: new Date(),
      sessionAmountTotal: session.amount_total != null ? Number(session.amount_total) : null,
      sessionCurrency: session.currency || null,
    });
    await client.query("COMMIT");
    return {
      status: result.status === "already_applied" ? "already_applied" : result.status === "applied" ? "applied" : "ignored",
      reason: result.reason || null,
      purchase: result.purchase,
    };
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
 * Server-side confirm after redirect: retrieve Stripe session and fulfill if paid.
 * Does NOT trust the success page alone.
 */
async function confirmBidCreditPackageCheckout({ freelancerUserId, sessionId } = {}) {
  await assertPurchaseEnginesActive();
  const stripe = getStripeOrNull();
  if (!stripe) throwStripeNotConfigured();
  if (!sessionId) {
    throw createAppError("sessionId is required.", 400, { exposeToClient: true });
  }

  const session = await stripe.checkout.sessions.retrieve(String(sessionId));
  const meta = session.metadata || {};
  const purchaseId = Number(meta.purchaseId || meta.purchase_id || 0);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let purchase = await findPurchaseBySessionId(client, session.id);
    if (!purchase && purchaseId > 0) {
      purchase = await findPurchaseByIdForUpdate(client, purchaseId);
    } else if (purchase) {
      purchase = await findPurchaseByIdForUpdate(client, purchase.id);
    }
    if (!purchase) {
      throw createAppError("Purchase not found.", 404, {
        exposeToClient: true,
        publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_PURCHASE_NOT_FOUND,
      });
    }
    if (Number(purchase.freelancer_user_id) !== Number(freelancerUserId)) {
      throw createAppError("Forbidden.", 403, {
        exposeToClient: true,
        publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_PURCHASE_FORBIDDEN,
      });
    }

    if (!isCheckoutSessionPaymentSuccessful(session)) {
      if (String(session.status || "").toLowerCase() === "expired") {
        await client.query(
          `UPDATE marketplace_bid_credit_purchases
              SET status = CASE WHEN status IN ('fulfilled','paid') THEN status ELSE 'cancelled' END,
                  cancelled_at = COALESCE(cancelled_at, NOW()),
                  updated_at = NOW()
            WHERE id = $1 AND status IN ('pending','checkout_created')`,
          [purchase.id],
        );
      }
      await client.query("COMMIT");
      const again = await pool.query(
        `SELECT * FROM marketplace_bid_credit_purchases WHERE id = $1`,
        [purchase.id],
      );
      return { purchase: mapPurchaseRow(again.rows[0]), fulfilled: false, paid: false };
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null;
    const result = await fulfillBidCreditPurchaseFromVerifiedPayment({
      client,
      purchaseRow: purchase,
      stripePaymentIntentId: paymentIntentId,
      paidAt: new Date(),
      sessionAmountTotal: session.amount_total != null ? Number(session.amount_total) : null,
      sessionCurrency: session.currency || null,
    });
    await client.query("COMMIT");
    return {
      purchase: result.purchase,
      fulfilled: result.status === "applied" || result.status === "already_applied",
      paid: true,
    };
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

async function markBidCreditPackageCheckoutCancelled({ freelancerUserId, sessionId } = {}) {
  if (!(await bidCreditPurchasesSchemaReady())) return null;
  const { rows } = await pool.query(
    `UPDATE marketplace_bid_credit_purchases
        SET status = 'cancelled',
            cancelled_at = COALESCE(cancelled_at, NOW()),
            updated_at = NOW()
      WHERE stripe_checkout_session_id = $1
        AND freelancer_user_id = $2
        AND status IN ('pending', 'checkout_created')
      RETURNING *`,
    [String(sessionId), Number(freelancerUserId)],
  );
  return mapPurchaseRow(rows[0]);
}

/**
 * Record provider refund/dispute only — no Bid economic reversal (owner decision pending).
 */
async function recordBidPackageProviderRefundOrDispute({
  purchaseId,
  kind = "refund",
} = {}) {
  if (!(await bidCreditPurchasesSchemaReady())) return null;
  const col =
    kind === "dispute" ? "provider_dispute_recorded_at" : "provider_refund_recorded_at";
  const { rows } = await pool.query(
    `UPDATE marketplace_bid_credit_purchases
        SET ${col} = COALESCE(${col}, NOW()),
            provider_refund_status = COALESCE(provider_refund_status, $2),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [Number(purchaseId), kind],
  );
  return mapPurchaseRow(rows[0]);
}

async function recordBidPackageProviderRefundOrDisputeByPaymentIntent({
  paymentIntentId,
  kind = "refund",
} = {}) {
  if (!(await bidCreditPurchasesSchemaReady())) return null;
  if (!paymentIntentId) return null;
  const col =
    kind === "dispute" ? "provider_dispute_recorded_at" : "provider_refund_recorded_at";
  const { rows } = await pool.query(
    `UPDATE marketplace_bid_credit_purchases
        SET ${col} = COALESCE(${col}, NOW()),
            provider_refund_status = COALESCE(provider_refund_status, $2),
            updated_at = NOW()
      WHERE stripe_payment_intent_id = $1
      RETURNING *`,
    [String(paymentIntentId), kind],
  );
  return mapPurchaseRow(rows[0]);
}

async function listMyBidCreditPurchases(freelancerUserId, { limit = 50, offset = 0 } = {}) {
  if (!(await bidCreditPurchasesSchemaReady())) return [];
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const off = Math.max(Number(offset) || 0, 0);
  const { rows } = await pool.query(
    `SELECT * FROM marketplace_bid_credit_purchases
      WHERE freelancer_user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [Number(freelancerUserId), lim, off],
  );
  return rows.map(mapPurchaseRow);
}

async function getMyBidCreditPurchase(purchaseId, freelancerUserId) {
  if (!(await bidCreditPurchasesSchemaReady())) return null;
  const { rows } = await pool.query(
    `SELECT * FROM marketplace_bid_credit_purchases WHERE id = $1 LIMIT 1`,
    [Number(purchaseId)],
  );
  const row = rows[0];
  if (!row) return null;
  if (Number(row.freelancer_user_id) !== Number(freelancerUserId)) {
    throw createAppError("Forbidden.", 403, {
      exposeToClient: true,
      publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_PURCHASE_FORBIDDEN,
    });
  }
  return mapPurchaseRow(row);
}

async function listAdminBidCreditPurchases({ limit = 50, offset = 0, freelancerUserId = null } = {}) {
  if (!(await bidCreditPurchasesSchemaReady())) return [];
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const { rows } = await pool.query(
    `SELECT * FROM marketplace_bid_credit_purchases
      WHERE ($1::bigint IS NULL OR freelancer_user_id = $1)
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [freelancerUserId != null ? Number(freelancerUserId) : null, lim, off],
  );
  return rows.map(mapPurchaseRow);
}

module.exports = {
  bidCreditPurchasesSchemaReady,
  clearBidCreditPurchasesSchemaCache,
  mapPurchaseRow,
  createBidCreditPackageCheckout,
  confirmBidCreditPackageCheckout,
  markBidCreditPackageCheckoutCancelled,
  applyBidCreditPackageCheckoutSessionCompleted,
  fulfillBidCreditPurchaseFromVerifiedPayment,
  recordBidPackageProviderRefundOrDispute,
  recordBidPackageProviderRefundOrDisputeByPaymentIntent,
  listMyBidCreditPurchases,
  getMyBidCreditPurchase,
  listAdminBidCreditPurchases,
  BID_PACKAGE_PURCHASE_PURPOSE,
};
