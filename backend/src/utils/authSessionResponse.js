const jwt = require("jsonwebtoken");
const { isMobileClient } = require("./clientType");
const { setAuthCookie } = require("./authCookie");

/**
 * Seconds until JWT exp (from decoded token). Returns null if exp is missing.
 */
function getTokenExpiresInSeconds(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded.exp !== "number") return null;
    const seconds = decoded.exp - Math.floor(Date.now() / 1000);
    return Math.max(0, seconds);
  } catch {
    return null;
  }
}

function buildWebAuthSessionResponse({ message, user }) {
  return {
    success: true,
    message,
    data: { user },
  };
}

function buildMobileAuthSessionResponse({ message, user, token }) {
  const data = {
    user,
    accessToken: token,
    tokenType: "Bearer",
  };
  const expiresIn = getTokenExpiresInSeconds(token);
  if (expiresIn != null) {
    data.expiresIn = expiresIn;
  }
  return {
    success: true,
    message,
    data,
  };
}

/**
 * Web: HttpOnly cookie + { user } only (no token in body).
 * Mobile: Bearer accessToken in body, no cookie.
 */
function sendAuthSuccess(res, { req, user, token, message, statusCode = 200 }) {
  if (isMobileClient(req)) {
    const payload = buildMobileAuthSessionResponse({ message, user, token });
    return res.status(statusCode).json(payload);
  }
  setAuthCookie(res, token);
  const payload = buildWebAuthSessionResponse({ message, user });
  return res.status(statusCode).json(payload);
}

module.exports = {
  getTokenExpiresInSeconds,
  buildWebAuthSessionResponse,
  buildMobileAuthSessionResponse,
  sendAuthSuccess,
};
