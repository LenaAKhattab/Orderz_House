/**
 * Phase A6 — Silver conversion CTA + marketplace paid-activation handoff.
 *
 * Reuses existing marketplace membership activation requests (company approval).
 * Does not create card checkout sessions, payment records, wallets, or claims.
 * Does not modify payment webhooks or the orders domain service.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  FREELANCER_ACTIVATION_EVENT_TYPES,
  FREELANCER_ACTIVATION_ERROR_CODES,
  FREELANCER_ACTIVATION_PAID_SYNC_FROM_STATUSES,
  FREELANCER_ACTIVATION_CONVERSION_REASONS,
  FREELANCER_ACTIVATION_NEXT_ACTIONS,
  FREELANCER_ACTIVATION_SETTINGS_DEFAULTS,
  FREELANCER_ACTIVATION_CAMPAIGN_DEFAULTS,
  normalizeSilverPlanCode,
} = require("../constants/freelancerActivationEngine");
const { E1_PLAN_SPECS } = require("../constants/marketplaceMembershipPlans");
const engine = require("./freelancerActivationEngineService");
const earnedBalanceService = require("./freelancerActivationEarnedBalanceService");
const plansService = require("./marketplaceMembershipPlansService");
const activationRequestService = require("./marketplaceMembershipActivationRequestService");
const { parseJodToMillis } = require("../utils/marketplaceBidPoolMoney");

const PLANS_ROUTE = "/dashboard/freelancer/plans";
const CHECKOUT_HANDOFF = "marketplace_activation_request";

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

function formatPriceJod(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return FREELANCER_ACTIVATION_CAMPAIGN_DEFAULTS.silverPriceJod;
  return n.toFixed(3);
}

function catalogSilverFallback(tierCode) {
  const code = normalizeSilverPlanCode(tierCode);
  const spec = E1_PLAN_SPECS[code] || E1_PLAN_SPECS.silver;
  return {
    code,
    id: null,
    name: code === "silver" ? "Silver" : code,
    priceJod: formatPriceJod(spec.priceJod),
    billingPeriodDays: spec.durationDays ?? 30,
  };
}

async function resolveSilverPlan(settings, client) {
  const code = normalizeSilverPlanCode(settings?.silverPlanCode);
  try {
    const plan = await plansService.getMarketplaceMembershipPlanByTierCode(code, client);
    if (plan && plan.id) {
      return {
        code: String(plan.tierCode || code).toLowerCase(),
        id: Number(plan.id),
        name: plan.nameAr || plan.nameEn || "Silver",
        priceJod: formatPriceJod(plan.monthlyPriceJod),
        billingPeriodDays: plan.cycleDurationDays ?? E1_PLAN_SPECS.silver.durationDays,
      };
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
  }
  return catalogSilverFallback(code);
}

function buildCtaCopy({ reason, priceJod }) {
  const priceLabel = String(priceJod || FREELANCER_ACTIVATION_CAMPAIGN_DEFAULTS.silverPriceJod).replace(
    /\.000$/,
    "",
  );
  const buttonLabel = `الترقية إلى Silver – ${priceLabel} JOD`;
  const secondaryLabel = "عرض تفاصيل الرصيد المكتسب";

  if (reason === FREELANCER_ACTIVATION_CONVERSION_REASONS.TRIAL_EXPIRED) {
    return {
      title: "استمر في استقبال فرص العمل عبر Silver",
      description:
        "انتهت تجربة العمل. يمكنك الترقية إلى Silver للاستمرار في التقديم على الفرص.",
      buttonLabel,
      secondaryLabel,
    };
  }
  if (reason === FREELANCER_ACTIVATION_CONVERSION_REASONS.WORK_CAP_REACHED) {
    return {
      title: "استمر في استقبال فرص العمل عبر Silver",
      description:
        "لقد وصلت إلى الحد التجريبي للأعمال المقبولة. للمتابعة، انتقل إلى Silver.",
      buttonLabel,
      secondaryLabel,
    };
  }
  return {
    title: "استمر في استقبال فرص العمل عبر Silver",
    description:
      "لقد جرّبت دورة العمل الحقيقية داخل المنصة. للمتابعة بعد التجربة والوصول إلى فرص أكثر، انتقل إلى باقة Silver.",
    buttonLabel,
    secondaryLabel,
  };
}

function resolveConversionReason({ trial, usage, earnedPendingMillis, daysRemaining }) {
  if (!trial) return FREELANCER_ACTIVATION_CONVERSION_REASONS.NONE;
  if (trial.status === "trial_expired_high_intent") {
    return FREELANCER_ACTIVATION_CONVERSION_REASONS.TRIAL_EXPIRED;
  }
  const accepted = Number(usage?.acceptedWorkCount ?? trial.acceptedWorkCount ?? 0);
  const cap = Number(usage?.successfulWorkCap ?? trial.successfulWorkCap ?? 2);
  if (accepted >= cap && cap >= 0) {
    return FREELANCER_ACTIVATION_CONVERSION_REASONS.WORK_CAP_REACHED;
  }
  if (
    daysRemaining != null &&
    daysRemaining >= 0 &&
    daysRemaining <= 3 &&
    trial.status === "trial_active"
  ) {
    return FREELANCER_ACTIVATION_CONVERSION_REASONS.LAST_3_DAYS;
  }
  if (trial.firstAcceptedAt || accepted > 0) {
    return FREELANCER_ACTIVATION_CONVERSION_REASONS.FIRST_ACCEPTED;
  }
  const published = Number(usage?.publishedWorkCount ?? trial.publishedWorkCount ?? 0);
  if (trial.firstPublishedAt || published > 0) {
    return FREELANCER_ACTIVATION_CONVERSION_REASONS.FIRST_PUBLISHED;
  }
  if (earnedPendingMillis > 0) {
    return FREELANCER_ACTIVATION_CONVERSION_REASONS.EARNED_BALANCE;
  }
  const used = Number(usage?.trialBidsUsed ?? 0);
  const limit = Number(usage?.trialBidLimit ?? trial.trialBidLimit ?? 20);
  if (limit >= 0 && used >= limit) {
    return FREELANCER_ACTIVATION_CONVERSION_REASONS.NO_TRIAL_BIDS_REMAINING;
  }
  return FREELANCER_ACTIVATION_CONVERSION_REASONS.NONE;
}

function shouldShowSilverCta({
  engineEnabled,
  isFreelancer,
  paidActive,
  nextRequiredAction,
  reason,
}) {
  if (!engineEnabled) return false;
  if (!isFreelancer) return false;
  if (paidActive) return false;
  const blocked = new Set([
    FREELANCER_ACTIVATION_NEXT_ACTIONS.VERIFY_EMAIL,
    FREELANCER_ACTIVATION_NEXT_ACTIONS.COMPLETE_ACTIVATION,
    FREELANCER_ACTIVATION_NEXT_ACTIONS.COMPLETE_TRAINING,
  ]);
  if (blocked.has(nextRequiredAction)) return false;
  return reason !== FREELANCER_ACTIVATION_CONVERSION_REASONS.NONE;
}

/**
 * If current marketplace membership is paid Silver/Pro/Elite, mark trial paid_active.
 * Does not create memberships or edit payment records.
 * After paid is confirmed, best-effort Work Inventory Reserve allocation (A8).
 */
async function syncActivationPaidStatus(userId, { client = null, now = new Date() } = {}) {
  const runner = client || pool;
  const freelancerUserId = Number(userId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    return { synced: false, paidActive: false, trial: null };
  }

  let paid;
  try {
    paid = await engine.loadPaidMembership(runner, freelancerUserId);
  } catch (err) {
    if (isMissingSchema(err)) {
      return { synced: false, paidActive: false, trial: null };
    }
    throw err;
  }

  if (!paid?.hasActivePaidSilver) {
    return { synced: false, paidActive: false, trial: null, paid };
  }

  let trialRow;
  try {
    trialRow = await engine.loadTrialRow(runner, freelancerUserId);
  } catch (err) {
    if (isMissingSchema(err)) {
      await maybeAllocateWorkInventoryReserve(freelancerUserId, { client: runner, now, paid });
      return { synced: false, paidActive: true, trial: null, paid };
    }
    throw err;
  }

  let trial = engine.mapTrialRow(trialRow);
  if (!trial) {
    await maybeAllocateWorkInventoryReserve(freelancerUserId, { client: runner, now, paid });
    return { synced: false, paidActive: true, trial: null, paid };
  }

  if (trial.status === "paid_active") {
    if (!trial.silverPaidAt) {
      try {
        const { rows } = await runner.query(
          `UPDATE freelancer_activation_trials
              SET silver_paid_at = COALESCE(silver_paid_at, $2::timestamptz),
                  updated_at = NOW()
            WHERE id = $1
              AND silver_paid_at IS NULL
            RETURNING *`,
          [trial.id, now.toISOString()],
        );
        trial = engine.mapTrialRow(rows[0]) || {
          ...trial,
          silverPaidAt: now.toISOString(),
        };
      } catch (err) {
        if (!isMissingSchema(err)) throw err;
      }
    }
    await maybeAllocateWorkInventoryReserve(freelancerUserId, { client: runner, now, paid });
    return { synced: false, paidActive: true, trial, paid };
  }

  if (!FREELANCER_ACTIVATION_PAID_SYNC_FROM_STATUSES.includes(String(trial.status || ""))) {
    await maybeAllocateWorkInventoryReserve(freelancerUserId, { client: runner, now, paid });
    return { synced: false, paidActive: true, trial, paid };
  }

  try {
    const { rows } = await runner.query(
      `UPDATE freelancer_activation_trials
          SET status = 'paid_active',
              silver_paid_at = COALESCE(silver_paid_at, $2::timestamptz),
              updated_at = NOW()
        WHERE id = $1
          AND status = ANY($3::text[])
        RETURNING *`,
      [trial.id, now.toISOString(), [...FREELANCER_ACTIVATION_PAID_SYNC_FROM_STATUSES]],
    );
    const updated = engine.mapTrialRow(rows[0]);
    if (updated) {
      trial = updated;
      await engine.insertEvent(runner, {
        freelancerUserId,
        trialId: trial.id,
        eventType: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAID_DETECTED,
        metadata: {
          tierCode: paid.currentTierCode,
          membershipId: paid.currentMembershipId,
        },
      });
      await maybeAllocateWorkInventoryReserve(freelancerUserId, { client: runner, now, paid });
      return { synced: true, paidActive: true, trial, paid };
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
  }

  await maybeAllocateWorkInventoryReserve(freelancerUserId, { client: runner, now, paid });
  return { synced: false, paidActive: true, trial, paid };
}

async function maybeAllocateWorkInventoryReserve(freelancerUserId, { client, now, paid }) {
  try {
    const reserve = require("./freelancerActivationWorkInventoryReserveService");
    await reserve.allocateWorkInventoryReserveForPaidMembership(freelancerUserId, {
      client,
      now,
      paid,
    });
  } catch {
    /* A8 must not break paid-status sync or conversion reads */
  }
}

function emptyConversionPayload(settingsOverrides = {}) {
  const settings = { ...FREELANCER_ACTIVATION_SETTINGS_DEFAULTS, ...settingsOverrides };
  const silverPlan = catalogSilverFallback(settings.silverPlanCode);
  return {
    engineEnabled: Boolean(settings.engineEnabled),
    shouldShowSilverCta: false,
    reason: FREELANCER_ACTIVATION_CONVERSION_REASONS.NONE,
    trialStatus: "not_started",
    daysRemaining: null,
    trialEndsAt: null,
    workCapReached: false,
    acceptedWorkCount: 0,
    publishedWorkCount: 0,
    earnedBalancePendingJod: "0.000",
    silverPlan,
    paidMembership: {
      isPaidActive: false,
      tierCode: null,
    },
    cta: buildCtaCopy({
      reason: FREELANCER_ACTIVATION_CONVERSION_REASONS.NONE,
      priceJod: silverPlan.priceJod,
    }),
    handoff: {
      type: CHECKOUT_HANDOFF,
      plansRoute: PLANS_ROUTE,
      checkoutUrl: null,
    },
  };
}

async function getFreelancerActivationConversion(userId, { client = null, now = new Date() } = {}) {
  const runner = client || pool;
  const freelancerUserId = Number(userId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    return emptyConversionPayload();
  }

  const settings = await engine.getActivationEngineSettings(runner);
  if (!settings.engineEnabled) {
    return emptyConversionPayload({
      engineEnabled: false,
      silverPlanCode: settings.silverPlanCode,
    });
  }

  const sync = await syncActivationPaidStatus(freelancerUserId, { client: runner, now });
  const state = await engine.getFreelancerActivationTrialState(freelancerUserId, {
    client: runner,
    now,
  });

  let trial = state.trial;
  if (sync.trial) {
    trial = {
      ...(trial || {}),
      ...sync.trial,
      daysRemaining: engine.computeDaysRemaining(sync.trial.endsAt, now),
    };
  }

  const usage = state.usage || engine.emptyTrialUsage(trial);
  const earned = await earnedBalanceService.getFreelancerEarnedBalance(freelancerUserId, {
    client: runner,
  });
  let pendingMillis = 0;
  try {
    pendingMillis = parseJodToMillis(earned.totalPendingJod || "0", {
      label: "conversionPending",
    });
  } catch {
    pendingMillis = Number(earned.totalPendingJod) > 0 ? 1 : 0;
  }

  const daysRemaining =
    trial?.daysRemaining != null
      ? trial.daysRemaining
      : engine.computeDaysRemaining(trial?.endsAt, now);
  const acceptedWorkCount = Number(usage.acceptedWorkCount ?? trial?.acceptedWorkCount ?? 0);
  const publishedWorkCount = Number(usage.publishedWorkCount ?? trial?.publishedWorkCount ?? 0);
  const successfulWorkCap = Number(usage.successfulWorkCap ?? trial?.successfulWorkCap ?? 2);
  const workCapReached = acceptedWorkCount >= successfulWorkCap;
  const paidActive = Boolean(
    sync.paidActive ||
      state.eligibility?.hasActivePaidSilver ||
      trial?.status === "paid_active",
  );

  let paidTierCode = null;
  if (paidActive) {
    paidTierCode = sync.paid?.currentTierCode || null;
  }

  const reason = paidActive
    ? FREELANCER_ACTIVATION_CONVERSION_REASONS.NONE
    : resolveConversionReason({
        trial,
        usage,
        earnedPendingMillis: pendingMillis,
        daysRemaining,
      });

  const show = shouldShowSilverCta({
    engineEnabled: true,
    isFreelancer: Boolean(state.eligibility?.isFreelancer),
    paidActive,
    nextRequiredAction: state.nextRequiredAction,
    reason,
  });

  const silverPlan = await resolveSilverPlan(settings, runner);
  const cta = buildCtaCopy({
    reason: show ? reason : FREELANCER_ACTIVATION_CONVERSION_REASONS.NONE,
    priceJod: silverPlan.priceJod,
  });

  return {
    engineEnabled: true,
    shouldShowSilverCta: show,
    reason: show ? reason : FREELANCER_ACTIVATION_CONVERSION_REASONS.NONE,
    trialStatus: trial?.status || state.status || "not_started",
    daysRemaining,
    trialEndsAt: trial?.endsAt || null,
    workCapReached,
    acceptedWorkCount,
    publishedWorkCount,
    earnedBalancePendingJod: earned.totalPendingJod || "0.000",
    silverPlan,
    paidMembership: {
      isPaidActive: paidActive,
      tierCode: paidTierCode,
    },
    cta,
    handoff: {
      type: CHECKOUT_HANDOFF,
      plansRoute: PLANS_ROUTE,
      checkoutUrl: null,
    },
  };
}

async function recordSilverCtaViewed(userId, { client = null, now = new Date() } = {}) {
  const runner = client || pool;
  const freelancerUserId = Number(userId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    throw createAppError("Invalid freelancer.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.NOT_FREELANCER,
    });
  }

  const settings = await engine.getActivationEngineSettings(runner);
  if (!settings.engineEnabled) {
    throw createAppError("Activation engine is disabled.", 403, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.ENGINE_DISABLED,
    });
  }

  const trialRow = await engine.loadTrialRow(runner, freelancerUserId);
  let trial = engine.mapTrialRow(trialRow);
  let firstShown = false;

  if (trial && !trial.silverCtaFirstShownAt) {
    try {
      const { rows } = await runner.query(
        `UPDATE freelancer_activation_trials
            SET silver_cta_first_shown_at = COALESCE(silver_cta_first_shown_at, $2::timestamptz),
                updated_at = NOW()
          WHERE id = $1
            AND silver_cta_first_shown_at IS NULL
          RETURNING *`,
        [trial.id, now.toISOString()],
      );
      if (rows[0]) {
        trial = engine.mapTrialRow(rows[0]);
        firstShown = true;
      } else {
        const refreshed = await engine.loadTrialRow(runner, freelancerUserId);
        trial = engine.mapTrialRow(refreshed) || trial;
      }
    } catch (err) {
      if (!isMissingSchema(err)) throw err;
    }
  }

  await engine.insertEvent(runner, {
    freelancerUserId,
    trialId: trial?.id || null,
    eventType: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CTA_SHOWN,
    metadata: {
      firstShown,
      silverCtaFirstShownAt: trial?.silverCtaFirstShownAt || null,
    },
  });

  await engine.insertEvent(runner, {
    freelancerUserId,
    trialId: trial?.id || null,
    eventType: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CHECKOUT_VIEWED,
    metadata: { source: "cta_viewed" },
  });

  return {
    recorded: true,
    firstShown,
    silverCtaFirstShownAt:
      trial?.silverCtaFirstShownAt || (firstShown ? now.toISOString() : null),
  };
}

async function startSilverCheckout(userId, { client = null, now = new Date() } = {}) {
  const runner = client || pool;
  const freelancerUserId = Number(userId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    throw createAppError("Invalid freelancer.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.NOT_FREELANCER,
    });
  }

  const conversion = await getFreelancerActivationConversion(freelancerUserId, {
    client: runner,
    now,
  });

  if (!conversion.engineEnabled) {
    await engine.insertEvent(runner, {
      freelancerUserId,
      trialId: null,
      eventType: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CONVERSION_BLOCKED,
      metadata: { reason: "engine_disabled" },
    });
    throw createAppError("Activation engine is disabled.", 403, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.ENGINE_DISABLED,
    });
  }

  if (conversion.paidMembership?.isPaidActive) {
    await engine.insertEvent(runner, {
      freelancerUserId,
      trialId: null,
      eventType: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CONVERSION_BLOCKED,
      metadata: {
        reason: "already_paid_active",
        tierCode: conversion.paidMembership.tierCode,
      },
    });
    throw createAppError("Paid membership is already active.", 409, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.SILVER_CONVERSION_BLOCKED,
    });
  }

  if (!conversion.shouldShowSilverCta) {
    await engine.insertEvent(runner, {
      freelancerUserId,
      trialId: null,
      eventType: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CONVERSION_BLOCKED,
      metadata: { reason: conversion.reason || "cta_not_eligible" },
    });
    throw createAppError("Silver conversion is not available right now.", 403, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.SILVER_CONVERSION_BLOCKED,
    });
  }

  const silverPlan = conversion.silverPlan;
  if (!silverPlan?.id) {
    await engine.insertEvent(runner, {
      freelancerUserId,
      trialId: null,
      eventType: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CONVERSION_ERROR,
      metadata: { reason: "silver_plan_missing", code: silverPlan?.code },
    });
    throw createAppError("Silver marketplace plan was not found.", 404, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.SILVER_PLAN_NOT_FOUND,
    });
  }

  const trialRow = await engine.loadTrialRow(runner, freelancerUserId);
  const trial = engine.mapTrialRow(trialRow);

  await engine.insertEvent(runner, {
    freelancerUserId,
    trialId: trial?.id || null,
    eventType: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAYMENT_STARTED,
    metadata: {
      marketplacePlanId: silverPlan.id,
      tierCode: silverPlan.code,
      handoff: CHECKOUT_HANDOFF,
    },
  });

  try {
    const request = await activationRequestService.createActivationRequest({
      freelancerUserId,
      marketplacePlanId: silverPlan.id,
      now,
    });
    return {
      handoff: CHECKOUT_HANDOFF,
      checkoutUrl: null,
      plansRoute: PLANS_ROUTE,
      activationRequest: request,
      silverPlan,
      messageAr:
        "تم إرسال طلب تفعيل باقة Silver. يبدأ الاشتراك بعد موافقة الشركة (لا يوجد دفع بطاقة من هذه الشاشة).",
      messageEn:
        "Silver activation request submitted. Membership starts after company approval (no card payment on this screen).",
    };
  } catch (err) {
    await engine.insertEvent(runner, {
      freelancerUserId,
      trialId: trial?.id || null,
      eventType: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CONVERSION_ERROR,
      metadata: {
        publicCode: err.publicCode || err.code || null,
        message: err.message || "activation_request_failed",
      },
    });
    throw err;
  }
}

async function getSuperAdminConversionCounters({ client = null } = {}) {
  const runner = client || pool;
  const empty = {
    ctaShownCount: 0,
    paymentStartedCount: 0,
    paidActiveCount: 0,
    trialToSilverRate: null,
  };
  try {
    const [events, paid] = await Promise.all([
      runner.query(
        `SELECT event_type, COUNT(*)::int AS count
           FROM freelancer_activation_events
          WHERE event_type = ANY($1::text[])
          GROUP BY event_type`,
        [
          [
            FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CTA_SHOWN,
            FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAYMENT_STARTED,
            FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAID_DETECTED,
          ],
        ],
      ),
      runner.query(
        `SELECT COUNT(*)::int AS count
           FROM freelancer_activation_trials
          WHERE status = 'paid_active'`,
      ),
    ]);
    const byType = {};
    for (const row of events.rows || []) {
      byType[row.event_type] = Number(row.count) || 0;
    }
    const ctaShownCount = byType[FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CTA_SHOWN] || 0;
    const paymentStartedCount =
      byType[FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAYMENT_STARTED] || 0;
    const paidActiveCount = Number(paid.rows[0]?.count) || 0;
    const trialToSilverRate =
      ctaShownCount > 0 ? Number((paidActiveCount / ctaShownCount).toFixed(4)) : null;
    return {
      ctaShownCount,
      paymentStartedCount,
      paidActiveCount,
      trialToSilverRate,
    };
  } catch (err) {
    if (isMissingSchema(err)) return empty;
    throw err;
  }
}

module.exports = {
  CHECKOUT_HANDOFF,
  PLANS_ROUTE,
  syncActivationPaidStatus,
  getFreelancerActivationConversion,
  recordSilverCtaViewed,
  startSilverCheckout,
  getSuperAdminConversionCounters,
  resolveConversionReason,
  shouldShowSilverCta,
  buildCtaCopy,
  resolveSilverPlan,
  emptyConversionPayload,
};
