const jwt = require("jsonwebtoken");

/** HttpOnly cookie name — must match auth middleware reader. */
const AUTH_COOKIE_NAME = "orderz_access_token";

function isSecureCookie() {
  if (process.env.COOKIE_SECURE === "0" || process.env.COOKIE_SECURE === "false") return false;
  if (process.env.COOKIE_SECURE === "1" || process.env.COOKIE_SECURE === "true") return true;
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function maxAgeMsFromJwt(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded.exp !== "number") {
      return 7 * 24 * 60 * 60 * 1000;
    }
    const ms = decoded.exp * 1000 - Date.now();
    return Math.max(0, Math.min(ms, 30 * 24 * 60 * 60 * 1000));
  } catch {
    return 7 * 24 * 60 * 60 * 1000;
  }
}

function getAuthCookieBaseOptions() {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
  };
}

function setAuthCookie(res, token) {
  const maxAge = maxAgeMsFromJwt(token);
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...getAuthCookieBaseOptions(),
    maxAge,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    ...getAuthCookieBaseOptions(),
    maxAge: 0,
  });
}

module.exports = {
  AUTH_COOKIE_NAME,
  setAuthCookie,
  clearAuthCookie,
  getAuthCookieBaseOptions,
  maxAgeMsFromJwt,
};
