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
const { isCheckoutSessionPaymentSuccessful } = require("../utils/stripeSessionPaymentStatus");
const { getPrimaryClientUrl } = require("../config/clientUrl");
const freelancerSubscriptionPaymentNotifications = require("./freelancerSubscriptionPaymentNotifications");

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

function hasPricedBiddingRow(order) {
  if (!order) return false;
  if (order.project_type !== "bidding") return false;
  const min = Number(order.bid_budget_min);
  const max = Number(order.bid_budget_max);
  return Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min;
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
    const err = new Error("Stripe is not configured on the server.");
    err.statusCode = 503;
    throw err;
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

    const successUrl = `${clientUrl}/dashboard/client/my-orders?paid=1&orderId=${encodeURIComponent(String(oid))}`;
    const cancelUrl = `${clientUrl}/dashboard/client/my-orders?cancelled=1&orderId=${encodeURIComponent(String(oid))}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: String(oid),
      metadata: {
        orderId: String(oid),
        purpose: "client_fixed_order",
        clientUserId: String(uid),
        expectedAmountMinor: String(amountMinor),
        currency: stripeCurrency.toUpperCase(),
      },
      payment_intent_data: {
        metadata: {
          orderId: String(oid),
          purpose: "client_fixed_order",
          expectedAmountMinor: String(amountMinor),
          currency: stripeCurrency.toUpperCase(),
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: stripeCurrency,
            unit_amount: amountMinor,
            product_data: {
              name: String(order.title || "Order").slice(0, 120),
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
    const err = new Error("Stripe is not configured on the server.");
    err.statusCode = 503;
    throw err;
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

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: `${oid}:${bid}`,
      metadata: {
        orderId: String(oid),
        bidId: String(bid),
        purpose: "client_selected_bid",
        clientUserId: String(uid),
        expectedAmountMinor: String(amountMinor),
        currency: stripeCurrency.toUpperCase(),
      },
      payment_intent_data: {
        metadata: {
          orderId: String(oid),
          bidId: String(bid),
          purpose: "client_selected_bid",
          expectedAmountMinor: String(amountMinor),
          currency: stripeCurrency.toUpperCase(),
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: stripeCurrency,
            unit_amount: amountMinor,
            product_data: {
              name: `Bid payment - ${String(order.title || "Order").slice(0, 110)}`,
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
    const err = new Error("Stripe is not configured on the server.");
    err.statusCode = 503;
    throw err;
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
    const err = new Error("Stripe is not configured on the server.");
    err.statusCode = 503;
    throw err;
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

async function createFreelancerSubscriptionCheckoutSession({ freelancerUserId, planId }) {
  const stripe = getStripeOrNull();
  if (!stripe) {
    const err = new Error("Stripe is not configured on the server.");
    err.statusCode = 503;
    throw err;
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
      `SELECT id, title, price_jod, stripe_checkout_amount_jod, is_active, is_visible, deleted_at, self_subscribe_allowed
       FROM plans
       WHERE id = $1
       LIMIT 1`,
      [pid],
    );
    const plan = planRows[0];
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
      const err = new Error("This plan is not available for self-service purchase.");
      err.statusCode = 400;
      err.exposeToClient = true;
      throw err;
    }
    if (!planEligibleForFreelancerSelfCheckout(plan)) {
      const err = new Error(
        `Selected plan is not available for self-checkout (planId=${pid}). It must be active, visible, self_subscribe_allowed, and have price_jod > 0.`,
      );
      err.statusCode = 400;
      err.exposeToClient = true;
      throw err;
    }
    const priceJod = effectiveCheckoutPriceJod(plan);

    const currency = "jod";
    const amountMinor = amountMajorToStripeMinor(priceJod, "JOD");
    if (amountMinor == null || !Number.isFinite(amountMinor) || amountMinor < 1) {
      const err = new Error(
        `Invalid subscription amount for planId=${pid} (check price_jod / currency). Checkout uses dynamic price_data, not a static Stripe Price ID.`,
      );
      err.statusCode = 400;
      err.exposeToClient = true;
      throw err;
    }
    const debugCheckout =
      process.env.NODE_ENV !== "production" || String(process.env.DEBUG_FREELANCER_CHECKOUT || "") === "1";
    if (debugCheckout) {
      // eslint-disable-next-line no-console
      console.warn("[createFreelancerSubscriptionCheckoutSession]", {
        planId: pid,
        freelancerUserId: uid,
        priceJod,
        amountMinor,
        lineItems: "price_data (no env Stripe Price ID for freelancer subscription)",
      });
    }
    const successUrl = `${clientUrl}/plans?freelancer_sub_paid=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${clientUrl}/plans?freelancer_sub_cancelled=1&session_id={CHECKOUT_SESSION_ID}`;

    const subscription = await subscriptionsService.createFreelancerSelfSubscriptionPendingPayment(
      { freelancerUserId: uid, planId: pid, stripeSessionId: null },
      db,
    );
    const internalSubId = Number(subscription?.id);
    if (!Number.isInteger(internalSubId) || internalSubId < 1) {
      const err = new Error("Could not create pending subscription record.");
      err.statusCode = 500;
      throw err;
    }

    const baseMeta = {
      purpose: "freelancer_subscription_purchase",
      freelancerUserId: String(uid),
      planId: String(pid),
      subscriptionId: String(internalSubId),
      expectedAmountMinor: String(amountMinor),
      currency: currency.toUpperCase(),
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      metadata: baseMeta,
      payment_intent_data: {
        metadata: { ...baseMeta },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountMinor,
            product_data: {
              name: `Freelancer Subscription - ${String(plan.title || `Plan #${pid}`).slice(0, 100)}`,
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    await db.query(`UPDATE freelancer_subscriptions SET stripe_session_id = $1, updated_at = NOW() WHERE id = $2`, [
      session.id,
      internalSubId,
    ]);
    await safeNotify(() =>
      notificationService.createIfNotExists(
        {
          recipientUserId: Number(uid),
          recipientRole: "freelancer",
          actorUserId: null,
          type: "subscription.payment.started",
          title: "تم بدء دفع الاشتراك",
          message: "تم إنشاء جلسة دفع الاشتراك، أكمل الدفع للمتابعة.",
          entityType: "subscription",
          entityId: Number(subscription?.id),
          link: "/plans",
          priority: "high",
          metadata: { subscriptionId: String(subscription?.id || ""), planId: String(pid) },
        },
        `subscription_payment_started_${String(subscription?.id || "")}`,
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
      subscription: { ...subscription, stripeSessionId: session.id },
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
 * Idempotent with webhooks: `markFreelancerSubscriptionStripePaymentPaid` + notification dedupe keys.
 */
async function confirmFreelancerSubscriptionCheckout({ freelancerUserId, stripeSessionId }) {
  const stripe = getStripeOrNull();
  if (!stripe) {
    const err = new Error("Stripe is not configured on the server.");
    err.statusCode = 503;
    throw err;
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
  if (String(meta.purpose || "") !== "freelancer_subscription_purchase") {
    const err = new Error("This checkout session is not for a freelancer subscription.");
    err.statusCode = 400;
    err.exposeToClient = true;
    throw err;
  }
  if (Number(meta.freelancerUserId) !== Number(freelancerUserId)) {
    const err = new Error("You cannot confirm this checkout session.");
    err.statusCode = 403;
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
      `SELECT id, payment_status FROM freelancer_subscriptions
       WHERE freelancer_user_id = $1 AND plan_id = $2 AND is_current = TRUE AND source = 'stripe'
         AND ($3::text IS NULL OR stripe_session_id = $3)
         AND ($4::bigint IS NULL OR id = $4::bigint)
       ORDER BY id DESC LIMIT 1
       FOR UPDATE`,
      [Number(freelancerUserId), planId, session.id || null, narrowSubscriptionId],
    );
    const pre = preRows[0];
    const wasAlreadyPaid = pre && String(pre.payment_status || "").toLowerCase() === "paid";

    const sub = await subscriptionsService.markFreelancerSubscriptionStripePaymentPaid(
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
      const err = new Error("No pending subscription found for this checkout.");
      err.statusCode = 404;
      err.exposeToClient = true;
      throw err;
    }

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
    const err = new Error("Stripe is not configured on the server.");
    err.statusCode = 503;
    throw err;
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
  if (String(meta.purpose || "") !== "freelancer_subscription_purchase") {
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
