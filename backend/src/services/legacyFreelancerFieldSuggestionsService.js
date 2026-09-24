/**
 * Anonymous Legacy registration field suggestions (vocabulary only — no PII).
 */
const { pool } = require("../config/db");
const { createPublicApiError } = require("../utils/publicApiError");
const { SUGGESTION_FIELD_KEYS, CONTRACT_FIELD_BY_KEY } =
  require("../constants/legacyFreelancerContractCatalog");
const { JORDAN_CITIES, normalizeJordanCityKey, canonicalJordanCity } =
  require("../constants/jordanCities");

const MAX_SUGGESTIONS = 15;
const MAX_QUERY_LEN = 80;
const MAX_VALUE_LEN = 200;
const CACHE_TTL_MS = 60_000;
const FETCH_POOL_LIMIT = 400;

const cache = new Map(); // key -> { at, values: string[] }

function isAllowedSuggestionField(fieldKey) {
  return SUGGESTION_FIELD_KEYS.includes(String(fieldKey || "").trim());
}

function normalizeSuggestionValue(raw) {
  if (raw == null) return null;
  let s;
  if (typeof raw === "string") s = raw;
  else if (typeof raw === "number" && Number.isFinite(raw)) s = String(raw);
  else if (typeof raw === "boolean") return null;
  else if (typeof raw === "object") return null;
  else s = String(raw);
  s = s.trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.length > MAX_VALUE_LEN) s = s.slice(0, MAX_VALUE_LEN);
  // Reject sentinel / control junk
  if (s === "__other__" || s === "أخرى" || s === "not_graduated_yet") return null;
  return s;
}

function suggestionDedupeKey(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();
}

function dedupeNormalizeList(values) {
  const out = [];
  const seen = new Set();
  for (const raw of values || []) {
    const v = normalizeSuggestionValue(raw);
    if (!v) continue;
    const key = suggestionDedupeKey(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function rankSuggestions(values, query) {
  const q = normalizeSuggestionValue(query) || "";
  const qKey = suggestionDedupeKey(q);
  const list = dedupeNormalizeList(values);
  if (!qKey) return list.slice(0, MAX_SUGGESTIONS);

  const exact = [];
  const starts = [];
  const contains = [];
  for (const v of list) {
    const k = suggestionDedupeKey(v);
    if (k === qKey) exact.push(v);
    else if (k.startsWith(qKey)) starts.push(v);
    else if (k.includes(qKey)) contains.push(v);
  }
  return [...exact, ...starts, ...contains].slice(0, MAX_SUGGESTIONS);
}

function cacheGet(fieldKey) {
  const hit = cache.get(fieldKey);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(fieldKey);
    return null;
  }
  return hit.values;
}

function cacheSet(fieldKey, values) {
  cache.set(fieldKey, { at: Date.now(), values });
}

/** Test helper — clear in-memory suggestion cache. */
function clearSuggestionCache() {
  cache.clear();
}

async function loadHistoricalValues(fieldKey) {
  const cached = cacheGet(fieldKey);
  if (cached) return cached;

  const { rows } = await pool.query(
    `SELECT value_json
       FROM legacy_freelancer_invite_answers
      WHERE field_key = $1
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT $2`,
    [fieldKey, FETCH_POOL_LIMIT],
  );

  const extracted = [];
  for (const r of rows) {
    const v = r.value_json;
    if (typeof v === "string" || typeof v === "number") {
      extracted.push(v);
    } else if (v != null && typeof v !== "object") {
      extracted.push(v);
    }
    // jsonb strings arrive already unquoted as JS string from node-pg
  }

  // Also include users.city for city field (admin-created + legacy column)
  if (fieldKey === "city") {
    try {
      const cities = await pool.query(
        `SELECT DISTINCT city
           FROM users
          WHERE city IS NOT NULL
            AND BTRIM(city) <> ''
            AND onboarding_source = 'LEGACY_INVITE'
          ORDER BY city ASC
          LIMIT 300`,
      );
      for (const r of cities.rows) extracted.push(r.city);
    } catch (_) {
      /* ignore query failures in degraded environments */
    }
  }

  const values = dedupeNormalizeList(extracted);
  cacheSet(fieldKey, values);
  return values;
}

/**
 * @returns {Promise<string[]>} anonymous suggestion strings only
 */
async function getFieldSuggestions(fieldKey, query = "") {
  const key = String(fieldKey || "").trim();
  if (!isAllowedSuggestionField(key)) {
    throw createPublicApiError("حقل الاقتراحات غير مسموح.", 400, "SUGGESTION_FIELD_NOT_ALLOWED");
  }
  if (!CONTRACT_FIELD_BY_KEY[key]) {
    throw createPublicApiError("حقل الاقتراحات غير مسموح.", 400, "SUGGESTION_FIELD_NOT_ALLOWED");
  }
  const q = String(query || "").trim().slice(0, MAX_QUERY_LEN);

  let historical = await loadHistoricalValues(key);

  if (key === "city") {
    // Prefer canonical Jordan spellings; merge historical customs not in Jordan list.
    const jordan = [...JORDAN_CITIES];
    const jordanKeys = new Set(jordan.map((c) => normalizeJordanCityKey(c)));
    const customs = [];
    for (const v of historical) {
      const canon = canonicalJordanCity(v);
      if (canon) continue;
      const nk = normalizeJordanCityKey(v);
      if (!nk || jordanKeys.has(nk)) continue;
      customs.push(v);
    }
    historical = dedupeNormalizeList([...jordan, ...customs]);
  }

  const ranked = rankSuggestions(historical, q);
  // Guarantee plain strings only (no objects)
  return ranked.map((s) => String(s));
}

module.exports = {
  MAX_SUGGESTIONS,
  isAllowedSuggestionField,
  normalizeSuggestionValue,
  suggestionDedupeKey,
  dedupeNormalizeList,
  rankSuggestions,
  getFieldSuggestions,
  clearSuggestionCache,
};
