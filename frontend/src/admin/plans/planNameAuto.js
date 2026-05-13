/**
 * Build a valid `plans.name` (backend: /^[a-z][a-z0-9_]*$/, max 80).
 * Arabic-only titles → safe fallback prefix.
 */
export function slugifyTitleForPlanName(title) {
  const t = String(title || "").trim().toLowerCase();
  let s = t.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (s && /^[0-9]/.test(s)) {
    s = `p_${s}`;
  }
  if (!s || !/^[a-z]/.test(s)) {
    const tail = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-z0-9]/g, "");
    s = `plan_${tail}`.slice(0, 80);
  }
  if (s.length < 2) {
    s = "plan_x";
  }
  return s.slice(0, 80);
}

/**
 * @param {string} base
 * @param {string[]} existingNames
 */
export function uniquePlanName(base, existingNames) {
  const lower = new Set(existingNames.map((n) => String(n).toLowerCase()));
  let candidate = base.slice(0, 80);
  let n = 2;
  while (lower.has(candidate.toLowerCase())) {
    const suffix = `_${n}`;
    const room = Math.max(2, 80 - suffix.length);
    candidate = (base.slice(0, room) + suffix).slice(0, 80);
    n += 1;
    if (n > 5000) {
      candidate = `plan_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.replace(/[^a-z0-9_]/g, "").slice(0, 80);
      break;
    }
  }
  return candidate;
}

/**
 * @param {string} title
 * @param {string[]} existingNames — current admin list (e.g. non-deleted plans)
 */
export function suggestPlanInternalName(title, existingNames) {
  const base = slugifyTitleForPlanName(title);
  return uniquePlanName(base, existingNames);
}
