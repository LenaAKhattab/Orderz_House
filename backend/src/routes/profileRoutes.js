const express = require("express");
const { requireAuth } = require("../middleware/rbacMiddleware");
const profileController = require("../controllers/profileController");
const { uploadProfileAvatar } = require("../middleware/profileAvatarUploadMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/me", profileController.getProfileMe);
router.patch("/me", profileController.patchProfile);
router.patch("/notification-preferences", profileController.patchNotificationPreferences);
router.patch("/browser-notifications", profileController.patchBrowserNotifications);
router.post("/browser-notifications/test", profileController.postBrowserNotificationTest);
router.patch("/password", profileController.patchPassword);
router.patch("/avatar", uploadProfileAvatar.single("avatar"), profileController.patchAvatar);
router.delete("/avatar", profileController.deleteAvatar);

module.exports = router;
