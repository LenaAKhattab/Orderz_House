const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");
const controller = require("../controllers/superAdminUsersControlController");
const {
  userIdParam,
  listUsersValidators,
  patchAccountValidators,
  patchIdentityValidators,
  patchMembershipValidators,
  patchTrainingValidators,
  bulkActionsValidators,
} = require("../validators/superAdminUsersControlValidators");

const router = express.Router();

const guard = [requireAuth, requireSuperAdmin];
const writeGuard = [...guard, adminWriteLimiter];

router.get("/users/stats", ...guard, controller.getStats);
router.get("/users", ...guard, listUsersValidators, validateRequest, controller.listUsers);
router.get("/users/:userId", ...guard, userIdParam, validateRequest, controller.getUserDetail);
router.patch(
  "/users/:userId/account",
  ...writeGuard,
  patchAccountValidators,
  validateRequest,
  controller.patchAccount,
);
router.patch(
  "/users/:userId/identity",
  ...writeGuard,
  patchIdentityValidators,
  validateRequest,
  controller.patchIdentity,
);
router.patch(
  "/users/:userId/membership",
  ...writeGuard,
  patchMembershipValidators,
  validateRequest,
  controller.patchMembership,
);
router.patch(
  "/users/:userId/training",
  ...writeGuard,
  patchTrainingValidators,
  validateRequest,
  controller.patchTraining,
);
router.post(
  "/users/bulk-actions",
  ...writeGuard,
  bulkActionsValidators,
  validateRequest,
  controller.bulkActions,
);

module.exports = router;
