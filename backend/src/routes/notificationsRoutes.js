const express = require("express");
const { requireAuth } = require("../middleware/rbacMiddleware");
const notificationsController = require("../controllers/notificationsController");

const router = express.Router();

router.use(requireAuth);

router.get("/notifications", notificationsController.listMyNotifications);
router.get("/notifications/unread-count", notificationsController.getMyUnreadCount);
router.post("/notifications/:id/read", notificationsController.readNotification);
router.post("/notifications/read-all", notificationsController.readAllNotifications);

module.exports = router;
