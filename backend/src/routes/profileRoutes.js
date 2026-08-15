const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("../middleware/rbacMiddleware");
const profileController = require("../controllers/profileController");
const { uploadProfileAvatar } = require("../middleware/profileAvatarUploadMiddleware");
const { rateLimitJsonHandler, userOrIpKey } = require("../middleware/rateLimitHelpers");

const router = express.Router();

/** Password change + account deactivate — 5 / 15 min per authenticated user. */
const profileSensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => userOrIpKey("profile_sensitive", req),
  handler: rateLimitJsonHandler(
    "profile_sensitive",
    "تم تجاوز عدد المحاولات الحساسة للحساب، حاول لاحقاً",
  ),
});

router.use(requireAuth);

router.get("/me", profileController.getProfileMe);
router.patch("/me", profileController.patchProfile);
router.patch("/notification-preferences", profileController.patchNotificationPreferences);
router.patch("/browser-notifications", profileController.patchBrowserNotifications);
router.post("/browser-notifications/test", profileController.postBrowserNotificationTest);
router.patch("/password", profileSensitiveLimiter, profileController.patchPassword);
router.patch("/avatar", uploadProfileAvatar.single("avatar"), profileController.patchAvatar);
router.delete("/avatar", profileController.deleteAvatar);
router.post("/deactivate", profileSensitiveLimiter, profileController.deactivateAccount);
router.get("/role-conversion", profileController.getRoleConversionEligibility);
router.post("/role-conversion", profileSensitiveLimiter, profileController.convertAccountRole);

module.exports = router;
