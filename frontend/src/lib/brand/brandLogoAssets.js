import heroLogoEn from "../../assets/brand/orderzhouse-logo-en-transparent.png";
import heroLogoEnTrimmed from "../../assets/brand/orderzhouse-logo-en-transparent-trimmed.png";

/** Full wordmark — Arabic hero and other spacious placements */
export const BRAND_LOGO_FULL_AR_SRC = "/hero/fullLogp.png";

/** Compact icon — navbar (icon-only in both locales) */
export const BRAND_LOGO_ICON_SRC = "/logo.png";

/** Full transparent wordmark — English auth/footer/default */
export const BRAND_LOGO_EN_SRC = heroLogoEn;

/** Trimmed transparent wordmark — English hero (no blue wash / minimal padding) */
export const BRAND_LOGO_EN_HERO_SRC = heroLogoEnTrimmed;

/**
 * @param {string} locale
 * @param {"hero" | "footer" | "default" | "navbar" | "auth"} variant
 * @returns {string}
 */
export function getBrandLogoSrc(locale, variant = "default") {
  // Navbar keeps the compact icon in all languages to avoid layout break.
  if (variant === "navbar") return BRAND_LOGO_ICON_SRC;

  if (locale === "en") {
    if (variant === "hero") return BRAND_LOGO_EN_HERO_SRC;
    return BRAND_LOGO_EN_SRC;
  }
  return BRAND_LOGO_FULL_AR_SRC;
}
