const ALLOWED_CLEAN_BUDGET_PAIRS = [
  [20, 30],
  [25, 50],
  [30, 50],
  [50, 70],
  [50, 100],
  [70, 100],
  [100, 150],
  [150, 200],
  [200, 300],
  [300, 500],
  [500, 700],
  [700, 1000],
];

const PROFILE_ALLOWED = {
  simple: [
    [20, 30],
    [25, 50],
    [30, 50],
    [50, 70],
  ],
  medium: [
    [50, 100],
    [70, 100],
    [100, 150],
    [150, 200],
  ],
  technical: [
    [100, 150],
    [150, 200],
    [200, 300],
    [300, 500],
  ],
  large: [
    [300, 500],
    [500, 700],
    [700, 1000],
  ],
  architecture: [
    [100, 150],
    [150, 200],
    [200, 300],
    [300, 500],
    [500, 700],
  ],
  marketing: [
    [150, 200],
    [200, 300],
    [300, 500],
    [500, 700],
  ],
};

function isAllowedCleanBudgetRange(min, max) {
  const a = Number(min);
  const b = Number(max);
  return ALLOWED_CLEAN_BUDGET_PAIRS.some(([x, y]) => a === x && b === y);
}

function inferComplexityProfile({ categoryBucket = "", title = "", description = "", categoryName = "", subcategoryName = "" }) {
  const text = `${categoryBucket} ${title} ${description} ${categoryName} ${subcategoryName}`.toLowerCase();
  if (/erp|crm|pos|mobile|flutter|react native|ai|automation|أتمت|أتمت|e-?commerce|متجر شامل/.test(text)) return "large";
  if (/laravel|php|node|react|vue|api|backend|dashboard|payment|تكامل|برمج/.test(text)) return "technical";
  if (/architecture|interior|ديكور|معماري|مخطط/.test(text)) return "architecture";
  if (/seo|تسويق|social|campaign|حمله|إعلانات|اعلان/.test(text)) return "marketing";
  if (/wordpress|landing|ui|ux|video|motion|logo|design|تصميم|مونتاج/.test(text)) return "medium";
  return "simple";
}

function pickCleanBudgetRange(profile = "simple", seed = 0) {
  const list = PROFILE_ALLOWED[profile] || PROFILE_ALLOWED.simple;
  const idx = Math.abs(Number(seed) || 0) % list.length;
  const [min, max] = list[idx];
  return { min, max, profile };
}

function normalizeToCleanBudgetRange(min, max, profile = "simple") {
  const a = Number(min);
  const b = Number(max);
  if (isAllowedCleanBudgetRange(a, b)) return { min: a, max: b, profile };
  const list = PROFILE_ALLOWED[profile] || PROFILE_ALLOWED.simple;
  const targetMid = Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : null;
  if (targetMid == null) {
    const [x, y] = list[0];
    return { min: x, max: y, profile };
  }
  let best = list[0];
  let bestDiff = Math.abs((best[0] + best[1]) / 2 - targetMid);
  for (const pair of list.slice(1)) {
    const d = Math.abs((pair[0] + pair[1]) / 2 - targetMid);
    if (d < bestDiff) {
      best = pair;
      bestDiff = d;
    }
  }
  return { min: best[0], max: best[1], profile };
}

function isFixedBudgetInAllowedSpan(value) {
  const v = Number(value);
  if (!Number.isInteger(v) || v <= 0) return false;
  return ALLOWED_CLEAN_BUDGET_PAIRS.some(([x, y]) => v >= x && v <= y);
}

/**
 * Normalize admin template budgets before save.
 * - Fixed (min === max): allow any integer within an allowed pair span (e.g. 120 in 100–150).
 * - Bidding: exact allowed pair, or snap to nearest allowed pair by midpoint.
 */
function normalizeTemplateBudget(min, max, profile = "simple") {
  const a = Math.round(Number(min));
  const b = Math.round(Number(max));
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b < a) {
    return { ok: false, code: "invalid_range" };
  }
  if (a === b) {
    if (isFixedBudgetInAllowedSpan(a)) return { ok: true, min: a, max: b };
    const norm = normalizeToCleanBudgetRange(a, b, profile);
    const mid = Math.round((norm.min + norm.max) / 2);
    if (isFixedBudgetInAllowedSpan(mid)) return { ok: true, min: mid, max: mid };
    return { ok: true, min: norm.min, max: norm.max };
  }
  if (isAllowedCleanBudgetRange(a, b)) return { ok: true, min: a, max: b };
  const norm = normalizeToCleanBudgetRange(a, b, profile);
  return { ok: true, min: norm.min, max: norm.max };
}

function formatAllowedBudgetPairsHint() {
  return ALLOWED_CLEAN_BUDGET_PAIRS.map(([x, y]) => `${x}–${y}`).join("، ");
}

module.exports = {
  ALLOWED_CLEAN_BUDGET_PAIRS,
  isAllowedCleanBudgetRange,
  isFixedBudgetInAllowedSpan,
  inferComplexityProfile,
  pickCleanBudgetRange,
  normalizeToCleanBudgetRange,
  normalizeTemplateBudget,
  formatAllowedBudgetPairsHint,
};
