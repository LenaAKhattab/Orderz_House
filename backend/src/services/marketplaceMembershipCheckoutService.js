/**
 * Marketplace-M2/M3 — Stripe Checkout + webhook grant for paid marketplace memberships.
 *
 * M2: create Checkout Session (mode=payment). Does NOT grant membership.
 * M3: checkout.session.completed → purchased_pending_start (term NOT started).
 * Success redirect must never activate membership.
 */

const crypto = require("crypto");
const Stripe = require("stripe");
const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");
const {
  getPrimaryClientUrl,
  buildFreelancerMarketplaceMembershipCheckoutReturnUrls,
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
  resolveMarketplaceMembershipPayablePricing,
} = require("../utils/marketplaceMembershipSalePricing");
const {
  isPaidMarketplaceMembershipTier,
} = require("../utils/marketplaceMembershipPendingStart");
const {
  MARKETPLACE_MEMBERSHIP_CHECKOUT_PURPOSE,
  MARKETPLACE_MEMBERSHIP_CHECKOUT_CURRENCY,
  MARKETPLACE_MEMBERSHIP_CHECKOUT_FLOW,
  MARKETPLACE_MEMBERSHIP_CHECKOUT_MODE,
  MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES,
  normalizeMarketplaceCheckoutPlanCode,
  buildMarketplaceMembershipCheckoutIdempotencyKey,
} = require("../constants/marketplaceMembershipCheckout");
const plansService = require("./marketplaceMembershipPlansService");

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
    {
      exposeToClient: true,
      publicCode: MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.STRIPE_NOT_CONFIGURED,
    },
  );
}

function requireStripeClientUrl() {
  const clientUrl = getPrimaryClientUrl();
  if (!clientUrl) {
    throw createAppError(
      "CLIENT_URL is not configured (set a single origin, e.g. https://orderzhouse.com).",
      500,
    );
  }
  try {
    // eslint-disable-next-line no-new
    new URL(clientUrl);
  } catch {
    throw createAppError("CLIENT_URL must be a single valid http(s) URL.", 500, {
      exposeToClient: true,
    });
  }
  return clientUrl;
}

/**
 * Resolve + validate a paid marketplace plan for Stripe checkout.
 * @returns {Promise<{ plan: object, planCode: string, durationDays: number, priceJod: number, expectedAmountMinor: number, currency: string }>}
 */
async function resolvePaidMarketplacePlanForCheckout(planCodeRaw, deps = {}) {
  const planCode = normalizeMarketplaceCheckoutPlanCode(planCodeRaw);
  if (!planCode) {
    throw createAppError("planCode is required (SILVER | PRO | ELITE).", 400, {
      exposeToClient: true,
      publicCode: MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.INVALID_PLAN_CODE,
    });
  }
  if (planCode === "starter" || planCode === "free") {
    throw createAppError("STARTER / free plans do not use Stripe checkout.", 400, {
      exposeToClient: true,
      publicCode: MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.STARTER_NOT_STRIPE,
    });
  }
  if (!isPaidMarketplaceMembershipTier(planCode)) {
    throw createAppError("Only SILVER, PRO, or ELITE marketplace memberships can be purchased.", 400, {
      exposeToClient: true,
      publicCode: MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.INVALID_PLAN_CODE,
      details: { planCode },
    });
  }

  const getPlan =
    deps.getPlanByTierCode || ((code) => plansService.getMarketplaceMembershipPlanByTierCode(code));
  const plan = await getPlan(planCode);
  if (!plan) {
    throw createAppError("Marketplace membership plan not found.", 404, {
      exposeToClient: true,
      publicCode: MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.PLAN_NOT_FOUND,
    });
  }
  if (!plan.isActive) {
    throw createAppError("This marketplace membership plan is not available.", 400, {
      exposeToClient: true,
      publicCode: MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.PLAN_INACTIVE,
    });
  }
  if (!isPaidMarketplaceMembershipTier(plan.tierCode)) {
    throw createAppError("Plan is not a paid marketplace membership.", 400, {
      exposeToClient: true,
      publicCode: MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.PLAN_NOT_PAID,
    });
  }

  const currency = MARKETPLACE_MEMBERSHIP_CHECKOUT_CURRENCY;
  const payable = resolveMarketplaceMembershipPayablePricing(plan);
  const priceJod = Number(payable?.effectivePriceJod);
  if (!Number.isFinite(priceJod) || priceJod <= 0) {
    throw createAppError("Marketplace membership price must be greater than zero.", 400, {
      exposeToClient: true,
      publicCode: MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.INVALID_PRICE,
    });
  }

  const durationDays = Number(plan.cycleDurationDays);
  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw createAppError("Marketplace membership durationDays is invalid.", 400, {
      exposeToClient: true,
      publicCode: MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.INVALID_DURATION,
    });
  }

  const expectedAmountMinor = amountMajorToStripeMinor(priceJod, currency);
  if (!Number.isInteger(expectedAmountMinor) || expectedAmountMinor < 1) {
    throw createAppError("Unable to compute Stripe amount for marketplace membership.", 400, {
      exposeToClient: true,
      publicCode: MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.INVALID_PRICE,
    });
  }

  return {
    plan,
    planCode: String(plan.tierCode).toLowerCase(),
    durationDays,
    priceJod,
    expectedAmountMinor,
    currency,
    saleActive: Boolean(payable?.active),
  };
}

/**
 * Create Stripe Checkout Session for a paid marketplace membership.
 * Does NOT write membership rows. Does NOT call createPurchasedPendingStartMembership.
 *
 * @param {{
 *   freelancerUserId: number|string,
 *   planCode?: string,
 *   tierCode?: string,
 *   locale?: string,
 * }} input
 * @param {{ stripe?: object, getPlanByTierCode?: Function, db?: object }} [deps]
 */
async function createMarketplaceMembershipCheckoutSession(input = {}, deps = {}) {
  const freelancerUserId = Number(input.freelancerUserId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    throw createAppError("freelancerUserId is required.", 400, {
      exposeToClient: true,
      publicCode: MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.FREELANCER_INVALID,
    });
  }

  const planCodeRaw = input.planCode != null ? input.planCode : input.tierCode;
  const resolved = await resolvePaidMarketplacePlanForCheckout(planCodeRaw, deps);

  const db = deps.db || pool;
  const { rows: userRows } = await db.query(
    `SELECT id, role, is_active, email FROM users WHERE id = $1 LIMIT 1`,
    [freelancerUserId],
  );
  const user = userRows[0];
  if (!user || user.role !== "freelancer" || user.is_active !== true) {
    throw createAppError("Freelancer account is not eligible for Marketplace Membership checkout.", 403, {
      exposeToClient: true,
      publicCode: MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.FREELANCER_INVALID,
    });
  }

  const stripe = deps.stripe || getStripeOrNull();
  if (!stripe) throwStripeNotConfigured();

  const clientUrl = requireStripeClientUrl();
  const returnUrls = buildFreelancerMarketplaceMembershipCheckoutReturnUrls(clientUrl);

  const nonce = crypto.randomBytes(8).toString("hex");
  const idempotencyKey = buildMarketplaceMembershipCheckoutIdempotencyKey(
    freelancerUserId,
    resolved.plan.id,
    nonce,
  );

  const sessionMetadata = mergeStripeCheckoutMetadata(
    buildFazaatStripeMetadata({
      paymentContext: PAYMENT_CONTEXT.MARKETPLACE_MEMBERSHIP,
      purpose: MARKETPLACE_MEMBERSHIP_CHECKOUT_PURPOSE,
      userId: freelancerUserId,
      userEmail: user.email,
      marketplacePlanId: resolved.plan.id,
      planId: resolved.plan.id,
      planCode: resolved.planCode,
      durationDays: resolved.durationDays,
      expectedAmountMinor: resolved.expectedAmountMinor,
      flow: MARKETPLACE_MEMBERSHIP_CHECKOUT_FLOW,
      currency: resolved.currency,
    }),
    {
      purpose: MARKETPLACE_MEMBERSHIP_CHECKOUT_PURPOSE,
      flow: MARKETPLACE_MEMBERSHIP_CHECKOUT_FLOW,
      freelancerUserId: String(freelancerUserId),
      marketplacePlanId: String(resolved.plan.id),
      planCode: resolved.planCode,
      durationDays: String(resolved.durationDays),
      expectedAmountMinor: String(resolved.expectedAmountMinor),
      // Explicit: term does not start at payment — first real order (M4).
      termStartPolicy: "first_real_order",
    },
  );

  const productName =
    lineItemProductNameForContext(PAYMENT_CONTEXT.MARKETPLACE_MEMBERSHIP) ||
    "FAZAAT - Orderz House - Marketplace Membership";
  const piDescription =
    paymentIntentDescriptionForContext(PAYMENT_CONTEXT.MARKETPLACE_MEMBERSHIP) || productName;
  const planLabel =
    resolved.plan.nameEn || resolved.plan.nameAr || String(resolved.planCode).toUpperCase();

  const session = await stripe.checkout.sessions.create(
    {
      mode: MARKETPLACE_MEMBERSHIP_CHECKOUT_MODE,
      success_url: returnUrls.successUrl,
      cancel_url: returnUrls.cancelUrl,
      client_reference_id: `marketplace_membership:${freelancerUserId}:${resolved.plan.id}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: String(resolved.currency).toLowerCase(),
            unit_amount: resolved.expectedAmountMinor,
            product_data: {
              name: productName,
              description: `${planLabel} · ${resolved.durationDays} days`,
            },
          },
        },
      ],
      metadata: sessionMetadata,
      payment_intent_data: {
        metadata: sessionMetadata,
        description: piDescription,
      },
    },
    { idempotencyKey },
  );

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    planCode: resolved.planCode,
    marketplacePlanId: String(resolved.plan.id),
    durationDays: resolved.durationDays,
    amountJod: resolved.priceJod,
    currency: resolved.currency,
    mode: MARKETPLACE_MEMBERSHIP_CHECKOUT_MODE,
    // Explicit product contract for clients / tests
    membershipGranted: false,
    termStarted: false,
    grantsOn: "webhook_m3",
    termStartsOn: "first_real_order_m4",
  };
}

function metaPick(meta, ...keys) {
  const m = meta && typeof meta === "object" ? meta : {};
  for (const key of keys) {
    if (m[key] != null && String(m[key]).trim() !== "") return m[key];
  }
  return null;
}

function isMarketplaceMembershipCheckoutPurpose(meta = {}) {
  const purpose = String(metaPick(meta, "purpose") || "");
  return purpose === MARKETPLACE_MEMBERSHIP_CHECKOUT_PURPOSE;
}

function isMarketplaceMembershipCheckoutFlow(meta = {}) {
  const flow = String(metaPick(meta, "flow", "payment_context") || "").toLowerCase();
  return flow === MARKETPLACE_MEMBERSHIP_CHECKOUT_FLOW;
}

/**
 * Marketplace-M3 — grant purchased_pending_start from checkout.session.completed.
 * Does NOT start paid term (M4). Does NOT create activation requests.
 * Idempotent on Stripe Checkout Session id (purchase_payment_reference).
 *
 * @returns {Promise<{ status: string, reason?: string|null, membership?: object|null, created?: boolean }>}
 */
async function applyMarketplaceMembershipCheckoutSessionCompleted(
  session,
  meta = {},
  dbPool = pool,
  deps = {},
) {
  const sessionMeta = {
    ...(session?.metadata && typeof session.metadata === "object" ? session.metadata : {}),
    ...(meta && typeof meta === "object" ? meta : {}),
  };

  if (!isMarketplaceMembershipCheckoutPurpose(sessionMeta)) {
    return { status: "ignored", reason: "not_marketplace_membership_purpose" };
  }
  if (!isMarketplaceMembershipCheckoutFlow(sessionMeta)) {
    return { status: "ignored", reason: "marketplace_membership_flow_mismatch" };
  }

  const { isCheckoutSessionPaymentSuccessful } = require("../utils/stripeSessionPaymentStatus");
  if (!isCheckoutSessionPaymentSuccessful(session)) {
    return { status: "ignored", reason: "marketplace_membership_checkout_not_paid" };
  }

  const mode = String(session?.mode || "").toLowerCase();
  if (mode && mode !== MARKETPLACE_MEMBERSHIP_CHECKOUT_MODE) {
    return { status: "ignored", reason: "marketplace_membership_mode_not_payment" };
  }

  const sessionId = session?.id != null ? String(session.id).trim() : "";
  if (!sessionId) {
    return { status: "ignored", reason: "marketplace_membership_missing_session_id" };
  }

  const freelancerUserId = Number(
    metaPick(sessionMeta, "freelancerUserId", "user_id", "userId"),
  );
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    return { status: "ignored", reason: "marketplace_membership_invalid_freelancer" };
  }

  const planCodeRaw = metaPick(sessionMeta, "planCode", "plan_code", "tierCode", "tier_code");
  const planCodeNorm = normalizeMarketplaceCheckoutPlanCode(planCodeRaw);
  if (planCodeNorm === "starter" || planCodeNorm === "free") {
    return { status: "ignored", reason: "marketplace_membership_starter_not_stripe" };
  }

  let marketplacePlanId = Number(
    metaPick(sessionMeta, "marketplacePlanId", "marketplace_plan_id", "plan_id", "planId"),
  );
  if (!Number.isInteger(marketplacePlanId) || marketplacePlanId < 1) {
    marketplacePlanId = null;
  }

  const getPlanById =
    deps.getPlanById || ((id, client) => plansService.getMarketplaceMembershipPlanById(id, client));
  const getPlanByTier =
    deps.getPlanByTierCode ||
    ((code, client) => plansService.getMarketplaceMembershipPlanByTierCode(code, client));

  let plan = null;
  try {
    if (marketplacePlanId) {
      plan = await getPlanById(marketplacePlanId, null);
    }
    if (!plan && planCodeNorm) {
      plan = await getPlanByTier(planCodeNorm, null);
    }
  } catch (err) {
    return {
      status: "ignored",
      reason: "marketplace_membership_plan_lookup_failed",
      detail: err?.publicCode || err?.code || null,
    };
  }

  if (!plan) {
    return { status: "ignored", reason: "marketplace_membership_plan_not_found" };
  }
  if (!plan.isActive) {
    return { status: "ignored", reason: "marketplace_membership_plan_inactive" };
  }
  if (!isPaidMarketplaceMembershipTier(plan.tierCode)) {
    return { status: "ignored", reason: "marketplace_membership_plan_not_paid" };
  }
  if (planCodeNorm && planCodeNorm !== String(plan.tierCode).toLowerCase()) {
    return { status: "ignored", reason: "marketplace_membership_plan_code_mismatch" };
  }

  const durationDays = Number(plan.cycleDurationDays);
  if (!Number.isInteger(durationDays) || durationDays < 1) {
    return { status: "ignored", reason: "marketplace_membership_invalid_duration" };
  }
  const metaDuration = Number(metaPick(sessionMeta, "durationDays", "duration_days"));
  if (Number.isInteger(metaDuration) && metaDuration >= 1 && metaDuration !== durationDays) {
    return { status: "ignored", reason: "marketplace_membership_duration_mismatch" };
  }

  const payable = resolveMarketplaceMembershipPayablePricing(plan);
  const priceJod = Number(payable?.effectivePriceJod);
  if (!Number.isFinite(priceJod) || priceJod <= 0) {
    return { status: "ignored", reason: "marketplace_membership_invalid_price" };
  }
  const expectedAmountMinor = amountMajorToStripeMinor(
    priceJod,
    MARKETPLACE_MEMBERSHIP_CHECKOUT_CURRENCY,
  );
  const metaExpected = Number(metaPick(sessionMeta, "expectedAmountMinor", "expected_amount_minor"));
  if (
    Number.isInteger(metaExpected) &&
    metaExpected >= 1 &&
    Number.isInteger(expectedAmountMinor) &&
    metaExpected !== expectedAmountMinor
  ) {
    return { status: "ignored", reason: "marketplace_membership_expected_amount_mismatch" };
  }

  if (session.amount_total != null) {
    const paidTotal = Number(session.amount_total);
    if (!Number.isInteger(paidTotal) || paidTotal !== expectedAmountMinor) {
      return { status: "ignored", reason: "marketplace_membership_amount_mismatch" };
    }
  }
  if (session.currency != null) {
    const cur = String(session.currency).toLowerCase();
    if (cur !== String(MARKETPLACE_MEMBERSHIP_CHECKOUT_CURRENCY).toLowerCase()) {
      return { status: "ignored", reason: "marketplace_membership_currency_mismatch" };
    }
  }

  let purchasedAt = new Date();
  if (session.created != null) {
    const createdUnix = Number(session.created);
    if (Number.isFinite(createdUnix) && createdUnix > 0) {
      purchasedAt = new Date(createdUnix * 1000);
    }
  }

  const createPending =
    deps.createPurchasedPendingStartMembership ||
    ((input) => {
      const membershipsService = require("./marketplaceMembershipsService");
      return membershipsService.createPurchasedPendingStartMembership(input);
    });

  try {
    const out = await createPending({
      freelancerUserId,
      marketplacePlanId: Number(plan.id),
      source: "stripe",
      purchasePaymentReference: sessionId,
      purchasedAt,
      now: purchasedAt,
      notes: `Stripe Checkout ${sessionId}`,
      client: deps.client || null,
    });

    const membership = out?.membership || null;
    if (
      membership?.paidTermStartsAt != null ||
      membership?.paidTermEndsAt != null ||
      membership?.firstOrderStartedAt != null
    ) {
      // Idempotent replay of already-started membership must not rewrite dates;
      // do not treat as a fresh grant failure.
      if (out?.idempotentReplay) {
        return {
          status: "already_applied",
          reason: "marketplace_membership_already_granted",
          membership,
          created: false,
          termStarted: Boolean(membership.paidTermStartsAt),
        };
      }
    }

    return {
      status: out?.idempotentReplay ? "already_applied" : "applied",
      reason: out?.idempotentReplay
        ? "marketplace_membership_already_granted"
        : "marketplace_membership_purchased_pending_start",
      membership,
      created: Boolean(out?.created),
      termStarted: false,
    };
  } catch (err) {
    const code = err?.publicCode || err?.code || null;
    if (
      code === "MEMBERSHIP_FREELANCER_INVALID" ||
      code === MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.FREELANCER_INVALID
    ) {
      return { status: "ignored", reason: "marketplace_membership_freelancer_invalid" };
    }
    if (code === "MARKETPLACE_PLAN_NOT_FOUND" || code === "MEMBERSHIP_PENDING_START_PAID_ONLY") {
      return { status: "ignored", reason: "marketplace_membership_plan_rejected", detail: code };
    }
    if (code === "MEMBERSHIP_PENDING_START_SCHEMA_MISSING") {
      return { status: "retryable_failure", reason: "marketplace_membership_schema_missing" };
    }
    throw err;
  }
}

module.exports = {
  createMarketplaceMembershipCheckoutSession,
  resolvePaidMarketplacePlanForCheckout,
  applyMarketplaceMembershipCheckoutSessionCompleted,
  isMarketplaceMembershipCheckoutPurpose,
  isMarketplaceMembershipCheckoutFlow,
  getStripeOrNull,
};
