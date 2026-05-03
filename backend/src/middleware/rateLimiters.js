const rateLimit = require("express-rate-limit");

const RATE_LIMITED_CODE = "RATE_LIMITED";

/**
 * @param {string} messageAr Safe Arabic message for clients (no internals).
 */
function rateLimitJsonHandler(messageAr) {
  return function rateLimitHandler(req, res /* , next, options */) {
    res.status(429).json({
      success: false,
      message: messageAr,
      code: RATE_LIMITED_CODE,
    });
  };
}

/** POST /api/auth/login — 5 / 15 min / IP; successful logins do not consume quota. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitJsonHandler("تم تجاوز عدد محاولات تسجيل الدخول، حاول لاحقاً"),
});

/** OTP verify endpoints — 5 / 10 min / IP; successful verification does not consume quota. */
const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitJsonHandler("تم تجاوز عدد محاولات التحقق، حاول لاحقاً"),
});

/** Register / resend / forgot-password send paths — 3 / 10 min / IP. */
const otpSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJsonHandler("تم إرسال عدد كبير من الرموز، حاول لاحقاً"),
});

module.exports = {
  loginLimiter,
  otpVerifyLimiter,
  otpSendLimiter,
  RATE_LIMITED_CODE,
};
