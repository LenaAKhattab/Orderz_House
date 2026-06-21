import { SORT_MODES, sortPlansForDisplay } from "./planPerformanceUtils";

/** Next sort slot when creating a plan (append to end). */
export function computeNextPlanSortOrder(plans = []) {
  let max = 0;
  for (const p of plans) {
    const n = Number(p?.sortOrder);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 10;
}

export function getDisplayOrderedPlans(plans = []) {
  return sortPlansForDisplay(plans, SORT_MODES.display);
}

/**
 * Swap plan with neighbor in display order; returns PATCH payloads for changed rows only.
 * @returns {{ id: string|number, sortOrder: number }[] | null}
 */
export function buildPlanReorderPatches(plans, planId, direction) {
  const ordered = getDisplayOrderedPlans(plans);
  const idx = ordered.findIndex((p) => String(p.id) === String(planId));
  if (idx < 0) return null;

  const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
  if (neighborIdx < 0 || neighborIdx >= ordered.length) return null;

  const swapped = [...ordered];
  [swapped[idx], swapped[neighborIdx]] = [swapped[neighborIdx], swapped[idx]];

  const patches = swapped.map((p, i) => ({
    id: p.id,
    sortOrder: (i + 1) * 10,
  }));

  return patches.filter((patch) => {
    const orig = plans.find((p) => String(p.id) === String(patch.id));
    return Number(orig?.sortOrder) !== patch.sortOrder;
  });
}

export function getPlanDisplayOrderMeta(plans, planId) {
  const ordered = getDisplayOrderedPlans(plans);
  const idx = ordered.findIndex((p) => String(p.id) === String(planId));
  if (idx < 0) {
    return { index: -1, canMoveUp: false, canMoveDown: false, total: ordered.length };
  }
  return {
    index: idx,
    canMoveUp: idx > 0,
    canMoveDown: idx < ordered.length - 1,
    total: ordered.length,
  };
}

export function plansListFiltersAreDefault({
  search = "",
  statusFilter = "all",
  visibilityFilter = "all",
  selfPurchaseFilter = "all",
  decisionFilter = "all",
} = {}) {
  return (
    !String(search || "").trim() &&
    statusFilter === "all" &&
    visibilityFilter === "all" &&
    selfPurchaseFilter === "all" &&
    decisionFilter === "all"
  );
}
