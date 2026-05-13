/**
 * Homepage «عروض مميزة» rail — theme presets + surface resolution (backward compatible with legacy ads).
 */

/** @typedef {{ gradientCss: string, titleColor: string, textColor: string, btnBg: string, btnFg: string, badgeBg: string, badgeFg: string, cardBorder: string }} OfferSurface */

const PRESETS = /** @type {Record<string, OfferSurface>} */ ({
  purple: {
    gradientCss: "linear-gradient(145deg, #f5f3ff 0%, #faf5ff 45%, #ffffff 100%)",
    titleColor: "#1e1b4b",
    textColor: "#575569",
    btnBg: "#7c3aed",
    btnFg: "#ffffff",
    badgeBg: "rgba(124, 58, 237, 0.14)",
    badgeFg: "#5b21b6",
    cardBorder: "rgba(124, 58, 237, 0.12)",
  },
  green: {
    gradientCss: "linear-gradient(145deg, #ecfdf5 0%, #f0fdf4 50%, #ffffff 100%)",
    titleColor: "#064e3b",
    textColor: "#4b5563",
    btnBg: "#059669",
    btnFg: "#ffffff",
    badgeBg: "rgba(16, 185, 129, 0.18)",
    badgeFg: "#065f46",
    cardBorder: "rgba(16, 185, 129, 0.15)",
  },
  orange: {
    gradientCss: "linear-gradient(145deg, #fff7ed 0%, #fffbeb 48%, #ffffff 100%)",
    titleColor: "#9a3412",
    textColor: "#57534e",
    btnBg: "#ea580c",
    btnFg: "#ffffff",
    badgeBg: "rgba(234, 88, 12, 0.12)",
    badgeFg: "#c2410c",
    cardBorder: "rgba(251, 146, 60, 0.2)",
  },
  blue: {
    gradientCss: "linear-gradient(145deg, #eff6ff 0%, #f0f9ff 50%, #ffffff 100%)",
    titleColor: "#1e3a5f",
    textColor: "#475569",
    btnBg: "#2563eb",
    btnFg: "#ffffff",
    badgeBg: "rgba(37, 99, 235, 0.12)",
    badgeFg: "#1d4ed8",
    cardBorder: "rgba(59, 130, 246, 0.18)",
  },
});

const FALLBACK = PRESETS.purple;

/**
 * @param {import("../../types/ad.js").Ad} ad
 * @returns {OfferSurface}
 */
export function resolveOfferSurface(ad) {
  const key = ad?.themePreset && PRESETS[String(ad.themePreset).toLowerCase()] ? String(ad.themePreset).toLowerCase() : null;
  if (key) return PRESETS[key];

  const g1 = ad?.gradientFrom;
  const g2 = ad?.gradientTo;
  if (g1 && g2) {
    return {
      gradientCss: `linear-gradient(145deg, ${g1} 0%, ${g2} 100%)`,
      titleColor: ad.titleColor || "#0f172a",
      textColor: ad.textColor || "#64748b",
      btnBg: ad.buttonColor || "#2f3b65",
      btnFg: ad.buttonTextColor || "#ffffff",
      badgeBg: ad.badgeColor || "rgba(47, 59, 101, 0.12)",
      badgeFg: "#1e293b",
      cardBorder: ad.borderColor || "rgba(15, 23, 42, 0.08)",
    };
  }

  if (ad?.backgroundColor) {
    return {
      gradientCss: `linear-gradient(180deg, ${ad.backgroundColor} 0%, #ffffff 92%)`,
      titleColor: ad.titleColor || "#0f172a",
      textColor: ad.textColor || "#64748b",
      btnBg: ad.buttonColor || "#2f3b65",
      btnFg: ad.buttonTextColor || "#ffffff",
      badgeBg: ad.badgeColor || "rgba(47, 59, 101, 0.1)",
      badgeFg: "#1e293b",
      cardBorder: ad.borderColor || "rgba(15, 23, 42, 0.06)",
    };
  }

  return FALLBACK;
}

/**
 * @param {import("../../types/ad.js").Ad[]} ads
 * @returns {{ featured: import("../../types/ad.js").Ad | null, rest: import("../../types/ad.js").Ad[] }}
 */
export function partitionHomeOffersAds(ads) {
  if (!Array.isArray(ads) || ads.length === 0) return { featured: null, rest: [] };
  const list = [...ads].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  const idx = list.findIndex((a) => a.isFeatured);
  const fi = idx >= 0 ? idx : 0;
  const featured = list[fi] || null;
  const rest = list.filter((_, i) => i !== fi);
  return { featured, rest };
}

/**
 * Flat list for homepage promo grid: featured (or first by sort) first, then the rest in sort order.
 * @param {import("../../types/ad.js").Ad[]} ads
 * @returns {import("../../types/ad.js").Ad[]}
 */
export function getOrderedHomeOffersAds(ads) {
  if (!Array.isArray(ads) || ads.length === 0) return [];
  const { featured, rest } = partitionHomeOffersAds(ads);
  return featured ? [featured, ...rest] : [];
}

/** Admin form: applying a preset fills gradient/button colors to match the public rail. */
export const THEME_PRESET_FORM_PATCH = Object.freeze({
  purple: {
    themePreset: "purple",
    gradientFrom: "#f5f3ff",
    gradientTo: "#ffffff",
    titleColor: "#1e1b4b",
    textColor: "#575569",
    buttonColor: "#7c3aed",
    buttonTextColor: "#ffffff",
    badgeColor: "rgba(124, 58, 237, 0.14)",
    borderColor: "rgba(124, 58, 237, 0.12)",
    backgroundColor: "",
  },
  green: {
    themePreset: "green",
    gradientFrom: "#ecfdf5",
    gradientTo: "#ffffff",
    titleColor: "#064e3b",
    textColor: "#4b5563",
    buttonColor: "#059669",
    buttonTextColor: "#ffffff",
    badgeColor: "rgba(16, 185, 129, 0.18)",
    borderColor: "rgba(16, 185, 129, 0.15)",
    backgroundColor: "",
  },
  orange: {
    themePreset: "orange",
    gradientFrom: "#fff7ed",
    gradientTo: "#ffffff",
    titleColor: "#9a3412",
    textColor: "#57534e",
    buttonColor: "#ea580c",
    buttonTextColor: "#ffffff",
    badgeColor: "rgba(234, 88, 12, 0.12)",
    borderColor: "rgba(251, 146, 60, 0.2)",
    backgroundColor: "",
  },
  blue: {
    themePreset: "blue",
    gradientFrom: "#eff6ff",
    gradientTo: "#ffffff",
    titleColor: "#1e3a5f",
    textColor: "#475569",
    buttonColor: "#2563eb",
    buttonTextColor: "#ffffff",
    badgeColor: "rgba(37, 99, 235, 0.12)",
    borderColor: "rgba(59, 130, 246, 0.18)",
    backgroundColor: "",
  },
});

export const THEME_PRESET_OPTIONS_AR = Object.freeze([
  { value: "", label: "تلقائي (ألوان الحقول أدناه أو الافتراضي)" },
  { value: "purple", label: "بنفسجي" },
  { value: "green", label: "أخضر" },
  { value: "orange", label: "برتقالي" },
  { value: "blue", label: "أزرق" },
]);
