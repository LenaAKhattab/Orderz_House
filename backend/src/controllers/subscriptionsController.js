const subscriptionsService = require("../services/subscriptionsService");
const plansService = require("../services/plansService");
const stripeCheckoutService = require("../services/stripeCheckoutService");
const { markActivationFeePaidOffline } = require("../services/subscriptionActivationFeeService");
const systemSettingsService = require("../services/systemSettingsService");
const {
  PAID_NOTIFICATION_EMAIL_KEY,
  ADMIN_EMAIL_ENV,
} = require("../services/subscriptionAdminNotificationService");
const { pool } = require("../config/db");

function envFallbackEmail() {
  return String(process.env[ADMIN_EMAIL_ENV] || "").trim() || null;
}

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

const listActivationQueue = async (req, res, next) => {
  try {
    const searchRaw = req.query.search != null ? String(req.query.search).trim() : "";
    const result = await subscriptionsService.listActivationQueueSubscriptions({
      page: req.query.page != null ? Number(req.query.page) : 1,
      limit: req.query.limit != null ? Number(req.query.limit) : 20,
      search: searchRaw || null,
    });
    return res.status(200).json({
      success: true,
      data: {
        subscriptions: result.subscriptions,
        pagination: result.pagination,
      },
    });
  } catch (err) {
    return next(err);
  }
};

const listSubscriptions = async (req, res, next) => {
  try {
    const result = await subscriptionsService.listSubscriptions({
      page: req.query.page != null ? Number(req.query.page) : 1,
      limit: req.query.limit != null ? Number(req.query.limit) : 20,
      freelancerUserId: req.query.freelancerUserId ? Number(req.query.freelancerUserId) : null,
      planId: req.query.planId ? Number(req.query.planId) : null,
      status: req.query.status ? String(req.query.status) : null,
      search: req.query.search ? String(req.query.search).trim() : null,
    });
    return res.status(200).json({
      success: true,
      data: {
        subscriptions: result.subscriptions,
        pagination: result.pagination,
        aggregates: result.aggregates,
      },
    });
  } catch (err) {
    return next(err);
  }
};

const getSubscriptionNotificationEmail = async (req, res, next) => {
  try {
    const email = await systemSettingsService.getSetting(PAID_NOTIFICATION_EMAIL_KEY);
    const envFallback = envFallbackEmail();
    return res.status(200).json({
      success: true,
      data: {
        email: email || null,
        envFallback,
        effectiveEmail: email || envFallback || null,
      },
    });
  } catch (err) {
    return next(err);
  }
};

const updateSubscriptionNotificationEmail = async (req, res, next) => {
  try {
    const raw = req.body.email;
    const value = raw == null ? "" : String(raw).trim();
    const saved = await systemSettingsService.setSetting(PAID_NOTIFICATION_EMAIL_KEY, value, {
      updatedByUserId: req.auth?.userId ?? null,
    });
    const envFallback = envFallbackEmail();
    return res.status(200).json({
      success: true,
      data: {
        email: saved,
        envFallback,
        effectiveEmail: saved || envFallback || null,
      },
    });
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
      locale: String(req.headers["accept-language"] || "ar").toLowerCase().startsWith("en") ? "en" : "ar",
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

const listAssignablePlans = async (req, res, next) => {
  try {
    const plans = await plansService.listPlans({ includeDeleted: false });
    const assignable = plans.filter((p) => p && p.isActive);
    return res.status(200).json({ success: true, data: { plans: assignable } });
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

const markActivationFeePaidOfflineAdmin = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { freelancerUserId, notes } = req.body;
    await client.query("BEGIN");
    const result = await markActivationFeePaidOffline({
      adminUserId: req.auth?.userId,
      freelancerUserId,
      notes,
    }, client);
    await client.query("COMMIT");
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    await client.query("ROLLBACK");
    return next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  assignPlan,
  listAssignablePlans,
  updateSubscription,
  listActivationQueue,
  listSubscriptions,
  getSubscriptionNotificationEmail,
  updateSubscriptionNotificationEmail,
  getFreelancerCurrentSubscription,
  getFreelancerEligibility,
  createFreelancerSubscriptionCheckout,
  confirmFreelancerSubscriptionCheckout,
  recordFreelancerSubscriptionCheckoutCancelledNotify,
  activateSubscriptionCompanyApproval,
  markActivationFeePaidOfflineAdmin,
};

