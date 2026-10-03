const express = require("express");
const { body, param, query } = require("express-validator");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");
const controller = require("../controllers/superAdminAccountRestrictionsController");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];
const writeGuard = [...guard, adminWriteLimiter];

router.get(
  "/account-restrictions",
  ...guard,
  query("status").optional().isString(),
  query("q").optional().isString(),
  query("limit").optional().isInt({ min: 1, max: 100 }),
  query("offset").optional().isInt({ min: 0 }),
  validateRequest,
  controller.list,
);

router.get(
  "/account-restrictions/held-bids",
  ...guard,
  query("userId").optional().isInt({ min: 1 }),
  validateRequest,
  controller.listHeldBids,
);

router.get(
  "/account-restrictions/:id",
  ...guard,
  param("id").isInt({ min: 1 }),
  validateRequest,
  controller.getOne,
);

router.get(
  "/users/:userId/account-restrictions",
  ...guard,
  param("userId").isInt({ min: 1 }),
  validateRequest,
  controller.userSummary,
);

router.post(
  "/account-restrictions",
  ...writeGuard,
  body("userId").isInt({ min: 1 }),
  body("restrictionType").isString().isLength({ min: 3, max: 64 }),
  body("scopes").optional().isArray(),
  body("internalReason").isString().isLength({ min: 3, max: 4000 }),
  body("internalNote").optional({ nullable: true }).isString().isLength({ max: 4000 }),
  body("startsAt").optional({ nullable: true }).isISO8601(),
  body("expiresAt").optional({ nullable: true }).isISO8601(),
  validateRequest,
  controller.create,
);

router.patch(
  "/account-restrictions/:id",
  ...writeGuard,
  param("id").isInt({ min: 1 }),
  body("scopes").optional().isArray(),
  body("internalReason").optional().isString().isLength({ min: 3, max: 4000 }),
  body("internalNote").optional({ nullable: true }).isString().isLength({ max: 4000 }),
  body("expiresAt").optional({ nullable: true }).isISO8601(),
  validateRequest,
  controller.update,
);

router.post(
  "/account-restrictions/:id/extend",
  ...writeGuard,
  param("id").isInt({ min: 1 }),
  body("expiresAt").isISO8601(),
  body("reason").optional({ nullable: true }).isString().isLength({ max: 2000 }),
  validateRequest,
  controller.extend,
);

router.post(
  "/account-restrictions/:id/revoke",
  ...writeGuard,
  param("id").isInt({ min: 1 }),
  body("revokeReason").optional({ nullable: true }).isString().isLength({ max: 2000 }),
  validateRequest,
  controller.revoke,
);

router.post(
  "/account-restrictions/held-bids/:bidId/release",
  ...writeGuard,
  param("bidId").isInt({ min: 1 }),
  body("reason").optional({ nullable: true }).isString().isLength({ max: 2000 }),
  validateRequest,
  controller.releaseBid,
);

router.post(
  "/account-restrictions/held-bids/:bidId/reject",
  ...writeGuard,
  param("bidId").isInt({ min: 1 }),
  body("reason").optional({ nullable: true }).isString().isLength({ max: 2000 }),
  validateRequest,
  controller.rejectBid,
);

module.exports = router;
