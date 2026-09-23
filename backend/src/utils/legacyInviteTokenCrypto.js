/**
 * Admin-only recoverable invite token wrapping (AES-256-GCM).
 * Plaintext is never stored in DB; only hash + optional ciphertext.
 *
 * Payload format: v1:<iv_b64url>:<tag_b64url>:<cipher_b64url>
 */

const crypto = require("node:crypto");

const ALGO = "aes-256-gcm";
const VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT = "orderzhouse-legacy-invite-token-v1";

function resolveSecret() {
  const dedicated = process.env.LEGACY_INVITE_TOKEN_KEY && String(process.env.LEGACY_INVITE_TOKEN_KEY).trim();
  if (dedicated && dedicated.length >= 16) return dedicated;
  const jwt = process.env.JWT_SECRET && String(process.env.JWT_SECRET).trim();
  if (jwt && jwt.length >= 16) return jwt;
  return null;
}

function deriveKey() {
  const secret = resolveSecret();
  if (!secret) {
    const err = new Error("LEGACY_INVITE_TOKEN_KEY or JWT_SECRET required for invite token wrap");
    err.code = "INVITE_TOKEN_CRYPTO_UNAVAILABLE";
    throw err;
  }
  return crypto.scryptSync(secret, SALT, KEY_BYTES);
}

/**
 * @param {string} plaintextToken
 * @returns {string} encrypted payload
 */
function encryptInviteToken(plaintextToken) {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintextToken), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(":");
}

/**
 * @param {string|null|undefined} payload
 * @returns {string|null}
 */
function decryptInviteToken(payload) {
  if (!payload || typeof payload !== "string") return null;
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const key = deriveKey();
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const data = Buffer.from(parts[3], "base64url");
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return out.toString("utf8");
  } catch {
    return null;
  }
}

function isInviteTokenCryptoAvailable() {
  return Boolean(resolveSecret());
}

module.exports = {
  encryptInviteToken,
  decryptInviteToken,
  isInviteTokenCryptoAvailable,
  ALGO,
  VERSION,
};
