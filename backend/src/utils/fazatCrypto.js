const crypto = require("node:crypto");

function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input), "utf8").digest("hex");
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Canonical signing string:
 * `${timestamp}.${nonce}.${method}.${pathWithQuery}.${bodySha256}`
 */
function buildSigningPayload({ timestamp, nonce, method, pathWithQuery, rawBody }) {
  const bodyHash = sha256Hex(rawBody == null ? "" : String(rawBody));
  return [
    String(timestamp || "").trim(),
    String(nonce || "").trim(),
    String(method || "GET").toUpperCase(),
    String(pathWithQuery || ""),
    bodyHash,
  ].join(".");
}

function signHmacSha256Hex(secret, payload) {
  return crypto.createHmac("sha256", String(secret)).update(String(payload), "utf8").digest("hex");
}

function verifyHmacSha256Hex(secret, payload, signatureHex) {
  const expected = signHmacSha256Hex(secret, payload);
  return timingSafeEqualString(expected, String(signatureHex || "").trim().toLowerCase());
}

function newEventId(prefix = "evt") {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

module.exports = {
  sha256Hex,
  timingSafeEqualString,
  buildSigningPayload,
  signHmacSha256Hex,
  verifyHmacSha256Hex,
  newEventId,
};
