const subscriptionsService = require("../services/subscriptionsService");
const stripeCheckoutService = require("../services/stripeCheckoutService");

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

const createFreelancerSubscriptionCheckout = async (req, res, next) => {
  try {
    const planId = Number(req.body.planId);
    const freelancerUserId = req.auth?.userId ?? req.user?.sub;
    const debug =
      process.env.NODE_ENV !== "production" || String(process.env.DEBUG_FREELANCER_CHECKOUT || "") === "1";
    if (debug) {
      // Safe debug only — never log secrets
      // eslint-disable-next-line no-console
      console.warn("[POST /freelancer/subscriptions/checkout]", {
        body: req.body,
        freelancerUserId,
        primaryRole: req.auth?.primaryRole,
        legacyRole: req.auth?.legacyRole,
        roles: req.auth?.roles?.map((r) => r?.name).filter(Boolean),
        planId,
      });
    }
    const result = await stripeCheckoutService.createFreelancerSubscriptionCheckoutSession({
      freelancerUserId,
      planId,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
};

const confirmFreelancerSubscriptionCheckout = async (req, res, next) => {
  try {
    const freelancerUserId = req.auth?.userId ?? req.user?.sub;
    const debug =
      process.env.NODE_ENV !== "production" || String(process.env.DEBUG_FREELANCER_CHECKOUT || "") === "1";
    if (debug) {
      // eslint-disable-next-line no-console
      console.warn("[POST /freelancer/subscriptions/confirm-checkout]", {
        sessionIdPrefix: req.body?.sessionId ? String(req.body.sessionId).slice(0, 16) : null,
        freelancerUserId,
      });
    }
    const result = await stripeCheckoutService.confirmFreelancerSubscriptionCheckout({
      freelancerUserId,
      stripeSessionId: req.body.sessionId,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
};

const recordFreelancerSubscriptionCheckoutCancelledNotify = async (req, res, next) => {
  try {
    const freelancerUserId = req.auth?.userId ?? req.user?.sub;
    const result = await stripeCheckoutService.recordFreelancerSubscriptionCheckoutCancelled({
      freelancerUserId,
      stripeSessionId: req.body.sessionId,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
};

const activateSubscriptionCompanyApproval = async (req, res, next) => {
  try {
    const subscription = await subscriptionsService.activateCompanyApprovalForSubscription({
      actorUserId: req.auth?.userId,
      subscriptionId: req.params.id,
    });
    return res.status(200).json({ success: true, data: { subscription } });
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
  createFreelancerSubscriptionCheckout,
  confirmFreelancerSubscriptionCheckout,
  recordFreelancerSubscriptionCheckoutCancelledNotify,
  activateSubscriptionCompanyApproval,
};

