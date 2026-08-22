/**
 * Super Admin assignment catalog + marketplace membership assign (canonical tiers).
 * Legacy subscription plans remain on subscriptionsService.assignPlanToFreelancer.
 */
const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES } = require("../constants/marketplaceMembershipPlans");
const marketplaceMembershipPlansService = require("./marketplaceMembershipPlansService");
const marketplaceMembershipsService = require("./marketplaceMembershipsService");
const plansService = require("./plansService");
const { markActivationFeePaidOffline } = require("./subscriptionActivationFeeService");

const ADMIN_MARKETPLACE_ASSIGNMENT_NOTE = "إسناد إداري أوفلاين — عضوية سوق العمل.";
const ADMIN_ASSIGNMENT_ACTIVATION_FEE_NOTE =
  "تم تسجيل رسوم تفعيل الحساب كمدفوعة أوفلاين ضمن إسناد عضوية سوق العمل من الإدارة.";

const TIER_RANK = new Map(MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES.map((code, i) => [code, i]));

function normalizeTierCode(value) {
  return String(value || "").trim().toLowerCase();
}

function sortCanonicalMarketplacePlans(plans) {
  return [...(plans || [])].sort((a, b) => {
    const ra = TIER_RANK.get(normalizeTierCode(a.tierCode)) ?? 99;
    const rb = TIER_RANK.get(normalizeTierCode(b.tierCode)) ?? 99;
    if (ra !== rb) return ra - rb;
    return Number(a.sortOrder) - Number(b.sortOrder);
  });
}

function mapLegacyAssignablePlan(plan) {
  if (!plan) return null;
  return {
    ...plan,
    assignmentCategory: "legacy_subscription",
    isLegacy: true,
    assignmentLabelAr: `${plan.title} (${plan.durationDays} يوم)`,
  };
}

async function listAssignmentCatalogForAdmin() {
  const [legacyRows, marketplaceRows] = await Promise.all([
    plansService.listPlans({ includeDeleted: false }),
    marketplaceMembershipPlansService.listAdminMarketplaceMembershipPlans({ includeInactive: false }),
  ]);

  const legacyPlans = (legacyRows || [])
    .filter((p) => p && p.isActive)
    .map(mapLegacyAssignablePlan)
    .filter(Boolean);

  const marketplaceMemberships = sortCanonicalMarketplacePlans(
    (marketplaceRows || []).filter(
      (p) =>
        p &&
        p.isActive &&
        MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES.includes(normalizeTierCode(p.tierCode)),
    ),
  ).map((plan) => ({
    ...plan,
    assignmentCategory: "marketplace_membership",
    isLegacy: false,
    tierCode: normalizeTierCode(plan.tierCode),
  }));

  return {
    assignmentDefault: "marketplace_membership",
    marketplaceMemberships,
    legacyPlans,
    // Backward compatibility for subscription list filters.
    plans: legacyPlans,
  };
}

async function assignMarketplaceMembershipToFreelancerByAdmin({
  actorUserId,
  freelancerUserId,
  marketplacePlanId,
  notes = null,
}) {
  const planId = Number(marketplacePlanId);
  const userId = Number(freelancerUserId);
  if (!Number.isInteger(userId) || userId < 1) {
    throw createAppError("freelancerUserId is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_FREELANCER",
    });
  }
  if (!Number.isInteger(planId) || planId < 1) {
    throw createAppError("marketplacePlanId is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MARKETPLACE_PLAN",
    });
  }

  const plan = await marketplaceMembershipPlansService.getMarketplaceMembershipPlanById(planId);
  if (!plan || !plan.isActive) {
    throw createAppError("Marketplace plan not found or inactive.", 404, {
      exposeToClient: true,
      publicCode: "MARKETPLACE_PLAN_NOT_FOUND",
    });
  }
  const tierCode = normalizeTierCode(plan.tierCode);
  if (!MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES.includes(tierCode)) {
    throw createAppError("Only canonical marketplace tiers can be assigned from admin.", 400, {
      exposeToClient: true,
      publicCode: "MARKETPLACE_PLAN_NOT_ASSIGNABLE",
    });
  }

  const assignmentNotes = [notes, ADMIN_MARKETPLACE_ASSIGNMENT_NOTE]
    .map((n) => (n != null ? String(n).trim() : ""))
    .filter(Boolean)
    .join("\n");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await markActivationFeePaidOffline(
      {
        adminUserId: actorUserId ? Number(actorUserId) : null,
        freelancerUserId: userId,
        notes: ADMIN_ASSIGNMENT_ACTIVATION_FEE_NOTE,
      },
      client,
    );

    const membership = await marketplaceMembershipsService.createAndActivateMarketplaceMembership({
      client,
      freelancerUserId: userId,
      marketplacePlanId: planId,
      source: "admin",
      actorUserId: actorUserId ? Number(actorUserId) : null,
      notes: assignmentNotes || null,
    });

    await client.query("COMMIT");
    return {
      membership,
      marketplacePlan: plan,
      tierCode,
      assignmentCategory: "marketplace_membership",
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listAssignmentCatalogForAdmin,
  assignMarketplaceMembershipToFreelancerByAdmin,
  ADMIN_MARKETPLACE_ASSIGNMENT_NOTE,
};
