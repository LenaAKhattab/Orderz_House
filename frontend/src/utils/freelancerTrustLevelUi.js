/** Known freelancer trust-level enum values from the API (internal, not for display). */
export const FREELANCER_TRUST_LEVEL_ENUMS = new Set([
  "beginner",
  "active",
  "professional",
  "trusted",
  "expert",
]);

/**
 * Localized display label for reputation.trustLevel enum.
 * Keeps the stored enum unchanged; maps to locale strings for UI.
 *
 * @param {{ trustLevel?: string, trustLevelAr?: string } | null | undefined} reputation
 * @param {string} locale
 * @param {(key: string) => string} t
 */
export function getLocalizedTrustLevelLabel(reputation, locale, t) {
  const trustEnum = String(reputation?.trustLevel || "")
    .trim()
    .toLowerCase();

  if (locale === "ar") {
    const ar = reputation?.trustLevelAr;
    if (ar != null && String(ar).trim() !== "") {
      return String(ar).trim();
    }
  }

  if (trustEnum && FREELANCER_TRUST_LEVEL_ENUMS.has(trustEnum)) {
    const key = `freelancerDashboard.stats.trustLevels.${trustEnum}`;
    const translated = t(key);
    if (translated !== key) {
      return translated;
    }
  }

  return t("freelancerDashboard.stats.beginner");
}
