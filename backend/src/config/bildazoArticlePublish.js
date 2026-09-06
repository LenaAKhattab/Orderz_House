/**
 * Server-to-server Bildazo accepted-article publish (Phase 2B).
 * Separate from BILDAZO_AUTHOR_GATE_ENABLED and BILDAZO_AUTHOR_SYNC_ENABLED.
 * Default OFF: no HTTP call. Secrets stay in backend env only.
 */

function truthy(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function parseTimeoutMs(raw = process.env.BILDAZO_ARTICLE_PUBLISH_TIMEOUT_MS) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1000) return 10000;
  return Math.min(Math.floor(n), 30000);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isBildazoLeafCategoryId(raw) {
  const s = String(raw || "").trim();
  return UUID_RE.test(s);
}

function parseCategoryMap(raw = process.env.BILDAZO_ARTICLE_CATEGORY_MAP) {
  const text = String(raw || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isBildazoLeafCategoryId(value)) out[String(key).trim()] = String(value).trim();
    }
    return out;
  } catch {
    return {};
  }
}

function isBildazoArticlePublishEnabled() {
  return truthy(process.env.BILDAZO_ARTICLE_PUBLISH_ENABLED);
}

function getBildazoArticlePublishConfig() {
  const enabled = isBildazoArticlePublishEnabled();
  const baseUrl = String(process.env.BILDAZO_API_BASE_URL || "").trim();
  const secret = String(process.env.BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET || "").trim();
  const defaultCategoryId = String(process.env.BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID || "").trim();
  return {
    enabled,
    baseUrl,
    secret,
    timeoutMs: parseTimeoutMs(),
    configured: Boolean(baseUrl && secret),
    defaultCategoryId: isBildazoLeafCategoryId(defaultCategoryId) ? defaultCategoryId : "",
    categoryMap: parseCategoryMap(),
  };
}

function resolveBildazoCategoryId({ categoryId, subcategoryId } = {}, cfg = getBildazoArticlePublishConfig()) {
  const map = cfg.categoryMap || {};
  const subKey = subcategoryId != null && subcategoryId !== "" ? `subcategory:${Number(subcategoryId)}` : null;
  const catKey = categoryId != null && categoryId !== "" ? `category:${Number(categoryId)}` : null;
  if (subKey && isBildazoLeafCategoryId(map[subKey])) return map[subKey];
  if (catKey && isBildazoLeafCategoryId(map[catKey])) return map[catKey];
  if (subcategoryId != null && isBildazoLeafCategoryId(map[String(subcategoryId)])) {
    return map[String(subcategoryId)];
  }
  if (categoryId != null && isBildazoLeafCategoryId(map[String(categoryId)])) {
    return map[String(categoryId)];
  }
  if (cfg.defaultCategoryId) return cfg.defaultCategoryId;
  return null;
}

module.exports = {
  isBildazoArticlePublishEnabled,
  getBildazoArticlePublishConfig,
  resolveBildazoCategoryId,
  isBildazoLeafCategoryId,
};
