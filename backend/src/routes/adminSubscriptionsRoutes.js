const express = require("express");

const subscriptionsController = require("../controllers/subscriptionsController");

const validateRequest = require("../middleware/validateRequest");

const { requireAuth, requireAnyRole, requireSuperAdmin, requirePermission, requireAnyPermission } = require("../middleware/rbacMiddleware");

const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");



/**

 * Full subscription management vs activation-only pages share some endpoints.

 * - dashboard.super_admin.subscriptions — full subscriptions page

 * - dashboard.admin.subscription_activation — company activation workflow

 */

const ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES = ["admin", "super_admin"];

const subscriptionsPerm = requirePermission(PERMISSION_KEYS.SUBSCRIPTIONS);

const subscriptionActivationPerm = requirePermission(PERMISSION_KEYS.SUBSCRIPTION_ACTIVATION);

const subscriptionsOrActivation = requireAnyPermission([

  PERMISSION_KEYS.SUBSCRIPTIONS,

  PERMISSION_KEYS.SUBSCRIPTION_ACTIVATION,

]);



const {

  assignSubscriptionValidators,

  assignMarketplaceMembershipValidators,

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

  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),

  subscriptionsOrActivation,

  listSubscriptionsValidators,

  validateRequest,

  subscriptionsController.listSubscriptions,

);

router.get(

  "/subscriptions/activation-queue",

  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),

  subscriptionsOrActivation,

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

  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),

  subscriptionsPerm,

  assignSubscriptionValidators,

  validateRequest,

  subscriptionsController.assignPlan,

);

router.post(

  "/subscriptions/assign-marketplace-membership",

  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),

  subscriptionsPerm,

  assignMarketplaceMembershipValidators,

  validateRequest,

  subscriptionsController.assignMarketplaceMembership,

);

router.get(

  "/subscriptions/assignable-plans",

  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),

  subscriptionsOrActivation,

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

  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),

  subscriptionsOrActivation,

  freelancerIdParam,

  validateRequest,

  subscriptionsController.getFreelancerCurrentSubscription,

);

router.get(

  "/freelancers/:freelancerUserId/eligibility",

  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),

  subscriptionsOrActivation,

  freelancerIdParam,

  validateRequest,

  subscriptionsController.getFreelancerEligibility,

);

router.patch(

  "/subscriptions/:id/company-activate",

  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),

  subscriptionsOrActivation,

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

