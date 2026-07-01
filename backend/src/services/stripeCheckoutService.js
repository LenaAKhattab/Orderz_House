const Stripe = require("stripe");
const { pool } = require("../config/db");
const {
  resolvePaidCheckoutSessionForClientOrder,
  PURPOSE_FIXED,
  PURPOSE_BID,
} = require("../utils/stripeCheckoutReconcile");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");
const orderFlowService = require("./orderFlowService");
const subscriptionsService = require("./subscriptionsService");
const ordersService = require("./ordersService");
const notificationService = require("./notificationService");
const notificationEventsService = require("./notificationEventsService");
const { planEligibleForFreelancerSelfCheckout, effectiveCheckoutPriceJod } = require("./plansService");
const {
  activationFeeMinorUnits,
  buildActivationFeeStripeLineItem,
  freelancerNeedsSubscriptionActivationFee,
  recordActivationFeeFromStripeSession,
  prepareFreelancerCheckoutSessionCreation,
  trackFreelancerCheckoutSession,
  markCheckoutSessionStatus,
  supersedeOpenCheckoutSessions,
  CHECKOUT_KIND,
  CHECKOUT_SESSION_STATUS,
  PURPOSE_ACTIVATION_FEE_ONLY,
  PURPOSE_SUBSCRIPTION_PURCHASE,
  isFreeDisplayPlanEligibleForActivationFeeCheckout,
} = require("./subscriptionActivationFeeService");
const { isCheckoutSessionPaymentSuccessful } = require("../utils/stripeSessionPaymentStatus");
const { getPrimaryClientUrl } = require("../config/clientUrl");
const { isProduction } = require("../config/env");
const freelancerSubscriptionPaymentNotifications = require("./freelancerSubscriptionPaymentNotifications");
const {
  PAYMENT_CONTEXT,
  buildFazaatStripeMetadata,
  mergeStripeCheckoutMetadata,
  paymentIntentDescriptionForContext,
  lineItemProductNameForContext,
} = require("../utils/fazaatStripeMetadata");

/** Stripe redirect URLs must use one origin; CLIENT_URL may list multiple values for CORS — take first via getPrimaryClientUrl. */
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
    const err = new Error("CLIENT_URL must be a single valid http(s) URL (use CORS_ORIGINS for extra origins).");
    err.statusCode = 500;
    err.exposeToClient = true;
    throw err;
  }
  return clientUrl;
}

async function safeNotify(run) {
  try {
    await run();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications]", err?.message || err);
  }
}

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

function hasPricedBiddingRow(order) {
  if (!order) return false;
  if (order.project_type !== "bidding") return false;
  const min = Number(order.bid_budget_min);
  const max = Number(order.bid_budget_max);
  return Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min;
}

async function getUserEmailById(userId, db) {
  const runner = db || pool;
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return null;
  const { rows } = await runner.query(`SELECT email FROM users WHERE id = $1 LIMIT 1`, [uid]);
  return rows[0]?.email ? String(rows[0].email).trim() : null;
}

function buildCheckoutPaymentIntentData(sessionMetadata, paymentContext) {
  const description = paymentIntentDescriptionForContext(paymentContext);
  return description
    ? { metadata: sessionMetadata, description }
    : { metadata: sessionMetadata };
}

async function insertPendingPayment({
  db,
  orderId,
  clientId,
  bidId = null,
  amountMajor,
  purpose,
  checkoutSessionId,
}) {
  await db.query(
    `INSERT INTO client_order_payments (
      order_id, client_id, bid_id, amount,
      payment_provider, provider_checkout_session_id, status, purpose, created_at
    ) VALUES ($1, $2, $3, $4, 'stripe', $5, 'pending', $6, NOW())`,
    [Number(orderId), Number(clientId), bidId ? Number(bidId) : null, Number(amountMajor), checkoutSessionId || null, String(purpose)],
  );
}

async function createClientFixedOrderCheckoutSession({ clientUserId, orderId }) {
  const stripe = getStripeOrNull();
  if (!stripe) {
    throwStripeNotConfigured();
  }

  const uid = Number(clientUserId);
  const oid = Number(orderId);
  if (!Number.isInteger(uid) || uid < 1 || !Number.isInteger(oid) || oid < 1) {
    const err = new Error("Invalid order.");
    err.statusCode = 400;
    throw err;
  }

  const clientUrl = requireStripeClientUrl();

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query(
      `SELECT *
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [oid],
    );
    const order = rows[0];
    if (!order) {
      const err = new Error("Order not found.");
      err.statusCode = 404;
      throw err;
    }
    if (order.source_type !== "client_created" || Number(order.created_by_user_id) !== uid) {
      const err = new Error("You cannot pay for this order.");
      err.statusCode = 403;
      throw err;
    }
    if (order.project_type !== "fixed") {
      const err = new Error("Checkout is only used for fixed-price client orders.");
      err.statusCode = 400;
      throw err;
    }
    if (order.order_status !== orderFlowService.ORDER_STATUSES.PENDING_PAYMENT) {
      const err = new Error("This order is not awaiting payment.");
      err.statusCode = 409;
      throw err;
    }
    if (order.payment_status !== "pending" && order.payment_status !== "unpaid") {
      const err = new Error("This order is not awaiting payment.");
      err.statusCode = 409;
      throw err;
    }

    const stripeCurrency = "jod";
    const budget = order.budget != null ? Number(order.budget) : null;
    if (!Number.isFinite(budget) || budget <= 0) {
      const err = new Error("Order is missing a valid payment amount.");
      err.statusCode = 400;
      throw err;
    }

    const amountMinor = amountMajorToStripeMinor(budget, "JOD");
    if (amountMinor == null || amountMinor < 1) {
      const err = new Error("Could not compute payment amount for Stripe.");
      err.statusCode = 400;
      throw err;
    }

    const userEmail = await getUserEmailById(uid, db);
    const currencyUpper = stripeCurrency.toUpperCase();
    const legacyMeta = {
      orderId: String(oid),
      purpose: "client_fixed_order",
      clientUserId: String(uid),
      expectedAmountMinor: String(amountMinor),
      currency: currencyUpper,
    };
    const sessionMetadata = mergeStripeCheckoutMetadata(
      buildFazaatStripeMetadata({
        paymentContext: PAYMENT_CONTEXT.CLIENT_FIXED_ORDER,
        purpose: "client_fixed_order",
        userId: uid,
        userEmail,
        orderId: oid,
        expectedAmountMinor: amountMinor,
        currency: currencyUpper,
      }),
      legacyMeta,
    );

    const successUrl = `${clientUrl}/dashboard/client/my-orders?paid=1&orderId=${encodeURIComponent(String(oid))}`;
    const cancelUrl = `${clientUrl}/dashboard/client/my-orders?cancelled=1&orderId=${encodeURIComponent(String(oid))}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: String(oid),
      metadata: sessionMetadata,
      payment_intent_data: buildCheckoutPaymentIntentData(sessionMetadata, PAYMENT_CONTEXT.CLIENT_FIXED_ORDER),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: stripeCurrency,
            unit_amount: amountMinor,
            product_data: {
              name: lineItemProductNameForContext(PAYMENT_CONTEXT.CLIENT_FIXED_ORDER).slice(0, 120),
              description: String(order.title || "Order").slice(0, 500),
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    await db.query(
      `UPDATE orders
         SET stripe_checkout_session_id = $2,
             stripe_checkout_expected_amount_minor = $3,
             updated_at = NOW()
       WHERE id = $1`,
      [oid, session.id, amountMinor],
    );

    await insertPendingPayment({
      db,
      orderId: oid,
      clientId: uid,
      bidId: null,
      amountMajor: budget,
      purpose: "fixed_order_creation",
      checkoutSessionId: session.id,
    });
    await safeNotify(() =>
      notificationService.createIfNotExists(
        {
          recipientUserId: Number(order.created_by_user_id),
          recipientRole: "client",
          actorUserId: null,
          type: "order.payment.started",
          title: "تم بدء عملية الدفع",
          message: "تم إنشاء جلسة الدفع للطلب، أكمل الدفع للمتابعة.",
          entityType: "order",
          entityId: Number(oid),
          link: `/dashboard/client/my-orders?orderId=${encodeURIComponent(String(oid))}`,
          priority: "high",
          metadata: { orderId: String(oid), purpose: "fixed_order_creation" },
        },
        `payment_started_${String(oid)}`,
        db,
      ),
    );

    await db.query("COMMIT");

    if (!session.url) {
      const err = new Error("Stripe did not return a checkout URL.");
      err.statusCode = 502;
      throw err;
    }

    return { checkoutUrl: session.url, sessionId: session.id };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

async function createClientSelectedBidCheckoutSession({ clientUserId, orderId, bidId }) {
  const stripe = getStripeOrNull();
  if (!stripe) {
    throwStripeNotConfigured();
  }

  const uid = Number(clientUserId);
  const oid = Number(orderId);
  const bid = Number(bidId);
  if (!Number.isInteger(uid) || uid < 1 || !Number.isInteger(oid) || oid < 1 || !Number.isInteger(bid) || bid < 1) {
    const err = new Error("Invalid order or bid.");
    err.statusCode = 400;
    throw err;
  }

  const clientUrl = requireStripeClientUrl();

  const db = await pool.connect();
  try {
    await db.query("BEGIN");

    const { rows } = await db.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [oid]);
    const order = rows[0];
    if (!order) {
      const err = new Error("Order not found.");
      err.statusCode = 404;
      throw err;
    }
    if (order.source_type !== "client_created" || Number(order.created_by_user_id) !== uid) {
      const err = new Error("You cannot select bid for this order.");
      err.statusCode = 403;
      throw err;
    }
    if (!hasPricedBiddingRow(order)) {
      const err = new Error("This order does not support bid payment flow.");
      err.statusCode = 409;
      throw err;
    }
    if (!order.is_published || !order.is_open_for_pool || order.assigned_freelancer_id) {
      const err = new Error("Order is not available for bid selection.");
      err.statusCode = 409;
      throw err;
    }
    if (
      order.order_status !== orderFlowService.ORDER_STATUSES.OPEN_FOR_BIDS &&
      order.order_status !== orderFlowService.ORDER_STATUSES.AWAITING_PAYMENT_AFTER_BID_SELECTION
    ) {
      const err = new Error("Order is not available for bid selection.");
      err.statusCode = 409;
      throw err;
    }

    const { rows: bidRows } = await db.query(`SELECT * FROM order_freelancer_bids WHERE id = $1 AND order_id = $2 FOR UPDATE`, [bid, oid]);
    const selectedBid = bidRows[0];
    if (!selectedBid) {
      const err = new Error("Bid not found.");
      err.statusCode = 404;
      throw err;
    }
    if (!["pending", "selected_pending_payment"].includes(String(selectedBid.status || ""))) {
      const err = new Error("Bid is not available for selection.");
      err.statusCode = 409;
      throw err;
    }

    const amountMajor = Number(selectedBid.amount);
    const min = Number(order.bid_budget_min);
    const max = Number(order.bid_budget_max);
    if (!Number.isFinite(amountMajor) || amountMajor < min || amountMajor > max) {
      const err = new Error("Bid amount is out of allowed range.");
      err.statusCode = 400;
      throw err;
    }

    const stripeCurrency = "jod";
    const amountMinor = amountMajorToStripeMinor(amountMajor, "JOD");
    if (!Number.isInteger(amountMinor) || amountMinor < 1) {
      const err = new Error("Could not compute payment amount for Stripe.");
      err.statusCode = 400;
      throw err;
    }

    if (order.selected_bid_id && Number(order.selected_bid_id) !== bid) {
      await db.query(
        `UPDATE order_freelancer_bids
           SET status = 'pending', updated_at = NOW()
         WHERE id = $1
           AND status = 'selected_pending_payment'`,
        [Number(order.selected_bid_id)],
      );
    }

    await db.query(`UPDATE order_freelancer_bids SET status = 'selected_pending_payment', updated_at = NOW() WHERE id = $1`, [bid]);
    await db.query(
      `UPDATE orders
         SET selected_bid_id = $2,
             payment_required = TRUE,
             payment_status = 'pending',
             order_status = $3,
             updated_at = NOW()
       WHERE id = $1`,
      [oid, bid, orderFlowService.ORDER_STATUSES.AWAITING_PAYMENT_AFTER_BID_SELECTION],
    );

    const successUrl = `${clientUrl}/dashboard/client/my-orders?paid=1&orderId=${encodeURIComponent(String(oid))}&bidId=${encodeURIComponent(
      String(bid),
    )}`;
    const cancelUrl = `${clientUrl}/dashboard/client/my-orders?cancelled=1&orderId=${encodeURIComponent(String(oid))}&bidId=${encodeURIComponent(
      String(bid),
    )}`;

    const userEmail = await getUserEmailById(uid, db);
    const currencyUpper = stripeCurrency.toUpperCase();
    const legacyMeta = {
      orderId: String(oid),
      bidId: String(bid),
      purpose: "client_selected_bid",
      clientUserId: String(uid),
      expectedAmountMinor: String(amountMinor),
      currency: currencyUpper,
    };
    const sessionMetadata = mergeStripeCheckoutMetadata(
      buildFazaatStripeMetadata({
        paymentContext: PAYMENT_CONTEXT.CLIENT_SELECTED_BID,
        purpose: "client_selected_bid",
        userId: uid,
        userEmail,
        orderId: oid,
        bidId: bid,
        expectedAmountMinor: amountMinor,
        currency: currencyUpper,
      }),
      legacyMeta,
    );

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: `${oid}:${bid}`,
      metadata: sessionMetadata,
      payment_intent_data: buildCheckoutPaymentIntentData(sessionMetadata, PAYMENT_CONTEXT.CLIENT_SELECTED_BID),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: stripeCurrency,
            unit_amount: amountMinor,
            product_data: {
              name: lineItemProductNameForContext(PAYMENT_CONTEXT.CLIENT_SELECTED_BID).slice(0, 120),
              description: String(order.title || "Order").slice(0, 500),
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    await db.query(
      `UPDATE orders
         SET stripe_checkout_session_id = $2,
             stripe_checkout_expected_amount_minor = $3,
             updated_at = NOW()
       WHERE id = $1`,
      [oid, session.id, amountMinor],
    );

    await insertPendingPayment({
      db,
      orderId: oid,
      clientId: uid,
      bidId: bid,
      amountMajor,
      purpose: "selected_bid_payment",
      checkoutSessionId: session.id,
    });
    await safeNotify(() =>
      notificationService.createIfNotExists(
        {
          recipientUserId: Number(order.created_by_user_id),
          recipientRole: "client",
          actorUserId: null,
          type: "order.payment.started",
          title: "تم اختيار العرض وبانتظار الدفع",
          message: "تم اختيار عرض السعر. أكمل الدفع لتثبيت الإسناد.",
          entityType: "order",
          entityId: Number(oid),
          link: `/dashboard/client/my-orders?orderId=${encodeURIComponent(String(oid))}&bidId=${encodeURIComponent(String(bid))}`,
          priority: "high",
          metadata: { orderId: String(oid), bidId: String(bid), purpose: "selected_bid_payment" },
        },
        `payment_started_${String(oid)}`,
        db,
      ),
    );
    await safeNotify(() =>
      notificationService.createIfNotExists(
        {
          recipientUserId: Number(selectedBid.freelancer_user_id),
          recipientRole: "freelancer",
          actorUserId: Number(order.created_by_user_id),
          type: "order.bid.selected",
          title: "تم اختيار عرضك بانتظار الدفع",
          message: "اختار العميل عرضك، وسيتم تثبيت الإسناد بعد إتمام الدفع.",
          entityType: "order",
          entityId: Number(oid),
          link: `/dashboard/freelancer/orders/${encodeURIComponent(String(oid))}`,
          priority: "high",
          metadata: { orderId: String(oid), bidId: String(bid) },
        },
        `order_bid_selected_${String(oid)}_${String(bid)}`,
        db,
      ),
    );

    await db.query("COMMIT");

    if (!session.url) {
      const err = new Error("Stripe did not return a checkout URL.");
      err.statusCode = 502;
      throw err;
    }
    return { checkoutUrl: session.url, sessionId: session.id };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

async function confirmClientSelectedBidPayment({ clientUserId, orderId, bidId }) {
  const stripe = getStripeOrNull();
  if (!stripe) {
    throwStripeNotConfigured();
  }
  const uid = Number(clientUserId);
  const oid = Number(orderId);
  const bid = Number(bidId);
  if (!Number.isInteger(uid) || uid < 1 || !Number.isInteger(oid) || oid < 1 || !Number.isInteger(bid) || bid < 1) {
    const err = new Error("Invalid order or bid.");
    err.statusCode = 400;
    throw err;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [oid]);
    const order = rows[0];
    if (!order) {
      const err = new Error("Order not found.");
      err.statusCode = 404;
      throw err;
    }
    if (order.source_type !== "client_created" || Number(order.created_by_user_id) !== uid) {
      const err = new Error("You cannot confirm payment for this order.");
      err.statusCode = 403;
      throw err;
    }
    if (!hasPricedBiddingRow(order)) {
      const err = new Error("This order does not support bid payment flow.");
      err.statusCode = 409;
      throw err;
    }
    if (order.assigned_freelancer_id && order.order_status === orderFlowService.ORDER_STATUSES.IN_PROGRESS) {
      await db.query("COMMIT");
      return { ok: true, alreadyApplied: true };
    }
    if (order.order_status !== orderFlowService.ORDER_STATUSES.AWAITING_PAYMENT_AFTER_BID_SELECTION) {
      const err = new Error("Order is not awaiting selected-bid payment.");
      err.statusCode = 409;
      throw err;
    }
    if (!order.selected_bid_id || Number(order.selected_bid_id) !== bid) {
      const err = new Error("Selected bid does not match this order.");
      err.statusCode = 409;
      throw err;
    }

    const session = await resolvePaidCheckoutSessionForClientOrder(stripe, db, {
      order,
      orderId: oid,
      purpose: PURPOSE_BID,
      bidId: bid,
    });
    if (!session) {
      const err = new Error("Payment is not completed yet.");
      err.statusCode = 402;
      err.publicCode = "PAYMENT_NOT_COMPLETED";
      throw err;
    }

    const { rows: bidRows } = await db.query(`SELECT * FROM order_freelancer_bids WHERE id = $1 AND order_id = $2 FOR UPDATE`, [bid, oid]);
    const selectedBid = bidRows[0];
    if (!selectedBid) {
      const err = new Error("Bid not found.");
      err.statusCode = 404;
      throw err;
    }

    const paidAt = new Date();
    const dueAt = (() => {
      const start = paidAt.getTime();
      const amount = Number(order.duration_value);
      if (!Number.isFinite(amount) || amount <= 0) return new Date(start);
      const due = new Date(start);
      if (order.duration_unit === "minutes") due.setUTCMinutes(due.getUTCMinutes() + Math.round(amount));
      else if (order.duration_unit === "hours") due.setUTCHours(due.getUTCHours() + Math.round(amount));
      else due.setUTCDate(due.getUTCDate() + Math.round(amount));
      return due;
    })();
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
    const orderCur = String(order.currency_code || "JOD").trim().toUpperCase() || "JOD";

    const { rows: appliedBid } = await db.query(
      `UPDATE orders
         SET payment_status = 'paid',
             order_status = $2,
             assigned_freelancer_id = $3,
             selected_bid_id = $4,
             received_at = $5,
             started_at = $5,
             due_at = $6,
             is_open_for_pool = FALSE,
             stripe_payment_intent_id = COALESCE($7, stripe_payment_intent_id),
             paid_at = $5,
             payment_amount = $8,
             payment_currency = $9,
             updated_at = NOW()
       WHERE id = $1
         AND payment_status <> 'paid'
       RETURNING id`,
      [oid, orderFlowService.ORDER_STATUSES.IN_PROGRESS, Number(selectedBid.freelancer_user_id), bid, paidAt, dueAt, paymentIntentId, Number(selectedBid.amount), orderCur],
    );
    if (!appliedBid[0]) {
      await db.query("COMMIT");
      return { ok: true, alreadyApplied: true };
    }
    await subscriptionsService.activateCurrentSubscriptionOnFirstAcceptedOrder(
      { freelancerUserId: String(selectedBid.freelancer_user_id), orderId: oid, activatedAt: paidAt },
      db,
    );
    await db.query(`UPDATE order_freelancer_bids SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [bid]);
    await db.query(
      `UPDATE order_freelancer_bids
         SET status = 'rejected', updated_at = NOW()
       WHERE order_id = $1
         AND id <> $2
         AND status IN ('pending','selected_pending_payment')`,
      [oid, bid],
    );
    await db.query(
      `UPDATE client_order_payments
         SET status = 'paid',
             provider_payment_id = COALESCE($2, provider_payment_id),
             paid_at = COALESCE(paid_at, $3)
       WHERE order_id = $1
         AND purpose = 'selected_bid_payment'
         AND bid_id = $4
         AND status = 'pending'
         AND provider_checkout_session_id = $5`,
      [oid, paymentIntentId, paidAt, bid, String(session.id)],
    );
    const { rows: rejectedBidders } = await db.query(
      `SELECT freelancer_user_id
       FROM order_freelancer_bids
       WHERE order_id = $1
         AND id <> $2
         AND status = 'rejected'`,
      [Number(oid), Number(bid)],
    );
    await safeNotify(() =>
      notificationEventsService.notifyUsers(
        {
          userIds: rejectedBidders.map((r) => Number(r.freelancer_user_id)),
          recipientRole: "freelancer",
          actorUserId: Number(order.created_by_user_id),
          type: "order.bid.rejected",
          title: "تم رفض عرضك على المشروع",
          message: "تم قبول عرض مستقل آخر لهذا المشروع.",
          entityType: "order",
          entityId: Number(oid),
          link: `/dashboard/freelancer/orders/${encodeURIComponent(String(oid))}`,
          priority: "medium",
          metadata: { orderId: String(oid), selectedBidId: String(bid) },
          dedupeKey: `order_bid_rejected_batch_${oid}_${bid}`,
        },
        db,
      ),
    );
    await safeNotify(() =>
      notificationService.createIfNotExists(
      {
        recipientUserId: Number(order.created_by_user_id),
        recipientRole: "client",
        actorUserId: null,
        type: "payment.client_order.succeeded",
        title: "تم الدفع بنجاح",
        message: "تم اعتماد العرض ودفعه بنجاح.",
        entityType: "order",
        entityId: Number(oid),
        link: `/dashboard/client/my-orders?paid=1&orderId=${encodeURIComponent(String(oid))}&bidId=${encodeURIComponent(String(bid))}`,
        priority: "critical",
        metadata: { orderId: String(oid), bidId: String(bid), source: "confirm_endpoint" },
      },
      `payment_success_${String(oid)}`,
      db,
      ),
    );
    await safeNotify(() =>
      notificationService.createIfNotExists(
      {
        recipientUserId: Number(selectedBid.freelancer_user_id),
        recipientRole: "freelancer",
        actorUserId: Number(order.created_by_user_id),
        type: "order.freelancer.assigned",
        title: "تم إسناد مشروع لك",
        message: "تم اعتمادك للعمل على المشروع.",
        entityType: "order",
        entityId: Number(oid),
        link: `/dashboard/freelancer/my-orders/${encodeURIComponent(String(oid))}`,
        priority: "high",
        metadata: { orderId: String(oid), source: "confirm_endpoint" },
      },
      `freelancer_assigned_${String(oid)}`,
      db,
      ),
    );

    await db.query("COMMIT");
    return { ok: true, alreadyApplied: false };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

async function confirmClientFixedOrderPayment({ clientUserId, orderId }) {
  const stripe = getStripeOrNull();
  if (!stripe) {
    throwStripeNotConfigured();
  }
  const uid = Number(clientUserId);
  const oid = Number(orderId);
  if (!Number.isInteger(uid) || uid < 1 || !Number.isInteger(oid) || oid < 1) {
    const err = new Error("Invalid order.");
    err.statusCode = 400;
    throw err;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [oid]);
    const order = rows[0];
    if (!order) {
      const err = new Error("Order not found.");
      err.statusCode = 404;
      throw err;
    }
    if (order.source_type !== "client_created" || Number(order.created_by_user_id) !== uid) {
      const err = new Error("You cannot confirm payment for this order.");
      err.statusCode = 403;
      throw err;
    }
    if (order.project_type !== "fixed") {
      const err = new Error("This order does not use fixed checkout.");
      err.statusCode = 409;
      throw err;
    }
    if (order.payment_status === "paid" && order.order_status === orderFlowService.ORDER_STATUSES.OPEN_FOR_FREELANCERS) {
      await db.query("COMMIT");
      return { ok: true, alreadyApplied: true };
    }
    if (order.order_status !== orderFlowService.ORDER_STATUSES.PENDING_PAYMENT) {
      const err = new Error("Order is not awaiting fixed-order payment.");
      err.statusCode = 409;
      throw err;
    }

    const session = await resolvePaidCheckoutSessionForClientOrder(stripe, db, {
      order,
      orderId: oid,
      purpose: PURPOSE_FIXED,
      bidId: null,
    });
    if (!session) {
      const err = new Error("Payment is not completed yet.");
      err.statusCode = 402;
      err.publicCode = "PAYMENT_NOT_COMPLETED";
      throw err;
    }

    const paidAt = new Date();
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
    const orderCur = String(order.currency_code || "JOD").trim().toUpperCase() || "JOD";
    const major = order.budget != null ? Number(order.budget) : null;

    const { rows: appliedFixed } = await db.query(
      `UPDATE orders
         SET payment_status = 'paid',
             order_status = $2,
             is_published = TRUE,
             is_open_for_pool = TRUE,
             stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
             paid_at = $4,
             payment_amount = $5,
             payment_currency = $6,
             updated_at = NOW()
       WHERE id = $1
         AND payment_status <> 'paid'
       RETURNING id`,
      [oid, orderFlowService.ORDER_STATUSES.OPEN_FOR_FREELANCERS, paymentIntentId, paidAt, Number.isFinite(major) ? major : null, orderCur],
    );
    if (!appliedFixed[0]) {
      await db.query("COMMIT");
      return { ok: true, alreadyApplied: true };
    }
    await db.query(
      `UPDATE client_order_payments
         SET status = 'paid',
             provider_payment_id = COALESCE($2, provider_payment_id),
             paid_at = COALESCE(paid_at, $3)
       WHERE order_id = $1
         AND purpose = 'fixed_order_creation'
         AND status = 'pending'
         AND provider_checkout_session_id = $4`,
      [oid, paymentIntentId, paidAt, String(session.id)],
    );
    await safeNotify(() =>
      notificationService.createIfNotExists(
      {
        recipientUserId: Number(order.created_by_user_id),
        recipientRole: "client",
        actorUserId: null,
        type: "payment.client_order.succeeded",
        title: "تم الدفع بنجاح",
        message: "تم استلام الدفع وفتح الطلب للمستقلين.",
        entityType: "order",
        entityId: Number(oid),
        link: `/dashboard/client/my-orders?paid=1&orderId=${encodeURIComponent(String(oid))}`,
        priority: "critical",
        metadata: { orderId: String(oid), source: "confirm_endpoint" },
      },
      `payment_success_${String(oid)}`,
      db,
      ),
    );

    await db.query("COMMIT");
    return { ok: true, alreadyApplied: false };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

async function cancelClientFixedOrderPaymentAttempt({ clientUserId, orderId }) {
  return ordersService.purgeClientUnpaidFixedOrderDraft({ clientUserId, orderId });
}

async function createFreelancerActivationFeeOnlyCheckoutSession({ freelancerUserId, displayPlanId = null, locale = "ar" }, db) {
  const stripe = getStripeOrNull();
  if (!stripe) {
    throwStripeNotConfigured();
  }
  const uid = Number(freelancerUserId);
  const clientUrl = requireStripeClientUrl();
  const currency = "jod";
  const activationMinor = activationFeeMinorUnits();
  if (activationMinor == null || activationMinor < 1) {
    const err = new Error("Invalid subscription activation fee amount.");
    err.statusCode = 500;
    err.exposeToClient = true;
    throw err;
  }

  const { needsActivationFee } = await prepareFreelancerCheckoutSessionCreation(
    { stripe, freelancerUserId: uid },
    db,
  );
  if (!needsActivationFee) {
    const err = new Error("Subscription activation fee is already paid for the current yearly period.");
    err.statusCode = 409;
    err.publicCode = "ACTIVATION_FEE_ALREADY_PAID";
    err.exposeToClient = true;
    throw err;
  }

  const baseMeta = mergeStripeCheckoutMetadata(
    buildFazaatStripeMetadata({
      paymentContext: PAYMENT_CONTEXT.ACTIVATION_FEE_ONLY,
      purpose: PURPOSE_ACTIVATION_FEE_ONLY,
      userId: uid,
      userEmail: await getUserEmailById(uid, db),
      displayPlanId: displayPlanId != null ? displayPlanId : null,
      expectedAmountMinor: activationMinor,
      activationFeeMinor: activationMinor,
      currency: currency.toUpperCase(),
    }),
    {
      purpose: PURPOSE_ACTIVATION_FEE_ONLY,
      freelancerUserId: String(uid),
      displayPlanId: displayPlanId != null ? String(displayPlanId) : "",
      expectedAmountMinor: String(activationMinor),
      activationFeeMinor: String(activationMinor),
      currency: currency.toUpperCase(),
    },
  );

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    metadata: baseMeta,
    payment_intent_data: buildCheckoutPaymentIntentData(baseMeta, PAYMENT_CONTEXT.ACTIVATION_FEE_ONLY),
    line_items: [
      buildActivationFeeStripeLineItem(locale, {
        productName: lineItemProductNameForContext(PAYMENT_CONTEXT.ACTIVATION_FEE_ONLY),
      }),
    ],
    success_url: `${clientUrl}/dashboard/freelancer/plans?freelancer_activation_fee_paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl}/dashboard/freelancer/plans?freelancer_activation_fee_cancelled=1&session_id={CHECKOUT_SESSION_ID}`,
  });

  if (!session?.id) {
    const err = new Error("Stripe did not return a checkout session.");
    err.statusCode = 502;
    throw err;
  }

  await trackFreelancerCheckoutSession(
    {
      freelancerUserId: uid,
      stripeSessionId: session.id,
      displayPlanId,
      checkoutPlanId: null,
      checkoutKind: CHECKOUT_KIND.ACTIVATION_FEE_ONLY,
      includesActivationFee: true,
    },
    db,
  );

  if (!session.url) {
    const err = new Error("Stripe did not return a checkout URL.");
    err.statusCode = 502;
    throw err;
  }

  return { checkoutUrl: session.url, sessionId: session.id, activationFeeOnly: true };
}

async function fulfillFreelancerActivationFeeOnlyCheckout({ freelancerUserId, stripeSessionId, stripePaymentIntentId, paidAt, activationFeeMinor }, db) {
  const feeResult = await recordActivationFeeFromStripeSession(
    {
      freelancerUserId,
      stripeSessionId,
      stripePaymentIntentId,
      activationFeeMinor,
      paidAt,
    },
    db,
  );
  await markCheckoutSessionStatus(stripeSessionId, CHECKOUT_SESSION_STATUS.COMPLETED, db);
  await supersedeOpenCheckoutSessions(
    { stripe: null, freelancerUserId, exceptStripeSessionId: stripeSessionId, feeBearingOnly: true },
    db,
  );
  return feeResult;
}

async function createFreelancerSubscriptionCheckoutSession({ freelancerUserId, planId, locale = "ar" }) {
  const stripe = getStripeOrNull();
  if (!stripe) {
    throwStripeNotConfigured();
  }

  const uid = Number(freelancerUserId);
  const pid = Number(planId);
  if (!Number.isInteger(uid) || uid < 1 || !Number.isInteger(pid) || pid < 1) {
    const err = new Error(
      !Number.isInteger(uid) || uid < 1
        ? "Invalid or missing freelancer user id (check auth context)."
        : "Invalid plan id for checkout.",
    );
    err.statusCode = 400;
    err.exposeToClient = true;
    throw err;
  }

  const clientUrl = requireStripeClientUrl();

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows: planRows } = await db.query(
      `SELECT id, title, price_jod, stripe_checkout_amount_jod, is_active, is_visible, deleted_at,
              self_subscribe_allowed, subscription_plan_id
       FROM plans
       WHERE id = $1
       LIMIT 1`,
      [pid],
    );
    const displayPlan = planRows[0];
    if (!displayPlan) {
      const err = new Error(`No plan found for checkout (planId=${pid}).`);
      err.statusCode = 400;
      err.exposeToClient = true;
      throw err;
    }
    const checkoutPlanId = displayPlan.subscription_plan_id
      ? Number(displayPlan.subscription_plan_id)
      : Number(displayPlan.id);
    const { rows: checkoutRows } = await db.query(
      `SELECT id, title, price_jod, stripe_checkout_amount_jod, is_active, is_visible, deleted_at, self_subscribe_allowed
       FROM plans
       WHERE id = $1
       LIMIT 1`,
      [checkoutPlanId],
    );
    const plan = checkoutRows[0];
    if (!plan) {
      const err = new Error(`No plan found for checkout (planId=${pid}).`);
      err.statusCode = 400;
      err.exposeToClient = true;
      throw err;
    }
    if (
      !plan.deleted_at &&
      plan.is_active &&
      plan.is_visible &&
      !plan.self_subscribe_allowed
    ) {
      const needsFee = await freelancerNeedsSubscriptionActivationFee(uid, db);
      if (needsFee && isFreeDisplayPlanEligibleForActivationFeeCheckout(displayPlan)) {
        const activationOnly = await createFreelancerActivationFeeOnlyCheckoutSession(
          { freelancerUserId: uid, displayPlanId: pid, locale },
          db,
        );
        await db.query("COMMIT");
        return activationOnly;
      }
      const err = new Error("This plan is not available for self-service purchase.");
      err.statusCode = 400;
      err.exposeToClient = true;
      throw err;
    }
    if (!planEligibleForFreelancerSelfCheckout(plan)) {
      const needsFee = await freelancerNeedsSubscriptionActivationFee(uid, db);
      if (needsFee && isFreeDisplayPlanEligibleForActivationFeeCheckout(displayPlan)) {
        const activationOnly = await createFreelancerActivationFeeOnlyCheckoutSession(
          { freelancerUserId: uid, displayPlanId: pid, locale },
          db,
        );
        await db.query("COMMIT");
        return activationOnly;
      }
      const err = new Error(
        `Selected plan is not available for self-checkout (planId=${pid}). It must be active, visible, self_subscribe_allowed, and have price_jod > 0.`,
      );
      err.statusCode = 400;
      err.exposeToClient = true;
      throw err;
    }
    const priceJod = effectiveCheckoutPriceJod(plan);

    const currency = "jod";
    const planAmountMinor = amountMajorToStripeMinor(priceJod, "JOD");
    if (planAmountMinor == null || !Number.isFinite(planAmountMinor) || planAmountMinor < 1) {
      const err = new Error(
        `Invalid subscription amount for planId=${pid} (check price_jod / currency). Checkout uses dynamic price_data, not a static Stripe Price ID.`,
      );
      err.statusCode = 400;
      err.exposeToClient = true;
      throw err;
    }

    const { needsActivationFee } = await prepareFreelancerCheckoutSessionCreation(
      { stripe, freelancerUserId: uid },
      db,
    );
    const activationMinor = needsActivationFee ? activationFeeMinorUnits() : 0;
    if (needsActivationFee && (activationMinor == null || activationMinor < 1)) {
      const err = new Error("Invalid subscription activation fee amount.");
      err.statusCode = 500;
      err.exposeToClient = true;
      throw err;
    }
    const totalAmountMinor = planAmountMinor + (needsActivationFee ? activationMinor : 0);
    const debugCheckout =
      process.env.NODE_ENV !== "production" || String(process.env.DEBUG_FREELANCER_CHECKOUT || "") === "1";
    if (debugCheckout) {
      // eslint-disable-next-line no-console
      console.warn("[createFreelancerSubscriptionCheckoutSession]", {
        planId: pid,
        freelancerUserId: uid,
        priceJod,
        planAmountMinor,
        activationMinor,
        totalAmountMinor,
        lineItems: "price_data (no env Stripe Price ID for freelancer subscription)",
      });
    }
    const successUrl = `${clientUrl}/dashboard/freelancer/plans?freelancer_sub_paid=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${clientUrl}/dashboard/freelancer/plans?freelancer_sub_cancelled=1&session_id={CHECKOUT_SESSION_ID}`;

    const snap = await subscriptionsService.getFreelancerIdentitySnapshot(uid, db);
    if (!snap) {
      const err = new Error("User not found.");
      err.statusCode = 404;
      err.exposeToClient = true;
      throw err;
    }
    if (!snap.isFreelancer) {
      const err = new Error("Target user must be a freelancer.");
      err.statusCode = 400;
      err.exposeToClient = true;
      throw err;
    }

    const currencyUpper = currency.toUpperCase();
    const userEmail = await getUserEmailById(uid, db);
    const legacyMeta = {
      purpose: PURPOSE_SUBSCRIPTION_PURCHASE,
      freelancerUserId: String(uid),
      planId: String(checkoutPlanId),
      displayPlanId: String(pid),
      expectedAmountMinor: String(totalAmountMinor),
      planAmountMinor: String(planAmountMinor),
      activationFeeMinor: String(needsActivationFee ? activationMinor : 0),
      currency: currencyUpper,
    };
    const baseMeta = mergeStripeCheckoutMetadata(
      buildFazaatStripeMetadata({
        paymentContext: PAYMENT_CONTEXT.FREELANCER_SUBSCRIPTION,
        purpose: PURPOSE_SUBSCRIPTION_PURCHASE,
        userId: uid,
        userEmail,
        planId: checkoutPlanId,
        displayPlanId: pid,
        expectedAmountMinor: totalAmountMinor,
        planAmountMinor,
        activationFeeMinor: needsActivationFee ? activationMinor : 0,
        currency: currencyUpper,
      }),
      legacyMeta,
    );

    const subscriptionProductName = lineItemProductNameForContext(PAYMENT_CONTEXT.FREELANCER_SUBSCRIPTION);
    const planTitleSuffix = String(plan.title || `Plan #${pid}`).slice(0, 80);
    const lineItems = [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: planAmountMinor,
          product_data: {
            name: `${subscriptionProductName} - ${planTitleSuffix}`.slice(0, 120),
          },
        },
      },
    ];
    if (needsActivationFee) {
      lineItems.push(buildActivationFeeStripeLineItem(locale));
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      metadata: baseMeta,
      payment_intent_data: buildCheckoutPaymentIntentData(baseMeta, PAYMENT_CONTEXT.FREELANCER_SUBSCRIPTION),
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    await trackFreelancerCheckoutSession(
      {
        freelancerUserId: uid,
        stripeSessionId: session.id,
        displayPlanId: pid,
        checkoutPlanId,
        checkoutKind: CHECKOUT_KIND.SUBSCRIPTION,
        includesActivationFee: needsActivationFee,
      },
      db,
    );

    await safeNotify(() =>
      notificationService.createIfNotExists(
        {
          recipientUserId: Number(uid),
          recipientRole: "freelancer",
          actorUserId: null,
          type: "subscription.payment.started",
          title: "تم بدء دفع الاشتراك",
          message: "تم إنشاء جلسة دفع الاشتراك، أكمل الدفع للمتابعة.",
          entityType: "plan",
          entityId: Number(pid),
          link: "/dashboard/freelancer/plans",
          priority: "high",
          metadata: { planId: String(pid), stripeSessionId: session.id },
        },
        `subscription_payment_started_${String(session.id)}`,
        db,
      ),
    );

    await db.query("COMMIT");
    if (!session.url) {
      const err = new Error("Stripe did not return a checkout URL.");
      err.statusCode = 502;
      throw err;
    }
    return {
      checkoutUrl: session.url,
      sessionId: session.id,
    };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

/**
 * After returning from Stripe Checkout, verify the session server-side and mark the subscription paid.
 * Idempotent with webhooks: `fulfillFreelancerSubscriptionStripePayment` + notification dedupe keys.
 */
async function confirmFreelancerSubscriptionCheckout({ freelancerUserId, stripeSessionId }) {
  const stripe = getStripeOrNull();
  if (!stripe) {
    throwStripeNotConfigured();
  }
  const sid = String(stripeSessionId || "").trim();
  if (!sid) {
    const err = new Error("sessionId is required.");
    err.statusCode = 400;
    err.exposeToClient = true;
    throw err;
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sid, { expand: ["payment_intent"] });
  } catch {
    const err = new Error("Could not retrieve Stripe checkout session.");
    err.statusCode = 502;
    err.exposeToClient = true;
    throw err;
  }

  const meta = session.metadata || {};
  const purpose = String(meta.purpose || "");
  if (Number(meta.freelancerUserId) !== Number(freelancerUserId)) {
    const err = new Error("You cannot confirm this checkout session.");
    err.statusCode = 403;
    err.exposeToClient = true;
    throw err;
  }

  if (purpose === PURPOSE_ACTIVATION_FEE_ONLY) {
    const expectedMinor = meta.expectedAmountMinor != null ? Number(meta.expectedAmountMinor) : null;
    const total = session.amount_total != null ? Number(session.amount_total) : null;
    if (
      expectedMinor != null &&
      Number.isFinite(expectedMinor) &&
      total != null &&
      Number.isFinite(total) &&
      expectedMinor !== total
    ) {
      const err = new Error("Payment amount does not match activation fee.");
      err.statusCode = 409;
      err.exposeToClient = true;
      throw err;
    }
    if (!isCheckoutSessionPaymentSuccessful(session)) {
      const err = new Error("Payment is not completed yet.");
      err.statusCode = 402;
      err.exposeToClient = true;
      err.publicCode = "PAYMENT_NOT_COMPLETED";
      throw err;
    }
    const piId =
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const feeResult = await fulfillFreelancerActivationFeeOnlyCheckout(
        {
          freelancerUserId,
          stripeSessionId: session.id,
          stripePaymentIntentId: piId,
          paidAt: new Date(),
          activationFeeMinor: meta.activationFeeMinor,
        },
        db,
      );
      await db.query("COMMIT");
      return { ok: true, activationFeeOnly: true, feeResult, alreadyApplied: feeResult.duplicate === true };
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }

  if (purpose !== PURPOSE_SUBSCRIPTION_PURCHASE && purpose !== "freelancer_subscription_purchase") {
    const err = new Error("This checkout session is not for a freelancer subscription.");
    err.statusCode = 400;
    err.exposeToClient = true;
    throw err;
  }

  const planId = Number(meta.planId);
  if (!Number.isInteger(planId) || planId < 1) {
    const err = new Error("Invalid subscription metadata.");
    err.statusCode = 400;
    err.exposeToClient = true;
    throw err;
  }

  const metaSubscriptionIdRaw = meta.subscriptionId != null ? Number(meta.subscriptionId) : null;
  const narrowSubscriptionId =
    metaSubscriptionIdRaw != null && Number.isInteger(metaSubscriptionIdRaw) && metaSubscriptionIdRaw > 0
      ? metaSubscriptionIdRaw
      : null;

  const expectedMinor = meta.expectedAmountMinor != null ? Number(meta.expectedAmountMinor) : null;
  const total = session.amount_total != null ? Number(session.amount_total) : null;
  if (
    expectedMinor != null &&
    Number.isFinite(expectedMinor) &&
    total != null &&
    Number.isFinite(total) &&
    expectedMinor !== total
  ) {
    const err = new Error("Payment amount does not match subscription.");
    err.statusCode = 409;
    err.exposeToClient = true;
    throw err;
  }

  if (!isCheckoutSessionPaymentSuccessful(session)) {
    const err = new Error("Payment is not completed yet.");
    err.statusCode = 402;
    err.exposeToClient = true;
    err.publicCode = "PAYMENT_NOT_COMPLETED";
    throw err;
  }

  const piId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;

  const db = await pool.connect();
  try {
    await db.query("BEGIN");

    const { rows: preRows } = await db.query(
      `SELECT id, payment_status FROM freelancer_subscriptions WHERE stripe_session_id = $1 LIMIT 1`,
      [session.id || null],
    );
    const pre = preRows[0];
    const wasAlreadyPaid = pre && String(pre.payment_status || "").toLowerCase() === "paid";

    const sub = await subscriptionsService.fulfillFreelancerSubscriptionStripePayment(
      {
        freelancerUserId,
        planId,
        stripeSessionId: session.id || null,
        stripePaymentIntentId: piId,
        paidAt: new Date(),
        subscriptionId: narrowSubscriptionId,
      },
      db,
    );

    if (!sub) {
      await db.query("ROLLBACK");
      const err = new Error("Could not create subscription for this checkout.");
      err.statusCode = 500;
      err.exposeToClient = true;
      throw err;
    }

    const activationMinor = meta.activationFeeMinor != null ? Number(meta.activationFeeMinor) : 0;
    if (Number.isFinite(activationMinor) && activationMinor > 0) {
      await recordActivationFeeFromStripeSession(
        {
          freelancerUserId,
          stripeSessionId: session.id || null,
          stripePaymentIntentId: piId,
          activationFeeMinor: activationMinor,
          paidAt: new Date(),
        },
        db,
      );
    }
    await markCheckoutSessionStatus(session.id, CHECKOUT_SESSION_STATUS.COMPLETED, db);
    await supersedeOpenCheckoutSessions(
      { stripe: null, freelancerUserId, exceptStripeSessionId: session.id, feeBearingOnly: true },
      db,
    );

    await db.query("COMMIT");

    if (!wasAlreadyPaid) {
      await safeNotify(() =>
        freelancerSubscriptionPaymentNotifications.notifyFreelancerSubscriptionPaymentSuccess(
          {
            freelancerUserId: Number(freelancerUserId),
            planId,
            subscriptionId: sub.id,
            stripeSessionId: session.id || null,
            source: "confirm_checkout",
          },
        ),
      );
    }

    return { ok: true, subscription: sub, alreadyApplied: wasAlreadyPaid };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

/**
 * After user returns from Stripe cancel_url: verify session is unpaid freelancer checkout, then persist one notification.
 * Caller must be authenticated as the freelancer in session metadata.
 */
async function recordFreelancerSubscriptionCheckoutCancelled({ freelancerUserId, stripeSessionId }) {
  const stripe = getStripeOrNull();
  if (!stripe) {
    throwStripeNotConfigured();
  }
  const sid = String(stripeSessionId || "").trim();
  if (!sid) {
    const err = new Error("sessionId is required.");
    err.statusCode = 400;
    err.exposeToClient = true;
    throw err;
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sid);
  } catch {
    const err = new Error("Could not retrieve Stripe checkout session.");
    err.statusCode = 502;
    err.exposeToClient = true;
    throw err;
  }

  const meta = session.metadata || {};
  const purpose = String(meta.purpose || "");
  if (
    purpose !== PURPOSE_SUBSCRIPTION_PURCHASE &&
    purpose !== "freelancer_subscription_purchase" &&
    purpose !== PURPOSE_ACTIVATION_FEE_ONLY
  ) {
    const err = new Error("This checkout session is not for a freelancer subscription.");
    err.statusCode = 400;
    err.exposeToClient = true;
    throw err;
  }
  if (Number(meta.freelancerUserId) !== Number(freelancerUserId)) {
    const err = new Error("You cannot record cancellation for this checkout session.");
    err.statusCode = 403;
    err.exposeToClient = true;
    throw err;
  }
  if (isCheckoutSessionPaymentSuccessful(session)) {
    const err = new Error("This checkout session is already paid.");
    err.statusCode = 409;
    err.exposeToClient = true;
    throw err;
  }

  const st = String(session.status || "").toLowerCase();
  if (st !== "open" && st !== "expired") {
    const err = new Error("Checkout session is not in a cancellable unpaid state.");
    err.statusCode = 409;
    err.exposeToClient = true;
    throw err;
  }

  const planId = meta.planId != null ? Number(meta.planId) : null;
  const subscriptionId = meta.subscriptionId != null ? Number(meta.subscriptionId) : null;

  await markCheckoutSessionStatus(sid, CHECKOUT_SESSION_STATUS.EXPIRED);

  await freelancerSubscriptionPaymentNotifications.notifyFreelancerSubscriptionPaymentCancelled(
    {
      freelancerUserId: Number(freelancerUserId),
      planId: Number.isInteger(planId) && planId > 0 ? planId : null,
      subscriptionId: Number.isInteger(subscriptionId) && subscriptionId > 0 ? subscriptionId : null,
      stripeSessionId: sid,
      source: "cancel_return",
    },
  );

  return { ok: true };
}

module.exports = {
  getStripeOrNull,
  createClientFixedOrderCheckoutSession,
  createClientSelectedBidCheckoutSession,
  confirmClientSelectedBidPayment,
  confirmClientFixedOrderPayment,
  cancelClientFixedOrderPaymentAttempt,
  createFreelancerSubscriptionCheckoutSession,
  confirmFreelancerSubscriptionCheckout,
  recordFreelancerSubscriptionCheckoutCancelled,
};
