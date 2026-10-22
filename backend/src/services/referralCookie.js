const crypto = require("crypto");
const { ATTRIBUTION_WINDOW_MS } = require("../domain/referralPolicy");

const COOKIE_NAME = "oh_ref";

function signingSecret() {
  return process.env.JWT_SECRET || process.env.REFERRAL_COOKIE_SECRET || "";
}

function signPayload(payload) {
  const secret = signingSecret();
  if (!secret) throw new Error("referral_cookie_secret_missing");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function readCookieToken(token) {
  const secret = signingSecret();
  if (!secret || !token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!parsed?.code || !parsed?.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildAttributionCookie(code, visitId, now = Date.now()) {
  const expiresAt = new Date(now + ATTRIBUTION_WINDOW_MS).toISOString();
  return {
    name: COOKIE_NAME,
    value: signPayload({ code, visitId, expiresAt }),
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: String(process.env.NODE_ENV || "").toLowerCase() === "production",
      maxAge: ATTRIBUTION_WINDOW_MS,
      path: "/",
    },
  };
}

module.exports = {
  COOKIE_NAME,
  signPayload,
  readCookieToken,
  buildAttributionCookie,
};
