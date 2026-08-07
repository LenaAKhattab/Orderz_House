/**
 * Safe structured logging for rate-limit 429 responses and exemptions.
 * Never logs Authorization, cookies, tokens, or passwords.
 */

function maskIp(raw) {
  const ip = String(raw || "").trim();
  if (!ip || ip === "unknown") return "unknown";
  if (ip.includes(":")) {
    // IPv6: keep first 4 hextets
    const parts = ip.split(":").filter(Boolean);
    if (parts.length <= 2) return `${parts[0] || "0"}::****`;
    return `${parts.slice(0, 3).join(":")}:****`;
  }
  const octets = ip.split(".");
  if (octets.length === 4) {
    return `${octets[0]}.${octets[1]}.${octets[2]}.***`;
  }
  return "masked";
}

function resolveClientIp(req) {
  return req?.ip || req?.socket?.remoteAddress || "unknown";
}

/**
 * @param {{
 *   limiterName: string,
 *   req: import("express").Request,
 *   retryAfterSec?: number,
 * }} args
 */
function logRateLimitExceeded({ limiterName, req, retryAfterSec }) {
  const userId = req?.auth?.userId != null ? String(req.auth.userId) : null;
  // eslint-disable-next-line no-console
  console.warn(
    JSON.stringify({
      event: "rate_limit_exceeded",
      limiterName: String(limiterName || "unknown"),
      method: String(req?.method || ""),
      path: String(req?.originalUrl || req?.url || req?.path || "").split("?")[0],
      maskedIp: maskIp(resolveClientIp(req)),
      userId,
      retryAfter: retryAfterSec != null ? Number(retryAfterSec) : null,
      timestamp: new Date().toISOString(),
    }),
  );
}

function logRateLimitExemptionUsed({ req, scope, exemptionId, mode }) {
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      event: "rate_limit_exemption_used",
      userId: req?.auth?.userId != null ? String(req.auth.userId) : null,
      scope: String(scope || ""),
      exemptionId: exemptionId != null ? String(exemptionId) : null,
      mode: mode != null ? String(mode) : null,
      method: String(req?.method || ""),
      path: String(req?.originalUrl || req?.url || req?.path || "").split("?")[0],
      timestamp: new Date().toISOString(),
    }),
  );
}

function logRateLimitExemptionAudit(payload = {}) {
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      event: String(payload.event || "rate_limit_exemption_audit"),
      exemptionId: payload.exemptionId != null ? String(payload.exemptionId) : null,
      userId: payload.userId != null ? String(payload.userId) : null,
      scope: payload.scope != null ? String(payload.scope) : null,
      mode: payload.mode != null ? String(payload.mode) : null,
      actorUserId: payload.actorUserId != null ? String(payload.actorUserId) : null,
      permanent: payload.permanent === true,
      timestamp: new Date().toISOString(),
    }),
  );
}

module.exports = {
  maskIp,
  resolveClientIp,
  logRateLimitExceeded,
  logRateLimitExemptionUsed,
  logRateLimitExemptionAudit,
};
