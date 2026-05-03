const express = require("express");
const authController = require("../controllers/authController");
const { requireAuth } = require("../middleware/rbacMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const validateRequest = require("../middleware/validateRequest");
const {
  registerValidators,
  loginValidators,
  verifyRegisterOtpValidators,
  resendRegisterOtpValidators,
  forgotPasswordValidators,
  verifyForgotPasswordOtpValidators,
  resetPasswordValidators,
} = require("../validators/authValidators");
const { ROLES } = require("../constants/roles");
const { loginLimiter, otpVerifyLimiter, otpSendLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

router.post("/register", otpSendLimiter, registerValidators, validateRequest, authController.register);
router.post(
  "/verify-register-otp",
  otpVerifyLimiter,
  verifyRegisterOtpValidators,
  validateRequest,
  authController.verifyRegisterOtp,
);
router.post("/resend-register-otp", otpSendLimiter, resendRegisterOtpValidators, validateRequest, authController.resendRegisterOtp);
router.post("/forgot-password", otpSendLimiter, forgotPasswordValidators, validateRequest, authController.forgotPassword);
router.post(
  "/verify-forgot-password-otp",
  otpVerifyLimiter,
  verifyForgotPasswordOtpValidators,
  validateRequest,
  authController.verifyForgotPasswordOtp,
);
router.post("/reset-password", resetPasswordValidators, validateRequest, authController.resetPassword);
router.post("/login", loginLimiter, loginValidators, validateRequest, authController.login);
router.post("/logout", authController.logout);
router.get("/me", requireAuth, authController.me);

/** Enforce role boundaries on the server (JWT + explicit role lists). */
router.get("/scope/super-admin", requireAuth, authorizeRoles(ROLES.SUPER_ADMIN), authController.respondScope("super_admin"));
router.get(
  "/scope/admin",
  requireAuth,
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  authController.respondScope("admin"),
);
router.get(
  "/scope/freelancer",
  requireAuth,
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.FREELANCER),
  authController.respondScope("freelancer"),
);
router.get(
  "/scope/client",
  requireAuth,
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CLIENT),
  authController.respondScope("client"),
);

module.exports = router;
