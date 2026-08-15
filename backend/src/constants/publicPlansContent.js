/**
 * Public `/plans` hero copy + initial Training/Work section.
 * Stored in existing system_settings. Independent of default_plan_catalog.
 */

const PUBLIC_PLANS_CONTENT_SETTING_KEYS = Object.freeze({
  BADGE_TEXT: "public_plans_badge_text",
  TITLE: "public_plans_title",
  DESCRIPTION: "public_plans_description",
  DEFAULT_SECTION: "public_plans_default_section",
  TRAINING_TAB_LABEL: "public_plans_training_tab_label",
  WORK_TAB_LABEL: "public_plans_work_tab_label",
});

const PUBLIC_PLANS_DEFAULT_SECTION = Object.freeze({
  TRAINING: "training",
  WORK: "work",
});

const PUBLIC_PLANS_DEFAULT_SECTION_VALUES = Object.freeze(
  Object.values(PUBLIC_PLANS_DEFAULT_SECTION),
);

const PUBLIC_PLANS_DEFAULT_SECTION_SET = new Set(PUBLIC_PLANS_DEFAULT_SECTION_VALUES);

/** Behavior-preserving fallback: public `/plans` currently opens on Training. */
const PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK = PUBLIC_PLANS_DEFAULT_SECTION.TRAINING;

/**
 * Current Production Arabic hero copy (matches frontend locales/ar/plans.json).
 * Used when no Super Admin override is stored.
 */
const PUBLIC_PLANS_CONTENT_DEFAULTS = Object.freeze({
  badgeText: "طوّر مهاراتك وابدأ مسارك المهني",
  title: "باقات التدريب الاحترافية",
  description: "اختر الباقة المناسبة لك وابدأ رحلتك في تطوير المهارات والعمل الحر.",
  trainingTabLabel: "باقات التدريب",
  workTabLabel: "عضوية سوق أوردرز هاوس",
});

const PUBLIC_PLANS_CONTENT_MAX_LENGTHS = Object.freeze({
  badgeText: 80,
  title: 120,
  description: 500,
  trainingTabLabel: 80,
  workTabLabel: 80,
});

function normalizePublicPlansDefaultSection(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  return PUBLIC_PLANS_DEFAULT_SECTION_SET.has(value) ? value : null;
}

function isPublicPlansDefaultSection(raw) {
  return normalizePublicPlansDefaultSection(raw) != null;
}

function normalizePublicPlansPlainText(raw, maxLength) {
  if (raw == null) return null;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) return undefined;
  return trimmed;
}

module.exports = {
  PUBLIC_PLANS_CONTENT_SETTING_KEYS,
  PUBLIC_PLANS_DEFAULT_SECTION,
  PUBLIC_PLANS_DEFAULT_SECTION_VALUES,
  PUBLIC_PLANS_DEFAULT_SECTION_SET,
  PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK,
  PUBLIC_PLANS_CONTENT_DEFAULTS,
  PUBLIC_PLANS_CONTENT_MAX_LENGTHS,
  normalizePublicPlansDefaultSection,
  isPublicPlansDefaultSection,
  normalizePublicPlansPlainText,
};
