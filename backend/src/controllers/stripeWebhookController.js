const Stripe = require("stripe");
const { pool } = require("../config/db");
const { isCheckoutSessionPaymentSuccessful } = require("../utils/stripeSessionPaymentStatus");
const { assertCheckoutSessionAuthorizedForOrder } = require("../utils/stripeCheckoutReconcile");
const orderFlowService = require("../services/orderFlowService");
const subscriptionsService = require("../services/subscriptionsService");
const { recordActivationFeeFromStripeSession, markCheckoutSessionStatus, supersedeOpenCheckoutSessions, CHECKOUT_SESSION_STATUS, PURPOSE_ACTIVATION_FEE_ONLY } = require("../services/subscriptionActivationFeeService");
const {
  PURPOSE_RECURRING_SUBSCRIPTION,
  fulfillRecurringSubscriptionFromCheckout,
  applyRecurringInvoicePaid,
  applyRecurringInvoicePaymentFailed,
  syncRecurringSubscriptionStatus,
  periodFromStripeSubscription,
} = require("../services/stripeRecurringSubscriptionService");
const notificationService = require("../services/notificationService");
const freelancerSubscriptionPaymentNotifications = require("../services/freelancerSubscriptionPaymentNotifications");
const subscriptionAdminNotificationService = require("../services/subscriptionAdminNotificationService");
const notificationEventsService = require("../services/notificationEventsService");
const { capture } = require("../config/posthog");
const { pickFazaatTrackingLogFields } = require("../utils/fazaatStripeMetadata");

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

/**
 * Outcomes from applying checkout.session.completed / payment_intent.* so the HTTP handler can
 * mark stripe_webhook_events processed vs failed (Stripe retries on non-2xx).
 * @typedef {{
 *   status: 'applied' | 'already_applied' | 'ignored' | 'retryable_failure';
 *   reason?: string;
 * }} CheckoutWebhookApplyResult
 */

function finalizeWebhookApplyResult(eventId, eventType, applyResult) {
  const status = applyResult?.status;
  const reason = applyResult?.reason ? String(applyResult.reason).slice(0, 200) : "";

  const markProcessed = status === "applied" || status === "already_applied" || status === "ignored";

  const markFailedRetryable = status === "retryable_failure";

  if (markFailedRetryable) {
    logStripeWebhook({
      eventId,
      type: eventType,
      outcome: "apply_skipped_retryable",
      applyStatus: status,
      reason: reason || "unknown",
    });
    return { httpStatus: 500, markProcessed: false, markFailed: true, safeError: reason || "retryable_apply_failure" };
  }

  if (markProcessed) {
    logStripeWebhook({
      eventId,
      type: eventType,
      outcome: "apply_finished",
      applyStatus: status || "noop",
      reason: reason || undefined,
    });
    return { httpStatus: 200, markProcessed: true, markFailed: false, safeError: "" };
  }

  logStripeWebhook({ eventId, type: eventType, outcome: "unexpected_apply_result", applyStatus: status });
  return { httpStatus: 500, markProcessed: false, markFailed: true, safeError: "unexpected_apply_result" };
}

/**
 * Atomically claim this Stripe event for processing (concurrency-safe).
 * 1) INSERT ... ON CONFLICT DO NOTHING with status = processing — first delivery wins.
 * 2) If id exists: processed → skip; processing → skip (duplicate / in-flight); failed → reclaim via UPDATE for Stripe retry.
 */
async function claimStripeWebhookEvent(eventId, db = pool) {
  if (!eventId) return false;
  const id = String(eventId);
  const runner = db || pool;

  const inserted = await runner.query(
    `INSERT INTO stripe_webhook_events (id, status) VALUES ($1, 'processing')
     ON CONFLICT (id) DO NOTHING`,
    [id],
  );
  if (inserted.rowCount === 1) return true;

  const { rows } = await runner.query(`SELECT status FROM stripe_webhook_events WHERE id = $1 LIMIT 1`, [id]);
  const current = rows[0]?.status;
  if (current === "processed" || current === "processing") return false;

  if (current === "failed") {
    const reclaimed = await runner.query(
      `UPDATE stripe_webhook_events
       SET status = 'processing',
           failed_at = NULL,
           last_error = NULL
       WHERE id = $1 AND status = 'failed'`,
      [id],
    );
    return reclaimed.rowCount === 1;
  }

  return false;
}

/** Mark successful webhook handling (idempotent row stays; duplicates skip via processed status). */
async function markStripeWebhookEventProcessed(eventId, db = pool) {
  if (!eventId) return;
  const runner = db || pool;
  await runner.query(
    `UPDATE stripe_webhook_events
     SET status = 'processed',
         processed_at = NOW(),
         failed_at = NULL,
         last_error = NULL
     WHERE id = $1 AND status = 'processing'`,
    [String(eventId)],
  );
}

/** Record handler failure; Stripe retry can reclaim via claimStripeWebhookEvent (failed → processing). */
async function markStripeWebhookEventFailed(eventId, safeError, db = pool) {
  if (!eventId) return;
  const runner = db || pool;
  const msg = String(safeError || "").slice(0, 2000);
  await runner.query(
    `UPDATE stripe_webhook_events
     SET status = 'failed',
         failed_at = NOW(),
         last_error = $2
     WHERE id = $1 AND status = 'processing'`,
    [String(eventId), msg],
  );
}

/**
 * @deprecated Prefer markStripeWebhookEventFailed + lifecycle columns. Deletes row (tests / emergency only).
 */
async function releaseStripeWebhookEventClaim(eventId, db = pool) {
  if (!eventId) return;
  const runner = db || pool;
  await runner.query(`DELETE FROM stripe_webhook_events WHERE id = $1`, [String(eventId)]);
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

  const claimed = await claimStripeWebhookEvent(eventId);
  if (!claimed) {
    logStripeWebhook({ eventId, type: eventType, outcome: "duplicate_skip" });
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    /** @type {CheckoutWebhookApplyResult | null} */
    let applyResult = null;

    if (eventType === "checkout.session.completed") {
      applyResult = await applyCheckoutSessionCompleted(event.data.object);
    } else if (eventType === "payment_intent.succeeded") {
      applyResult = await applyPaymentIntentOutcome(event.data.object, "paid");
    } else if (eventType === "payment_intent.payment_failed") {
      applyResult = await applyPaymentIntentOutcome(event.data.object, "failed");
    } else if (eventType === "invoice.paid" || eventType === "invoice.payment_succeeded") {
      applyResult = await applyInvoicePaidEvent(event.data.object);
    } else if (eventType === "invoice.payment_failed") {
      applyResult = await applyInvoicePaymentFailedEvent(event.data.object);
    } else if (
      eventType === "customer.subscription.updated" ||
      eventType === "customer.subscription.deleted"
    ) {
      applyResult = await applyCustomerSubscriptionEvent(event.data.object, eventType);
    } else if (
      eventType === "charge.refunded" ||
      eventType === "charge.dispute.created" ||
      eventType === "charge.dispute.closed"
    ) {
      // Bid package: record only — Bid economic reversal is PRODUCT_DECISION_REQUIRED.
      applyResult = await applyBidPackageProviderRefundOrDisputeRecordOnly(event.data.object, eventType);
    } else {
      logStripeWebhook({ eventId, type: eventType, outcome: "unhandled_type" });
      applyResult = { status: "ignored", reason: "unhandled_event_type" };
    }

    const fin = finalizeWebhookApplyResult(eventId, eventType, applyResult);
    if (fin.markFailed) {
      try {
        await markStripeWebhookEventFailed(eventId, fin.safeError);
      } catch (markErr) {
        logStripeWebhook({
          eventId,
          type: eventType,
          outcome: "mark_failed_state_failed",
          error: String(markErr?.message || markErr).slice(0, 200),
        });
      }
      if (fin.httpStatus >= 500) {
        // eslint-disable-next-line no-console
        console.error("[stripe webhook] retryable apply failure:", fin.safeError);
      }
      return res.status(fin.httpStatus).json({ received: false, retryable: true });
    }
    if (fin.markProcessed) {
      await markStripeWebhookEventProcessed(eventId);
    }

    logStripeWebhook({
      eventId,
      type: eventType,
      outcome: "handled",
      claimed: true,
    });
    return res.status(200).json({ received: true, duplicate: false });
  } catch (e) {
    const safeMsg = String(e?.message || e).slice(0, 200);
    logStripeWebhook({
      eventId,
      type: eventType,
      outcome: "handler_failed",
      error: safeMsg,
      markedFailed: true,
    });
    try {
      await markStripeWebhookEventFailed(eventId, safeMsg);
    } catch (markErr) {
      logStripeWebhook({
        eventId,
        type: eventType,
        outcome: "mark_failed_state_failed",
        error: String(markErr?.message || markErr).slice(0, 200),
      });
    }
    // eslint-disable-next-line no-console
    console.error("[stripe webhook] handler failed:", safeMsg);
    return res.status(500).json({ received: false });
  }
}

async function applyCheckoutSessionFreelancerRecurringCompleted(session, meta, dbPool) {
  const freelancerUserId = Number(meta.freelancerUserId || meta.user_id);
  const planId = Number(meta.planId || meta.plan_id);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1 || !Number.isInteger(planId) || planId < 1) {
    return { status: "ignored", reason: "recurring_invalid_meta" };
  }
  if (String(session.mode || "") !== "subscription") {
    return { status: "ignored", reason: "recurring_wrong_mode" };
  }
  if (!isCheckoutSessionPaymentSuccessful(session)) {
    return { status: "ignored", reason: "recurring_checkout_not_paid" };
  }

  const expectedMinor = meta.expectedAmountMinor != null ? Number(meta.expectedAmountMinor) : null;
  const total = session.amount_total != null ? Number(session.amount_total) : null;
  if (
    expectedMinor != null &&
    Number.isFinite(expectedMinor) &&
    total != null &&
    Number.isFinite(total) &&
    expectedMinor !== total
  ) {
    return { status: "ignored", reason: "recurring_amount_mismatch" };
  }

  const stripe = getStripeOrNull();
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id || null;
  if (!stripeSubscriptionId) {
    return { status: "retryable_failure", reason: "recurring_missing_subscription_id" };
  }

  let stripeSubscription = null;
  try {
    if (stripe) {
      stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    }
  } catch (err) {
    return { status: "retryable_failure", reason: "recurring_subscription_retrieve_failed" };
  }

  const { currentPeriodStart, currentPeriodEnd } = periodFromStripeSubscription(stripeSubscription || {}, {
    preferredPriceId: meta.stripePriceId || stripeSubscription?.items?.data?.[0]?.price?.id || null,
  });
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id || null;
  const stripePriceId =
    meta.stripePriceId ||
    (typeof stripeSubscription?.items?.data?.[0]?.price === "string"
      ? stripeSubscription.items.data[0].price
      : stripeSubscription?.items?.data?.[0]?.price?.id) ||
    null;
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  const activationMinor = meta.activationFeeMinor != null ? Number(meta.activationFeeMinor) : 0;

  const db = await dbPool.connect();
  try {
    await db.query("BEGIN");
    const { subscription, created } = await fulfillRecurringSubscriptionFromCheckout(
      {
        freelancerUserId,
        planId,
        stripeSessionId: session.id || null,
        stripeSubscriptionId,
        stripeCustomerId,
        stripePriceId,
        stripePaymentIntentId: paymentIntentId,
        currentPeriodStart,
        currentPeriodEnd,
        activationFeeMinor,
        paidAt: new Date(),
      },
      db,
    );
    if (subscription?.id) {
      await safeNotify(() =>
        freelancerSubscriptionPaymentNotifications.notifyFreelancerSubscriptionPaymentSuccess(
          {
            freelancerUserId,
            planId,
            subscriptionId: subscription.id,
            stripeSessionId: session.id || null,
            source: "stripe_webhook_recurring_checkout",
          },
          db,
        ),
      );
      await safeNotify(() =>
        notificationEventsService.notifyAdmins(
          {
            recipientRole: "admin",
            actorUserId: null,
            type: "subscription.company.activation.pending",
            title: "اشتراك شهري جديد بانتظار تفعيل الشركة",
            message: "تم دفع اشتراك شهري متجدد وهو بانتظار تفعيل الشركة.",
            entityType: "subscription",
            entityId: Number(subscription.id),
            link: "/dashboard/super-admin/subscriptions",
            priority: "high",
            metadata: {
              subscriptionId: String(subscription.id),
              freelancerUserId: String(freelancerUserId),
              planId: String(planId),
              billingMode: "recurring_stripe",
            },
          },
          `subscription_company_pending_${String(subscription.id)}`,
          db,
        ),
      );
    }
    await db.query("COMMIT");
    return { status: created ? "applied" : "already_applied" };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

async function retrieveSubscriptionForInvoice(invoice) {
  const stripe = getStripeOrNull();
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subId || !stripe) return { stripeSubscription: null, subId: subId || null };
  try {
    const stripeSubscription = await stripe.subscriptions.retrieve(subId);
    return { stripeSubscription, subId };
  } catch (_) {
    return { stripeSubscription: null, subId };
  }
}

async function applyInvoicePaidEvent(invoice) {
  const meta = invoice?.subscription_details?.metadata || invoice?.metadata || {};
  const purpose = String(meta.purpose || "");
  if (purpose && purpose !== PURPOSE_RECURRING_SUBSCRIPTION && purpose !== "freelancer_recurring_subscription") {
    // Still try by Stripe subscription id lookup for renewals where invoice metadata is sparse.
  }
  const { stripeSubscription, subId } = await retrieveSubscriptionForInvoice(invoice);
  if (!subId) return { status: "ignored", reason: "invoice_no_subscription" };
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await applyRecurringInvoicePaid(
      { stripeSubscription: stripeSubscription || { id: subId }, invoice },
      db,
    );
    await db.query("COMMIT");
    if (!result.ok && result.reason === "subscription_row_not_found") {
      return { status: "ignored", reason: result.reason };
    }
    return { status: result.ok ? "applied" : "ignored", reason: result.reason };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

async function applyInvoicePaymentFailedEvent(invoice) {
  const { stripeSubscription, subId } = await retrieveSubscriptionForInvoice(invoice);
  if (!subId) return { status: "ignored", reason: "invoice_no_subscription" };
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await applyRecurringInvoicePaymentFailed(
      { stripeSubscription: stripeSubscription || { id: subId }, invoice },
      db,
    );
    await db.query("COMMIT");
    if (!result.ok && result.reason === "subscription_row_not_found") {
      return { status: "ignored", reason: result.reason };
    }
    return { status: result.ok ? "applied" : "ignored", reason: result.reason };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

async function applyCustomerSubscriptionEvent(stripeSubscription, eventType) {
  if (!stripeSubscription?.id) return { status: "ignored", reason: "missing_subscription" };
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await syncRecurringSubscriptionStatus({ stripeSubscription }, db);
    if (eventType === "customer.subscription.deleted" && result.ok) {
      // status sync already marks cancelled
    }
    await db.query("COMMIT");
    return { status: result.ok ? "applied" : "ignored", reason: result.reason };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

async function applyCheckoutSessionFreelancerSubscriptionCompleted(session, meta, dbPool) {
  const freelancerUserId = Number(meta.freelancerUserId);
  const planId = Number(meta.planId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1 || !Number.isInteger(planId) || planId < 1) {
    return { status: "ignored", reason: "subscription_invalid_meta" };
  }
  const subscriptionMetaId = meta.subscriptionId != null ? Number(meta.subscriptionId) : null;
  const narrowSubId =
    subscriptionMetaId != null && Number.isInteger(subscriptionMetaId) && subscriptionMetaId > 0
      ? subscriptionMetaId
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
    return { status: "ignored", reason: "subscription_amount_mismatch" };
  }
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  const db = await dbPool.connect();
  try {
    await db.query("BEGIN");
    if (!isCheckoutSessionPaymentSuccessful(session)) {
      await db.query("COMMIT");
      return { status: "ignored", reason: "subscription_checkout_not_paid" };
    }
    const sub = await subscriptionsService.fulfillFreelancerSubscriptionStripePayment(
      {
        freelancerUserId,
        planId,
        stripeSessionId: session.id || null,
        stripePaymentIntentId: paymentIntentId,
        paidAt: new Date(),
        subscriptionId: narrowSubId,
      },
      db,
    );
    if (sub?.id) {
      const activationMinor = meta.activationFeeMinor != null ? Number(meta.activationFeeMinor) : 0;
      if (Number.isFinite(activationMinor) && activationMinor > 0) {
        await recordActivationFeeFromStripeSession(
          {
            freelancerUserId,
            stripeSessionId: session.id || null,
            stripePaymentIntentId: paymentIntentId,
            activationFeeMinor,
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
      await safeNotify(() =>
        freelancerSubscriptionPaymentNotifications.notifyFreelancerSubscriptionPaymentSuccess(
          {
            freelancerUserId,
            planId,
            subscriptionId: sub.id,
            stripeSessionId: session.id || null,
            source: "stripe_webhook_checkout",
          },
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
            metadata: {
              subscriptionId: String(sub.id),
              freelancerUserId: String(sub.freelancerUserId || sub.freelancer_user_id || ""),
            },
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
    capture(String(freelancerUserId), "subscription_purchased", {
      planId: String(planId),
      subscriptionId: sub?.id ? String(sub.id) : undefined,
    });
    await db.query("COMMIT");
    // Internal admin email — after commit, only on a genuine paid transition (idempotent).
    if (sub?.id && sub.freshlyPaid) {
      await safeNotify(() =>
        subscriptionAdminNotificationService.sendPaidSubscriptionAdminNotification(sub.id),
      );
    }
    return { status: "applied" };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

/**
 * Apply Stripe Checkout completion for client orders. Caller should ensure purpose is client_fixed_order or client_selected_bid.
 * @param {import('stripe').Stripe.Checkout.Session} session
 * @returns {Promise<CheckoutWebhookApplyResult>}
 */
async function applyCheckoutSessionClientOrderCompleted(session, meta, purpose, orderId, dbPool) {
  if (!isCheckoutSessionPaymentSuccessful(session)) {
    return { status: "ignored", reason: "checkout_session_not_paid" };
  }

  const amountTotal = session.amount_total != null ? Number(session.amount_total) : null;
  const currency = String(session.currency || "")
    .trim()
    .toUpperCase();

  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;

  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return { status: "retryable_failure", reason: "order_not_found" };
    }
    if (order.payment_status === "paid") {
      await client.query("COMMIT");
      return { status: "already_applied" };
    }
    const auth = await assertCheckoutSessionAuthorizedForOrder(client, {
      order,
      session,
      orderId,
      purpose,
    });
    if (!auth.ok) {
      await client.query("ROLLBACK");
      return { status: "ignored", reason: auth.reason || "checkout_session_not_linked" };
    }
    if (purpose === "client_fixed_order") {
      if (order.order_status !== orderFlowService.ORDER_STATUSES.PENDING_PAYMENT) {
        await client.query("ROLLBACK");
        return { status: "retryable_failure", reason: "order_state_not_pending_payment" };
      }
      if (order.project_type !== "fixed" || order.source_type !== "client_created") {
        await client.query("ROLLBACK");
        return { status: "retryable_failure", reason: "order_type_mismatch" };
      }
    } else if (purpose === "client_selected_bid") {
      if (order.project_type !== "bidding" || order.source_type !== "client_created") {
        await client.query("ROLLBACK");
        return { status: "retryable_failure", reason: "order_type_mismatch" };
      }
      if (order.order_status !== orderFlowService.ORDER_STATUSES.AWAITING_PAYMENT_AFTER_BID_SELECTION) {
        await client.query("ROLLBACK");
        return { status: "retryable_failure", reason: "order_state_not_awaiting_bid_payment" };
      }
    }
    if (
      order.stripe_checkout_expected_amount_minor != null &&
      amountTotal != null &&
      Number(order.stripe_checkout_expected_amount_minor) !== amountTotal
    ) {
      await client.query("ROLLBACK");
      return { status: "retryable_failure", reason: "amount_mismatch" };
    }
    const orderCur = String(order.currency_code || "JOD")
      .trim()
      .toUpperCase();
    if (currency && currency !== orderCur) {
      await client.query("ROLLBACK");
      return { status: "retryable_failure", reason: "currency_mismatch" };
    }

    const paidAt = new Date();
    if (purpose === "client_fixed_order") {
      const major = order.budget != null ? Number(order.budget) : null;
      const { rows: appliedFixed } = await client.query(
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
           AND payment_status <> 'paid'
         RETURNING id`,
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
      if (!appliedFixed[0]) {
        await client.query("ROLLBACK");
        return { status: "already_applied" };
      }
      await client.query(
        `UPDATE client_order_payments
           SET status = 'paid',
               provider_payment_id = COALESCE($2, provider_payment_id),
               paid_at = COALESCE(paid_at, $3)
         WHERE order_id = $1
           AND purpose = 'fixed_order_creation'
           AND status = 'pending'
           AND provider_checkout_session_id = $4`,
        [orderId, piId, paidAt, String(session.id)],
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
        return { status: "retryable_failure", reason: "bid_id_invalid" };
      }
      const { rows: bidRows } = await client.query(`SELECT * FROM order_freelancer_bids WHERE id = $1 AND order_id = $2 FOR UPDATE`, [bidId, orderId]);
      const bid = bidRows[0];
      if (!bid) {
        await client.query("ROLLBACK");
        return { status: "retryable_failure", reason: "bid_not_found" };
      }
      const dueAt = computeDueAtFromOrder(paidAt, order.duration_value, order.duration_unit);
      const { rows: appliedBid } = await client.query(
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
         WHERE id = $1
           AND payment_status <> 'paid'
         RETURNING id`,
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
      if (!appliedBid[0]) {
        await client.query("ROLLBACK");
        return { status: "already_applied" };
      }
      await subscriptionsService.activateCurrentSubscriptionOnFirstAcceptedOrder(
        { freelancerUserId: String(bid.freelancer_user_id), orderId, activatedAt: paidAt },
        client,
      );
      capture(String(bid.freelancer_user_id), "first_subscription_started", {
        orderId: String(orderId),
        bidId: String(bid.id),
      });
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
           AND status = 'pending'
           AND provider_checkout_session_id = $5`,
        [orderId, piId, paidAt, Number(bid.id), String(session.id)],
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

      // Phase 7.1 Fair history
      {
        const fairDist = require("../services/marketplaceFairDistributionService");
        const orderForFair = {
          ...order,
          assigned_freelancer_id: bid.freelancer_user_id,
          received_at: paidAt,
        };
        await fairDist.recordFinalEffectiveSelectionOutcome({
          client,
          order: orderForFair,
          winnerFreelancerUserId: bid.freelancer_user_id,
          loserFreelancerUserIds: rejectedBidders.map((r) => r.freelancer_user_id),
          selectionSource: "stripe_webhook_client_selected_bid",
          actorRole: "system",
          actorUserId: null,
          occurredAt: paidAt,
        });
      }

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
    return { status: "applied" };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function applyCheckoutSessionFreelancerActivationFeeOnlyCompleted(session, meta, dbPool) {
  const freelancerUserId = Number(meta.freelancerUserId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    return { status: "ignored", reason: "activation_fee_invalid_meta" };
  }
  const expectedMinor = meta.expectedAmountMinor != null ? Number(meta.expectedAmountMinor) : null;
  const total = session.amount_total != null ? Number(session.amount_total) : null;
  if (
    expectedMinor != null &&
    Number.isFinite(expectedMinor) &&
    total != null &&
    Number.isFinite(total) &&
    expectedMinor !== total
  ) {
    return { status: "ignored", reason: "activation_fee_amount_mismatch" };
  }
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  const db = await dbPool.connect();
  try {
    await db.query("BEGIN");
    if (!isCheckoutSessionPaymentSuccessful(session)) {
      await db.query("COMMIT");
      return { status: "ignored", reason: "activation_fee_checkout_not_paid" };
    }
    const activationMinor = meta.activationFeeMinor != null ? Number(meta.activationFeeMinor) : 0;
    await recordActivationFeeFromStripeSession(
      {
        freelancerUserId,
        stripeSessionId: session.id || null,
        stripePaymentIntentId: paymentIntentId,
        activationFeeMinor,
        paidAt: new Date(),
      },
      db,
    );
    await markCheckoutSessionStatus(session.id, CHECKOUT_SESSION_STATUS.COMPLETED, db);
    await supersedeOpenCheckoutSessions(
      { stripe: null, freelancerUserId, exceptStripeSessionId: session.id, feeBearingOnly: true },
      db,
    );
    await db.query("COMMIT");
    return { status: "applied" };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

async function applyCheckoutSessionCompleted(session, dbPool = pool) {
  const meta = session.metadata || {};
  logStripeWebhook({
    outcome: "checkout_session_apply_start",
    ...pickFazaatTrackingLogFields(meta),
  });
  const purpose = String(meta.purpose || "");
  if (purpose === PURPOSE_RECURRING_SUBSCRIPTION || purpose === "freelancer_recurring_subscription") {
    return applyCheckoutSessionFreelancerRecurringCompleted(session, meta, dbPool);
  }
  if (purpose === "freelancer_subscription_purchase") {
    return applyCheckoutSessionFreelancerSubscriptionCompleted(session, meta, dbPool);
  }
  if (purpose === PURPOSE_ACTIVATION_FEE_ONLY) {
    return applyCheckoutSessionFreelancerActivationFeeOnlyCompleted(session, meta, dbPool);
  }
  if (purpose === "bid_credit_package_purchase") {
    const purchases = require("../services/marketplaceBidCreditPurchasesService");
    return purchases.applyBidCreditPackageCheckoutSessionCompleted(session, meta, dbPool);
  }
  if (purpose === "marketplace_membership_checkout") {
    const membershipCheckout = require("../services/marketplaceMembershipCheckoutService");
    return membershipCheckout.applyMarketplaceMembershipCheckoutSessionCompleted(
      session,
      meta,
      dbPool,
    );
  }
  if (!["client_fixed_order", "client_selected_bid"].includes(purpose)) {
    return { status: "ignored", reason: "unknown_checkout_purpose" };
  }
  const orderId = Number(meta.orderId);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return { status: "ignored", reason: "invalid_order_metadata" };
  }
  return applyCheckoutSessionClientOrderCompleted(session, meta, purpose, orderId, dbPool);
}

async function applyPaymentIntentOutcome(pi, outcomePaymentStatus, dbPool = pool) {
  const meta = pi.metadata || {};
  logStripeWebhook({
    outcome: "payment_intent_apply_start",
    paymentIntentStatus: outcomePaymentStatus,
    ...pickFazaatTrackingLogFields(meta),
  });
  const purpose = String(meta.purpose || "");
  if (purpose === "bid_credit_package_purchase") {
    const purchases = require("../services/marketplaceBidCreditPurchasesService");
    const purchaseId = Number(meta.purchaseId || meta.purchase_id || 0);
    if (!Number.isInteger(purchaseId) || purchaseId < 1) {
      return { status: "ignored", reason: "bid_pkg_pi_missing_purchase" };
    }
    if (outcomePaymentStatus !== "paid") {
      // Fail closed for unpaid/failed PI — never undo an already fulfilled purchase.
      const client = await dbPool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE marketplace_bid_credit_purchases
              SET status = 'failed',
                  failed_at = COALESCE(failed_at, NOW()),
                  failure_reason = COALESCE(failure_reason, 'payment_intent_failed'),
                  updated_at = NOW()
            WHERE id = $1
              AND status IN ('pending', 'checkout_created')`,
          [purchaseId],
        );
        await client.query("COMMIT");
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw e;
      } finally {
        client.release();
      }
      return { status: "ignored", reason: "bid_pkg_pi_not_paid" };
    }
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT * FROM marketplace_bid_credit_purchases WHERE id = $1 FOR UPDATE`,
        [purchaseId],
      );
      const purchase = rows[0];
      if (!purchase) {
        await client.query("COMMIT");
        return { status: "ignored", reason: "bid_pkg_purchase_not_found" };
      }
      const amount =
        pi.amount_received != null
          ? Number(pi.amount_received)
          : pi.amount != null
            ? Number(pi.amount)
            : null;
      const result = await purchases.fulfillBidCreditPurchaseFromVerifiedPayment({
        client,
        purchaseRow: purchase,
        stripePaymentIntentId: pi.id || null,
        paidAt: new Date(),
        sessionAmountTotal: amount,
        sessionCurrency: pi.currency || null,
      });
      await client.query("COMMIT");
      return {
        status:
          result.status === "already_applied"
            ? "already_applied"
            : result.status === "applied"
              ? "applied"
              : "ignored",
        reason: result.reason || null,
      };
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }
  if (purpose === "freelancer_subscription_purchase") {
    const freelancerUserId = Number(meta.freelancerUserId);
    const planId = Number(meta.planId);
    if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1 || !Number.isInteger(planId) || planId < 1) {
      return { status: "ignored", reason: "subscription_invalid_meta" };
    }
    const subscriptionMetaId = meta.subscriptionId != null ? Number(meta.subscriptionId) : null;
    const narrowSubId =
      subscriptionMetaId != null && Number.isInteger(subscriptionMetaId) && subscriptionMetaId > 0
        ? subscriptionMetaId
        : null;
    const db = await dbPool.connect();
    let paidSub = null;
    try {
      await db.query("BEGIN");
      if (outcomePaymentStatus === "paid") {
        const sub = await subscriptionsService.fulfillFreelancerSubscriptionStripePayment(
          {
            freelancerUserId,
            planId,
            stripeSessionId: null,
            stripePaymentIntentId: pi.id || null,
            paidAt: new Date(),
            subscriptionId: narrowSubId,
          },
          db,
        );
        paidSub = sub;
        if (sub?.id) {
          await safeNotify(() =>
            freelancerSubscriptionPaymentNotifications.notifyFreelancerSubscriptionPaymentSuccess(
              {
                freelancerUserId,
                planId,
                subscriptionId: sub.id,
                stripeSessionId: null,
                source: "stripe_webhook_payment_intent",
              },
              db,
            ),
          );
        }
      } else if (outcomePaymentStatus === "failed") {
        await subscriptionsService.markFreelancerSubscriptionStripePaymentFailed(
          {
            freelancerUserId,
            planId,
            stripeSessionId: null,
            stripePaymentIntentId: pi.id || null,
          },
          db,
        );
      }
      await db.query("COMMIT");
      // Internal admin email — after commit, only on a genuine paid transition (idempotent).
      if (paidSub?.id && paidSub.freshlyPaid) {
        await safeNotify(() =>
          subscriptionAdminNotificationService.sendPaidSubscriptionAdminNotification(paidSub.id),
        );
      }
      return { status: "applied" };
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  if (!["client_fixed_order", "client_selected_bid"].includes(purpose)) {
    return { status: "ignored", reason: "unknown_payment_intent_purpose" };
  }
  const orderId = Number(meta.orderId);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return { status: "ignored", reason: "invalid_order_metadata" };
  }

  const amount = pi.amount != null ? Number(pi.amount) : null;
  const currency = String(pi.currency || "")
    .trim()
    .toUpperCase();

  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      if (outcomePaymentStatus === "paid") {
        return { status: "retryable_failure", reason: "order_not_found" };
      }
      return { status: "ignored", reason: "order_not_found" };
    }

    if (outcomePaymentStatus === "paid") {
      if (order.payment_status === "paid") {
        await client.query("COMMIT");
        return { status: "already_applied" };
      }
      if (purpose === "client_fixed_order") {
        if (order.order_status !== orderFlowService.ORDER_STATUSES.PENDING_PAYMENT) {
          await client.query("ROLLBACK");
          return { status: "retryable_failure", reason: "order_state_not_pending_payment" };
        }
        if (order.project_type !== "fixed" || order.source_type !== "client_created") {
          await client.query("ROLLBACK");
          return { status: "retryable_failure", reason: "order_type_mismatch" };
        }
      } else {
        if (order.order_status !== orderFlowService.ORDER_STATUSES.AWAITING_PAYMENT_AFTER_BID_SELECTION) {
          await client.query("ROLLBACK");
          return { status: "retryable_failure", reason: "order_state_not_awaiting_bid_payment" };
        }
        if (order.project_type !== "bidding" || order.source_type !== "client_created") {
          await client.query("ROLLBACK");
          return { status: "retryable_failure", reason: "order_type_mismatch" };
        }
      }
      if (
        order.stripe_checkout_expected_amount_minor != null &&
        amount != null &&
        Number(order.stripe_checkout_expected_amount_minor) !== amount
      ) {
        await client.query("ROLLBACK");
        return { status: "retryable_failure", reason: "amount_mismatch" };
      }
      const orderCur = String(order.currency_code || "JOD")
        .trim()
        .toUpperCase();
      if (currency && currency !== orderCur) {
        await client.query("ROLLBACK");
        return { status: "retryable_failure", reason: "currency_mismatch" };
      }

      const paidAt = new Date();
      if (purpose === "client_fixed_order") {
        const major = order.budget != null ? Number(order.budget) : null;
        const { rows: appliedPiFixed } = await client.query(
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
          [
            orderId,
            orderFlowService.ORDER_STATUSES.OPEN_FOR_FREELANCERS,
            pi.id || null,
            paidAt,
            Number.isFinite(major) ? major : null,
            orderCur || null,
          ],
        );
        if (!appliedPiFixed[0]) {
          await client.query("COMMIT");
          return { status: "already_applied" };
        }
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
          return { status: "retryable_failure", reason: "bid_not_found" };
        }
        const dueAt = computeDueAtFromOrder(paidAt, order.duration_value, order.duration_unit);
        const { rows: appliedPiBid } = await client.query(
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
        if (!appliedPiBid[0]) {
          await client.query("COMMIT");
          return { status: "already_applied" };
        }
        await subscriptionsService.activateCurrentSubscriptionOnFirstAcceptedOrder(
          { freelancerUserId: String(bid.freelancer_user_id), orderId, activatedAt: paidAt },
          client,
        );
        capture(String(bid.freelancer_user_id), "first_subscription_started", {
          orderId: String(orderId),
          bidId: String(bid.id),
        });
        await client.query(`UPDATE order_freelancer_bids SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [Number(bid.id)]);
        await client.query(
          `UPDATE order_freelancer_bids
             SET status = 'rejected', updated_at = NOW()
           WHERE order_id = $1
             AND id <> $2
             AND status IN ('pending','selected_pending_payment')`,
          [orderId, Number(bid.id)],
        );

        // Phase 7.1 Fair history (PaymentIntent path)
        {
          const fairDist = require("../services/marketplaceFairDistributionService");
          const { rows: rejectedBidders } = await client.query(
            `SELECT freelancer_user_id
             FROM order_freelancer_bids
             WHERE order_id = $1
               AND id <> $2
               AND status = 'rejected'`,
            [Number(orderId), Number(bid.id)],
          );
          const orderForFair = {
            ...order,
            assigned_freelancer_id: bid.freelancer_user_id,
            received_at: paidAt,
          };
          await fairDist.recordFinalEffectiveSelectionOutcome({
            client,
            order: orderForFair,
            winnerFreelancerUserId: bid.freelancer_user_id,
            loserFreelancerUserIds: rejectedBidders.map((r) => r.freelancer_user_id),
            selectionSource: "stripe_pi_client_selected_bid",
            actorRole: "system",
            actorUserId: null,
            occurredAt: paidAt,
          });
        }

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
    return { status: "applied" };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Record Stripe refund/dispute against a Bid package purchase and apply owner-approved Bid policy.
 * Authenticity: verified webhook only (signature + event claim).
 * No account suspension. No cross-source clawback. No negative Bid balance.
 */
async function applyBidPackageProviderRefundOrDisputeRecordOnly(obj, eventType) {
  const reversals = require("../services/marketplaceBidCreditPurchaseReversalsService");
  const meta = obj?.metadata || {};
  let purchaseId = Number(meta.purchaseId || meta.purchase_id || 0);

  if (!(purchaseId > 0) && obj?.payment_intent && typeof obj.payment_intent === "object") {
    const piMeta = obj.payment_intent.metadata || {};
    purchaseId = Number(piMeta.purchaseId || piMeta.purchase_id || 0);
  }

  const purpose = String(meta.purpose || "");
  if (purpose && purpose !== "bid_credit_package_purchase" && !(purchaseId > 0)) {
    // Try PI-linked purchase without purpose (charge objects often omit purpose).
    if (!obj?.payment_intent && !purchaseId) {
      return { status: "ignored", reason: "refund_not_bid_package" };
    }
  }

  const type = String(eventType || "");
  if (type === "charge.refunded") {
    return reversals.applyVerifiedChargeRefunded(obj, {
      ...meta,
      purchaseId: purchaseId > 0 ? purchaseId : meta.purchaseId,
    });
  }
  if (type.startsWith("charge.dispute.")) {
    return reversals.applyVerifiedDisputeEvent(
      obj,
      type,
      { ...meta, purchaseId: purchaseId > 0 ? purchaseId : meta.purchaseId },
    );
  }
  return { status: "ignored", reason: "unhandled_bid_pkg_reversal_type" };
}

module.exports = {
  handleStripeWebhook,
  applyCheckoutSessionCompleted,
  applyPaymentIntentOutcome,
  claimStripeWebhookEvent,
  markStripeWebhookEventProcessed,
  markStripeWebhookEventFailed,
  releaseStripeWebhookEventClaim,
};
