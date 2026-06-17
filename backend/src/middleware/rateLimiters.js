const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const { isProduction } = require("../config/env");

const RATE_LIMITED_CODE = "RATE_LIMITED";

const REGISTER_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_LIMIT_MAX = 8;

/**
 * @param {string} messageAr Safe Arabic message for clients (no internals).
 */
function rateLimitJsonHandler(messageAr) {
  return function rateLimitHandler(req, res, _next, options) {
    setRetryAfterHeader(res, options);
    res.status(429).json({
      success: false,
      message: messageAr,
      code: RATE_LIMITED_CODE,
    });
  };
}

function setRetryAfterHeader(res, options) {
  const resetTime = options?.resetTime;
  const windowMs = options?.windowMs || REGISTER_LIMIT_WINDOW_MS;
  const retryAfterSec = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : Math.ceil(windowMs / 1000);
  res.set("Retry-After", String(retryAfterSec));
}

/** POST /api/auth/register — dedicated limiter (not shared with login / forgot-password). */
function registerRateLimitKey(req) {
  const rawIp = req.ip || req.socket?.remoteAddress || "unknown";
  const ipKey = ipKeyGenerator(rawIp, 56);
  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  return email ? `register:${ipKey}:${email}` : `register:${ipKey}`;
}

function registerRateLimitHandler(req, res, _next, options) {
  setRetryAfterHeader(res, options);
  res.status(429).json({
    success: false,
    message: "Too many registration attempts. Please try again later.",
    code: RATE_LIMITED_CODE,
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

/** Resend-register-otp / forgot-password send paths — 5 / 10 min / IP. */
const otpSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJsonHandler("تم إرسال عدد كبير من الرموز، حاول لاحقاً"),
});

/**
 * POST /reset-password — token brute-force / abuse protection.
 * Key = IP (via ipKeyGenerator for IPv6-safe subnetting) + normalized email when body.email is present; otherwise IP only.
 */
function resetPasswordRateLimitKey(req) {
  const rawIp = req.ip || req.socket?.remoteAddress || "unknown";
  const ipKey = ipKeyGenerator(rawIp, 56);
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
  handler: rateLimitJsonHandler("تم تجاوز عدد محاولات إعادة تعيين كلمة المرور، حاول لاحقاً"),
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
