/**
 * Bildazo server-to-server author link/create client (Phase 1B).
 * Browser/frontend must never call this. Secret never logged or returned.
 * Legacy stub helpers still throw 501 if invoked (they are not the live path).
 */

const { createAppError } = require("../utils/AppError");
const { getBildazoAuthorSyncConfig } = require("../config/bildazoAuthorSync");

const NOT_IMPLEMENTED =
  "Bildazo live integration is not implemented. OrderzHouse must not create Bildazo users or call Bildazo APIs in Phase 0B.";

const LINK_OR_CREATE_PATH = "/api/integrations/orderzhouse/authors/link-or-create";
const CREATE_AND_LINK_PATH = "/api/integrations/orderzhouse/authors/create-and-link";
const LINK_WITH_CREDENTIALS_PATH = "/api/integrations/orderzhouse/authors/link-with-credentials";
const SECRET_HEADER = "X-OrderzHouse-Integration-Secret";

const BILDAZO_SYNC_LINKED_OK_STATUSES = Object.freeze(["created", "linked", "already_linked"]);
const BILDAZO_SYNC_KNOWN_STATUSES = Object.freeze([
  ...BILDAZO_SYNC_LINKED_OK_STATUSES,
  "needs_manual_review",
]);

function assertNoLiveBildazoCall() {
  throw createAppError(NOT_IMPLEMENTED, 501, {
    exposeToClient: false,
    publicCode: "BILDAZO_INTEGRATION_NOT_IMPLEMENTED",
  });
}

async function createWriterAccount() {
  assertNoLiveBildazoCall();
}

async function lookupExistingWriter() {
  assertNoLiveBildazoCall();
}

async function linkExistingWriter() {
  assertNoLiveBildazoCall();
}

function joinBildazoPath(baseUrl, pathname) {
  const b = String(baseUrl || "").trim().replace(/\/+$/, "");
  const p = String(pathname || "");
  if (!b) return "";
  if (b.endsWith("/api") && p.startsWith("/api/")) {
    return `${b}${p.slice(4)}`;
  }
  return `${b}${p}`;
}

function joinLinkOrCreateUrl(baseUrl) {
  return joinBildazoPath(baseUrl, LINK_OR_CREATE_PATH);
}

function abortSignalForTimeout(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function isAbortError(err) {
  if (!err) return false;
  const name = String(err.name || "");
  const code = String(err.code || "");
  return name === "AbortError" || name === "TimeoutError" || code === "ABORT_ERR";
}

function optionalText(raw, max) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function optionalIsoDate(raw) {
  if (raw == null || raw === "") return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Never copy unknown keys (password/passwordHash/role must never be sent). */
function buildSafeRequestBody(payload = {}) {
  const body = {
    orderzFreelancerId: String(payload.orderzFreelancerId || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    fullName: String(payload.fullName || "").trim(),
  };
  const phoneE164 = optionalText(payload.phoneE164, 20);
  const countryIso = optionalText(payload.countryIso, 2);
  const bio = optionalText(payload.bio, 2000);
  const acceptedTermsVersion = optionalText(payload.acceptedTermsVersion, 64);
  const acceptedAt = optionalIsoDate(payload.acceptedAt);
  if (phoneE164) body.phoneE164 = phoneE164;
  if (countryIso) body.countryIso = countryIso.toUpperCase();
  if (bio) body.bio = bio;
  if (acceptedTermsVersion) body.acceptedTermsVersion = acceptedTermsVersion;
  if (acceptedAt) body.acceptedAt = acceptedAt;
  return body;
}

function redactSecrets(text, secret) {
  let s = String(text || "");
  if (secret && s.includes(secret)) s = s.split(secret).join("[redacted]");
  s = s.replace(/X-OrderzHouse-[^\s,;]*/gi, "[redacted-header]");
  s = s.replace(/secret[s]?\s*[=:]\s*\S+/gi, "secret=[redacted]");
  s = s.replace(/password["']?\s*[:=]\s*["']?[^"'\s,}\\]+/gi, "password=[redacted]");
  return s.slice(0, 240);
}

function stripPasswordKeys(value) {
  if (!value || typeof value !== "object") return value;
  const out = { ...value };
  delete out.password;
  delete out.passwordConfirm;
  delete out.passwordHash;
  delete out.confirmPassword;
  return out;
}

function safeIdentity(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  return s || null;
}

function emptyResult(overrides = {}) {
  return {
    ok: false,
    disabled: false,
    called: false,
    status: null,
    bildazoUserId: null,
    bildazoPublicId: null,
    profileUrl: null,
    errorCode: null,
    safeMessage: null,
    httpStatus: null,
    ...overrides,
  };
}

function parseKnownStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return BILDAZO_SYNC_KNOWN_STATUSES.includes(s) ? s : null;
}

function buildCreateAndLinkRequestBody(payload = {}) {
  const body = buildSafeRequestBody(payload);
  const password = String(payload.password || "");
  if (password) body.password = password;
  const dateOfBirth = optionalText(payload.dateOfBirth, 10);
  if (dateOfBirth) body.dateOfBirth = dateOfBirth;
  return body;
}

function buildCredentialLinkRequestBody(payload = {}) {
  return {
    orderzFreelancerId: String(payload.orderzFreelancerId || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    password: String(payload.password || ""),
  };
}

function logSyncOutcome({ freelancerId, outcome, httpStatus, pathLabel = "s2s" }) {
  console.info(
    "[bildazo-s2s] %s freelancerId=%s outcome=%s http=%s",
    pathLabel,
    freelancerId == null ? "unknown" : String(freelancerId),
    outcome,
    httpStatus == null ? "n/a" : String(httpStatus),
  );
}

async function parseResponseJson(res) {
  const text = await res.text().catch(() => "");
  if (!text) return { json: null, raw: "" };
  try {
    return { json: JSON.parse(text), raw: text };
  } catch {
    return { json: null, raw: text.slice(0, 180) };
  }
}

async function postBildazoAuthorIntegration({
  path,
  pathLabel,
  payload,
  buildBody,
  deps = {},
}) {
  const getConfig = deps.getConfig || getBildazoAuthorSyncConfig;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const cfg = getConfig();
  const freelancerId = payload.orderzFreelancerId;

  if (!cfg.enabled) {
    return emptyResult({
      ok: true,
      disabled: true,
      called: false,
      errorCode: "BILDAZO_SYNC_DISABLED",
      safeMessage: "Bildazo author sync is disabled",
    });
  }

  if (!cfg.baseUrl || !cfg.secret) {
    logSyncOutcome({ freelancerId, outcome: "config_missing", httpStatus: null, pathLabel });
    return emptyResult({
      ok: false,
      called: false,
      errorCode: "BILDAZO_SYNC_CONFIG_MISSING",
      safeMessage: "Bildazo sync is not configured",
    });
  }

  if (typeof fetchImpl !== "function") {
    logSyncOutcome({ freelancerId, outcome: "fetch_unavailable", httpStatus: null, pathLabel });
    return emptyResult({
      ok: false,
      called: false,
      errorCode: "BILDAZO_SYNC_UNAVAILABLE",
      safeMessage: "Bildazo request failed",
    });
  }

  const url = joinBildazoPath(cfg.baseUrl, path);
  const body = buildBody(payload);
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        [SECRET_HEADER]: cfg.secret,
      },
      body: JSON.stringify(body),
      signal: abortSignalForTimeout(cfg.timeoutMs),
    });
  } catch (err) {
    if (isAbortError(err)) {
      logSyncOutcome({ freelancerId, outcome: "timeout", httpStatus: null, pathLabel });
      return emptyResult({
        ok: false,
        called: true,
        errorCode: "BILDAZO_SYNC_TIMEOUT",
        safeMessage: "Bildazo request timed out",
      });
    }
    logSyncOutcome({ freelancerId, outcome: "network", httpStatus: null, pathLabel });
    return emptyResult({
      ok: false,
      called: true,
      errorCode: "BILDAZO_SYNC_NETWORK",
      safeMessage: "Bildazo request failed",
    });
  } finally {
    stripPasswordKeys(payload);
  }

  const httpStatus = res.status;
  const { json, raw } = await parseResponseJson(res);
  if (httpStatus === 401) {
    logSyncOutcome({ freelancerId, outcome: "invalid_credentials", httpStatus, pathLabel });
    return emptyResult({
      ok: false,
      called: true,
      httpStatus,
      errorCode: "BILDAZO_SYNC_INVALID_CREDENTIALS",
      safeMessage: "Invalid email or password",
    });
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    logSyncOutcome({ freelancerId, outcome: "http_error", httpStatus, pathLabel });
    return emptyResult({
      ok: false,
      called: true,
      httpStatus,
      errorCode: httpStatus === 409 ? "BILDAZO_SYNC_EMAIL_IN_USE" : "BILDAZO_SYNC_HTTP_ERROR",
      safeMessage: redactSecrets(
        (json && (json.message || json.error)) || `Bildazo request failed (${httpStatus})`,
        cfg.secret,
      ),
    });
  }

  const status = parseKnownStatus(json && json.status);
  if (!status) {
    logSyncOutcome({ freelancerId, outcome: "unknown_status", httpStatus, pathLabel });
    return emptyResult({
      ok: false,
      called: true,
      httpStatus,
      errorCode: "BILDAZO_SYNC_UNKNOWN_STATUS",
      safeMessage: redactSecrets(raw || "Bildazo returned an unknown status", cfg.secret),
    });
  }

  const profileUrl = safeIdentity(json.profileUrl);
  const result = emptyResult({
    ok: BILDAZO_SYNC_LINKED_OK_STATUSES.includes(status),
    called: true,
    status,
    httpStatus,
    bildazoUserId: safeIdentity(json.bildazoUserId),
    bildazoPublicId: safeIdentity(json.bildazoPublicId),
    profileUrl,
    errorCode: status === "needs_manual_review" ? "BILDAZO_SYNC_NEEDS_REVIEW" : null,
    safeMessage: redactSecrets(json.message || null, cfg.secret),
  });
  logSyncOutcome({ freelancerId, outcome: status, httpStatus, pathLabel });
  return result;
}

async function linkOrCreateBildazoAuthor(payload = {}, deps = {}) {
  return postBildazoAuthorIntegration({
    path: LINK_OR_CREATE_PATH,
    pathLabel: "link-or-create",
    payload,
    buildBody: buildSafeRequestBody,
    deps,
  });
}

async function createAndLinkBildazoAuthor(payload = {}, deps = {}) {
  return postBildazoAuthorIntegration({
    path: CREATE_AND_LINK_PATH,
    pathLabel: "create-and-link",
    payload,
    buildBody: buildCreateAndLinkRequestBody,
    deps,
  });
}

async function linkExistingBildazoAuthorWithCredentials(payload = {}, deps = {}) {
  return postBildazoAuthorIntegration({
    path: LINK_WITH_CREDENTIALS_PATH,
    pathLabel: "link-with-credentials",
    payload,
    buildBody: buildCredentialLinkRequestBody,
    deps,
  });
}

module.exports = {
  createWriterAccount,
  lookupExistingWriter,
  linkExistingWriter,
  assertNoLiveBildazoCall,
  linkOrCreateBildazoAuthor,
  createAndLinkBildazoAuthor,
  linkExistingBildazoAuthorWithCredentials,
  joinLinkOrCreateUrl,
  joinBildazoPath,
  buildSafeRequestBody,
  buildCreateAndLinkRequestBody,
  buildCredentialLinkRequestBody,
  stripPasswordKeys,
  BILDAZO_SYNC_LINKED_OK_STATUSES,
  BILDAZO_SYNC_KNOWN_STATUSES,
};
