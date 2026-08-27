/**
 * Bildazo S2S categories client (OZ-Articles-Bildazo-02).
 * Browser must never call this. Secrets never logged or returned.
 */

const { getBildazoArticlePublishConfig, isBildazoLeafCategoryId } = require("../config/bildazoArticlePublish");

const CATEGORIES_PATH = "/api/integrations/orderzhouse/categories";
const SECRET_HEADER = "X-OrderzHouse-Integration-Secret";

const CACHE_TTL_MS = 60_000;
let cache = { at: 0, items: null, error: null };

function joinCategoriesUrl(baseUrl) {
  const b = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!b) return "";
  if (b.endsWith("/api") && CATEGORIES_PATH.startsWith("/api/")) {
    return `${b}${CATEGORIES_PATH.slice(4)}`;
  }
  return `${b}${CATEGORIES_PATH}`;
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

function mapCategoryNode(raw, parentPath = []) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || raw.categoryId || raw.uuid || "").trim();
  if (!isBildazoLeafCategoryId(id) && !id) return null;
  const nameAr =
    String(raw.nameAr || raw.name_ar || raw.titleAr || raw.labelAr || raw.name || "").trim() || null;
  const nameEn =
    String(raw.nameEn || raw.name_en || raw.titleEn || raw.labelEn || "").trim() || null;
  const slug = String(raw.slug || raw.pathSlug || "").trim() || null;
  const isLeaf =
    raw.isLeaf === true ||
    raw.leaf === true ||
    (Array.isArray(raw.children) ? raw.children.length === 0 : true) ||
    (Array.isArray(raw.items) ? raw.items.length === 0 : Boolean(raw.isLeaf !== false && !raw.children));
  const pathParts = [...parentPath, nameAr || nameEn || slug || id].filter(Boolean);
  return {
    id,
    nameAr,
    nameEn,
    slug,
    path: pathParts.join(" / "),
    section: parentPath[0] || null,
    root: parentPath[0] || null,
    isLeaf: Boolean(isLeaf),
    children: Array.isArray(raw.children)
      ? raw.children
      : Array.isArray(raw.items)
        ? raw.items
        : [],
  };
}

function flattenLeafCategories(nodes, parentPath = [], out = []) {
  if (!Array.isArray(nodes)) return out;
  for (const raw of nodes) {
    const mapped = mapCategoryNode(raw, parentPath);
    if (!mapped) continue;
    const nextPath = [...parentPath, mapped.nameAr || mapped.nameEn || mapped.slug].filter(Boolean);
    const kids = mapped.children;
    if (Array.isArray(kids) && kids.length > 0) {
      flattenLeafCategories(kids, nextPath, out);
    } else if (isBildazoLeafCategoryId(mapped.id)) {
      out.push({
        id: mapped.id,
        nameAr: mapped.nameAr,
        nameEn: mapped.nameEn,
        slug: mapped.slug,
        path: mapped.path,
        section: mapped.section,
        root: mapped.root,
        isLeaf: true,
      });
    }
  }
  return out;
}

function extractCategoryList(json) {
  if (!json) return null;
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.categories)) return json.categories;
  if (json.data && Array.isArray(json.data.categories)) return json.data.categories;
  if (json.data && Array.isArray(json.data.items)) return json.data.items;
  return null;
}

function clearBildazoCategoriesCache() {
  cache = { at: 0, items: null, error: null };
}

/**
 * @returns {Promise<{ ok: boolean, blocked?: boolean, items?: Array, errorCode?: string, safeMessage?: string }>}
 */
async function fetchBildazoLeafCategories(deps = {}) {
  const getConfig = deps.getConfig || getBildazoArticlePublishConfig;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const now = Date.now();
  if (!deps.skipCache && cache.items && now - cache.at < CACHE_TTL_MS) {
    return { ok: true, items: cache.items, cached: true };
  }

  const cfg = getConfig();
  if (!cfg.baseUrl || !cfg.secret) {
    return {
      ok: false,
      blocked: true,
      errorCode: "BILDAZO_CATEGORIES_CONFIG_MISSING",
      safeMessage: "تعذر تحميل أصناف بلدازو الآن. حاول مجددًا.",
    };
  }
  if (typeof fetchImpl !== "function") {
    return {
      ok: false,
      blocked: true,
      errorCode: "BILDAZO_CATEGORIES_FETCH_UNAVAILABLE",
      safeMessage: "تعذر تحميل أصناف بلدازو الآن. حاول مجددًا.",
    };
  }

  const url = joinCategoriesUrl(cfg.baseUrl);
  let res;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        [SECRET_HEADER]: cfg.secret,
      },
      signal: abortSignalForTimeout(cfg.timeoutMs || 10000),
    });
  } catch (err) {
    const code = isAbortError(err) ? "BILDAZO_CATEGORIES_TIMEOUT" : "BILDAZO_CATEGORIES_NETWORK";
    return {
      ok: false,
      blocked: true,
      errorCode: code,
      safeMessage: "تعذر تحميل أصناف بلدازو الآن. حاول مجددًا.",
    };
  }

  if (res.status === 404) {
    return {
      ok: false,
      blocked: true,
      errorCode: "BILDAZO_CATEGORIES_ENDPOINT_MISSING",
      safeMessage: "تعذر تحميل أصناف بلدازو الآن. حاول مجددًا.",
    };
  }
  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      blocked: true,
      errorCode: "BILDAZO_CATEGORIES_HTTP_ERROR",
      safeMessage: "تعذر تحميل أصناف بلدازو الآن. حاول مجددًا.",
    };
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    return {
      ok: false,
      blocked: true,
      errorCode: "BILDAZO_CATEGORIES_UNSUPPORTED_SHAPE",
      safeMessage: "تعذر تحميل أصناف بلدازو الآن. حاول مجددًا.",
    };
  }

  const list = extractCategoryList(json);
  if (!list) {
    return {
      ok: false,
      blocked: true,
      errorCode: "BILDAZO_CATEGORIES_UNSUPPORTED_SHAPE",
      safeMessage: "تعذر تحميل أصناف بلدازو الآن. حاول مجددًا.",
    };
  }

  const leaves = flattenLeafCategories(list).filter((c) => isBildazoLeafCategoryId(c.id));
  if (!leaves.length) {
    return {
      ok: false,
      blocked: true,
      errorCode: "BILDAZO_CATEGORIES_NO_LEAVES",
      safeMessage: "تعذر تحميل أصناف بلدازو الآن. حاول مجددًا.",
    };
  }

  cache = { at: Date.now(), items: leaves, error: null };
  return { ok: true, items: leaves, cached: false };
}

module.exports = {
  fetchBildazoLeafCategories,
  clearBildazoCategoriesCache,
  flattenLeafCategories,
  joinCategoriesUrl,
  CATEGORIES_PATH,
};
