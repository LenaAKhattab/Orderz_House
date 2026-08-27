const express = require("express");

const subscriptionsController = require("../controllers/subscriptionsController");

const validateRequest = require("../middleware/validateRequest");

const {
  requireAuth,
  requireAdmin,
  requireAnyRole,
  requireSuperAdmin,
  requirePermission,
} = require("../middleware/rbacMiddleware");

const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");

/**
 * Web-Admin-A1: membership activation + package assignment are role-gated
 * (admin + super_admin), matching Flutter Super Admin action parity.
 * Payment/email secret settings remain super_admin-only.
 * Destructive/hold clears stay subscriptions-permission gated.
 */
const ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES = ["admin", "super_admin"];

const subscriptionsPerm = requirePermission(PERMISSION_KEYS.SUBSCRIPTIONS);

const {
  assignSubscriptionValidators,
  updateSubscriptionValidators,
  listSubscriptionsValidators,
  listActivationQueueValidators,
  updateSubscriptionNotificationEmailValidators,
  updateSubscriptionActivationFeeSettingsValidators,
  freelancerIdParam,
  activateSubscriptionValidators,
  markActivationFeePaidOfflineValidators,
} = require("../validators/subscriptionsValidators");

const router = express.Router();

router.use(requireAuth);

router.get(
  "/subscriptions",
  requireAdmin,
  listSubscriptionsValidators,
  validateRequest,
  subscriptionsController.listSubscriptions,
);

router.get(
  "/subscriptions/activation-queue",
  requireAdmin,
  listActivationQueueValidators,
  validateRequest,
  subscriptionsController.listActivationQueue,
);

router.get(
  "/subscriptions/notification-email",
  requireSuperAdmin,
  subscriptionsController.getSubscriptionNotificationEmail,
);

router.put(
  "/subscriptions/notification-email",
  requireSuperAdmin,
  updateSubscriptionNotificationEmailValidators,
  validateRequest,
  subscriptionsController.updateSubscriptionNotificationEmail,
);

router.get(
  "/subscriptions/activation-fee-settings",
  requireSuperAdmin,
  subscriptionsController.getSubscriptionActivationFeeSettings,
);

router.put(
  "/subscriptions/activation-fee-settings",
  requireSuperAdmin,
  updateSubscriptionActivationFeeSettingsValidators,
  validateRequest,
  subscriptionsController.updateSubscriptionActivationFeeSettings,
);

router.post(
  "/subscriptions/assign",
  requireAdmin,
  assignSubscriptionValidators,
  validateRequest,
  subscriptionsController.assignPlan,
);

router.get(
  "/subscriptions/assignable-plans",
  requireAdmin,
  subscriptionsController.listAssignablePlans,
);

router.patch(
  "/subscriptions/:id",
  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),
  subscriptionsPerm,
  updateSubscriptionValidators,
  validateRequest,
  subscriptionsController.updateSubscription,
);

router.get(
  "/freelancers/:freelancerUserId/subscription",
  requireAdmin,
  freelancerIdParam,
  validateRequest,
  subscriptionsController.getFreelancerCurrentSubscription,
);

router.get(
  "/freelancers/:freelancerUserId/eligibility",
  requireAdmin,
  freelancerIdParam,
  validateRequest,
  subscriptionsController.getFreelancerEligibility,
);

router.patch(
  "/subscriptions/:id/company-activate",
  requireAdmin,
  activateSubscriptionValidators,
  validateRequest,
  subscriptionsController.activateSubscriptionCompanyApproval,
);

router.post(
  "/freelancers/:freelancerUserId/clear-payment-failure-hold",
  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),
  subscriptionsPerm,
  freelancerIdParam,
  validateRequest,
  subscriptionsController.clearFreelancerPaymentFailureHold,
);

router.post(
  "/subscriptions/activation-fee/mark-paid-offline",
  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),
  subscriptionsPerm,
  markActivationFeePaidOfflineValidators,
  validateRequest,
  subscriptionsController.markActivationFeePaidOfflineAdmin,
);

module.exports = router;
