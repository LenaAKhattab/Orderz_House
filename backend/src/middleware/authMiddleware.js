const jwt = require("jsonwebtoken");
const { AUTH_COOKIE_NAME } = require("../utils/authCookie");

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    return null;
  }
  return secret;
};

const getTokenFromHeader = (authHeader = "") => {
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
};

/** Prefer HttpOnly cookie, then Authorization (legacy / API clients). */
const getTokenFromRequest = (req) => {
  const fromCookie = req.cookies?.[AUTH_COOKIE_NAME];
  if (fromCookie && typeof fromCookie === "string" && fromCookie.trim()) {
    return fromCookie.trim();
  }
  return getTokenFromHeader(req.headers.authorization);
};

const optionalAuthenticate = (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return next();
  }

  const secret = getJwtSecret();
  if (!secret) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[optionalAuth] JWT_SECRET not configured; continuing as guest");
    }
    return next();
  }

  try {
    req.user = jwt.verify(token, secret);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const name = error && typeof error.name === "string" ? error.name : "Error";
      // eslint-disable-next-line no-console
      console.warn("[optionalAuth] ignoring invalid/expired token for optional route:", name);
    }
  }

  return next();
};

const authenticate = (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "يجب إرسال رمز دخول صالح.",
      code: "UNAUTHORIZED",
    });
  }

  const secret = getJwtSecret();
  if (!secret) {
    return res.status(500).json({
      success: false,
      message: "حدث خطأ غير متوقع، حاول لاحقاً",
      code: "INTERNAL_ERROR",
    });
  }

  try {
    req.user = jwt.verify(token, secret);
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "رمز الدخول غير صالح أو منتهٍ.",
      code: "INVALID_TOKEN",
    });
  }
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  getTokenFromRequest,
};
