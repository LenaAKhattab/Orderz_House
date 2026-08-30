/**
 * Marketplace Memberships (باقات العمل) — Phase 3 / 3.1 / M1 domain.
 * Independent of freelancer_subscriptions / legacy plans.
 * M1–M4: purchased_pending_start, Stripe grant, eligibility while pending, start on first real order/article.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  MEMBERSHIP_SOURCES,
  MEMBERSHIP_AUDIT_ACTIONS,
  BENEFIT_USABLE_MEMBERSHIP_STATUSES,
  RECONCILE_MEMBERSHIP_STATUSES,
  isBenefitUsableStatus,
  isReconcileStatus,
} = require("../constants/marketplaceMemberships");
const {
  resolveCycleAnchorDay,
  toUtcDate,
  addCalendarMonthsAnchored,
} = require("../utils/marketplaceMembershipCycleDates");
const marketplaceMembershipPlansService = require("./marketplaceMembershipPlansService");
const marketplaceMembershipCyclesService = require("./marketplaceMembershipCyclesService");
const {
  marketplacePlanJoinSelectExtras,
} = require("../utils/marketplaceMembershipPlanSchema");
const { defaultArticleAccessLevelForTier } = require("../constants/marketplaceMembershipPlans");
const {
  PURCHASED_PENDING_START_MESSAGE_AR,
  STARTER_PENDING_START_MESSAGE_AR,
  STARTER_TRIAL_DURATION_DAYS,
  isPaidMarketplaceMembershipTier,
  computePaidTermWindowFromDurationDays,
  decideMarketplaceMembershipFirstOrderStart,
  isPurchasedPendingStartStatus,
  isStarterPendingStartStatus,
} = require("../utils/marketplaceMembershipPendingStart");

function isTruthyFlag(value) {
  return value === true || value === "t" || value === 1 || value === "1";
}

function toIdString(value) {
  if (value == null) return null;
  return String(value);
}

function isMissingRelationError(err) {
  return err && (err.code === "42P01" || /does not exist/i.test(String(err.message || "")));
}

function isUniqueViolation(err) {
  return err && err.code === "23505";
}

function mapMembership(row) {
  if (!row) return null;
  return {
    id: toIdString(row.id),
    freelancerUserId: toIdString(row.freelancer_user_id),
    marketplacePlanId: toIdString(row.marketplace_plan_id),
    isCurrent: isTruthyFlag(row.is_current),
    status: row.status,
    source: row.source,
    cycleAnchorDay: Number(row.cycle_anchor_day) || null,
    startedAt: row.started_at || null,
    paidTermStartsAt: row.paid_term_starts_at || null,
    paidTermEndsAt: row.paid_term_ends_at || null,
    purchasedAt: row.purchased_at || null,
    firstOrderStartedAt: row.first_order_started_at || null,
    startTriggerOrderId: toIdString(row.start_trigger_order_id),
    purchasePaymentReference: row.purchase_payment_reference || null,
    cancelAtPeriodEnd: isTruthyFlag(row.cancel_at_period_end),
    cancelledAt: row.cancelled_at || null,
    endedAt: row.ended_at || null,
    autoRenew: isTruthyFlag(row.auto_renew),
    stripeSubscriptionId: row.stripe_subscription_id || null,
    notes: row.notes || null,
    createdByUserId: toIdString(row.created_by_user_id),
    updatedByUserId: toIdString(row.updated_by_user_id),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    statusMessageAr: isPurchasedPendingStartStatus(row.status)
      ? PURCHASED_PENDING_START_MESSAGE_AR
      : isStarterPendingStartStatus(row.status)
        ? STARTER_PENDING_START_MESSAGE_AR
        : null,
  };
}

async function writeAudit(client, {
  membershipId = null,
  cycleId = null,
  freelancerUserId = null,
  actorUserId = null,
  action,
  detail = null,
}) {
  await client.query(
    `INSERT INTO marketplace_membership_audit_logs
      (membership_id, cycle_id, freelancer_user_id, actor_user_id, action, detail_json)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      membershipId,
      cycleId,
      freelancerUserId,
      actorUserId,
      action,
      detail ? JSON.stringify(detail) : null,
    ],
  );
}

async function resolveDbClient(externalClient) {
  if (externalClient) {
    return { client: externalClient, release: false, ownTxn: false };
  }
  const client = await pool.connect();
  return { client, release: true, ownTxn: true };
}

function mapPlanFields(row) {
  return {
    id: toIdString(row.marketplace_plan_id),
    tierCode: row.plan_tier_code,
    nameAr: row.plan_name_ar,
    nameEn: row.plan_name_en || null,
    slug: row.plan_slug || null,
    priorityBidEnabled: isTruthyFlag(row.plan_priority_bid_enabled),
    priorityBidUsesPerCycle: Number(row.plan_priority_bid_uses_per_cycle) || 0,
    articleAccessLevel:
      row.plan_article_access_level == null
        ? defaultArticleAccessLevelForTier(row.plan_tier_code)
        : Number(row.plan_article_access_level) || 1,
    eliteDirectOrdersEnabled: isTruthyFlag(row.plan_elite_direct_orders_enabled),
    monthlyPriceJod:
      row.plan_monthly_price_jod != null ? Number(row.plan_monthly_price_jod) : null,
  };
}

/**
 * Create + activate a Marketplace Membership atomically (internal).
 * Replaces prior current membership as superseded (history retained).
 */
async function createAndActivateMarketplaceMembership(input) {
  const freelancerUserId = Number(input.freelancerUserId);
  const marketplacePlanId = Number(input.marketplacePlanId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    throw createAppError("freelancerUserId is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_FREELANCER",
    });
  }
  if (!Number.isInteger(marketplacePlanId) || marketplacePlanId < 1) {
    throw createAppError("marketplacePlanId is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MARKETPLACE_PLAN",
    });
  }

  const source = String(input.source || "system").toLowerCase();
  if (!MEMBERSHIP_SOURCES.includes(source)) {
    throw createAppError("Invalid membership source.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MEMBERSHIP_SOURCE",
    });
  }

  const now = toUtcDate(input.now || new Date());
  const paidTermStartsAt = toUtcDate(input.paidTermStartsAt || now);
  let paidTermEndsAt;
  if (input.paidTermEndsAt) {
    paidTermEndsAt = toUtcDate(input.paidTermEndsAt);
  } else {
    // Prefer plan.cycleDurationDays (E1) when provided by catalog.
    const planPeek = await marketplaceMembershipPlansService.getMarketplaceMembershipPlanById(
      marketplacePlanId,
      input.client || null,
    );
    const durationDays = Number(planPeek?.cycleDurationDays);
    if (Number.isInteger(durationDays) && durationDays >= 1) {
      paidTermEndsAt = new Date(paidTermStartsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
    } else {
      const months = Number(input.paidTermMonths);
      if (!Number.isInteger(months) || months < 1 || months > 120) {
        throw createAppError("paidTermMonths must be an integer between 1 and 120.", 400, {
          exposeToClient: true,
          publicCode: "INVALID_PAID_TERM_MONTHS",
        });
      }
      const anchor = resolveCycleAnchorDay(paidTermStartsAt);
      paidTermEndsAt = addCalendarMonthsAnchored(paidTermStartsAt, months, anchor);
    }
  }
  if (!(paidTermEndsAt > paidTermStartsAt)) {
    throw createAppError("paid_term_ends_at must be after paid_term_starts_at.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_PAID_TERM",
    });
  }

  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");

    const eligibility = require("./marketplaceMembershipEligibilityService");
    if (input.skipVerification !== true) {
      await eligibility.assertMarketplaceVerificationComplete(client, freelancerUserId);
    } else {
      // Account self-activation path: verification fee is handled by caller; still require freelancer role.
      const { rows: userRows } = await client.query(
        `SELECT id, role, is_active FROM users WHERE id = $1`,
        [freelancerUserId],
      );
      const user = userRows[0];
      if (!user || user.role !== "freelancer" || user.is_active !== true) {
        throw createAppError("Freelancer account is not eligible for Marketplace Membership.", 403, {
          exposeToClient: true,
          publicCode: "MEMBERSHIP_FREELANCER_INVALID",
        });
      }
    }

    const plan = await marketplaceMembershipPlansService.getMarketplaceMembershipPlanById(
      marketplacePlanId,
      client,
    );
    if (!plan || !plan.isActive) {
      throw createAppError("Marketplace plan not found or inactive.", 404, {
        exposeToClient: true,
        publicCode: "MARKETPLACE_PLAN_NOT_FOUND",
      });
    }

    if (String(plan.tierCode).toLowerCase() === "starter" || plan.isOneTimeStarter) {
      await eligibility.assertStarterNotAlreadyConsumed(client, freelancerUserId);
    }

    // Serialize concurrent activations for this freelancer
    const userLock = await client.query(
      `SELECT id, role FROM users WHERE id = $1 FOR UPDATE`,
      [freelancerUserId],
    );
    if (!userLock.rows[0] || userLock.rows[0].role !== "freelancer") {
      throw createAppError("Freelancer not found.", 404, {
        exposeToClient: true,
        publicCode: "FREELANCER_NOT_FOUND",
      });
    }

    // Supersede previous current membership (history preserved; not "expired")
    const prior = await client.query(
      `SELECT id, status FROM freelancer_marketplace_memberships
       WHERE freelancer_user_id = $1 AND is_current = TRUE
       FOR UPDATE`,
      [freelancerUserId],
    );
    for (const old of prior.rows) {
      await client.query(
        `UPDATE freelancer_marketplace_memberships
         SET is_current = FALSE,
             status = 'superseded',
             ended_at = COALESCE(ended_at, $2),
             updated_at = NOW(),
             updated_by_user_id = $3
         WHERE id = $1`,
        [old.id, now.toISOString(), input.actorUserId || null],
      );
      await marketplaceMembershipCyclesService.closeActiveCycle({
        membershipId: old.id,
        client,
        now,
        actorUserId: input.actorUserId || null,
      });
      await writeAudit(client, {
        membershipId: old.id,
        freelancerUserId,
        actorUserId: input.actorUserId || null,
        action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_SUPERSEDED,
        detail: { previousStatus: old.status, reason: "replaced_by_new_membership" },
      });
    }

    const anchorDay = resolveCycleAnchorDay(paidTermStartsAt);
    let membershipRow;
    try {
      const { rows } = await client.query(
        `INSERT INTO freelancer_marketplace_memberships (
           freelancer_user_id, marketplace_plan_id, is_current, status, source,
           cycle_anchor_day, started_at, paid_term_starts_at, paid_term_ends_at,
           auto_renew, notes, created_by_user_id, updated_by_user_id
         ) VALUES (
           $1, $2, TRUE, 'active', $3,
           $4, $5, $5, $6,
           $7, $8, $9, $9
         )
         RETURNING *`,
        [
          freelancerUserId,
          marketplacePlanId,
          source,
          anchorDay,
          paidTermStartsAt.toISOString(),
          paidTermEndsAt.toISOString(),
          Boolean(input.autoRenew),
          input.notes || null,
          input.actorUserId || null,
        ],
      );
      membershipRow = rows[0];
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw createAppError(
          "Another Marketplace Membership is already current for this freelancer.",
          409,
          {
            exposeToClient: true,
            publicCode: "MARKETPLACE_MEMBERSHIP_CONFLICT",
            cause: err,
          },
        );
      }
      throw err;
    }

    const membership = mapMembership(membershipRow);

    await writeAudit(client, {
      membershipId: membership.id,
      freelancerUserId,
      actorUserId: input.actorUserId || null,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_CREATED,
      detail: {
        marketplacePlanId: String(marketplacePlanId),
        source,
        paidTermStartsAt: paidTermStartsAt.toISOString(),
        paidTermEndsAt: paidTermEndsAt.toISOString(),
      },
    });
    await writeAudit(client, {
      membershipId: membership.id,
      freelancerUserId,
      actorUserId: input.actorUserId || null,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_ACTIVATED,
      detail: { status: "active" },
    });

    const cycle = await marketplaceMembershipCyclesService.createAndActivateCycleForMembership({
      membership: membershipRow,
      plan,
      cycleNumber: 1,
      now,
      client,
      actorUserId: input.actorUserId || null,
    });

    // E2: paid membership activation releases eligible Starter pending Article earnings.
    let starterPendingRelease = null;
    const activatedTier = String(plan.tierCode || "").toLowerCase();
    if (activatedTier && activatedTier !== "starter") {
      try {
        const settlementService = require("./marketplaceArticleSettlementService");
        starterPendingRelease = await settlementService.releaseStarterPendingArticleEarnings({
          client,
          freelancerUserId,
          now,
        });
      } catch (releaseErr) {
        if (releaseErr?.code !== "42P01") throw releaseErr;
      }
    }

    if (ownTxn) await client.query("COMMIT");
    return { membership, currentCycle: cycle, starterPendingRelease };
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

/**
 * Canonical current Marketplace Membership resolver.
 * Requires is_current = TRUE (never status='active' alone).
 */
async function resolveCurrentMarketplaceMembershipForFreelancer(freelancerUserId, options = {}) {
  const id = Number(freelancerUserId);
  if (!Number.isInteger(id) || id < 1) return null;
  const db = options.client || pool;
  const extras = await marketplacePlanJoinSelectExtras(db);
  const { rows } = await db.query(
    `SELECT m.*,
            p.tier_code AS plan_tier_code,
            p.name_ar AS plan_name_ar,
            p.name_en AS plan_name_en,
            p.slug AS plan_slug,
            p.priority_bid_uses_per_cycle AS plan_priority_bid_uses_per_cycle,
            p.priority_bid_enabled AS plan_priority_bid_enabled,
            p.included_tokens_per_cycle AS plan_included_tokens_per_cycle,
            ${extras.sql}
     FROM freelancer_marketplace_memberships m
     JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
     WHERE m.freelancer_user_id = $1
       AND m.is_current = TRUE
     LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;
  const membership = mapMembership(rows[0]);
  membership.plan = mapPlanFields(rows[0]);
  return membership;
}

async function getMarketplaceMembershipById(membershipId, options = {}) {
  const id = Number(membershipId);
  if (!Number.isInteger(id) || id < 1) return null;
  const db = options.client || pool;
  try {
    const extras = await marketplacePlanJoinSelectExtras(db);
    const { rows } = await db.query(
      `SELECT m.*,
              p.tier_code AS plan_tier_code,
              p.name_ar AS plan_name_ar,
              p.name_en AS plan_name_en,
              p.slug AS plan_slug,
              p.priority_bid_uses_per_cycle AS plan_priority_bid_uses_per_cycle,
              p.priority_bid_enabled AS plan_priority_bid_enabled,
              p.included_tokens_per_cycle AS plan_included_tokens_per_cycle,
              ${extras.sql}
       FROM freelancer_marketplace_memberships m
       JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
       WHERE m.id = $1
       LIMIT 1`,
      [id],
    );
    if (!rows[0]) return null;
    const membership = mapMembership(rows[0]);
    membership.plan = mapPlanFields(rows[0]);
    return membership;
  } catch (err) {
    if (isMissingRelationError(err)) return null;
    throw err;
  }
}

async function getFreelancerMarketplaceMembershipSnapshot(freelancerUserId, options = {}) {
  try {
    const now = toUtcDate(options.now || new Date());
    let membership = await resolveCurrentMarketplaceMembershipForFreelancer(freelancerUserId, options);
    if (!membership && options.ensureStarterPending !== false) {
      try {
        const ensured = await ensureStarterPendingEntitlement({
          freelancerUserId,
          actorUserId: freelancerUserId,
          now,
          client: options.client,
        });
        if (ensured?.membership) {
          membership = ensured.membership.plan
            ? ensured.membership
            : await resolveCurrentMarketplaceMembershipForFreelancer(freelancerUserId, options);
        }
      } catch (ensureErr) {
        if (
          ensureErr?.publicCode !== "STARTER_ENTITLEMENT_ALREADY_USED" &&
          ensureErr?.code !== "42P01" &&
          ensureErr?.code !== "23514"
        ) {
          // eslint-disable-next-line no-console
          console.error(
            "[membership] ensureStarterPendingEntitlement on snapshot failed:",
            ensureErr?.message || ensureErr,
          );
        }
      }
    }
    if (!membership) {
      return {
        hasMembership: false,
        membership: null,
        currentCycle: null,
        priorityBid: {
          allowed: 0,
          used: 0,
          remaining: 0,
          engineAvailable: false,
        },
      };
    }

    // Reconcile calendar for active/cancel_at_period_end/suspended while current
    if (isReconcileStatus(membership.status)) {
      await marketplaceMembershipCyclesService.reconcileMembershipCycles({
        membershipId: membership.id,
        now,
        client: options.client,
      });
    }

    const refreshed = await resolveCurrentMarketplaceMembershipForFreelancer(freelancerUserId, options);
    const current = refreshed || membership;
    const cycle = await marketplaceMembershipCyclesService.getCurrentActiveCycle(current.id, {
      client: options.client,
      now,
    });

    const allowed = cycle ? Number(cycle.priorityBidUsesAllowed) || 0 : 0;
    const used = cycle ? Number(cycle.priorityBidUsesConsumed) || 0 : 0;
    const remaining = Math.max(allowed - used, 0);
    const benefitsUsable = isBenefitUsableStatus(current.status);
    const {
      isApplicationEligibleStatus,
      isPurchasedPendingStartStatus: isPaidPending,
      isStarterPendingStartStatus: isStarterPending,
      PURCHASED_PENDING_START_MESSAGE_AR: paidMsg,
      STARTER_PENDING_START_MESSAGE_AR: starterMsg,
    } = require("../utils/marketplaceMembershipPendingStart");
    const applicationEligible = isApplicationEligibleStatus(current.status);
    const pendingStart = isPaidPending(current.status);
    const starterPendingStart = isStarterPending(current.status);
    const termStarted = benefitsUsable && Boolean(current.paidTermStartsAt);

    const eligibility = require("./marketplaceMembershipEligibilityService");
    let canApply = false;
    let verificationComplete = null;
    let trainingComplete = null;
    const probeGates = applicationEligible || starterPendingStart;
    if (probeGates) {
      try {
        await eligibility.assertMarketplaceVerificationComplete(
          options.client || null,
          freelancerUserId,
        );
        verificationComplete = true;
      } catch {
        verificationComplete = false;
      }
      try {
        await eligibility.assertPaidTrainingComplete(options.client || null, freelancerUserId);
        trainingComplete = true;
      } catch {
        trainingComplete = false;
      }
      if (applicationEligible && verificationComplete === true) {
        const tierCode = current.plan?.tierCode;
        const needsTraining =
          isPaidPending(current.status) || isPaidMarketplaceMembershipTier(tierCode);
        canApply = needsTraining ? trainingComplete === true : true;
        if (canApply) {
          try {
            await eligibility.assertMarketplaceApplyGates(options.client || null, freelancerUserId, {
              membership: current,
            });
            canApply = true;
          } catch {
            canApply = false;
          }
        }
      }
    }

    const applyCapability = eligibility.evaluatePendingStartApplyCapability({
      membershipStatus: current.status,
      verificationComplete,
      trainingComplete,
      tierCode: current.plan?.tierCode,
    });

    let remainingDays = null;
    if (termStarted && current.paidTermEndsAt) {
      const endMs = new Date(current.paidTermEndsAt).getTime();
      if (!Number.isNaN(endMs)) {
        remainingDays = Math.max(0, Math.ceil((endMs - now.getTime()) / (24 * 60 * 60 * 1000)));
      }
    }

    return {
      hasMembership: true,
      membership: {
        id: current.id,
        status: current.status,
        isCurrent: current.isCurrent,
        source: current.source,
        startedAt: current.startedAt,
        paidTermStartsAt: current.paidTermStartsAt,
        paidTermEndsAt: current.paidTermEndsAt,
        purchasedAt: current.purchasedAt,
        firstOrderStartedAt: current.firstOrderStartedAt,
        startTriggerOrderId: current.startTriggerOrderId,
        cancelAtPeriodEnd: current.cancelAtPeriodEnd,
        statusMessageAr:
          current.statusMessageAr ||
          (pendingStart ? paidMsg : starterPendingStart ? starterMsg : null),
        messageKey: pendingStart
          ? "marketplace_membership.purchased_pending_start"
          : starterPendingStart
            ? "marketplace_membership.starter_pending_start"
            : null,
        termStarted,
        applicationEligible,
        canApply,
        entitled: applyCapability.entitled,
        starterPendingStart,
        canStartStarterTrial:
          starterPendingStart &&
          verificationComplete === true &&
          trainingComplete === true,
        verificationComplete,
        trainingComplete,
        remainingDays,
        plan: current.plan,
      },
      currentCycle: cycle
        ? {
            id: cycle.id,
            cycleNumber: cycle.cycleNumber,
            startsAt: cycle.startsAt,
            endsAt: cycle.endsAt,
            status: cycle.status,
            monthlyBidAllowanceSnapshot: cycle.monthlyBidAllowanceSnapshot,
          }
        : null,
      priorityBid: {
        allowed: benefitsUsable ? allowed : 0,
        used: benefitsUsable ? used : used,
        remaining: benefitsUsable ? remaining : 0,
        // Global Priority Bid engine remains OFF in Phase 3/3.1
        engineAvailable: false,
        membershipBenefitsUsable: benefitsUsable,
      },
    };
  } catch (err) {
    if (isMissingRelationError(err)) {
      return {
        hasMembership: false,
        membership: null,
        currentCycle: null,
        priorityBid: {
          allowed: 0,
          used: 0,
          remaining: 0,
          engineAvailable: false,
        },
        schemaPending: true,
      };
    }
    throw err;
  }
}

async function cancelMarketplaceMembership({
  membershipId,
  actorUserId = null,
  immediate = false,
  reason = null,
  client: externalClient = null,
  now = new Date(),
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM freelancer_marketplace_memberships WHERE id = $1 FOR UPDATE`,
      [membershipId],
    );
    if (!rows[0]) {
      throw createAppError("Membership not found.", 404, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_NOT_FOUND",
      });
    }
    const instant = toUtcDate(now);
    if (immediate) {
      await client.query(
        `UPDATE freelancer_marketplace_memberships
         SET status = 'cancelled',
             is_current = FALSE,
             cancelled_at = $2,
             ended_at = $2,
             cancel_at_period_end = FALSE,
             updated_at = NOW(),
             updated_by_user_id = $3
         WHERE id = $1`,
        [membershipId, instant.toISOString(), actorUserId],
      );
      await marketplaceMembershipCyclesService.closeActiveCycle({
        membershipId,
        client,
        now: instant,
        actorUserId,
      });
      await writeAudit(client, {
        membershipId,
        freelancerUserId: rows[0].freelancer_user_id,
        actorUserId,
        action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_CANCELLED,
        detail: { immediate: true, reason },
      });
    } else {
      await client.query(
        `UPDATE freelancer_marketplace_memberships
         SET status = 'cancel_at_period_end',
             cancel_at_period_end = TRUE,
             cancelled_at = COALESCE(cancelled_at, $2),
             updated_at = NOW(),
             updated_by_user_id = $3
         WHERE id = $1`,
        [membershipId, instant.toISOString(), actorUserId],
      );
      await writeAudit(client, {
        membershipId,
        freelancerUserId: rows[0].freelancer_user_id,
        actorUserId,
        action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_CANCEL_AT_PERIOD_END,
        detail: { immediate: false, reason },
      });
    }
    if (ownTxn) await client.query("COMMIT");
    return getMarketplaceMembershipById(membershipId, { client: ownTxn ? pool : client });
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

/**
 * Suspend current membership (access hold). Paid term continues; no benefit consume.
 */
async function suspendMarketplaceMembership({
  membershipId,
  actorUserId = null,
  reason = null,
  client: externalClient = null,
  now = new Date(),
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM freelancer_marketplace_memberships WHERE id = $1 FOR UPDATE`,
      [membershipId],
    );
    if (!rows[0]) {
      throw createAppError("Membership not found.", 404, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_NOT_FOUND",
      });
    }
    const row = rows[0];
    if (!row.is_current) {
      throw createAppError("Only a current membership can be suspended.", 409, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_NOT_CURRENT",
      });
    }
    if (!["active", "cancel_at_period_end", "suspended"].includes(row.status)) {
      throw createAppError("Membership status cannot be suspended.", 409, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_SUSPEND_INVALID",
      });
    }
    if (row.status === "suspended") {
      if (ownTxn) await client.query("COMMIT");
      return getMarketplaceMembershipById(membershipId, { client: ownTxn ? pool : client });
    }

    const previousStatus = row.status;
    await client.query(
      `UPDATE freelancer_marketplace_memberships
       SET status = 'suspended',
           updated_at = NOW(),
           updated_by_user_id = $2
       WHERE id = $1`,
      [membershipId, actorUserId],
    );
    await writeAudit(client, {
      membershipId,
      freelancerUserId: row.freelancer_user_id,
      actorUserId,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_SUSPENDED,
      detail: { reason, previousStatus, at: toUtcDate(now).toISOString() },
    });
    if (ownTxn) await client.query("COMMIT");
    return getMarketplaceMembershipById(membershipId, { client: ownTxn ? pool : client });
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

/**
 * Resume a suspended current membership → active (or cancel_at_period_end if flag set).
 * Then reconciles to the correct CURRENT anniversary cycle (no backlog benefits).
 */
async function resumeMarketplaceMembership({
  membershipId,
  actorUserId = null,
  reason = null,
  client: externalClient = null,
  now = new Date(),
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    const instant = toUtcDate(now);
    const { rows } = await client.query(
      `SELECT * FROM freelancer_marketplace_memberships WHERE id = $1 FOR UPDATE`,
      [membershipId],
    );
    if (!rows[0]) {
      throw createAppError("Membership not found.", 404, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_NOT_FOUND",
      });
    }
    const row = rows[0];
    if (!row.is_current || row.status !== "suspended") {
      throw createAppError("Only a current suspended membership can be resumed.", 409, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_RESUME_INVALID",
      });
    }

    // If paid term already ended during suspension → expire instead of resume benefits
    if (row.paid_term_ends_at && toUtcDate(row.paid_term_ends_at) <= instant) {
      await client.query(
        `UPDATE freelancer_marketplace_memberships
         SET status = 'expired',
             is_current = FALSE,
             ended_at = COALESCE(ended_at, $2),
             updated_at = NOW(),
             updated_by_user_id = $3
         WHERE id = $1`,
        [membershipId, instant.toISOString(), actorUserId],
      );
      await marketplaceMembershipCyclesService.closeActiveCycle({
        membershipId,
        client,
        now: instant,
        actorUserId,
      });
      await writeAudit(client, {
        membershipId,
        freelancerUserId: row.freelancer_user_id,
        actorUserId,
        action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_EXPIRED,
        detail: { via: "resume_after_term_ended", reason },
      });
      if (ownTxn) await client.query("COMMIT");
      return getMarketplaceMembershipById(membershipId, { client: ownTxn ? pool : client });
    }

    const nextStatus = row.cancel_at_period_end ? "cancel_at_period_end" : "active";
    await client.query(
      `UPDATE freelancer_marketplace_memberships
       SET status = $2,
           updated_at = NOW(),
           updated_by_user_id = $3
       WHERE id = $1`,
      [membershipId, nextStatus, actorUserId],
    );
    await writeAudit(client, {
      membershipId,
      freelancerUserId: row.freelancer_user_id,
      actorUserId,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_RESUMED,
      detail: { reason, status: nextStatus, at: instant.toISOString() },
    });

    await marketplaceMembershipCyclesService.reconcileMembershipCycles({
      membershipId,
      now: instant,
      client,
    });

    if (ownTxn) await client.query("COMMIT");
    return getMarketplaceMembershipById(membershipId, { client: ownTxn ? pool : client });
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

async function expireMarketplaceMembershipIfDue({
  membershipId,
  now = new Date(),
  client: externalClient = null,
}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    const instant = toUtcDate(now);
    const { rows } = await client.query(
      `SELECT * FROM freelancer_marketplace_memberships WHERE id = $1 FOR UPDATE`,
      [membershipId],
    );
    if (!rows[0]) {
      if (ownTxn) await client.query("COMMIT");
      return { expired: false };
    }
    const row = rows[0];
    if (!RECONCILE_MEMBERSHIP_STATUSES.includes(row.status)) {
      if (ownTxn) await client.query("COMMIT");
      return { expired: false, reason: "not_expirable_status" };
    }
    if (!row.paid_term_ends_at || toUtcDate(row.paid_term_ends_at) > instant) {
      if (ownTxn) await client.query("COMMIT");
      return { expired: false, reason: "term_not_ended" };
    }

    await client.query(
      `UPDATE freelancer_marketplace_memberships
       SET status = 'expired',
           is_current = FALSE,
           ended_at = COALESCE(ended_at, $2),
           updated_at = NOW()
       WHERE id = $1`,
      [membershipId, instant.toISOString()],
    );
    await marketplaceMembershipCyclesService.closeActiveCycle({
      membershipId,
      client,
      now: instant,
    });
    await writeAudit(client, {
      membershipId,
      freelancerUserId: row.freelancer_user_id,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_EXPIRED,
      detail: { paidTermEndsAt: row.paid_term_ends_at },
    });
    if (ownTxn) await client.query("COMMIT");
    return { expired: true };
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

async function listMarketplaceMembershipsForAdmin({
  limit = 50,
  offset = 0,
  freelancerUserId = null,
} = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const params = [];
  let where = "";
  if (freelancerUserId != null) {
    params.push(Number(freelancerUserId));
    where = `WHERE m.freelancer_user_id = $${params.length}`;
  }
  params.push(lim, off);
  try {
    const extras = await marketplacePlanJoinSelectExtras(pool);
    const { rows } = await pool.query(
      `SELECT m.*,
              p.tier_code AS plan_tier_code,
              p.name_ar AS plan_name_ar,
              p.name_en AS plan_name_en,
              p.priority_bid_uses_per_cycle AS plan_priority_bid_uses_per_cycle,
              p.priority_bid_enabled AS plan_priority_bid_enabled,
              p.included_tokens_per_cycle AS plan_included_tokens_per_cycle,
              ${extras.sql},
              COALESCE(
                NULLIF(trim(concat_ws(' ', u.first_name, u.father_name, u.family_name)), ''),
                u.email
              ) AS freelancer_full_name,
              u.email AS freelancer_email
       FROM freelancer_marketplace_memberships m
       JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
       JOIN users u ON u.id = m.freelancer_user_id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return rows.map((row) => {
      const m = mapMembership(row);
      m.plan = mapPlanFields(row);
      m.freelancer = {
        id: toIdString(row.freelancer_user_id),
        fullName: row.freelancer_full_name || null,
        email: row.freelancer_email || null,
      };
      return m;
    });
  } catch (err) {
    if (isMissingRelationError(err)) return [];
    throw err;
  }
}

/**
 * Marketplace-M1 — grant paid membership after payment (future Stripe webhook).
 * Creates purchased_pending_start: entitlement owned, paid term NOT started.
 * Does NOT require admin approval / company approval.
 * Does NOT require KYC/training (purchase-before-gates; apply still gated elsewhere).
 * Idempotent on purchasePaymentReference when provided.
 */
async function createPurchasedPendingStartMembership(input = {}) {
  const freelancerUserId = Number(input.freelancerUserId);
  const marketplacePlanId = Number(input.marketplacePlanId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    throw createAppError("freelancerUserId is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_FREELANCER",
    });
  }
  if (!Number.isInteger(marketplacePlanId) || marketplacePlanId < 1) {
    throw createAppError("marketplacePlanId is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MARKETPLACE_PLAN",
    });
  }

  const source = String(input.source || "stripe").toLowerCase();
  if (!MEMBERSHIP_SOURCES.includes(source)) {
    throw createAppError("Invalid membership source.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MEMBERSHIP_SOURCE",
    });
  }

  const purchasePaymentReference =
    input.purchasePaymentReference != null && String(input.purchasePaymentReference).trim() !== ""
      ? String(input.purchasePaymentReference).trim()
      : null;

  const now = toUtcDate(input.now || new Date());
  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");

    if (purchasePaymentReference) {
      const existing = await client.query(
        `SELECT * FROM freelancer_marketplace_memberships
          WHERE purchase_payment_reference = $1
          LIMIT 1
          FOR UPDATE`,
        [purchasePaymentReference],
      );
      if (existing.rows[0]) {
        const membership = mapMembership(existing.rows[0]);
        const plan = await marketplaceMembershipPlansService.getMarketplaceMembershipPlanById(
          Number(existing.rows[0].marketplace_plan_id),
          client,
        );
        if (plan) membership.plan = plan;
        if (ownTxn) await client.query("COMMIT");
        return { membership, created: false, idempotentReplay: true };
      }
    }

    const { rows: userRows } = await client.query(
      `SELECT id, role, is_active FROM users WHERE id = $1 FOR UPDATE`,
      [freelancerUserId],
    );
    const user = userRows[0];
    if (!user || user.role !== "freelancer" || user.is_active !== true) {
      throw createAppError("Freelancer account is not eligible for Marketplace Membership.", 403, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_FREELANCER_INVALID",
      });
    }

    const plan = await marketplaceMembershipPlansService.getMarketplaceMembershipPlanById(
      marketplacePlanId,
      client,
    );
    if (!plan || !plan.isActive) {
      throw createAppError("Marketplace plan not found or inactive.", 404, {
        exposeToClient: true,
        publicCode: "MARKETPLACE_PLAN_NOT_FOUND",
      });
    }
    if (!isPaidMarketplaceMembershipTier(plan.tierCode)) {
      throw createAppError(
        "Only paid marketplace plans (SILVER/PRO/ELITE/special offer) support purchased_pending_start.",
        400,
        {
          exposeToClient: true,
          publicCode: "MEMBERSHIP_PENDING_START_PAID_ONLY",
          details: { tierCode: plan.tierCode },
        },
      );
    }

    // Supersede previous current membership (history preserved)
    const prior = await client.query(
      `SELECT id, status FROM freelancer_marketplace_memberships
       WHERE freelancer_user_id = $1 AND is_current = TRUE
       FOR UPDATE`,
      [freelancerUserId],
    );
    for (const old of prior.rows) {
      await client.query(
        `UPDATE freelancer_marketplace_memberships
         SET is_current = FALSE,
             status = 'superseded',
             ended_at = COALESCE(ended_at, $2),
             updated_at = NOW(),
             updated_by_user_id = $3
         WHERE id = $1`,
        [old.id, now.toISOString(), input.actorUserId || null],
      );
      await marketplaceMembershipCyclesService.closeActiveCycle({
        membershipId: old.id,
        client,
        now,
        actorUserId: input.actorUserId || null,
      });
      await writeAudit(client, {
        membershipId: old.id,
        freelancerUserId,
        actorUserId: input.actorUserId || null,
        action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_SUPERSEDED,
        detail: { previousStatus: old.status, reason: "replaced_by_purchased_pending_start" },
      });
    }

    const anchorDay = resolveCycleAnchorDay(now);
    let membershipRow;
    try {
      const { rows } = await client.query(
        `INSERT INTO freelancer_marketplace_memberships (
           freelancer_user_id, marketplace_plan_id, is_current, status, source,
           cycle_anchor_day, started_at, paid_term_starts_at, paid_term_ends_at,
           purchased_at, first_order_started_at, start_trigger_order_id,
           purchase_payment_reference,
           auto_renew, notes, created_by_user_id, updated_by_user_id
         ) VALUES (
           $1, $2, TRUE, 'purchased_pending_start', $3,
           $4, NULL, NULL, NULL,
           $5, NULL, NULL,
           $6,
           $7, $8, $9, $9
         )
         RETURNING *`,
        [
          freelancerUserId,
          marketplacePlanId,
          source,
          anchorDay,
          now.toISOString(),
          purchasePaymentReference,
          Boolean(input.autoRenew),
          input.notes || null,
          input.actorUserId || null,
        ],
      );
      membershipRow = rows[0];
    } catch (err) {
      if (isUniqueViolation(err) && purchasePaymentReference) {
        const again = await client.query(
          `SELECT * FROM freelancer_marketplace_memberships
            WHERE purchase_payment_reference = $1 LIMIT 1`,
          [purchasePaymentReference],
        );
        if (again.rows[0]) {
          const membership = mapMembership(again.rows[0]);
          membership.plan = plan;
          if (ownTxn) await client.query("COMMIT");
          return { membership, created: false, idempotentReplay: true };
        }
      }
      if (err && err.code === "42703") {
        throw createAppError(
          "Marketplace pending-start columns missing. Apply migration 181 on a non-Production DB.",
          503,
          {
            exposeToClient: false,
            publicCode: "MEMBERSHIP_PENDING_START_SCHEMA_MISSING",
            cause: err,
          },
        );
      }
      if (isUniqueViolation(err)) {
        throw createAppError(
          "Another Marketplace Membership is already current for this freelancer.",
          409,
          {
            exposeToClient: true,
            publicCode: "MARKETPLACE_MEMBERSHIP_CONFLICT",
            cause: err,
          },
        );
      }
      throw err;
    }

    const membership = mapMembership(membershipRow);
    membership.plan = plan;

    await writeAudit(client, {
      membershipId: membership.id,
      freelancerUserId,
      actorUserId: input.actorUserId || null,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_CREATED,
      detail: {
        marketplacePlanId: String(marketplacePlanId),
        source,
        status: "purchased_pending_start",
        purchasedAt: now.toISOString(),
        purchasePaymentReference,
        paidTermStartsAt: null,
        paidTermEndsAt: null,
      },
    });
    await writeAudit(client, {
      membershipId: membership.id,
      freelancerUserId,
      actorUserId: input.actorUserId || null,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_PURCHASED_PENDING_START,
      detail: {
        status: "purchased_pending_start",
        messageAr: PURCHASED_PENDING_START_MESSAGE_AR,
      },
    });

    if (ownTxn) await client.query("COMMIT");
    return { membership, created: true, idempotentReplay: false, currentCycle: null };
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

/**
 * Marketplace-M4 — start paid term on first real order / real marketplace article assignment.
 * Idempotent: already-active membership with term started is a no-op.
 * Does NOT start on fake/training/simulation orders.
 * Does NOT start on mere application/bid submission.
 */
async function startMarketplaceMembershipOnFirstRealOrder(input = {}) {
  const freelancerUserId = Number(input.freelancerUserId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    throw createAppError("freelancerUserId is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_FREELANCER",
    });
  }

  const triggerSource = String(input.triggerSource || "order").trim() || "order";
  const orderIdRaw = input.orderId != null ? Number(input.orderId) : null;
  const articleApplicationId =
    input.articleApplicationId != null ? Number(input.articleApplicationId) : null;

  const isArticleTrigger = triggerSource === "marketplace_article_application";
  if (!isArticleTrigger) {
    if (!Number.isInteger(orderIdRaw) || orderIdRaw < 1) {
      throw createAppError("orderId is required.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_ORDER",
      });
    }
  } else if (!Number.isInteger(articleApplicationId) || articleApplicationId < 1) {
    throw createAppError("articleApplicationId is required for article trigger.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_ARTICLE_APPLICATION",
    });
  }

  const now = toUtcDate(input.now || input.triggeredAt || new Date());
  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");

    const { rows: memRows } = await client.query(
      `SELECT *
         FROM freelancer_marketplace_memberships
        WHERE freelancer_user_id = $1 AND is_current = TRUE
        LIMIT 1
        FOR UPDATE`,
      [freelancerUserId],
    );
    const mem = memRows[0];
    if (!mem) {
      if (ownTxn) await client.query("COMMIT");
      return { membership: null, started: false, reason: "no_current_membership" };
    }

    let orderRow = null;
    let startTriggerOrderId = null;
    if (isArticleTrigger) {
      // Real paid Mini Article assignment — not an orders row; do not set start_trigger_order_id.
      orderRow = {
        id: articleApplicationId,
        source_type: "client_created",
        is_fake: false,
        is_fake_or_training: false,
      };
    } else {
      const { rows: orderRows } = await client.query(
        `SELECT id, source_type, assigned_freelancer_id, accepted_freelancer_id, received_at
           FROM orders
          WHERE id = $1
          LIMIT 1`,
        [orderIdRaw],
      );
      orderRow = orderRows[0] || null;
      startTriggerOrderId = orderIdRaw;
    }

    const decision = decideMarketplaceMembershipFirstOrderStart({
      membershipStatus: mem.status,
      paidTermStartsAt: mem.paid_term_starts_at,
      firstOrderStartedAt: mem.first_order_started_at,
      orderRow,
    });

    if (decision === "noop_already_active") {
      const membership = mapMembership(mem);
      if (ownTxn) await client.query("COMMIT");
      return { membership, started: false, reason: "already_active", idempotent: true };
    }
    if (decision === "skip_wrong_status") {
      const membership = mapMembership(mem);
      if (ownTxn) await client.query("COMMIT");
      return { membership, started: false, reason: `status_${mem.status}` };
    }
    if (decision === "reject_missing_order") {
      if (ownTxn) await client.query("COMMIT");
      return {
        membership: mapMembership(mem),
        started: false,
        reason: "order_not_found_in_orders",
      };
    }
    if (decision === "reject_non_real") {
      if (ownTxn) await client.query("COMMIT");
      return {
        membership: mapMembership(mem),
        started: false,
        reason: "non_real_order",
      };
    }

    const plan = await marketplaceMembershipPlansService.getMarketplaceMembershipPlanById(
      Number(mem.marketplace_plan_id),
      client,
    );
    let durationDays = Number(plan?.cycleDurationDays);
    if (!Number.isInteger(durationDays) || durationDays < 1) {
      durationDays = 30;
    }

    const { paidTermStartsAt, paidTermEndsAt } = computePaidTermWindowFromDurationDays({
      startsAt: now,
      durationDays,
    });
    const anchorDay = resolveCycleAnchorDay(paidTermStartsAt);

    let updatedRow;
    try {
      const { rows: updated } = await client.query(
        `UPDATE freelancer_marketplace_memberships
            SET status = 'active',
                started_at = COALESCE(started_at, $2),
                paid_term_starts_at = $2,
                paid_term_ends_at = $3,
                first_order_started_at = $2,
                start_trigger_order_id = $4,
                cycle_anchor_day = $5,
                updated_at = NOW(),
                updated_by_user_id = $6
          WHERE id = $1
            AND is_current = TRUE
            AND status = 'purchased_pending_start'
            AND paid_term_starts_at IS NULL
          RETURNING *`,
        [
          mem.id,
          paidTermStartsAt.toISOString(),
          paidTermEndsAt.toISOString(),
          startTriggerOrderId,
          anchorDay,
          input.actorUserId || null,
        ],
      );
      updatedRow = updated[0] || null;
    } catch (err) {
      if (err && err.code === "42703") {
        throw createAppError(
          "Marketplace pending-start columns missing. Apply migration 181 on a non-Production DB.",
          503,
          {
            exposeToClient: false,
            publicCode: "MEMBERSHIP_PENDING_START_SCHEMA_MISSING",
            cause: err,
          },
        );
      }
      throw err;
    }

    if (!updatedRow) {
      const { rows: again } = await client.query(
        `SELECT * FROM freelancer_marketplace_memberships WHERE id = $1`,
        [mem.id],
      );
      const membership = mapMembership(again[0] || mem);
      if (ownTxn) await client.query("COMMIT");
      return { membership, started: false, reason: "concurrent_or_already_started", idempotent: true };
    }

    const membership = mapMembership(updatedRow);
    if (plan) membership.plan = plan;

    await writeAudit(client, {
      membershipId: membership.id,
      freelancerUserId,
      actorUserId: input.actorUserId || null,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_TERM_STARTED_ON_FIRST_ORDER,
      detail: {
        orderId: startTriggerOrderId != null ? String(startTriggerOrderId) : null,
        articleApplicationId: isArticleTrigger ? String(articleApplicationId) : null,
        triggerSource,
        paidTermStartsAt: paidTermStartsAt.toISOString(),
        paidTermEndsAt: paidTermEndsAt.toISOString(),
        durationDays,
      },
    });
    await writeAudit(client, {
      membershipId: membership.id,
      freelancerUserId,
      actorUserId: input.actorUserId || null,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_ACTIVATED,
      detail: {
        status: "active",
        trigger: isArticleTrigger ? "first_real_article_assignment" : "first_real_order",
        orderId: startTriggerOrderId != null ? String(startTriggerOrderId) : null,
        articleApplicationId: isArticleTrigger ? String(articleApplicationId) : null,
      },
    });

    let cycle = null;
    if (plan) {
      cycle = await marketplaceMembershipCyclesService.createAndActivateCycleForMembership({
        membership: updatedRow,
        plan,
        cycleNumber: 1,
        now: paidTermStartsAt,
        client,
        actorUserId: input.actorUserId || null,
      });
    }

    if (ownTxn) await client.query("COMMIT");
    return {
      membership,
      started: true,
      reason: isArticleTrigger
        ? "started_on_first_real_article_assignment"
        : "started_on_first_real_order",
      currentCycle: cycle,
    };
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

/**
 * Best-effort lifecycle hook used next to legacy subscription first-order activation.
 * Never throws for "no marketplace membership" / wrong status — only unexpected failures.
 */
async function maybeStartMarketplaceMembershipOnFirstRealOrder(input = {}, client = null) {
  try {
    return await startMarketplaceMembershipOnFirstRealOrder({
      ...input,
      client: client || input.client || null,
    });
  } catch (err) {
    if (
      err?.publicCode === "MEMBERSHIP_PENDING_START_SCHEMA_MISSING" ||
      err?.code === "42P01" ||
      err?.code === "42703"
    ) {
      return { membership: null, started: false, reason: "schema_unavailable", error: err };
    }
    throw err;
  }
}

/**
 * Lazy STARTER entitlement: grant starter_pending_start when freelancer has no current membership.
 * Does NOT start the 10-day trial clock. Does NOT require Stripe or admin approval.
 */
async function ensureStarterPendingEntitlement(input = {}) {
  const freelancerUserId = Number(input.freelancerUserId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    throw createAppError("freelancerUserId is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_FREELANCER",
    });
  }
  const now = toUtcDate(input.now || new Date());
  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");

    const current = await resolveCurrentMarketplaceMembershipForFreelancer(freelancerUserId, {
      client,
    });
    if (current) {
      if (ownTxn) await client.query("COMMIT");
      return { membership: current, created: false, reason: "already_has_current" };
    }

    const eligibility = require("./marketplaceMembershipEligibilityService");
    await eligibility.assertStarterNotAlreadyConsumed(client, freelancerUserId);

    const { rows: userRows } = await client.query(
      `SELECT id, role, is_active FROM users WHERE id = $1 FOR UPDATE`,
      [freelancerUserId],
    );
    const user = userRows[0];
    if (!user || user.role !== "freelancer" || user.is_active !== true) {
      throw createAppError("Freelancer account is not eligible for Marketplace Membership.", 403, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_FREELANCER_INVALID",
      });
    }

    const plan = await marketplaceMembershipPlansService.getMarketplaceMembershipPlanByTierCode(
      "starter",
      client,
    );
    if (!plan || !plan.isActive) {
      throw createAppError("Starter plan is not available.", 404, {
        exposeToClient: true,
        publicCode: "STARTER_PLAN_NOT_FOUND",
      });
    }

    const anchorDay = resolveCycleAnchorDay(now);
    let membershipRow;
    try {
      const { rows } = await client.query(
        `INSERT INTO freelancer_marketplace_memberships (
           freelancer_user_id, marketplace_plan_id, is_current, status, source,
           cycle_anchor_day, started_at, paid_term_starts_at, paid_term_ends_at,
           auto_renew, notes, created_by_user_id, updated_by_user_id
         ) VALUES (
           $1, $2, TRUE, 'starter_pending_start', 'system',
           $3, NULL, NULL, NULL,
           FALSE, $4, $5, $5
         )
         RETURNING *`,
        [
          freelancerUserId,
          Number(plan.id),
          anchorDay,
          input.notes || "starter_pending_start_entitlement",
          input.actorUserId != null ? Number(input.actorUserId) : freelancerUserId,
        ],
      );
      membershipRow = rows[0];
    } catch (err) {
      if (isUniqueViolation(err)) {
        const again = await resolveCurrentMarketplaceMembershipForFreelancer(freelancerUserId, {
          client,
        });
        if (ownTxn) await client.query("COMMIT");
        return { membership: again, created: false, reason: "race_current_exists" };
      }
      throw err;
    }

    const membership = mapMembership(membershipRow);
    membership.plan = plan;

    await writeAudit(client, {
      membershipId: membership.id,
      freelancerUserId,
      actorUserId: input.actorUserId != null ? Number(input.actorUserId) : freelancerUserId,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_STARTER_PENDING_GRANTED,
      detail: { status: "starter_pending_start", marketplacePlanId: String(plan.id) },
    });
    await writeAudit(client, {
      membershipId: membership.id,
      freelancerUserId,
      actorUserId: input.actorUserId != null ? Number(input.actorUserId) : freelancerUserId,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_CREATED,
      detail: { status: "starter_pending_start", source: "system" },
    });

    if (ownTxn) await client.query("COMMIT");
    return { membership, created: true, reason: "granted_starter_pending_start" };
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

/**
 * Start STARTER 10-day trial from starter_pending_start.
 * Requires identity verification + required training. Idempotent if already active STARTER.
 */
async function startStarterTrial(input = {}) {
  const freelancerUserId = Number(input.freelancerUserId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    throw createAppError("freelancerUserId is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_FREELANCER",
    });
  }
  const now = toUtcDate(input.now || new Date());
  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");

    const eligibility = require("./marketplaceMembershipEligibilityService");

    let current = await resolveCurrentMarketplaceMembershipForFreelancer(freelancerUserId, {
      client,
    });

    if (!current) {
      const ensured = await ensureStarterPendingEntitlement({
        freelancerUserId,
        actorUserId: input.actorUserId,
        now,
        client,
      });
      current = ensured.membership;
    }

    if (!current) {
      throw createAppError("Starter entitlement is not available.", 404, {
        exposeToClient: true,
        publicCode: "STARTER_ENTITLEMENT_MISSING",
      });
    }

    const tier = String(current.plan?.tierCode || "").toLowerCase();
    if (tier === "starter" && isBenefitUsableStatus(current.status) && current.paidTermStartsAt) {
      const cycle = await marketplaceMembershipCyclesService.getCurrentActiveCycle(current.id, {
        client,
        now,
      });
      if (ownTxn) await client.query("COMMIT");
      return {
        membership: current,
        currentCycle: cycle,
        started: false,
        idempotent: true,
        reason: "already_active",
      };
    }

    if (isPaidMarketplaceMembershipTier(tier) || isPurchasedPendingStartStatus(current.status)) {
      throw createAppError("A paid marketplace membership is already current.", 409, {
        exposeToClient: true,
        publicCode: "PAID_MEMBERSHIP_ALREADY_CURRENT",
        details: { tierCode: tier, status: current.status },
      });
    }

    if (!isStarterPendingStartStatus(current.status) || tier !== "starter") {
      throw createAppError("Starter trial can only start from a pending STARTER entitlement.", 409, {
        exposeToClient: true,
        publicCode: "STARTER_TRIAL_INVALID_STATUS",
        details: { status: current.status, tierCode: tier },
      });
    }

    await eligibility.assertMarketplaceVerificationComplete(client, freelancerUserId);
    await eligibility.assertPaidTrainingComplete(client, freelancerUserId);

    const plan =
      current.plan ||
      (await marketplaceMembershipPlansService.getMarketplaceMembershipPlanById(
        Number(current.marketplacePlanId),
        client,
      ));
    const durationDays =
      Number(plan?.cycleDurationDays) > 0
        ? Number(plan.cycleDurationDays)
        : STARTER_TRIAL_DURATION_DAYS;
    const { paidTermStartsAt, paidTermEndsAt } = computePaidTermWindowFromDurationDays({
      startsAt: now,
      durationDays,
    });
    const anchorDay = resolveCycleAnchorDay(paidTermStartsAt);

    const { rows } = await client.query(
      `UPDATE freelancer_marketplace_memberships
          SET status = 'active',
              started_at = $2,
              paid_term_starts_at = $2,
              paid_term_ends_at = $3,
              cycle_anchor_day = $4,
              updated_at = NOW(),
              updated_by_user_id = $5
        WHERE id = $1
          AND is_current = TRUE
          AND status = 'starter_pending_start'
        RETURNING *`,
      [
        current.id,
        paidTermStartsAt.toISOString(),
        paidTermEndsAt.toISOString(),
        anchorDay,
        input.actorUserId != null ? Number(input.actorUserId) : freelancerUserId,
      ],
    );
    if (!rows[0]) {
      throw createAppError("Could not start Starter trial (status changed).", 409, {
        exposeToClient: true,
        publicCode: "STARTER_TRIAL_CONFLICT",
      });
    }

    const membership = mapMembership(rows[0]);
    membership.plan = plan;

    await writeAudit(client, {
      membershipId: membership.id,
      freelancerUserId,
      actorUserId: input.actorUserId != null ? Number(input.actorUserId) : freelancerUserId,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_STARTER_TRIAL_STARTED,
      detail: {
        status: "active",
        paidTermStartsAt: paidTermStartsAt.toISOString(),
        paidTermEndsAt: paidTermEndsAt.toISOString(),
        durationDays,
      },
    });
    await writeAudit(client, {
      membershipId: membership.id,
      freelancerUserId,
      actorUserId: input.actorUserId != null ? Number(input.actorUserId) : freelancerUserId,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_ACTIVATED,
      detail: { status: "active", source: "starter_trial_start" },
    });

    const cycle = await marketplaceMembershipCyclesService.createAndActivateCycleForMembership({
      membership: rows[0],
      plan,
      cycleNumber: 1,
      now: paidTermStartsAt,
      client,
      actorUserId: input.actorUserId != null ? Number(input.actorUserId) : freelancerUserId,
    });

    if (ownTxn) await client.query("COMMIT");
    return {
      membership,
      currentCycle: cycle,
      started: true,
      idempotent: false,
      reason: "trial_started",
    };
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

module.exports = {
  mapMembership,
  writeAudit,
  createAndActivateMarketplaceMembership,
  createPurchasedPendingStartMembership,
  startMarketplaceMembershipOnFirstRealOrder,
  maybeStartMarketplaceMembershipOnFirstRealOrder,
  ensureStarterPendingEntitlement,
  startStarterTrial,
  resolveCurrentMarketplaceMembershipForFreelancer,
  getMarketplaceMembershipById,
  getFreelancerMarketplaceMembershipSnapshot,
  cancelMarketplaceMembership,
  suspendMarketplaceMembership,
  resumeMarketplaceMembership,
  expireMarketplaceMembershipIfDue,
  listMarketplaceMembershipsForAdmin,
  BENEFIT_USABLE_MEMBERSHIP_STATUSES,
};
