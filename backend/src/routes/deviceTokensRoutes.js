const express = require("express");
const { requireAuth } = require("../middleware/rbacMiddleware");
const { notificationsReadLimiter } = require("../middleware/orderWriteRateLimiters");
const deviceTokensController = require("../controllers/deviceTokensController");

const router = express.Router();

router.use(requireAuth);

router.post(
  "/devices/push-token",
  notificationsReadLimiter,
  deviceTokensController.upsertPushToken,
);

router.delete(
  "/devices/push-token",
  notificationsReadLimiter,
  deviceTokensController.deactivatePushToken,
);

router.post(
  "/devices/push-token/deactivate-all",
  notificationsReadLimiter,
  deviceTokensController.deactivateAllPushTokens,
);

module.exports = router;
