/**
 * Bildazo S2S accepted-article publish client (Phase 2B).
 * Browser/frontend must never call this. Secret never logged or returned.
 */

const { getBildazoArticlePublishConfig } = require("../config/bildazoArticlePublish");
const { BILDAZO_ARTICLE_PUBLISH_ERROR_CODES } = require("../constants/bildazoArticlePublish");

const PUBLISH_PATH = "/api/integrations/orderzhouse/articles/publish";
const SECRET_HEADER = "X-OrderzHouse-Integration-Secret";
const KNOWN_REMOTE_STATUSES = Object.freeze([
  "approved",
  "already_imported",
  "needs_manual_review",
]);

function joinPublishUrl(baseUrl) {
  const b = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!b) return "";
  if (b.endsWith("/api") && PUBLISH_PATH.startsWith("/api/")) {
    return `${b}${PUBLISH_PATH.slice(4)}`;
  }
  return `${b}${PUBLISH_PATH}`;
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

/** Never copy unknown keys (password/role/admin must never be sent). */
function buildSafePublishBody(payload = {}) {
  const body = {
    orderzArticleId: String(payload.orderzArticleId || "").trim(),
    orderzFreelancerId: String(payload.orderzFreelancerId || "").trim(),
    bildazoUserId: String(payload.bildazoUserId || "").trim(),
    title: String(payload.title || "").trim().slice(0, 120),
    content: String(payload.content || "").trim().slice(0, 200000),
    categoryId: String(payload.categoryId || "").trim(),
    source: "orderzhouse",
  };
  const bildazoPublicId = optionalText(payload.bildazoPublicId, 120);
  const acceptedAt = optionalIsoDate(payload.acceptedAt);
  const reviewerNotes = optionalText(payload.reviewerNotes, 2000);
  if (bildazoPublicId) body.bildazoPublicId = bildazoPublicId;
  if (acceptedAt) body.acceptedAt = acceptedAt;
  if (reviewerNotes) body.reviewerNotes = reviewerNotes;
  return body;
}

function redactSecrets(text, secret) {
  let s = String(text || "");
  if (secret && s.includes(secret)) s = s.split(secret).join("[redacted]");
  s = s.replace(/X-OrderzHouse-[^\s,;]*/gi, "[redacted-header]");
  s = s.replace(/secret[s]?\s*[=:]\s*\S+/gi, "secret=[redacted]");
  return s.slice(0, 240);
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
    bildazoArticleId: null,
    articleUrl: null,
    articleStatus: null,
    errorCode: null,
    safeMessage: null,
    httpStatus: null,
    ...overrides,
  };
}

function parseKnownStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return KNOWN_REMOTE_STATUSES.includes(s) ? s : null;
}

function logPublishOutcome({ applicationId, outcome, httpStatus }) {
  console.info(
    "[bildazo-s2s] article-publish applicationId=%s outcome=%s http=%s",
    applicationId == null ? "unknown" : String(applicationId),
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

async function publishAcceptedArticleToBildazo(payload = {}, deps = {}) {
  const getConfig = deps.getConfig || getBildazoArticlePublishConfig;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const cfg = getConfig();
  const applicationId = payload.orderzArticleId;

  if (!cfg.enabled) {
    return emptyResult({
      ok: true,
      disabled: true,
      called: false,
      errorCode: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.BILDAZO_ARTICLE_PUBLISH_DISABLED,
      safeMessage: "Bildazo article publish is disabled",
    });
  }

  if (!cfg.baseUrl || !cfg.secret) {
    logPublishOutcome({ applicationId, outcome: "config_missing", httpStatus: null });
    return emptyResult({
      ok: false,
      called: false,
      errorCode: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.BILDAZO_ARTICLE_PUBLISH_CONFIG_MISSING,
      safeMessage: "Bildazo article publish is not configured",
    });
  }

  if (typeof fetchImpl !== "function") {
    logPublishOutcome({ applicationId, outcome: "fetch_unavailable", httpStatus: null });
    return emptyResult({
      ok: false,
      called: false,
      errorCode: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.BILDAZO_ARTICLE_PUBLISH_NETWORK,
      safeMessage: "Bildazo request failed",
    });
  }

  const url = joinPublishUrl(cfg.baseUrl);
  const body = buildSafePublishBody(payload);
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
      logPublishOutcome({ applicationId, outcome: "timeout", httpStatus: null });
      return emptyResult({
        ok: false,
        called: true,
        errorCode: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.BILDAZO_ARTICLE_PUBLISH_TIMEOUT,
        safeMessage: "Bildazo request timed out",
      });
    }
    logPublishOutcome({ applicationId, outcome: "network", httpStatus: null });
    return emptyResult({
      ok: false,
      called: true,
      errorCode: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.BILDAZO_ARTICLE_PUBLISH_NETWORK,
      safeMessage: "Bildazo request failed",
    });
  }

  const httpStatus = res.status;
  const { json, raw } = await parseResponseJson(res);
  if (httpStatus < 200 || httpStatus >= 300) {
    logPublishOutcome({ applicationId, outcome: "http_error", httpStatus });
    return emptyResult({
      ok: false,
      called: true,
      httpStatus,
      errorCode: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.BILDAZO_ARTICLE_PUBLISH_HTTP_ERROR,
      safeMessage: redactSecrets(
        (json && (json.message || json.error || json.code)) || `Bildazo request failed (${httpStatus})`,
        cfg.secret,
      ),
    });
  }

  const status = parseKnownStatus(json && json.status);
  if (!status) {
    logPublishOutcome({ applicationId, outcome: "unknown_status", httpStatus });
    return emptyResult({
      ok: false,
      called: true,
      httpStatus,
      errorCode: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.BILDAZO_ARTICLE_PUBLISH_UNKNOWN_STATUS,
      safeMessage: redactSecrets(raw || "Bildazo returned an unknown status", cfg.secret),
    });
  }

  const result = emptyResult({
    ok: status === "approved" || status === "already_imported",
    called: true,
    status,
    httpStatus,
    bildazoArticleId: safeIdentity(json.bildazoArticleId),
    articleUrl: safeIdentity(json.articleUrl),
    articleStatus: safeIdentity(json.articleStatus),
    errorCode: status === "needs_manual_review" ? json.code || "BILDAZO_NEEDS_MANUAL_REVIEW" : null,
    safeMessage: redactSecrets(json.message || json.code || null, cfg.secret),
  });
  logPublishOutcome({ applicationId, outcome: status, httpStatus });
  return result;
}

module.exports = {
  publishAcceptedArticleToBildazo,
  buildSafePublishBody,
  joinPublishUrl,
  KNOWN_REMOTE_STATUSES,
};
