/**
 * Stripe Billing (mode=subscription) for recurring freelancer plans.
 * One-time Checkout remains in stripeCheckoutService; this path is separate.
 */

const { pool } = require("../config/db");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");
const { resolvePlanPayablePricing } = require("../utils/planSalePricing");
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
const { buildFreelancerPlansCheckoutReturnUrls } = require("../config/clientUrl");
const notificationService = require("./notificationService");
const subscriptionsService = require("./subscriptionsService");
const {
  assertStripeObjectMatchesSecretKey,
  getStripeSecretKey,
} = require("../utils/stripeModeGuard");

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
  if (user.stripe_customer_id) {
    try {
      const existing = await stripe.customers.retrieve(String(user.stripe_customer_id));
      assertStripeObjectMatchesSecretKey(existing, {
        label: "customer",
        key: getStripeSecretKey(),
      });
      return String(existing.id);
    } catch (err) {
      if (err && err.code === "STRIPE_MODE_MISMATCH") throw err;
      const missing =
        (err && (err.statusCode === 404 || err.code === "resource_missing")) ||
        (err && String(err.message || "").includes("No such customer"));
      if (!missing) throw err;
      await runner.query("UPDATE users SET stripe_customer_id = NULL, updated_at = NOW() WHERE id = $1", [
        uid,
      ]);
    }
  }
  const customer = await stripe.customers.create({
    email: email || user.email || undefined,
    metadata: {
      platform: "FAZAAT",
      project: "Orderz House",
      user_id: String(uid),
      metadata_version: METADATA_VERSION,
    },
  });
  assertStripeObjectMatchesSecretKey(customer, { label: "customer", key: getStripeSecretKey() });
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
  const payable = resolvePlanPayablePricing(planRow, { mode: "recurring" });
  const amountMajor = payable.effectivePriceJod;
  const amountMinor =
    payable.effectiveMinor != null
      ? payable.effectiveMinor
      : amountMajorToStripeMinor(amountMajor, currency);
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
    try {
      const priceObj = await stripe.prices.retrieve(priceId);
      assertStripeObjectMatchesSecretKey(priceObj, {
        label: "price",
        key: getStripeSecretKey(),
      });
    } catch (err) {
      if (err && err.code === "STRIPE_MODE_MISMATCH") throw err;
      // Stale/missing price: fall through to create a new Price for this key mode
      priceId = null;
    }
  }

  if (priceId && storedMinor === amountMinor) {
    return {
      productId,
      priceId,
      amountMinor,
      currency,
      interval,
      intervalCount,
      originalAmountMinor: payable.originalMinor,
      saleActive: payable.active,
      salePercentage: payable.salePercentage,
    };
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
    assertStripeObjectMatchesSecretKey(product, { label: "product", key: getStripeSecretKey() });
    productId = product.id;
  } else {
    try {
      const productObj = await stripe.products.retrieve(productId);
      assertStripeObjectMatchesSecretKey(productObj, {
        label: "product",
        key: getStripeSecretKey(),
      });
    } catch (err) {
      if (err && err.code === "STRIPE_MODE_MISMATCH") throw err;
      productId = null;
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
      assertStripeObjectMatchesSecretKey(product, { label: "product", key: getStripeSecretKey() });
      productId = product.id;
    }
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
      sale_active: payable.active ? "1" : "0",
      sale_percentage: payable.active ? String(payable.salePercentage) : "",
      original_amount_minor: payable.originalMinor != null ? String(payable.originalMinor) : "",
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

  return {
    productId,
    priceId,
    amountMinor,
    currency,
    interval,
    intervalCount,
    originalAmountMinor: payable.originalMinor,
    saleActive: payable.active,
    salePercentage: payable.salePercentage,
  };
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
    const activationMinor = needsActivationFee ? await activationFeeMinorUnits(db) : 0;
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
      originalPlanAmountMinor:
        priceInfo.originalAmountMinor != null
          ? String(priceInfo.originalAmountMinor)
          : String(priceInfo.amountMinor),
      saleActive: priceInfo.saleActive ? "1" : "0",
      salePercentage:
        priceInfo.saleActive && priceInfo.salePercentage != null
          ? String(priceInfo.salePercentage)
          : "",
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
      lineItems.push(
        await buildActivationFeeStripeLineItem(locale, {
          amountMinor: activationMinor,
          client: db,
        }),
      );
    }

    const { successUrl, cancelUrl } = buildFreelancerPlansCheckoutReturnUrls(clientUrl);

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

/**
 * Convert Stripe unix seconds → Date, or null if missing/invalid.
 * @param {unknown} unix
 * @returns {Date|null}
 */
function unixSecondsToDate(unix) {
  if (unix == null || unix === "") return null;
  const n = Number(unix);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

function subscriptionItemPriceId(item) {
  if (!item) return null;
  if (typeof item.price === "string") return String(item.price);
  if (item.price && item.price.id != null) return String(item.price.id);
  return null;
}

/**
 * Whether a subscription item is a recurring (or period-bearing) billing line.
 * Skips expanded one_time prices. Items with period timestamps but unexpanded price are kept.
 */
function isPeriodBearingSubscriptionItem(item) {
  if (!item) return false;
  const start = unixSecondsToDate(item.current_period_start);
  const end = unixSecondsToDate(item.current_period_end);
  if (!start || !end) return false;
  const price = item.price;
  if (price && typeof price === "object") {
    if (price.type === "one_time") return false;
    if (price.recurring == null && price.type === "recurring") return true;
    if (price.recurring) return true;
    // Expanded non-recurring without type — exclude
    if (price.recurring == null && price.type && price.type !== "recurring") return false;
  }
  return true;
}

/**
 * Billing period from a Stripe Subscription (legacy top-level OR Basil+ item-level).
 *
 * Strategy:
 * 1. Legacy: subscription.current_period_start / current_period_end (pre-Basil).
 * 2. Else: subscription.items.data[*] periods (API 2025-03-31.basil+).
 * 3. Prefer item matching options.preferredPriceId (stored stripe_price_id).
 * 4. If exactly one period-bearing item → use it.
 * 5. If multiple items share identical periods → use that shared period.
 * 6. If multiple items have conflicting periods → throw STRIPE_PERIOD_AMBIGUOUS
 *    (Orderz House does not support mixed-interval Billing).
 *
 * @param {object|null|undefined} sub Stripe Subscription object
 * @param {{ preferredPriceId?: string|null }} [options]
 * @returns {{ currentPeriodStart: Date|null, currentPeriodEnd: Date|null }}
 */
function periodFromStripeSubscription(sub, options = {}) {
  const preferredPriceId =
    options.preferredPriceId != null && String(options.preferredPriceId).trim()
      ? String(options.preferredPriceId).trim()
      : null;

  const legacyStart = unixSecondsToDate(sub?.current_period_start);
  const legacyEnd = unixSecondsToDate(sub?.current_period_end);
  if (legacyStart && legacyEnd) {
    return { currentPeriodStart: legacyStart, currentPeriodEnd: legacyEnd };
  }

  const items = Array.isArray(sub?.items?.data) ? sub.items.data : [];
  const candidates = items.filter(isPeriodBearingSubscriptionItem).map((item) => ({
    priceId: subscriptionItemPriceId(item),
    currentPeriodStart: unixSecondsToDate(item.current_period_start),
    currentPeriodEnd: unixSecondsToDate(item.current_period_end),
  }));

  if (candidates.length === 0) {
    return {
      currentPeriodStart: legacyStart,
      currentPeriodEnd: legacyEnd,
    };
  }

  if (preferredPriceId) {
    const matched = candidates.filter((c) => c.priceId === preferredPriceId);
    if (matched.length === 1) {
      return {
        currentPeriodStart: matched[0].currentPeriodStart,
        currentPeriodEnd: matched[0].currentPeriodEnd,
      };
    }
    if (matched.length > 1) {
      const same = matched.every(
        (c) =>
          c.currentPeriodStart.getTime() === matched[0].currentPeriodStart.getTime() &&
          c.currentPeriodEnd.getTime() === matched[0].currentPeriodEnd.getTime(),
      );
      if (same) {
        return {
          currentPeriodStart: matched[0].currentPeriodStart,
          currentPeriodEnd: matched[0].currentPeriodEnd,
        };
      }
      const err = new Error(
        "Ambiguous Stripe subscription item periods for preferred price (mixed intervals unsupported).",
      );
      err.code = "STRIPE_PERIOD_AMBIGUOUS";
      err.statusCode = 409;
      throw err;
    }
  }

  if (candidates.length === 1) {
    return {
      currentPeriodStart: candidates[0].currentPeriodStart,
      currentPeriodEnd: candidates[0].currentPeriodEnd,
    };
  }

  const samePeriod = candidates.every(
    (c) =>
      c.currentPeriodStart.getTime() === candidates[0].currentPeriodStart.getTime() &&
      c.currentPeriodEnd.getTime() === candidates[0].currentPeriodEnd.getTime(),
  );
  if (samePeriod) {
    return {
      currentPeriodStart: candidates[0].currentPeriodStart,
      currentPeriodEnd: candidates[0].currentPeriodEnd,
    };
  }

  const err = new Error(
    "Ambiguous Stripe subscription item billing periods (mixed-interval subscriptions are not supported).",
  );
  err.code = "STRIPE_PERIOD_AMBIGUOUS";
  err.statusCode = 409;
  throw err;
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
      'inactive', FALSE, NULL, NULL, NULL, TRUE,
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

  const { currentPeriodStart, currentPeriodEnd } = periodFromStripeSubscription(stripeSubscription, {
    preferredPriceId: row.stripe_price_id || null,
  });
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
         expiry_date = CASE
           WHEN has_first_order = TRUE THEN COALESCE($4, expiry_date)
           ELSE expiry_date
         END,
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
  const { currentPeriodStart, currentPeriodEnd } = periodFromStripeSubscription(stripeSubscription, {
    preferredPriceId: row.stripe_price_id || null,
  });

  if (status === "canceled" || status === "incomplete_expired") {
    await runner.query(
      `UPDATE freelancer_subscriptions
       SET status = 'cancelled',
           cancelled_at = COALESCE(cancelled_at, NOW()),
           payment_status = CASE WHEN payment_status = 'paid' THEN 'cancelled' ELSE payment_status END,
           current_period_start = COALESCE($2, current_period_start),
           current_period_end = COALESCE($3, current_period_end),
           next_renewal_at = COALESCE($3, next_renewal_at),
           expiry_date = CASE
             WHEN has_first_order = TRUE THEN COALESCE($3, expiry_date)
             ELSE expiry_date
           END,
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
           expiry_date = CASE
             WHEN has_first_order = TRUE THEN COALESCE($3, expiry_date)
             ELSE expiry_date
           END,
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
           expiry_date = CASE
             WHEN has_first_order = TRUE THEN COALESCE($3, expiry_date)
             ELSE expiry_date
           END,
           updated_at = NOW()
       WHERE id = $1`,
      [Number(row.id), currentPeriodStart, currentPeriodEnd],
    );
  }

  return { ok: true, status, currentPeriodStart, currentPeriodEnd };
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
  unixSecondsToDate,
};
