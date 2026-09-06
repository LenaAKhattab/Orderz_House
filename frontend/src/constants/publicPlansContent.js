/**
 * Public `/plans` hero copy + initial Training/Work section.
 * Independent of default_plan_catalog. Does not select which work-plan catalog is shown.
 */

export const PUBLIC_PLANS_DEFAULT_SECTION = Object.freeze({
  TRAINING: "training",
  WORK: "work",
});

export const PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK = PUBLIC_PLANS_DEFAULT_SECTION.TRAINING;

export const PUBLIC_PLANS_CONTENT_DEFAULTS = Object.freeze({
  badgeText: "طوّر مهاراتك وابدأ مسارك المهني",
  title: "باقات التدريب الاحترافية",
  description: "اختر الباقة المناسبة لك وابدأ رحلتك في تطوير المهارات والعمل الحر.",
  trainingTabLabel: "باقات التدريب",
  workTabLabel: "عضوية سوق أوردرز هاوس",
});

export const PUBLIC_PLANS_CONTENT_MAX_LENGTHS = Object.freeze({
  badgeText: 80,
  title: 120,
  description: 500,
  trainingTabLabel: 80,
  workTabLabel: 80,
});

/**
 * @param {string | null | undefined} raw
 * @returns {"training" | "work"}
 */
export function resolvePublicPlansDefaultSection(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value === PUBLIC_PLANS_DEFAULT_SECTION.WORK) return PUBLIC_PLANS_DEFAULT_SECTION.WORK;
  return PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK;
}

export function isPublicPlansDefaultSection(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  return value === PUBLIC_PLANS_DEFAULT_SECTION.TRAINING || value === PUBLIC_PLANS_DEFAULT_SECTION.WORK;
}

/**
 * Map admin initial-section setting to the existing public tab ids.
 * `work` → membership tab. Does not touch default_plan_catalog.
 * @param {string | null | undefined} section
 * @returns {"training" | "membership"}
 */
export function plansCategoryFromDefaultSection(section) {
  return resolvePublicPlansDefaultSection(section) === PUBLIC_PLANS_DEFAULT_SECTION.WORK
    ? "membership"
    : "training";
}

/**
 * Public `/plans` top-level tab DOM order.
 * First id is first in document order = RTL rightmost. Driven by
 * `public_plans_default_section` (training | work), never by labels or the
 * currently selected tab. Independent of `default_plan_catalog`.
 *
 * @param {string | null | undefined} defaultSection
 * @returns {ReadonlyArray<"training" | "membership">}
 */
export function orderPublicPlansCategoryTabs(defaultSection) {
  const first = plansCategoryFromDefaultSection(defaultSection);
  const second = first === "membership" ? "training" : "membership";
  return [first, second];
}
