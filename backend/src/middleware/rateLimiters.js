const rateLimit = require("express-rate-limit");
const { isProduction } = require("../config/env");
const {
  RATE_LIMITED_CODE,
  clientIpKey,
  setRetryAfterHeader,
  rateLimitJsonHandler,
} = require("./rateLimitHelpers");

const REGISTER_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_LIMIT_MAX = 8;

/** POST /api/auth/register — dedicated limiter (not shared with login / forgot-password). */
function registerRateLimitKey(req) {
  const ipKey = clientIpKey(req);
  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  return email ? `register:${ipKey}:${email}` : `register:${ipKey}`;
}

function registerRateLimitHandler(req, res, _next, options) {
  const retryAfterSec = setRetryAfterHeader(res, options, REGISTER_LIMIT_WINDOW_MS);
  try {
    const { logRateLimitExceeded } = require("../utils/rateLimitLog");
    logRateLimitExceeded({ limiterName: "auth_register", req, retryAfterSec });
  } catch {
    /* ignore */
  }
  res.status(429).json({
    success: false,
    message: "Too many registration attempts. Please try again later.",
    code: RATE_LIMITED_CODE,
    limiter: "auth_register",
  });
}

/** POST /api/auth/register — 8 / 15 min / (IP + email when present). */
const registerLimiter = rateLimit({
  windowMs: REGISTER_LIMIT_WINDOW_MS,
  max: REGISTER_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: registerRateLimitKey,
  handler: registerRateLimitHandler,
});

/** POST /api/auth/login — 5 / 15 min / IP; successful logins do not consume quota. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitJsonHandler("auth_login", "تم تجاوز عدد محاولات تسجيل الدخول، حاول لاحقاً"),
});

/** OTP verify endpoints — 5 / 10 min / IP; successful verification does not consume quota. */
const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitJsonHandler("auth_otp_verify", "تم تجاوز عدد محاولات التحقق، حاول لاحقاً", {
    windowMsFallback: 10 * 60 * 1000,
  }),
});

/** Resend-register-otp / forgot-password send paths — 5 / 10 min / IP. */
const otpSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJsonHandler("auth_otp_send", "تم إرسال عدد كبير من الرموز، حاول لاحقاً", {
    windowMsFallback: 10 * 60 * 1000,
  }),
});

/**
 * POST /reset-password — token brute-force / abuse protection.
 * Key = IP + normalized email when body.email is present; otherwise IP only.
 */
function resetPasswordRateLimitKey(req) {
  const ipKey = clientIpKey(req);
  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  return email ? `reset_pw:${ipKey}:${email}` : `reset_pw:${ipKey}`;
}

/** Reset password — 5 / 10 min / (IP+email); successful resets do not consume quota. */
const resetPasswordLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: resetPasswordRateLimitKey,
  handler: rateLimitJsonHandler(
    "auth_reset_password",
    "تم تجاوز عدد محاولات إعادة تعيين كلمة المرور، حاول لاحقاً",
    { windowMsFallback: 10 * 60 * 1000 },
  ),
});

/** Dev/staging: log client IP resolution for auth register (confirm trust proxy). */
function registerRateLimitDebugMiddleware(req, _res, next) {
  if (isProduction()) return next();
  if (req.method !== "POST" || !String(req.path || "").endsWith("/register")) return next();
  // eslint-disable-next-line no-console
  console.debug("[rate-limit:register]", {
    ip: req.ip,
    xForwardedFor: req.headers["x-forwarded-for"] || null,
  });
  next();
}

module.exports = {
  registerLimiter,
  registerRateLimitKey,
  loginLimiter,
  otpVerifyLimiter,
  otpSendLimiter,
  resetPasswordLimiter,
  resetPasswordRateLimitKey,
  registerRateLimitDebugMiddleware,
  rateLimitJsonHandler,
  RATE_LIMITED_CODE,
  REGISTER_LIMIT_WINDOW_MS,
  REGISTER_LIMIT_MAX,
};
