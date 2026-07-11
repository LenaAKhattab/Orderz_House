const express = require("express");
const { requireAuth } = require("../middleware/rbacMiddleware");
const { requireNotificationStreamAuth } = require("../middleware/notificationStreamAuth");
const notificationsController = require("../controllers/notificationsController");

const router = express.Router();

router.get("/notifications/stream", requireNotificationStreamAuth, notificationsController.streamNotifications);

router.get("/notifications", requireAuth, notificationsController.listMyNotifications);
router.get("/notifications/unread-count", requireAuth, notificationsController.getMyUnreadCount);
router.post("/notifications/:id/read", requireAuth, notificationsController.readNotification);
router.post("/notifications/read-all", requireAuth, notificationsController.readAllNotifications);

module.exports = router;
