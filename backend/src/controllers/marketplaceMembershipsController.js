const marketplaceMembershipsService = require("../services/marketplaceMembershipsService");
const marketplaceMembershipCyclesService = require("../services/marketplaceMembershipCyclesService");
const marketplacePriorityBidUsageService = require("../services/marketplacePriorityBidUsageService");

async function getMyMarketplaceMembership(req, res, next) {
  try {
    const freelancerUserId = req.auth?.userId || req.user?.sub;
    const snapshot = await marketplaceMembershipsService.getFreelancerMarketplaceMembershipSnapshot(
      freelancerUserId,
    );
    return res.json({
      success: true,
      data: snapshot,
    });
  } catch (err) {
    return next(err);
  }
}

async function listAdminMarketplaceMemberships(req, res, next) {
  try {
    const freelancerUserId = req.query.freelancerUserId || null;
    const limit = req.query.limit;
    const offset = req.query.offset;
    const rows = await marketplaceMembershipsService.listMarketplaceMembershipsForAdmin({
      freelancerUserId,
      limit,
      offset,
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    return next(err);
  }
}

async function getAdminMarketplaceMembership(req, res, next) {
  try {
    const membership = await marketplaceMembershipsService.getMarketplaceMembershipById(req.params.id);
    if (!membership) {
      return res.status(404).json({
        success: false,
        code: "MEMBERSHIP_NOT_FOUND",
        message: "عضوية Marketplace غير موجودة.",
      });
    }
    const cycle = await marketplaceMembershipCyclesService.getCurrentActiveCycle(membership.id);
    const allowance = cycle
      ? {
          allowed: cycle.priorityBidUsesAllowed,
          used: cycle.priorityBidUsesConsumed,
          remaining: cycle.priorityBidUsesRemaining,
        }
      : null;
    return res.json({
      success: true,
      data: {
        membership,
        currentCycle: cycle,
        priorityBid: allowance,
        // Payment integration not built in Phase 3
        paymentIntegration: "not_wired",
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** Internal reconciliation tick — secret-gated; no Freelancer consume endpoint. */
async function runMembershipCyclesReconcileTick(req, res, next) {
  try {
    const result =
      await marketplaceMembershipCyclesService.reconcileAllMarketplaceMembershipCycles({
        limit: req.body?.limit || 200,
      });
    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMyMarketplaceMembership,
  listAdminMarketplaceMemberships,
  getAdminMarketplaceMembership,
  runMembershipCyclesReconcileTick,
  // Exported for route wiring clarity — usage mutations stay internal
  _internalUsageService: marketplacePriorityBidUsageService,
};
