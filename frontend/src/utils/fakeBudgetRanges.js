/** Keep in sync with backend/src/utils/fakeBudgetRanges.js */

export const ALLOWED_CLEAN_BUDGET_PAIRS = [
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

export function isAllowedCleanBudgetRange(min, max) {
  const a = Number(min);
  const b = Number(max);
  return ALLOWED_CLEAN_BUDGET_PAIRS.some(([x, y]) => a === x && b === y);
}

export function isFixedBudgetInAllowedSpan(value) {
  const v = Number(value);
  if (!Number.isInteger(v) || v <= 0) return false;
  return ALLOWED_CLEAN_BUDGET_PAIRS.some(([x, y]) => v >= x && v <= y);
}

function normalizeToCleanBudgetRange(min, max) {
  const a = Number(min);
  const b = Number(max);
  if (isAllowedCleanBudgetRange(a, b)) return { min: a, max: b };
  const targetMid = Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : null;
  if (targetMid == null) {
    const [x, y] = ALLOWED_CLEAN_BUDGET_PAIRS[0];
    return { min: x, max: y };
  }
  let best = ALLOWED_CLEAN_BUDGET_PAIRS[0];
  let bestDiff = Math.abs((best[0] + best[1]) / 2 - targetMid);
  for (const pair of ALLOWED_CLEAN_BUDGET_PAIRS.slice(1)) {
    const d = Math.abs((pair[0] + pair[1]) / 2 - targetMid);
    if (d < bestDiff) {
      best = pair;
      bestDiff = d;
    }
  }
  return { min: best[0], max: best[1] };
}

export function normalizeTemplateBudget(min, max) {
  const a = Math.round(Number(min));
  const b = Math.round(Number(max));
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b < a) {
    return { ok: false };
  }
  if (a === b) {
    if (isFixedBudgetInAllowedSpan(a)) return { ok: true, min: a, max: b };
    const norm = normalizeToCleanBudgetRange(a, b);
    const mid = Math.round((norm.min + norm.max) / 2);
    if (isFixedBudgetInAllowedSpan(mid)) return { ok: true, min: mid, max: mid };
    return { ok: true, min: norm.min, max: norm.max };
  }
  if (isAllowedCleanBudgetRange(a, b)) return { ok: true, min: a, max: b };
  const norm = normalizeToCleanBudgetRange(a, b);
  return { ok: true, min: norm.min, max: norm.max };
}

export function formatAllowedBudgetPairsHint() {
  return ALLOWED_CLEAN_BUDGET_PAIRS.map(([x, y]) => `${x}–${y}`).join(", ");
}
