import { ADMIN_COLOR_PRESET_KEYS, ADMIN_COLOR_PRESET_LABELS_AR } from "../../components/ads/bannerColorPresets";
import { COLOR_PRESET_DB_PATCH } from "../../components/ads/homeOffersTheme";
import { PREMIUM_THEME_EXTRAS } from "../../components/ads/bannerDesignSystem";
import { pickContrastButtonText } from "./adColorPalette";

const QUICK_PRESETS = ADMIN_COLOR_PRESET_KEYS.map((key) => ({
  key,
  label: ADMIN_COLOR_PRESET_LABELS_AR[key],
}));

/**
 * Apply a bundled color preset to admin form state.
 * @param {object} data
 * @param {string} key
 * @returns {object}
 */
export function applyBannerColorPreset(data, key) {
  const safeKey = ADMIN_COLOR_PRESET_KEYS.includes(key) ? key : "blue_white";
  const p = COLOR_PRESET_DB_PATCH[safeKey] || COLOR_PRESET_DB_PATCH.blue_white;
  const extras = PREMIUM_THEME_EXTRAS[safeKey] || {};
  const btn = p.buttonColor || "";
  return {
    ...data,
    colorPreset: safeKey,
    gradientFrom: p.gradientFrom || "",
    gradientTo: p.gradientTo || "",
    titleColor: p.titleColor || "",
    textColor: p.textColor || "",
    companyNameColor: p.textColor || "",
    descriptionColor: p.textColor || "",
    subtitleColor: extras.accentColor || "",
    discountLineColor: extras.accentCyan || "",
    buttonColor: btn,
    buttonTextColor: p.buttonTextColor || (btn ? pickContrastButtonText(btn) : ""),
    badgeColor: p.badgeColor || "",
    badgeTextColor: p.badgeTextColor || "",
    borderColor: p.borderColor || "",
    backgroundColor: p.backgroundColor || "",
    saleStickerBg: extras.saleStickerBg || "",
    saleStickerFg: extras.saleStickerFg || "",
  };
}

export { QUICK_PRESETS };
