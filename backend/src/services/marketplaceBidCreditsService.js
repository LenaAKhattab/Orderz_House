/**
 * Freelancer Bid Credits summary + Super Admin inspect/manual grant — Phase B1.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { BID_CREDIT_ERROR_CODES, NORMAL_APPLICATION_BID_COST } = require("../constants/marketplaceBidCredits");
const { marketplaceBidCreditsSchemaReady } = require("../utils/marketplaceBidCreditsSchema");
const accounting = require("./marketplaceBidCreditAccountingService");
const distribution = require("./marketplaceBidCreditDistributionService");
const { getMarketplaceEconomySettings } = require("./marketplaceEconomySettingsService");

async function assertSchema(client = pool) {
  if (!(await marketplaceBidCreditsSchemaReady(client))) {
    throw createAppError("Bid Credits schema is not applied yet.", 503, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.BID_CREDITS_SCHEMA_NOT_READY,
    });
  }
}

function isBidCreditsEngineActive(settings) {
  return Boolean(settings?.bidCreditsEnabled);
}

function isBidCreditPurchasesEngineActive(settings) {
  return Boolean(settings?.bidCreditPurchasesEnabled);
}

/**
 * Freelancer-facing summary (own data only). Lazy-reconciles distributions first.
 */
async function getFreelancerBidCreditsSummary({ freelancerUserId, now = new Date() } = {}) {
  const fid = Number(freelancerUserId);
  if (!Number.isInteger(fid) || fid < 1) {
    throw createAppError("Invalid freelancer.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.INVALID_FREELANCER,
    });
  }

  const schemaReady = await marketplaceBidCreditsSchemaReady();
  if (!schemaReady) {
    return {
      schemaReady: false,
      engineEnabled: false,
      purchasesEngineEnabled: false,
      availableBids: 0,
      membershipDerivedAvailable: 0,
      manualAdminAvailable: 0,
      normalApplicationBidCost: NORMAL_APPLICATION_BID_COST,
      nextExpiringAt: null,
      currentMonth: null,
      recentLedger: [],
    };
  }

  await distribution.reconcileFreelancerBidDistributions({ freelancerUserId: fid, now });

  const settings = await getMarketplaceEconomySettings();
  const client = await pool.connect();
  try {
    const available = await accounting.sumAvailableBidCredits({
      client,
      freelancerUserId: fid,
      now,
    });
    const grants = await accounting.listBidCreditGrantsForFreelancer({
      freelancerUserId: fid,
      includeExhausted: false,
      limit: 30,
      client,
    });
    const ledger = await accounting.listBidCreditLedgerForFreelancer({
      freelancerUserId: fid,
      limit: 20,
      client,
    });
    const { rows } = await client.query(
      `SELECT * FROM marketplace_membership_bid_distribution_months
        WHERE freelancer_user_id = $1 AND status = 'open'
        ORDER BY window_starts_at DESC, id DESC
        LIMIT 1`,
      [fid],
    );
    const currentMonth = rows[0] ? distribution.mapDistributionMonth(rows[0]) : null;

    const activeGrants = (grants || []).filter((g) => g.amountAvailable > 0);
    const nextExpiringAt = activeGrants.length
      ? activeGrants.map((g) => g.expiresAt).sort()[0]
      : null;

    const membershipDerivedAvailable = activeGrants
      .filter((g) => g.sourceType === "membership_daily_unlock")
      .reduce((s, g) => s + g.amountAvailable, 0);
    const manualAvailable = activeGrants
      .filter((g) => g.sourceType === "admin_manual" || g.sourceType === "admin_adjustment")
      .reduce((s, g) => s + g.amountAvailable, 0);
    const refundCompensatingAvailable = activeGrants
      .filter((g) => g.sourceType === "normal_application_refund")
      .reduce((s, g) => s + g.amountAvailable, 0);

    return {
      schemaReady: true,
      engineEnabled: isBidCreditsEngineActive(settings),
      purchasesEngineEnabled: isBidCreditPurchasesEngineActive(settings),
      availableBids: available,
      membershipDerivedAvailable,
      manualAdminAvailable: manualAvailable,
      refundCompensatingAvailable,
      normalApplicationBidCost: NORMAL_APPLICATION_BID_COST,
      nextExpiringAt,
      currentMonth: currentMonth
        ? {
            monthlyAllowance: currentMonth.monthlyBidAllowanceSnapshot,
            unlockedThisMonth: currentMonth.totalUnlocked,
            dayCount: currentMonth.dayCount,
            lastReconciledDayIndex: currentMonth.lastReconciledDayIndex,
            windowStartsAt: currentMonth.windowStartsAt,
            windowEndsAt: currentMonth.windowEndsAt,
            membershipExpiresAt: currentMonth.membershipExpiresAt,
          }
        : null,
      recentLedger: (ledger || []).map((e) => ({
        id: e.id,
        eventType: e.eventType,
        amount: e.amount,
        direction: e.direction,
        reason: e.reason,
        createdAt: e.createdAt,
        // Human labels only — never expose grant IDs on Freelancer surface.
        labelKey:
          e.eventType === "NORMAL_APPLICATION_BID_REFUND"
            ? "freelancerDashboard.bidCredits.ledgerEvents.NORMAL_APPLICATION_BID_REFUND"
            : `freelancerDashboard.bidCredits.ledgerEvents.${e.eventType}`,
      })),
    };
  } finally {
    client.release();
  }
}

async function getAdminFreelancerBidCredits({ freelancerUserId, now = new Date() } = {}) {
  const summary = await getFreelancerBidCreditsSummary({ freelancerUserId, now });
  if (!summary.schemaReady) return summary;
  const grants = await accounting.listBidCreditGrantsForFreelancer({
    freelancerUserId,
    includeExhausted: true,
    limit: 100,
  });
  const ledger = await accounting.listBidCreditLedgerForFreelancer({
    freelancerUserId,
    limit: 100,
  });
  return {
    ...summary,
    grants,
    ledger,
  };
}

async function adminGrantBidCredits({
  freelancerUserId,
  amount,
  expiresAt,
  reason,
  internalNote = null,
  actorUserId,
  idempotencyKey,
  metadata = {},
} = {}) {
  await assertSchema();
  const fid = Number(freelancerUserId);
  if (!Number.isInteger(fid) || fid < 1) {
    throw createAppError("Invalid freelancer.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.INVALID_FREELANCER,
    });
  }
  const reasonText = String(reason || "").trim();
  if (!reasonText) {
    throw createAppError("reason is required for Admin Bid grants.", 400, {
      exposeToClient: true,
    });
  }
  if (!actorUserId) {
    throw createAppError("actorUserId is required.", 400, { exposeToClient: false });
  }
  const key =
    String(idempotencyKey || "").trim() ||
    `admin_bid_grant:${actorUserId}:${fid}:${amount}:${new Date(expiresAt).toISOString()}:${reasonText}`.slice(
      0,
      180,
    );

  return accounting.createBidCreditGrant({
    freelancerUserId: fid,
    sourceType: "admin_manual",
    amount,
    expiresAt,
    eventType: "ADMIN_BID_GRANT",
    idempotencyKey: key,
    reason: reasonText,
    internalNote,
    actorUserId,
    referenceType: "admin_manual_grant",
    referenceId: key,
    metadata: {
      ...metadata,
      independentOfMembershipPlan: true,
    },
  });
}

module.exports = {
  getFreelancerBidCreditsSummary,
  getAdminFreelancerBidCredits,
  adminGrantBidCredits,
  isBidCreditsEngineActive,
  NORMAL_APPLICATION_BID_COST,
};
