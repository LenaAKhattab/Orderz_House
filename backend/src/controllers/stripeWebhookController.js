const Stripe = require("stripe");
const { pool } = require("../config/db");
const orderFlowService = require("../services/orderFlowService");
const subscriptionsService = require("../services/subscriptionsService");
const notificationService = require("../services/notificationService");
const notificationEventsService = require("../services/notificationEventsService");

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

function computeDueAtFromOrder(receivedAt, durationValue, durationUnit) {
  const base = new Date(receivedAt);
  const amount = Number(durationValue);
  if (!Number.isFinite(amount) || amount <= 0) return base;
  const due = new Date(base);
  if (durationUnit === "minutes") {
    due.setUTCMinutes(due.getUTCMinutes() + Math.round(amount));
  } else if (durationUnit === "hours") {
    due.setUTCHours(due.getUTCHours() + Math.round(amount));
  } else {
    due.setUTCDate(due.getUTCDate() + Math.round(amount));
  }
  return due;
}

function logStripeWebhook(fields) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      component: "stripe_webhook",
      ...fields,
    }),
  );
}

async function isStripeWebhookEventRecorded(eventId) {
  if (!eventId) return false;
  const { rows } = await pool.query(`SELECT 1 FROM stripe_webhook_events WHERE id = $1 LIMIT 1`, [String(eventId)]);
  return Boolean(rows[0]);
}

/** Persist after successful handling so retries after a failure can re-run business logic. */
async function recordStripeWebhookEventProcessed(eventId) {
  if (!eventId) return false;
  const { rowCount } = await pool.query(`INSERT INTO stripe_webhook_events (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [
    String(eventId),
  ]);
  return rowCount === 1;
}

/**
 * Express handler: raw body required (mounted with express.raw).
 */
async function handleStripeWebhook(req, res) {
  const stripe = getStripeOrNull();
  const secret = process.env.STRIPE_WEBHOOK_SECRET && String(process.env.STRIPE_WEBHOOK_SECRET).trim();
  if (!stripe || !secret) {
    logStripeWebhook({ outcome: "misconfigured", detail: "missing_stripe_or_webhook_secret" });
    return res.status(503).type("text/plain").send("Unavailable");
  }

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    logStripeWebhook({ outcome: "invalid_signature" });
    return res.status(400).type("text/plain").send("Invalid signature");
  }

  const eventId = String(event.id);
  const eventType = String(event.type);

  if (await isStripeWebhookEventRecorded(eventId)) {
    logStripeWebhook({ eventId, type: eventType, outcome: "duplicate_skip" });
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    if (eventType === "checkout.session.completed") {
      await applyCheckoutSessionCompleted(event.data.object);
    } else if (eventType === "payment_intent.succeeded") {
      await applyPaymentIntentOutcome(event.data.object, "paid");
    } else if (eventType === "payment_intent.payment_failed") {
      await applyPaymentIntentOutcome(event.data.object, "failed");
    } else {
      logStripeWebhook({ eventId, type: eventType, outcome: "unhandled_type" });
    }

    const insertedNew = await recordStripeWebhookEventProcessed(eventId);
    logStripeWebhook({
      eventId,
      type: eventType,
      outcome: "handled",
      recordInserted: insertedNew,
    });
    return res.status(200).json({ received: true, duplicate: !insertedNew });
  } catch (e) {
    const safeMsg = String(e?.message || e).slice(0, 200);
    logStripeWebhook({ eventId, type: eventType, outcome: "handler_failed", error: safeMsg });
    // eslint-disable-next-line no-console
    console.error("[stripe webhook] handler failed:", safeMsg);
    return res.status(500).json({ received: false });
  }
}

async function applyCheckoutSessionCompleted(session) {
  const meta = session.metadata || {};
  const purpose = String(meta.purpose || "");
  if (purpose === "freelancer_subscription_purchase") {
    const freelancerUserId = Number(meta.freelancerUserId);
    const planId = Number(meta.planId);
    if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1 || !Number.isInteger(planId) || planId < 1) return;
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      if (String(session.payment_status || "").toLowerCase() === "paid") {
        const sub = await subscriptionsService.markFreelancerSubscriptionStripePaymentPaid(
          {
            freelancerUserId,
            planId,
            stripeSessionId: session.id || null,
            stripePaymentIntentId: paymentIntentId,
            paidAt: new Date(),
          },
          db,
        );
        if (sub?.id) {
          await safeNotify(() =>
            notificationService.createIfNotExists(
            {
              recipientUserId: freelancerUserId,
              recipientRole: "freelancer",
              actorUserId: null,
              type: "subscription.payment.succeeded",
              title: "تم دفع الاشتراك بنجاح",
              message: "تم استلام دفعة الاشتراك وبانتظار تفعيل الشركة.",
              entityType: "subscription",
              entityId: Number(sub.id),
              link: "/plans?freelancer_sub_paid=1",
              priority: "high",
              metadata: { subscriptionId: String(sub.id), source: "stripe_webhook" },
            },
            `subscription_paid_${String(sub.id)}`,
            db,
            ),
          );
          await safeNotify(() =>
            notificationEventsService.notifyAdmins(
              {
                recipientRole: "admin",
                actorUserId: null,
                type: "subscription.company.activation.pending",
                title: "اشتراك جديد بانتظار تفعيل الشركة",
                message: "تم دفع اشتراك مستقل جديد ويحتاج لتفعيل من الإدارة.",
                entityType: "subscription",
                entityId: Number(sub.id),
                link: "/dashboard/admin/subscriptions",
                priority: "high",
                metadata: { subscriptionId: String(sub.id), freelancerUserId: String(sub.freelancerUserId || sub.freelancer_user_id || "") },
                dedupeKey: `subscription_company_pending_${String(sub.id)}`,
              },
              db,
            ),
          );
          await safeNotify(() =>
            notificationEventsService.notifySuperAdmins(
              {
                recipientRole: "super_admin",
                actorUserId: null,
                type: "subscription.company.activation.pending",
                title: "اشتراك جديد بانتظار تفعيل الشركة",
                message: "تم دفع اشتراك مستقل جديد ويحتاج لتفعيل من الإدارة.",
                entityType: "subscription",
                entityId: Number(sub.id),
                link: "/dashboard/super-admin/subscriptions/activation",
                priority: "high",
                metadata: { subscriptionId: String(sub.id) },
                dedupeKey: `subscription_company_pending_${String(sub.id)}`,
              },
              db,
            ),
          );
        }
      }
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
    return;
  }
  if (!["client_fixed_order", "client_selected_bid"].includes(purpose)) return;
  const orderId = Number(meta.orderId);
  if (!Number.isInteger(orderId) || orderId < 1) return;

  const amountTotal = session.amount_total != null ? Number(session.amount_total) : null;
  const currency = String(session.currency || "")
    .trim()
    .toUpperCase();

  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return;
    }
    if (order.payment_status === "paid") {
      await client.query("COMMIT");
      return;
    }
    if (order.stripe_checkout_session_id && session.id && order.stripe_checkout_session_id !== session.id) {
      await client.query("ROLLBACK");
      return;
    }
    if (purpose === "client_fixed_order") {
      if (order.order_status !== orderFlowService.ORDER_STATUSES.PENDING_PAYMENT) {
        await client.query("ROLLBACK");
        return;
      }
      if (order.project_type !== "fixed" || order.source_type !== "client_created") {
        await client.query("ROLLBACK");
        return;
      }
    } else if (purpose === "client_selected_bid") {
      if (order.project_type !== "bidding" || order.source_type !== "client_created") {
        await client.query("ROLLBACK");
        return;
      }
      if (order.order_status !== orderFlowService.ORDER_STATUSES.AWAITING_PAYMENT_AFTER_BID_SELECTION) {
        await client.query("ROLLBACK");
        return;
      }
    }
    if (
      order.stripe_checkout_expected_amount_minor != null &&
      amountTotal != null &&
      Number(order.stripe_checkout_expected_amount_minor) !== amountTotal
    ) {
      await client.query("ROLLBACK");
      return;
    }
    const orderCur = String(order.currency_code || "")
      .trim()
      .toUpperCase();
    if (currency && orderCur && currency !== orderCur) {
      await client.query("ROLLBACK");
      return;
    }

    const paidAt = new Date();
    if (purpose === "client_fixed_order") {
      const major = order.budget != null ? Number(order.budget) : null;
      await client.query(
        `UPDATE orders
           SET payment_status = 'paid',
               order_status = $2,
               is_published = TRUE,
               is_open_for_pool = TRUE,
               stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, $3),
               stripe_payment_intent_id = COALESCE($4, stripe_payment_intent_id),
               paid_at = $5,
               payment_amount = $6,
               payment_currency = $7,
               updated_at = NOW()
         WHERE id = $1
           AND payment_status <> 'paid'`,
        [
          orderId,
          orderFlowService.ORDER_STATUSES.OPEN_FOR_FREELANCERS,
          session.id || null,
          piId,
          paidAt,
          Number.isFinite(major) ? major : null,
          orderCur || null,
        ],
      );
      await client.query(
        `UPDATE client_order_payments
           SET status = 'paid',
               provider_payment_id = COALESCE($2, provider_payment_id),
               paid_at = COALESCE(paid_at, $3)
         WHERE order_id = $1
           AND purpose = 'fixed_order_creation'
           AND status = 'pending'`,
        [orderId, piId, paidAt],
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
          entityId: Number(orderId),
          link: `/dashboard/client/my-orders?paid=1&orderId=${encodeURIComponent(String(orderId))}`,
          priority: "critical",
          metadata: { orderId: String(orderId), source: "stripe_webhook" },
        },
        `payment_success_${String(orderId)}`,
        client,
        ),
      );
    } else {
      const bidId = Number(meta.bidId || order.selected_bid_id);
      if (!Number.isInteger(bidId) || bidId < 1) {
        await client.query("ROLLBACK");
        return;
      }
      const { rows: bidRows } = await client.query(`SELECT * FROM order_freelancer_bids WHERE id = $1 AND order_id = $2 FOR UPDATE`, [bidId, orderId]);
      const bid = bidRows[0];
      if (!bid) {
        await client.query("ROLLBACK");
        return;
      }
      const dueAt = computeDueAtFromOrder(paidAt, order.duration_value, order.duration_unit);
      await client.query(
        `UPDATE orders
           SET payment_status = 'paid',
               order_status = $2,
               assigned_freelancer_id = $3,
               selected_bid_id = $4,
               received_at = $5,
               started_at = $5,
               due_at = $6,
               is_open_for_pool = FALSE,
               stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, $7),
               stripe_payment_intent_id = COALESCE($8, stripe_payment_intent_id),
               paid_at = $5,
               payment_amount = $9,
               payment_currency = $10,
               updated_at = NOW()
         WHERE id = $1`,
        [
          orderId,
          orderFlowService.ORDER_STATUSES.IN_PROGRESS,
          Number(bid.freelancer_user_id),
          Number(bid.id),
          paidAt,
          dueAt,
          session.id || null,
          piId,
          Number(bid.amount),
          orderCur || null,
        ],
      );
      await subscriptionsService.activateCurrentSubscriptionOnFirstAcceptedOrder(
        { freelancerUserId: String(bid.freelancer_user_id), orderId, activatedAt: paidAt },
        client,
      );
      await client.query(`UPDATE order_freelancer_bids SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [Number(bid.id)]);
      await client.query(
        `UPDATE order_freelancer_bids
           SET status = 'rejected', updated_at = NOW()
         WHERE order_id = $1
           AND id <> $2
           AND status IN ('pending','selected_pending_payment')`,
        [orderId, Number(bid.id)],
      );
      await client.query(
        `UPDATE client_order_payments
           SET status = 'paid',
               provider_payment_id = COALESCE($2, provider_payment_id),
               paid_at = COALESCE(paid_at, $3)
         WHERE order_id = $1
           AND purpose = 'selected_bid_payment'
           AND bid_id = $4
           AND status = 'pending'`,
        [orderId, piId, paidAt, Number(bid.id)],
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
          entityId: Number(orderId),
          link: `/dashboard/client/my-orders?paid=1&orderId=${encodeURIComponent(String(orderId))}&bidId=${encodeURIComponent(String(bid.id))}`,
          priority: "critical",
          metadata: { orderId: String(orderId), bidId: String(bid.id), source: "stripe_webhook" },
        },
        `payment_success_${String(orderId)}`,
        client,
        ),
      );
      await safeNotify(() =>
        notificationService.createIfNotExists(
        {
          recipientUserId: Number(bid.freelancer_user_id),
          recipientRole: "freelancer",
          actorUserId: Number(order.created_by_user_id),
          type: "order.freelancer.assigned",
          title: "تم إسناد مشروع لك",
          message: "تم اعتمادك للعمل على المشروع.",
          entityType: "order",
          entityId: Number(orderId),
          link: `/dashboard/freelancer/my-orders/${encodeURIComponent(String(orderId))}`,
          priority: "high",
          metadata: { orderId: String(orderId), source: "stripe_webhook" },
        },
        `freelancer_assigned_${String(orderId)}`,
        client,
        ),
      );
      const { rows: rejectedBidders } = await client.query(
        `SELECT freelancer_user_id
         FROM order_freelancer_bids
         WHERE order_id = $1
           AND id <> $2
           AND status = 'rejected'`,
        [Number(orderId), Number(bid.id)],
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
            entityId: Number(orderId),
            link: `/dashboard/freelancer/orders/${encodeURIComponent(String(orderId))}`,
            priority: "medium",
            metadata: { orderId: String(orderId), selectedBidId: String(bid.id) },
            dedupeKey: `order_bid_rejected_batch_${orderId}_${bid.id}`,
          },
          client,
        ),
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function applyPaymentIntentOutcome(pi, outcomePaymentStatus) {
  const meta = pi.metadata || {};
  const purpose = String(meta.purpose || "");
  if (purpose === "freelancer_subscription_purchase") {
    const freelancerUserId = Number(meta.freelancerUserId);
    const planId = Number(meta.planId);
    if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1 || !Number.isInteger(planId) || planId < 1) return;
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      if (outcomePaymentStatus === "paid") {
        const sub = await subscriptionsService.markFreelancerSubscriptionStripePaymentPaid(
          {
            freelancerUserId,
            planId,
            stripeSessionId: null,
            stripePaymentIntentId: pi.id || null,
            paidAt: new Date(),
          },
          db,
        );
        if (sub?.id) {
          await safeNotify(() =>
            notificationService.createIfNotExists(
            {
              recipientUserId: freelancerUserId,
              recipientRole: "freelancer",
              actorUserId: null,
              type: "subscription.payment.succeeded",
              title: "تم دفع الاشتراك بنجاح",
              message: "تم استلام دفعة الاشتراك وبانتظار تفعيل الشركة.",
              entityType: "subscription",
              entityId: Number(sub.id),
              link: "/plans?freelancer_sub_paid=1",
              priority: "high",
              metadata: { subscriptionId: String(sub.id), source: "stripe_webhook" },
            },
            `subscription_paid_${String(sub.id)}`,
            db,
            ),
          );
        }
      } else if (outcomePaymentStatus === "failed") {
        const sub = await subscriptionsService.markFreelancerSubscriptionStripePaymentFailed(
          {
            freelancerUserId,
            planId,
            stripeSessionId: null,
            stripePaymentIntentId: pi.id || null,
          },
          db,
        );
        if (sub?.id) {
          await safeNotify(() =>
            notificationService.createIfNotExists(
              {
                recipientUserId: freelancerUserId,
                recipientRole: "freelancer",
                actorUserId: null,
                type: "subscription.payment.failed",
                title: "فشل دفع الاشتراك",
                message: "تعذر إتمام دفع الاشتراك. يرجى إعادة المحاولة.",
                entityType: "subscription",
                entityId: Number(sub.id),
                link: "/plans?freelancer_sub_cancelled=1",
                priority: "high",
                metadata: { subscriptionId: String(sub.id), source: "stripe_webhook" },
              },
              `subscription_failed_${String(sub.id)}`,
              db,
            ),
          );
        }
      }
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
    return;
  }
  if (!["client_fixed_order", "client_selected_bid"].includes(purpose)) return;
  const orderId = Number(meta.orderId);
  if (!Number.isInteger(orderId) || orderId < 1) return;

  const amount = pi.amount != null ? Number(pi.amount) : null;
  const currency = String(pi.currency || "")
    .trim()
    .toUpperCase();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return;
    }

    if (outcomePaymentStatus === "paid") {
      if (order.payment_status === "paid") {
        await client.query("COMMIT");
        return;
      }
      if (pi.id && order.stripe_payment_intent_id && order.stripe_payment_intent_id !== pi.id) {
        await client.query("ROLLBACK");
        return;
      }
      if (purpose === "client_fixed_order") {
        if (order.order_status !== orderFlowService.ORDER_STATUSES.PENDING_PAYMENT) {
          await client.query("ROLLBACK");
          return;
        }
        if (order.project_type !== "fixed" || order.source_type !== "client_created") {
          await client.query("ROLLBACK");
          return;
        }
      } else {
        if (order.order_status !== orderFlowService.ORDER_STATUSES.AWAITING_PAYMENT_AFTER_BID_SELECTION) {
          await client.query("ROLLBACK");
          return;
        }
        if (order.project_type !== "bidding" || order.source_type !== "client_created") {
          await client.query("ROLLBACK");
          return;
        }
      }
      if (
        order.stripe_checkout_expected_amount_minor != null &&
        amount != null &&
        Number(order.stripe_checkout_expected_amount_minor) !== amount
      ) {
        await client.query("ROLLBACK");
        return;
      }
      const orderCur = String(order.currency_code || "")
        .trim()
        .toUpperCase();
      if (currency && orderCur && currency !== orderCur) {
        await client.query("ROLLBACK");
        return;
      }

      const paidAt = new Date();
      if (purpose === "client_fixed_order") {
        const major = order.budget != null ? Number(order.budget) : null;
        await client.query(
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
             AND payment_status <> 'paid'`,
          [
            orderId,
            orderFlowService.ORDER_STATUSES.OPEN_FOR_FREELANCERS,
            pi.id || null,
            paidAt,
            Number.isFinite(major) ? major : null,
            orderCur || null,
          ],
        );
        await client.query(
          `UPDATE client_order_payments
             SET status = 'paid',
                 provider_payment_id = COALESCE($2, provider_payment_id),
                 paid_at = COALESCE(paid_at, $3)
           WHERE order_id = $1
             AND purpose = 'fixed_order_creation'
             AND status = 'pending'`,
          [orderId, pi.id || null, paidAt],
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
            entityId: Number(orderId),
            link: `/dashboard/client/my-orders?paid=1&orderId=${encodeURIComponent(String(orderId))}`,
            priority: "critical",
            metadata: { orderId: String(orderId), source: "stripe_webhook" },
          },
          `payment_success_${String(orderId)}`,
          client,
          ),
        );
      } else {
        const bidId = Number(meta.bidId || order.selected_bid_id);
        const { rows: bidRows } = await client.query(`SELECT * FROM order_freelancer_bids WHERE id = $1 AND order_id = $2 FOR UPDATE`, [bidId, orderId]);
        const bid = bidRows[0];
        if (!bid) {
          await client.query("ROLLBACK");
          return;
        }
        const dueAt = computeDueAtFromOrder(paidAt, order.duration_value, order.duration_unit);
        await client.query(
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
           WHERE id = $1`,
          [
            orderId,
            orderFlowService.ORDER_STATUSES.IN_PROGRESS,
            Number(bid.freelancer_user_id),
            Number(bid.id),
            paidAt,
            dueAt,
            pi.id || null,
            Number(bid.amount),
            orderCur || null,
          ],
        );
        await subscriptionsService.activateCurrentSubscriptionOnFirstAcceptedOrder(
          { freelancerUserId: String(bid.freelancer_user_id), orderId, activatedAt: paidAt },
          client,
        );
        await client.query(`UPDATE order_freelancer_bids SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [Number(bid.id)]);
        await client.query(
          `UPDATE order_freelancer_bids
             SET status = 'rejected', updated_at = NOW()
           WHERE order_id = $1
             AND id <> $2
             AND status IN ('pending','selected_pending_payment')`,
          [orderId, Number(bid.id)],
        );
        await client.query(
          `UPDATE client_order_payments
             SET status = 'paid',
                 provider_payment_id = COALESCE($2, provider_payment_id),
                 paid_at = COALESCE(paid_at, $3)
           WHERE order_id = $1
             AND purpose = 'selected_bid_payment'
             AND bid_id = $4
             AND status = 'pending'`,
          [orderId, pi.id || null, paidAt, Number(bid.id)],
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
            entityId: Number(orderId),
            link: `/dashboard/client/my-orders?paid=1&orderId=${encodeURIComponent(String(orderId))}&bidId=${encodeURIComponent(String(bid.id))}`,
            priority: "critical",
            metadata: { orderId: String(orderId), bidId: String(bid.id), source: "stripe_webhook" },
          },
          `payment_success_${String(orderId)}`,
          client,
          ),
        );
        await safeNotify(() =>
          notificationService.createIfNotExists(
          {
            recipientUserId: Number(bid.freelancer_user_id),
            recipientRole: "freelancer",
            actorUserId: Number(order.created_by_user_id),
            type: "order.freelancer.assigned",
            title: "تم إسناد مشروع لك",
            message: "تم اعتمادك للعمل على المشروع.",
            entityType: "order",
            entityId: Number(orderId),
            link: `/dashboard/freelancer/my-orders/${encodeURIComponent(String(orderId))}`,
            priority: "high",
            metadata: { orderId: String(orderId), source: "stripe_webhook" },
          },
          `freelancer_assigned_${String(orderId)}`,
          client,
          ),
        );
      }
    } else if (outcomePaymentStatus === "failed") {
      if (purpose === "client_fixed_order") {
        await client.query(
          `UPDATE orders
             SET payment_status = 'failed',
                 updated_at = NOW()
           WHERE id = $1
             AND order_status = $2
             AND payment_status IN ('pending','unpaid')`,
          [orderId, orderFlowService.ORDER_STATUSES.PENDING_PAYMENT],
        );
        await client.query(
          `UPDATE client_order_payments
             SET status = 'failed',
                 provider_payment_id = COALESCE($2, provider_payment_id)
           WHERE order_id = $1
             AND purpose = 'fixed_order_creation'
             AND status = 'pending'`,
          [orderId, pi.id || null],
        );
        await safeNotify(() =>
          notificationService.createIfNotExists(
          {
            recipientUserId: Number(order.created_by_user_id),
            recipientRole: "client",
            actorUserId: null,
            type: "payment.client_order.failed",
            title: "فشل الدفع",
            message: "تعذر إتمام الدفع للطلب. حاول مرة أخرى.",
            entityType: "order",
            entityId: Number(orderId),
            link: `/dashboard/client/my-orders?orderId=${encodeURIComponent(String(orderId))}`,
            priority: "high",
            metadata: { orderId: String(orderId), source: "stripe_webhook" },
          },
          `payment_failed_${String(orderId)}`,
          client,
          ),
        );
      } else {
        const bidId = Number(meta.bidId || order.selected_bid_id);
        await client.query(
          `UPDATE orders
             SET payment_status = 'failed',
                 order_status = $2,
                 selected_bid_id = NULL,
                 updated_at = NOW()
           WHERE id = $1
             AND order_status = $3`,
          [orderId, orderFlowService.ORDER_STATUSES.OPEN_FOR_BIDS, orderFlowService.ORDER_STATUSES.AWAITING_PAYMENT_AFTER_BID_SELECTION],
        );
        if (Number.isInteger(bidId) && bidId > 0) {
          await client.query(
            `UPDATE order_freelancer_bids
               SET status = 'pending', updated_at = NOW()
             WHERE id = $1
               AND order_id = $2
               AND status = 'selected_pending_payment'`,
            [bidId, orderId],
          );
        }
        await client.query(
          `UPDATE client_order_payments
             SET status = 'failed',
                 provider_payment_id = COALESCE($2, provider_payment_id)
           WHERE order_id = $1
             AND purpose = 'selected_bid_payment'
             AND status = 'pending'`,
          [orderId, pi.id || null],
        );
        await safeNotify(() =>
          notificationService.createIfNotExists(
          {
            recipientUserId: Number(order.created_by_user_id),
            recipientRole: "client",
            actorUserId: null,
            type: "payment.client_order.failed",
            title: "فشل الدفع",
            message: "فشل دفع العرض المختار وعاد الطلب للمزايدة.",
            entityType: "order",
            entityId: Number(orderId),
            link: `/dashboard/client/my-orders?orderId=${encodeURIComponent(String(orderId))}`,
            priority: "high",
            metadata: { orderId: String(orderId), source: "stripe_webhook" },
          },
          `payment_failed_${String(orderId)}`,
          client,
          ),
        );
      }
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { handleStripeWebhook };
