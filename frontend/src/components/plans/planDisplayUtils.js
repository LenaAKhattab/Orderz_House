import { localeFromEnFlag, pt } from "../../i18n/activeLocale.js";
import { isNewLocale, localizeSystemText } from "../../i18n/systemContent.js";

const PD = "platformComponents.plans";

/**
 * Locale for copy that the English UI historically rendered in Arabic (kept byte-identical);
 * German / Dutch / Romanian get their own translation.
 */
function legacyArabicCopyLocale(locale) {
  return locale === "en" ? "ar" : locale;
}

/** Normalize bullet text so feature vs training duplicates can be detected. */
function normalizePlanBullet(text) {
  return String(text)
    .replace(/^تدريب:\s*/u, "")
    .replace(/^تدريب\s+/u, "")
    .replace(/مجاني(?:ة)?/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isRedundantPlanBullet(candidate, existingNormalized) {
  const normalized = normalizePlanBullet(candidate);
  if (!normalized) return true;
  return existingNormalized.some((entry) => {
    if (!entry) return false;
    if (normalized === entry) return true;
    return entry.includes(normalized) || normalized.includes(entry);
  });
}

export function planListItems(plan, locale = "ar") {
  const newLocale = isNewLocale(locale);
  if (Array.isArray(plan?.planFeatures) && plan.planFeatures.length > 0) {
    return plan.planFeatures
      .filter((item) => item?.isIncluded !== false)
      .map((item) => {
        if (newLocale) {
          return localizeSystemText(locale, { ar: String(item.featureText || item), en: item?.featureTextEn });
        }
        if (locale === "en" && item?.featureTextEn) return String(item.featureTextEn);
        return String(item.featureText || item);
      })
      .filter(Boolean)
      .slice(0, 14);
  }
  const features = Array.isArray(plan?.features) ? plan.features.filter(Boolean).map(String) : [];
  const trainingsEn =
    Array.isArray(plan?.trainingsEn) && plan.trainingsEn.length > 0
      ? plan.trainingsEn.filter(Boolean).map(String)
      : [];
  const trainingsAr = Array.isArray(plan?.trainings) ? plan.trainings.filter(Boolean).map(String) : [];
  // German / Dutch / Romanian translate from the English source when there is one (like the English UI).
  const useEnglishTrainings = (locale === "en" || newLocale) && trainingsEn.length > 0;
  const trainings = useEnglishTrainings ? trainingsEn : trainingsAr;
  // Duplicate detection runs on the source text; new locales translate only what is displayed.
  const sourceLocale = newLocale ? (useEnglishTrainings ? "en" : "ar") : locale;
  const trainingPrefix = pt(`${PD}.trainingPrefix`, undefined, sourceLocale);
  if (features.length > 0 || trainings.length > 0) {
    const items = [];
    const normalized = [];

    for (const feature of features) {
      if (isRedundantPlanBullet(feature, normalized)) continue;
      items.push(newLocale ? localizeSystemText(locale, { ar: feature }) : feature);
      normalized.push(normalizePlanBullet(feature));
    }

    for (const training of trainings) {
      const labelled = `${trainingPrefix}${training}`;
      if (isRedundantPlanBullet(training, normalized) || isRedundantPlanBullet(labelled, normalized)) {
        continue;
      }
      items.push(
        newLocale
          ? `${pt(`${PD}.trainingPrefix`, undefined, locale)}${localizeSystemText(locale, { [sourceLocale]: training })}`
          : labelled,
      );
      normalized.push(normalizePlanBullet(training));
    }

    return items.slice(0, 14);
  }
  const d = Number(plan?.durationDays);
  if (Number.isFinite(d) && d > 0) {
    return [pt(`${PD}.subscriptionDurationDays`, { days: d }, legacyArabicCopyLocale(locale))];
  }
  return [];
}

/**
 * @param {object} plan
 * @param {string} [locale] defaults to Arabic for the Arabic / English UI (unchanged) and to the active
 *   locale for German / Dutch / Romanian
 */
export function formatOrderValueRange(plan, locale = localeFromEnFlag(false)) {
  const minRaw = plan?.minOrderValue ?? plan?.orderValueMinJod;
  const maxRaw = plan?.maxOrderValue ?? plan?.orderValueMaxJod;
  const min = minRaw != null ? Number(minRaw) : null;
  const max = maxRaw != null ? Number(maxRaw) : null;
  if (!Number.isFinite(min) && !Number.isFinite(max)) return null;
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return pt(`${PD}.orderValue.range`, { min, max }, locale);
  }
  if (Number.isFinite(min)) {
    return pt(`${PD}.orderValue.fromMin`, { min }, locale);
  }
  return pt(`${PD}.orderValue.upToMax`, { max }, locale);
}

/**
 * @param {object} plan
 * @param {string} [locale] defaults to Arabic for the Arabic / English UI (unchanged) and to the active
 *   locale for German / Dutch / Romanian
 */
export function formatInstallmentSummary(plan, locale = localeFromEnFlag(false)) {
  const inst = plan?.installmentPlan;
  if (!inst || typeof inst !== "object") return null;
  const parts = [];
  if (inst.upfrontJod != null) parts.push(pt(`${PD}.installment.upfront`, { amount: Number(inst.upfrontJod) }, locale));
  if (inst.monthlyJod != null && inst.months != null) {
    parts.push(pt(`${PD}.installment.monthly`, { amount: Number(inst.monthlyJod), months: inst.months }, locale));
  }
  if (parts.length === 0) return inst.notes || null;
  return parts.join(" · ");
}

export function isOfferActive(plan) {
  const label = plan?.offerLabel;
  const labelEn = plan?.offerLabelEn;
  if (!label && !labelEn) return false;
  const exp = plan?.offerExpiresAt;
  if (!exp) return true;
  const t = new Date(exp).getTime();
  if (!Number.isFinite(t)) return true;
  return t >= Date.now();
}
