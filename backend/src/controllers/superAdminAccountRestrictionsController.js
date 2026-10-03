const restrictionsService = require("../services/freelancerAccountRestrictionsService");
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
};
