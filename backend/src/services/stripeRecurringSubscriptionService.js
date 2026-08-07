/**
 * Stripe Billing (mode=subscription) for recurring freelancer plans.
 * One-time Checkout remains in stripeCheckoutService; this path is separate.
 */

const { pool } = require("../config/db");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");
const {
  buildFazaatStripeMetadata,
  mergeStripeCheckoutMetadata,
  PAYMENT_CONTEXT,
} = require("../utils/fazaatStripeMetadata");
const {
  prepareFreelancerCheckoutSessionCreation,
  activationFeeMinorUnits,
  buildActivationFeeStripeLineItem,
  trackFreelancerCheckoutSession,
  recordActivationFeeFromStripeSession,
  markCheckoutSessionStatus,
  supersedeOpenCheckoutSessions,
  CHECKOUT_SESSION_STATUS,
} = require("./subscriptionActivationFeeService");
const {
  applyStripeSubscriptionPaymentFailedHold,
  clearPaymentFailureHoldsForFreelancer,
  CLEAR_SOURCE,
  RENEWAL_FAILED_COPY,
} = require("./freelancerAccountHoldsService");
const notificationService = require("./notificationService");
const subscriptionsService = require("./subscriptionsService");

const METADATA_VERSION = "1";
const PURPOSE_RECURRING_SUBSCRIPTION = "freelancer_recurring_subscription";
const FREELANCERS_MONTHLY_PAID_15_NAME = "freelancers_monthly_paid_15";
const PAYMENT_CONTEXT_RECURRING = PAYMENT_CONTEXT.FREELANCER_SUBSCRIPTION;

function isRecurringPlanRow(row) {
  if (!row) return false;
  if (row.is_recurring === true || row.is_recurring === "t" || row.is_recurring === 1) return true;
  return String(row.name || "").trim() === FREELANCERS_MONTHLY_PAID_15_NAME;
}

async function ensureStripeCustomerForUser({ stripe, userId, email }, client) {
  const runner = client || pool;
  const uid = Number(userId);
  const { rows } = await runner.query(
    "SELECT id, email, stripe_customer_id FROM users WHERE id = $1 LIMIT 1 FOR UPDATE",
    [uid],
  );
  const user = rows[0];
  if (!user) {
    const err = new Error("User not found.");
    err.statusCode = 404;
    throw err;
  }
  if (user.stripe_customer_id) return String(user.stripe_customer_id);
  const customer = await stripe.customers.create({
    email: email || user.email || undefined,
    metadata: {
      platform: "FAZAAT",
      project: "Orderz House",
      user_id: String(uid),
      metadata_version: METADATA_VERSION,
    },
  });
  await runner.query("UPDATE users SET stripe_customer_id = $2, updated_at = NOW() WHERE id = $1", [
    uid,
    customer.id,
  ]);
  return customer.id;
}

async function ensureStripeRecurringPriceForPlan({ stripe, planRow }, client) {
  const runner = client || pool;
  const planId = Number(planRow.id);
  const currency = String(planRow.currency || "JOD").toUpperCase();
  const amountMajor = Number(planRow.price_jod);
  const amountMinor = amountMajorToStripeMinor(amountMajor, currency);
  if (amountMinor == null || amountMinor < 1) {
    const err = new Error("Invalid recurring plan amount.");
    err.statusCode = 400;
    err.exposeToClient = true;
    throw err;
  }
  const interval = String(planRow.billing_interval || "month").toLowerCase();
  const intervalCount = Number(planRow.billing_interval_count || 1);
  if (!["day", "week", "month", "year"].includes(interval) || !Number.isInteger(intervalCount) || intervalCount < 1) {
    const err = new Error("Invalid recurring billing interval.");
    err.statusCode = 400;
    throw err;
  }

  let productId = planRow.stripe_product_id ? String(planRow.stripe_product_id) : null;
  let priceId = planRow.stripe_price_id ? String(planRow.stripe_price_id) : null;
  const storedMinor =
    planRow.stripe_price_amount_minor != null ? Number(planRow.stripe_price_amount_minor) : null;

  if (priceId && storedMinor === amountMinor) {
    return { productId, priceId, amountMinor, currency, interval, intervalCount };
  }

  if (!productId) {
    const product = await stripe.products.create({
      name: String(planRow.title || planRow.name || `Plan ${planId}`).slice(0, 120),
      metadata: {
        platform: "FAZAAT",
        project: "Orderz House",
        plan_id: String(planId),
        plan_name: String(planRow.name || ""),
        metadata_version: METADATA_VERSION,
      },
    });
    productId = product.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    currency: currency.toLowerCase(),
    unit_amount: amountMinor,
    recurring: { interval, interval_count: intervalCount },
    metadata: {
      platform: "FAZAAT",
      plan_id: String(planId),
      plan_name: String(planRow.name || ""),
      metadata_version: METADATA_VERSION,
    },
  });
  priceId = price.id;

  await runner.query(
    `UPDATE plans
     SET stripe_product_id = $2,
         stripe_price_id = $3,
         stripe_price_amount_minor = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [planId, productId, priceId, amountMinor],
  );

  return { productId, priceId, amountMinor, currency, interval, intervalCount };
}

async function findActiveRecurringSubscriptionForPlan({ freelancerUserId, planId }, client) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `SELECT *
     FROM freelancer_subscriptions
     WHERE freelancer_user_id = $1
       AND plan_id = $2
       AND is_current = TRUE
       AND billing_mode = 'recurring_stripe'
       AND stripe_subscription_id IS NOT NULL
       AND payment_status IN ('paid', 'pending')
       AND status NOT IN ('cancelled', 'expired')
     ORDER BY id DESC
     LIMIT 1`,
    [Number(freelancerUserId), Number(planId)],
  );
  return rows[0] || null;
}

async function createRecurringSubscriptionCheckoutSession({
  stripe,
  freelancerUserId,
  planRow,
  locale = "ar",
  clientUrl,
}) {
  const uid = Number(freelancerUserId);
  const pid = Number(planRow.id);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");

    const existing = await findActiveRecurringSubscriptionForPlan(
      { freelancerUserId: uid, planId: pid },
      db,
    );
    if (existing) {
      const err = new Error("You already have an active monthly subscription for this plan.");
      err.statusCode = 409;
      err.exposeToClient = true;
      err.publicCode = "RECURRING_SUBSCRIPTION_EXISTS";
      throw err;
    }

    const snap = await subscriptionsService.getFreelancerIdentitySnapshot(uid, db);
    if (!snap) {
      const err = new Error("User not found.");
      err.statusCode = 404;
      throw err;
    }
    if (!snap.isFreelancer) {
      const err = new Error("Target user must be a freelancer.");
      err.statusCode = 400;
      err.exposeToClient = true;
      throw err;
    }

    const { rows: emailRows } = await db.query("SELECT email FROM users WHERE id = $1 LIMIT 1", [uid]);
    const email = emailRows[0]?.email ? String(emailRows[0].email).trim() : null;
    const customerId = await ensureStripeCustomerForUser({ stripe, userId: uid, email }, db);
    const priceInfo = await ensureStripeRecurringPriceForPlan({ stripe, planRow }, db);

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

    const expectedAmountMinor = priceInfo.amountMinor + (needsActivationFee ? activationMinor : 0);
    const currencyUpper = priceInfo.currency.toUpperCase();

    const legacyMeta = {
      purpose: PURPOSE_RECURRING_SUBSCRIPTION,
      freelancerUserId: String(uid),
      planId: String(pid),
      displayPlanId: String(pid),
      planName: String(planRow.name || ""),
      expectedAmountMinor: String(expectedAmountMinor),
      planAmountMinor: String(priceInfo.amountMinor),
      activationFeeMinor: String(needsActivationFee ? activationMinor : 0),
      currency: currencyUpper,
      metadataVersion: METADATA_VERSION,
      stripePriceId: priceInfo.priceId,
    };
    const baseMeta = mergeStripeCheckoutMetadata(
      buildFazaatStripeMetadata({
        paymentContext: PAYMENT_CONTEXT_RECURRING,
        purpose: PURPOSE_RECURRING_SUBSCRIPTION,
        userId: uid,
        userEmail: email,
        planId: pid,
        displayPlanId: pid,
        expectedAmountMinor,
        planAmountMinor: priceInfo.amountMinor,
        activationFeeMinor: needsActivationFee ? activationMinor : 0,
        currency: currencyUpper,
      }),
      {
        ...legacyMeta,
        plan_name: String(planRow.name || ""),
        metadata_version: METADATA_VERSION,
        platform_code: "FAZAAT",
      },
    );

    const lineItems = [{ price: priceInfo.priceId, quantity: 1 }];
    if (needsActivationFee) {
      lineItems.push(buildActivationFeeStripeLineItem(locale));
    }

    const successUrl = `${clientUrl}/dashboard/freelancer/plans?freelancer_sub_paid=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${clientUrl}/dashboard/freelancer/plans?freelancer_sub_cancelled=1&session_id={CHECKOUT_SESSION_ID}`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: baseMeta,
      subscription_data: { metadata: baseMeta },
    });

    await trackFreelancerCheckoutSession(
      {
        freelancerUserId: uid,
        stripeSessionId: session.id,
        displayPlanId: pid,
        checkoutPlanId: pid,
        checkoutKind: "recurring_subscription",
        includesActivationFee: needsActivationFee,
      },
      db,
    );

    await db.query("COMMIT");
    return {
      checkoutUrl: session.url,
      sessionId: session.id,
      recurring: true,
      includesActivationFee: needsActivationFee,
    };
  } catch (err) {
    try {
      await db.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    db.release();
  }
}

function periodFromStripeSubscription(sub) {
  const start =
    sub?.current_period_start != null ? new Date(Number(sub.current_period_start) * 1000) : null;
  const end =
    sub?.current_period_end != null ? new Date(Number(sub.current_period_end) * 1000) : null;
  return {
    currentPeriodStart: start && !Number.isNaN(start.getTime()) ? start : null,
    currentPeriodEnd: end && !Number.isNaN(end.getTime()) ? end : null,
  };
}

async function fulfillRecurringSubscriptionFromCheckout(
  {
    freelancerUserId,
    planId,
    stripeSessionId,
    stripeSubscriptionId,
    stripeCustomerId,
    stripePriceId,
    stripePaymentIntentId = null,
    currentPeriodStart = null,
    currentPeriodEnd = null,
    activationFeeMinor = 0,
    paidAt = new Date(),
  },
  client,
) {
  const runner = client || pool;
  const uid = Number(freelancerUserId);
  const pid = Number(planId);
  const sid = stripeSessionId ? String(stripeSessionId).trim() : null;
  const subStripeId = stripeSubscriptionId ? String(stripeSubscriptionId).trim() : null;

  if (subStripeId) {
    const { rows: bySub } = await runner.query(
      "SELECT * FROM freelancer_subscriptions WHERE stripe_subscription_id = $1 LIMIT 1 FOR UPDATE",
      [subStripeId],
    );
    if (bySub[0]) {
      const existing = subscriptionsService.mapSubscription(bySub[0]);
      if (existing) existing.freshlyPaid = false;
      return { subscription: existing, created: false };
    }
  }

  if (sid) {
    const { rows: bySession } = await runner.query(
      "SELECT * FROM freelancer_subscriptions WHERE stripe_session_id = $1 LIMIT 1 FOR UPDATE",
      [sid],
    );
    if (bySession[0]) {
      const existing = subscriptionsService.mapSubscription(bySession[0]);
      if (existing) existing.freshlyPaid = false;
      return { subscription: existing, created: false };
    }
  }

  await subscriptionsService.endCurrentSubscription({ freelancerUserId: uid, endedAt: paidAt }, runner);

  const { rows: inserted } = await runner.query(
    `INSERT INTO freelancer_subscriptions (
      freelancer_user_id, plan_id, assigned_by_user_id, notes,
      status, has_first_order, first_order_date, actual_start_date, expiry_date, is_current,
      source, payment_status, activation_status,
      stripe_session_id, stripe_payment_intent_id, paid_at,
      billing_mode, stripe_subscription_id, stripe_customer_id, stripe_price_id,
      current_period_start, current_period_end, last_payment_at, next_renewal_at
    ) VALUES (
      $1,$2,NULL,NULL,
      'inactive', FALSE, NULL, NULL, $10, TRUE,
      'stripe', 'paid', 'company_pending',
      $3,$4,$5,
      'recurring_stripe', $6, $7, $8,
      $9, $10, $5, $10
    )
    RETURNING *`,
    [
      uid,
      pid,
      sid,
      stripePaymentIntentId || null,
      paidAt,
      subStripeId,
      stripeCustomerId || null,
      stripePriceId || null,
      currentPeriodStart,
      currentPeriodEnd,
    ],
  );

  if (Number(activationFeeMinor) > 0 && sid) {
    await recordActivationFeeFromStripeSession(
      {
        freelancerUserId: uid,
        stripeSessionId: sid,
        stripePaymentIntentId: stripePaymentIntentId || null,
        activationFeeMinor: Number(activationFeeMinor),
        paidAt,
      },
      runner,
    );
  }

  if (sid) {
    await markCheckoutSessionStatus(sid, CHECKOUT_SESSION_STATUS.COMPLETED, runner);
    await supersedeOpenCheckoutSessions(
      { stripe: null, freelancerUserId: uid, exceptStripeSessionId: sid, feeBearingOnly: true },
      runner,
    );
  }

  const mapped = subscriptionsService.mapSubscription(inserted[0]);
  if (mapped) mapped.freshlyPaid = true;
  return { subscription: mapped, created: true };
}

async function applyRecurringInvoicePaid({ stripeSubscription, invoice }, client) {
  const runner = client || pool;
  const subId = stripeSubscription?.id || invoice?.subscription;
  if (!subId) return { ok: false, reason: "missing_subscription" };

  const { rows } = await runner.query(
    "SELECT * FROM freelancer_subscriptions WHERE stripe_subscription_id = $1 LIMIT 1 FOR UPDATE",
    [String(subId)],
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "subscription_row_not_found" };

  const { currentPeriodStart, currentPeriodEnd } = periodFromStripeSubscription(stripeSubscription);
  const paidAt = invoice?.status_transitions?.paid_at
    ? new Date(Number(invoice.status_transitions.paid_at) * 1000)
    : new Date();

  await runner.query(
    `UPDATE freelancer_subscriptions
     SET payment_status = 'paid',
         payment_failure_at = NULL,
         payment_failure_code = NULL,
         payment_failure_message = NULL,
         last_failed_stripe_invoice_id = NULL,
         last_payment_at = $2,
         current_period_start = COALESCE($3, current_period_start),
         current_period_end = COALESCE($4, current_period_end),
         next_renewal_at = COALESCE($4, next_renewal_at),
         expiry_date = COALESCE($4, expiry_date),
         updated_at = NOW()
     WHERE id = $1`,
    [Number(row.id), paidAt, currentPeriodStart, currentPeriodEnd],
  );

  await clearPaymentFailureHoldsForFreelancer(
    {
      freelancerUserId: Number(row.freelancer_user_id),
      clearSource: CLEAR_SOURCE.STRIPE,
      stripeSubscriptionId: String(subId),
      clearReason: "Stripe invoice paid",
    },
    runner,
  );

  return { ok: true, freelancerUserId: Number(row.freelancer_user_id), subscriptionId: Number(row.id) };
}

async function applyRecurringInvoicePaymentFailed({ stripeSubscription, invoice }, client) {
  const runner = client || pool;
  const subId = stripeSubscription?.id || invoice?.subscription;
  if (!subId) return { ok: false, reason: "missing_subscription", createdHold: false };

  const { rows } = await runner.query(
    "SELECT * FROM freelancer_subscriptions WHERE stripe_subscription_id = $1 LIMIT 1 FOR UPDATE",
    [String(subId)],
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "subscription_row_not_found", createdHold: false };

  const invoiceId = invoice?.id ? String(invoice.id) : null;
  const failCode =
    invoice?.last_finalization_error?.code ||
    invoice?.status ||
    "invoice_payment_failed";
  const failMsgSafe = "Stripe recurring invoice payment failed";

  await runner.query(
    `UPDATE freelancer_subscriptions
     SET payment_status = 'failed',
         payment_failure_at = NOW(),
         payment_failure_code = $2,
         payment_failure_message = $3,
         last_failed_stripe_invoice_id = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [Number(row.id), String(failCode).slice(0, 80), failMsgSafe, invoiceId],
  );

  const { hold, created } = await applyStripeSubscriptionPaymentFailedHold(
    {
      freelancerUserId: Number(row.freelancer_user_id),
      stripeSubscriptionId: String(subId),
      stripeInvoiceId: invoiceId,
      failureCode: failCode,
      failureMessage: failMsgSafe,
    },
    runner,
  );

  if (created) {
    const copy = RENEWAL_FAILED_COPY.ar;
    await notificationService.createIfNotExists(
      {
        recipientUserId: Number(row.freelancer_user_id),
        recipientRole: "freelancer",
        actorUserId: null,
        type: "subscription_renewal_failed",
        title: copy.title,
        message: copy.message,
        entityType: "subscription",
        entityId: Number(row.id),
        link: "/dashboard/freelancer/plans",
        priority: "high",
        metadata: {
          subscriptionId: String(row.id),
          stripeSubscriptionId: String(subId),
          stripeInvoiceId: invoiceId,
          redirectTo: "/dashboard/support",
          holdId: hold?.id || null,
        },
      },
      invoiceId ? `fsub_renewal_failed_inv_${invoiceId}` : `fsub_renewal_failed_sub_${row.id}`,
      runner,
    );
  }

  return {
    ok: true,
    createdHold: created,
    freelancerUserId: Number(row.freelancer_user_id),
    subscriptionId: Number(row.id),
    hold,
  };
}

async function syncRecurringSubscriptionStatus({ stripeSubscription }, client) {
  const runner = client || pool;
  const subId = stripeSubscription?.id;
  if (!subId) return { ok: false };
  const { rows } = await runner.query(
    "SELECT * FROM freelancer_subscriptions WHERE stripe_subscription_id = $1 LIMIT 1 FOR UPDATE",
    [String(subId)],
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found" };

  const status = String(stripeSubscription.status || "").toLowerCase();
  const { currentPeriodStart, currentPeriodEnd } = periodFromStripeSubscription(stripeSubscription);

  if (status === "canceled" || status === "incomplete_expired") {
    await runner.query(
      `UPDATE freelancer_subscriptions
       SET status = 'cancelled',
           cancelled_at = COALESCE(cancelled_at, NOW()),
           payment_status = CASE WHEN payment_status = 'paid' THEN 'cancelled' ELSE payment_status END,
           current_period_start = COALESCE($2, current_period_start),
           current_period_end = COALESCE($3, current_period_end),
           next_renewal_at = COALESCE($3, next_renewal_at),
           updated_at = NOW()
       WHERE id = $1`,
      [Number(row.id), currentPeriodStart, currentPeriodEnd],
    );
  } else if (status === "past_due" || status === "unpaid") {
    await runner.query(
      `UPDATE freelancer_subscriptions
       SET payment_status = 'failed',
           current_period_start = COALESCE($2, current_period_start),
           current_period_end = COALESCE($3, current_period_end),
           next_renewal_at = COALESCE($3, next_renewal_at),
           updated_at = NOW()
       WHERE id = $1`,
      [Number(row.id), currentPeriodStart, currentPeriodEnd],
    );
  } else if (status === "active" || status === "trialing") {
    await runner.query(
      `UPDATE freelancer_subscriptions
       SET payment_status = 'paid',
           current_period_start = COALESCE($2, current_period_start),
           current_period_end = COALESCE($3, current_period_end),
           next_renewal_at = COALESCE($3, next_renewal_at),
           updated_at = NOW()
       WHERE id = $1`,
      [Number(row.id), currentPeriodStart, currentPeriodEnd],
    );
  }

  return { ok: true, status };
}

module.exports = {
  METADATA_VERSION,
  PURPOSE_RECURRING_SUBSCRIPTION,
  FREELANCERS_MONTHLY_PAID_15_NAME,
  isRecurringPlanRow,
  ensureStripeCustomerForUser,
  ensureStripeRecurringPriceForPlan,
  findActiveRecurringSubscriptionForPlan,
  createRecurringSubscriptionCheckoutSession,
  fulfillRecurringSubscriptionFromCheckout,
  applyRecurringInvoicePaid,
  applyRecurringInvoicePaymentFailed,
  syncRecurringSubscriptionStatus,
  periodFromStripeSubscription,
};
