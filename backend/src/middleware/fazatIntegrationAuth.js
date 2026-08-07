const { pool } = require("../config/db");
const { assertFazatEnabled, PARTNER_CODE } = require("../config/fazatIntegration");
const {
  buildSigningPayload,
  verifyHmacSha256Hex,
  timingSafeEqualString,
} = require("../utils/fazatCrypto");

function header(req, name) {
  const v = req.headers[name] || req.headers[name.toLowerCase()];
  return typeof v === "string" ? v.trim() : "";
}

function requestPathWithQuery(req) {
  // Prefer originalUrl under /api mount: /api/integrations/fazat/...
  const full = String(req.originalUrl || req.url || "");
  const qIndex = full.indexOf("?");
  const pathOnly = qIndex >= 0 ? full.slice(0, qIndex) : full;
  const query = qIndex >= 0 ? full.slice(qIndex) : "";
  return `${pathOnly}${query}`;
}

function rawBodyString(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString("utf8");
  if (typeof req.rawBody === "string") return req.rawBody;
  if (req.method === "GET" || req.method === "HEAD") return "";
  try {
    return JSON.stringify(req.body == null ? {} : req.body);
  } catch {
    return "";
  }
}

async function consumeNonce({ partnerCode, nonce, maxSkewSec }) {
  // Best-effort cleanup of old nonces (ignore failures).
  try {
    await pool.query(
      `DELETE FROM partner_request_nonces WHERE seen_at < NOW() - ($1::text || ' seconds')::interval`,
      [String(Math.max(maxSkewSec * 2, 600))],
    );
  } catch {
    /* table may not exist yet in unit tests */
  }

  try {
    await pool.query(
      `INSERT INTO partner_request_nonces (partner_code, nonce) VALUES ($1, $2)`,
      [partnerCode, nonce],
    );
    return true;
  } catch (err) {
    if (err && (err.code === "23505" || String(err.message || "").includes("duplicate"))) {
      return false;
    }
    // If nonce table missing, fail closed in production-like enabled mode.
    throw err;
  }
}

/**
 * Backend-to-backend auth for FAZAT:
 * - X-Orderz-Partner-Key (API key)
 * - X-Orderz-Timestamp (unix seconds)
 * - X-Orderz-Nonce
 * - X-Orderz-Signature (HMAC hex)
 * Optional: X-Idempotency-Key (copied onto req for handlers)
 */
async function requireFazatPartnerAuth(req, res, next) {
  try {
    const cfg = assertFazatEnabled();

    const apiKey = header(req, "x-orderz-partner-key");
    const timestamp = header(req, "x-orderz-timestamp");
    const nonce = header(req, "x-orderz-nonce");
    const signature = header(req, "x-orderz-signature");

    if (!apiKey || !timingSafeEqualString(apiKey, cfg.apiKey)) {
      return res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "Invalid partner key.",
      });
    }

    if (!timestamp || !nonce || !signature) {
      return res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "Missing signature headers.",
      });
    }

    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) {
      return res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "Invalid timestamp.",
      });
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - tsNum) > cfg.maxSkewSec) {
      return res.status(401).json({
        success: false,
        code: "TIMESTAMP_REJECTED",
        message: "Request timestamp outside allowed window.",
      });
    }

    if (nonce.length < 8 || nonce.length > 128) {
      return res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "Invalid nonce.",
      });
    }

    const pathWithQuery = requestPathWithQuery(req);
    const payload = buildSigningPayload({
      timestamp,
      nonce,
      method: req.method,
      pathWithQuery,
      rawBody: rawBodyString(req),
    });

    if (!verifyHmacSha256Hex(cfg.sharedSecret, payload, signature)) {
      return res.status(401).json({
        success: false,
        code: "INVALID_SIGNATURE",
        message: "Invalid signature.",
      });
    }

    const nonceOk = await consumeNonce({
      partnerCode: PARTNER_CODE,
      nonce,
      maxSkewSec: cfg.maxSkewSec,
    });
    if (!nonceOk) {
      return res.status(401).json({
        success: false,
        code: "REPLAY_REJECTED",
        message: "Nonce already used.",
      });
    }

    req.fazatPartner = {
      partnerCode: PARTNER_CODE,
      idempotencyKey: header(req, "x-idempotency-key") || null,
    };
    return next();
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        code: err.code || "FAZAT_ERROR",
        message: err.message,
      });
    }
    return next(err);
  }
}

module.exports = {
  requireFazatPartnerAuth,
  requestPathWithQuery,
  rawBodyString,
  consumeNonce,
};
