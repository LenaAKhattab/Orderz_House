const express = require("express");
const { requireAuth } = require("../middleware/rbacMiddleware");
const { requireNotificationStreamAuth } = require("../middleware/notificationStreamAuth");
const notificationsController = require("../controllers/notificationsController");
const { notificationsReadLimiter } = require("../middleware/orderWriteRateLimiters");

const router = express.Router();

router.get("/notifications/stream", requireNotificationStreamAuth, notificationsController.streamNotifications);

router.use(requireAuth);

router.get("/notifications", notificationsController.listMyNotifications);
router.get(
  "/notifications/unread-count",
  notificationsReadLimiter,
  notificationsController.getMyUnreadCount,
);
router.post("/notifications/:id/read", notificationsController.readNotification);
router.post("/notifications/read-all", notificationsController.readAllNotifications);
router.delete("/notifications/:id", notificationsController.deleteNotification);
router.post("/notifications/bulk-delete", notificationsController.deleteNotificationsBulk);

module.exports = router;
