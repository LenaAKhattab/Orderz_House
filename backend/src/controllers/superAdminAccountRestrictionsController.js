const restrictionsService = require("../services/freelancerAccountRestrictionsService");
const planRestrictionsService = require("../services/marketplacePlanRestrictionsService");
const subscriptionsService = require("../services/subscriptionsService");

function actorId(req) {
  return req.auth?.userId || req.user?.id;
}

async function list(req, res, next) {
  try {
    const data = await restrictionsService.listRestrictions({
      status: req.query.status || null,
      q: req.query.q || null,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const row = await restrictionsService.getRestrictionById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Restriction not found." });
    return res.json({ success: true, data: { restriction: row } });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    const created = await restrictionsService.createRestriction({
      userId: req.body.userId,
      restrictionType: req.body.restrictionType,
      scopes: req.body.scopes,
      internalReason: req.body.internalReason,
      internalNote: req.body.internalNote,
      startsAt: req.body.startsAt,
      expiresAt: req.body.expiresAt,
      actorAdminId: actorId(req),
      metadata: req.body.metadata || null,
    });
    return res.status(201).json({ success: true, data: { restriction: created } });
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const updated = await restrictionsService.updateRestriction(req.params.id, req.body, actorId(req));
    return res.json({ success: true, data: { restriction: updated } });
  } catch (err) {
    return next(err);
  }
}

async function extend(req, res, next) {
  try {
    const updated = await restrictionsService.extendRestriction(
      req.params.id,
      req.body.expiresAt,
      actorId(req),
      req.body.reason || null,
    );
    return res.json({ success: true, data: { restriction: updated } });
  } catch (err) {
    return next(err);
  }
}

async function revoke(req, res, next) {
  try {
    const revoked = await restrictionsService.revokeRestriction(req.params.id, {
      actorAdminId: actorId(req),
      revokeReason: req.body.revokeReason || null,
    });
    return res.json({ success: true, data: { restriction: revoked } });
  } catch (err) {
    return next(err);
  }
}

async function userSummary(req, res, next) {
  try {
    const userId = req.params.userId;
    const summary = await restrictionsService.getUserRestrictionSummary(userId);
    const audit = await restrictionsService.listAuditForUser(userId, { limit: 30 });
    let eligibility = null;
    let subscription = null;
    try {
      eligibility = await subscriptionsService.canFreelancerTakeOrders(userId);
      subscription = await subscriptionsService.getCurrentSubscriptionForFreelancer(userId);
    } catch {
      /* optional enrichment */
    }
    return res.json({
      success: true,
      data: {
        ...summary,
        audit,
        eligibility,
        subscription: subscription
          ? {
              planId: subscription.planId,
              planName: subscription.planName || subscription.plan?.name || null,
              planTitle: subscription.planTitle || subscription.plan?.title || null,
              status: subscription.status,
              activationStatus: subscription.activationStatus,
            }
          : null,
        moderationBadge: summary.hasActiveRestriction ? "ACTIVE_ADMIN_HOLD" : null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function listHeldBids(req, res, next) {
  try {
    const items = await restrictionsService.listHeldBids({
      userId: req.query.userId || null,
      limit: req.query.limit,
    });
    return res.json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

async function releaseBid(req, res, next) {
  try {
    const result = await restrictionsService.releaseHeldBid(req.params.bidId, {
      actorAdminId: actorId(req),
      reason: req.body.reason || null,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function rejectBid(req, res, next) {
  try {
    const result = await restrictionsService.rejectHeldBid(req.params.bidId, {
      actorAdminId: actorId(req),
      reason: req.body.reason || null,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function listPlans(req, res, next) {
  try {
    const data = await planRestrictionsService.listCanonicalPlansWithRestrictionState();
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getPlanRestriction(req, res, next) {
  try {
    const restriction = await planRestrictionsService.getPlanRestrictionById(req.params.id);
    if (!restriction) {
      return res.status(404).json({ success: false, message: "Plan restriction not found." });
    }
    const [audit, impact] = await Promise.all([
      planRestrictionsService.listPlanRestrictionAudit(req.params.id, { limit: 50 }),
      planRestrictionsService.getPlanRestrictionImpact(restriction.marketplacePlanId),
    ]);
    return res.json({ success: true, data: { restriction, audit, impact } });
  } catch (err) {
    return next(err);
  }
}

async function createPlan(req, res, next) {
  try {
    const created = await planRestrictionsService.createPlanRestriction({
      marketplacePlanId: req.body.marketplacePlanId,
      restrictionType: req.body.restrictionType,
      scopes: req.body.scopes,
      internalReason: req.body.internalReason,
      internalNote: req.body.internalNote,
      startsAt: req.body.startsAt,
      expiresAt: req.body.expiresAt,
      actorAdminId: actorId(req),
      metadata: req.body.metadata || null,
    });
    return res.status(201).json({ success: true, data: { restriction: created } });
  } catch (err) {
    return next(err);
  }
}

async function updatePlan(req, res, next) {
  try {
    const updated = await planRestrictionsService.updatePlanRestriction(
      req.params.id,
      req.body,
      actorId(req),
    );
    return res.json({ success: true, data: { restriction: updated } });
  } catch (err) {
    return next(err);
  }
}

async function extendPlan(req, res, next) {
  try {
    const updated = await planRestrictionsService.extendPlanRestriction(
      req.params.id,
      req.body.expiresAt,
      actorId(req),
      req.body.reason || null,
    );
    return res.json({ success: true, data: { restriction: updated } });
  } catch (err) {
    return next(err);
  }
}

async function revokePlan(req, res, next) {
  try {
    const revoked = await planRestrictionsService.revokePlanRestriction(req.params.id, {
      actorAdminId: actorId(req),
      revokeReason: req.body.revokeReason || null,
    });
    return res.json({ success: true, data: { restriction: revoked } });
  } catch (err) {
    return next(err);
  }
}

async function planImpact(req, res, next) {
  try {
    const impact = await planRestrictionsService.getPlanRestrictionImpact(req.params.planId);
    const count = await planRestrictionsService.countCurrentSubscribersForPlanId(req.params.planId);
    return res.json({
      success: true,
      data: { ...impact, currentSubscriberCount: count },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  list,
  getOne,
  create,
  update,
  extend,
  revoke,
  userSummary,
  listHeldBids,
  releaseBid,
  rejectBid,
  listPlans,
  getPlanRestriction,
  createPlan,
  updatePlan,
  extendPlan,
  revokePlan,
  planImpact,
};
