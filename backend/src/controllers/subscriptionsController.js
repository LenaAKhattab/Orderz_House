const subscriptionsService = require("../services/subscriptionsService");

const assignPlan = async (req, res, next) => {
  try {
    const { freelancerUserId, planId, notes } = req.body;
    const result = await subscriptionsService.assignPlanToFreelancer({
      actorUserId: req.auth?.userId,
      freelancerUserId,
      planId,
      notes,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
};

const updateSubscription = async (req, res, next) => {
  try {
    const updated = await subscriptionsService.updateSubscription({
      actorUserId: req.auth?.userId,
      subscriptionId: req.params.id,
      patch: req.body,
    });
    return res.status(200).json({ success: true, data: { subscription: updated } });
  } catch (err) {
    return next(err);
  }
};

const listSubscriptions = async (req, res, next) => {
  try {
    const subs = await subscriptionsService.listSubscriptions({
      freelancerUserId: req.query.freelancerUserId ? Number(req.query.freelancerUserId) : null,
      status: req.query.status ? String(req.query.status) : null,
    });
    return res.status(200).json({ success: true, data: { subscriptions: subs } });
  } catch (err) {
    return next(err);
  }
};

const getFreelancerCurrentSubscription = async (req, res, next) => {
  try {
    const current = await subscriptionsService.getCurrentSubscriptionForFreelancer(req.params.freelancerUserId);
    return res.status(200).json({ success: true, data: { subscription: current } });
  } catch (err) {
    return next(err);
  }
};

const getFreelancerEligibility = async (req, res, next) => {
  try {
    const eligibility = await subscriptionsService.canFreelancerTakeOrders(req.params.freelancerUserId);
    return res.status(200).json({ success: true, data: eligibility });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  assignPlan,
  updateSubscription,
  listSubscriptions,
  getFreelancerCurrentSubscription,
  getFreelancerEligibility,
};

