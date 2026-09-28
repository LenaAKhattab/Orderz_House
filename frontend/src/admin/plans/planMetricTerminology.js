/**
 * i18n key paths for plan portfolio metrics — labels resolve via planAdmin.metrics.* (see planAdmin.json).
 * Snapshot KPI semantics documented in planPerformanceUtils / backend SQL.
 */

import { getTranslation } from "../../lib/translation/getTranslation";
import "../../i18n/planAdminResources";

const METRICS = "planAdmin.metrics";

export function planMetricT(t, suffix, values) {
  const key = `${METRICS}.${suffix}`;
  if (typeof t === "function") return t(key, values);
  return getTranslation(key, "ar", values);
}

export function revenueSharePhrase(pctFormatted, t) {
  return planMetricT(t, "phrases.revenueShare", { pct: pctFormatted });
}

export function concentrationRiskPhrase(pctFormatted, t) {
  return planMetricT(t, "phrases.concentrationRisk", { pct: pctFormatted });
}

export function concentrationPlatformPhrase(planTitle, pctFormatted, t) {
  return planMetricT(t, "phrases.concentrationPlatform", { planTitle, pct: pctFormatted });
}

/** @deprecated Prefer t(`planAdmin.sections.${id}.*`) in UI */
export const SECTION_IDS = Object.freeze({
  core: "core",
  pages: "pages",
  marketplace: "marketplace",
  training: "training",
  specialOffer: "specialOffer",
});

export function planSectionKey(sectionId, field) {
  return `planAdmin.sections.${sectionId}.${field}`;
}
