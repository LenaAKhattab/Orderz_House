/**
 * FAZ3AT (partner code FAZAT) workforce-provider integration config.
 * Secrets come from env only — never hard-code.
 */

const PARTNER_CODE = "FAZAT";

function truthy(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function parsePilotFreelancerIds(raw = process.env.FAZAT_PILOT_FREELANCER_IDS) {
  return String(raw || "")
    .split(",")
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function getFazatIntegrationConfig() {
  const enabled = truthy(process.env.FAZAT_INTEGRATION_ENABLED);
  const sharedSecret = String(process.env.FAZAT_INTEGRATION_SHARED_SECRET || "").trim();
  const apiKey = String(process.env.FAZAT_INTEGRATION_API_KEY || "").trim();
  const webhookUrl = String(process.env.FAZAT_WEBHOOK_URL || "").trim() || null;
  const publicApiUrl = String(process.env.ORDERZ_PUBLIC_API_URL || "").trim() || null;
  const actorUserIdRaw = process.env.FAZAT_INTEGRATION_ACTOR_USER_ID;
  const actorUserId =
    actorUserIdRaw != null && String(actorUserIdRaw).trim() !== "" ? Number(actorUserIdRaw) : null;
  const defaultCategoryIdRaw = process.env.FAZAT_DEFAULT_CATEGORY_ID;
  const defaultCategoryId =
    defaultCategoryIdRaw != null && String(defaultCategoryIdRaw).trim() !== ""
      ? Number(defaultCategoryIdRaw)
      : null;
  const maxSkewSec = Math.max(30, Number(process.env.FAZAT_REQUEST_MAX_SKEW_SEC) || 300);
  const pilotFreelancerIds = parsePilotFreelancerIds();
  const requirePilotAllowlist = enabled; // while integration is on, allowlist is mandatory

  return {
    partnerCode: PARTNER_CODE,
    partnerName: "FAZ3AT",
    enabled,
    sharedSecret,
    apiKey,
    webhookUrl,
    publicApiUrl,
    actorUserId: Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
    defaultCategoryId:
      Number.isInteger(defaultCategoryId) && defaultCategoryId > 0 ? defaultCategoryId : null,
    maxSkewSec,
    pilotFreelancerIds,
    requirePilotAllowlist,
    freelancerClientAliasAr: "طلب مُدار من Orderz",
    freelancerClientAliasEn: "Orderz House managed order",
  };
}

function assertFazatEnabled() {
  const cfg = getFazatIntegrationConfig();
  if (!cfg.enabled) {
    const err = new Error("FAZAT integration is disabled.");
    err.statusCode = 503;
    err.code = "FAZAT_DISABLED";
    throw err;
  }
  if (!cfg.sharedSecret || cfg.sharedSecret.length < 16) {
    const err = new Error("FAZAT integration shared secret is not configured.");
    err.statusCode = 503;
    err.code = "FAZAT_MISCONFIGURED";
    throw err;
  }
  if (!cfg.apiKey || cfg.apiKey.length < 8) {
    const err = new Error("FAZAT integration API key is not configured.");
    err.statusCode = 503;
    err.code = "FAZAT_MISCONFIGURED";
    throw err;
  }
  if (cfg.requirePilotAllowlist && cfg.pilotFreelancerIds.length === 0) {
    const err = new Error(
      "FAZAT pilot allowlist is empty. Set FAZAT_PILOT_FREELANCER_IDS to selected freelancer ids.",
    );
    err.statusCode = 503;
    err.code = "FAZAT_PILOT_ALLOWLIST_EMPTY";
    throw err;
  }
  if (cfg.webhookUrl && /localhost|127\.0\.0\.1/i.test(cfg.webhookUrl)) {
    // eslint-disable-next-line no-console
    console.warn(
      "[fazat] FAZAT_WEBHOOK_URL looks local; live Orderz cannot reach it. Use a public tunnel URL.",
    );
  }
  return cfg;
}

function assertPilotAllowlisted(freelancerId) {
  const cfg = getFazatIntegrationConfig();
  const fid = Number(freelancerId);
  if (!cfg.requirePilotAllowlist) return true;
  if (!cfg.pilotFreelancerIds.length) {
    const err = new Error(
      "FAZAT pilot allowlist is empty. Set FAZAT_PILOT_FREELANCER_IDS before creating partner orders.",
    );
    err.statusCode = 503;
    err.code = "FAZAT_PILOT_ALLOWLIST_EMPTY";
    throw err;
  }
  if (!cfg.pilotFreelancerIds.includes(fid)) {
    const err = new Error(
      "Freelancer is not on the FAZAT pilot allowlist (FAZAT_PILOT_FREELANCER_IDS).",
    );
    err.statusCode = 403;
    err.code = "FAZAT_PILOT_NOT_ALLOWLISTED";
    throw err;
  }
  return true;
}

function isPilotAllowlisted(freelancerId) {
  const cfg = getFazatIntegrationConfig();
  const fid = Number(freelancerId);
  if (!cfg.requirePilotAllowlist) return true;
  if (!cfg.pilotFreelancerIds.length) return false;
  return cfg.pilotFreelancerIds.includes(fid);
}

module.exports = {
  PARTNER_CODE,
  getFazatIntegrationConfig,
  assertFazatEnabled,
  assertPilotAllowlisted,
  isPilotAllowlisted,
  parsePilotFreelancerIds,
};
