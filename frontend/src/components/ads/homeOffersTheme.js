/**
 * Homepage «عروض مميزة» rail — theme presets + surface resolution (backward compatible with legacy ads).
 */

import { COLOR_PRESET_KEYS, getBannerMetaFromTexts, LEGACY_THEME_COLORS } from "./bannerAdMeta";
import { PREMIUM_THEME_EXTRAS } from "./bannerDesignSystem";

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

/** DB + visual fields for each admin color pack (saved on submit). */
export const COLOR_PRESET_DB_PATCH = Object.freeze({
  cream_navy: {
    gradientFrom: "#faf9f7",
    gradientMid: "#f0f1f8",
    gradientTo: "#e8eaf6",
    gradientAngle: 118,
    titleColor: "#1e293b",
    textColor: "#64748b",
    buttonColor: "#2f3b65",
    buttonTextColor: "#ffffff",
    badgeColor: "#f5ebe0",
    badgeTextColor: "#78350f",
    borderColor: "rgba(47, 59, 101, 0.1)",
    backgroundColor: "",
  },
  soft_lavender: {
    gradientFrom: "#faf5ff",
    gradientMid: "#f5f3ff",
    gradientTo: "#ede9fe",
    gradientAngle: 125,
    titleColor: "#312e81",
    textColor: "#6b7280",
    buttonColor: "#6d28d9",
    buttonTextColor: "#ffffff",
    badgeColor: "#ede9fe",
    badgeTextColor: "#5b21b6",
    borderColor: "rgba(109, 40, 217, 0.12)",
    backgroundColor: "",
  },
  pastel_blue_violet: {
    gradientFrom: "#f0f9ff",
    gradientMid: "#eef2ff",
    gradientTo: "#f5f3ff",
    gradientAngle: 110,
    titleColor: "#1e3a5f",
    textColor: "#64748b",
    buttonColor: "#4f46e5",
    buttonTextColor: "#ffffff",
    badgeColor: "#e0f2fe",
    badgeTextColor: "#0369a1",
    borderColor: "rgba(79, 70, 229, 0.14)",
    backgroundColor: "",
  },
  navy_gold: {
    gradientFrom: "#0f172a",
    gradientMid: "#1e293b",
    gradientTo: "#334155",
    gradientAngle: 135,
    titleColor: "#fef3c7",
    textColor: "#cbd5e1",
    buttonColor: "#d97706",
    buttonTextColor: "#1c1917",
    badgeColor: "rgba(251, 191, 36, 0.22)",
    badgeTextColor: "#fef3c7",
    borderColor: "rgba(245, 158, 11, 0.35)",
    backgroundColor: "",
  },
  warm_beige: {
    gradientFrom: "#fffbeb",
    gradientMid: "#fff7ed",
    gradientTo: "#ffffff",
    gradientAngle: 120,
    titleColor: "#78350f",
    textColor: "#78716c",
    buttonColor: "#c2410c",
    buttonTextColor: "#ffffff",
    badgeColor: "#ffedd5",
    badgeTextColor: "#9a3412",
    borderColor: "rgba(234, 88, 12, 0.18)",
    backgroundColor: "",
  },
  purple_yellow: {
    gradientFrom: "#4c1d95",
    gradientTo: "#6d28d9",
    titleColor: "#ffffff",
    textColor: "rgba(255, 255, 255, 0.9)",
    buttonColor: "#facc15",
    buttonTextColor: "#4c1d95",
    badgeColor: "#facc15",
    badgeTextColor: "#4c1d95",
    borderColor: "rgba(250, 204, 21, 0.45)",
    backgroundColor: "",
  },
  blue_white: {
    gradientFrom: "#1e3a8a",
    gradientTo: "#2563eb",
    titleColor: "#ffffff",
    textColor: "rgba(255, 255, 255, 0.92)",
    buttonColor: "#ffffff",
    buttonTextColor: "#1e40af",
    badgeColor: "rgba(255, 255, 255, 0.2)",
    badgeTextColor: "#ffffff",
    borderColor: "rgba(147, 197, 253, 0.45)",
    backgroundColor: "",
  },
  darkblue_cyan: {
    gradientFrom: "#0b1220",
    gradientMid: "#1e3a8a",
    gradientTo: "#0369a1",
    gradientAngle: 102,
    titleColor: "#f0f9ff",
    textColor: "rgba(224, 242, 254, 0.92)",
    buttonColor: "#22d3ee",
    buttonTextColor: "#0f172a",
    badgeColor: "rgba(34, 211, 238, 0.95)",
    badgeTextColor: "#0c4a6e",
    borderColor: "rgba(34, 211, 238, 0.4)",
    backgroundColor: "",
  },
  green_nature: {
    gradientFrom: "#ecfdf5",
    gradientTo: "#f0fdf4",
    titleColor: "#064e3b",
    textColor: "#4b5563",
    buttonColor: "#059669",
    buttonTextColor: "#ffffff",
    badgeColor: "rgba(16, 185, 129, 0.2)",
    borderColor: "rgba(5, 150, 105, 0.25)",
    backgroundColor: "",
  },
  red_sale: {
    gradientFrom: "#fef2f2",
    gradientTo: "#fff1f2",
    titleColor: "#7f1d1d",
    textColor: "#57534e",
    buttonColor: "#dc2626",
    buttonTextColor: "#ffffff",
    badgeColor: "rgba(220, 38, 38, 0.15)",
    borderColor: "rgba(220, 38, 38, 0.22)",
    backgroundColor: "",
  },
  orange_bright: {
    gradientFrom: "#fff7ed",
    gradientTo: "#fffbeb",
    titleColor: "#9a3412",
    textColor: "#57534e",
    buttonColor: "#ea580c",
    buttonTextColor: "#ffffff",
    badgeColor: "rgba(234, 88, 12, 0.15)",
    borderColor: "rgba(251, 146, 60, 0.28)",
    backgroundColor: "",
  },
  black_gold: {
    gradientFrom: "#171717",
    gradientTo: "#292524",
    titleColor: "#fef3c7",
    textColor: "#e7e5e4",
    buttonColor: "#d97706",
    buttonTextColor: "#1c1917",
    badgeColor: "rgba(217, 119, 6, 0.25)",
    borderColor: "rgba(245, 158, 11, 0.35)",
    backgroundColor: "",
  },
});

/** @type {Record<string, OfferSurface>} */
const COLOR_PRESET_SURFACES = {};
for (const k of COLOR_PRESET_KEYS) {
  const p = COLOR_PRESET_DB_PATCH[k];
  if (!p) continue;
  const angle = p.gradientAngle != null ? Number(p.gradientAngle) : 145;
  const mid = p.gradientMid != null ? p.gradientMid : null;
  const gradientCss =
    mid != null
      ? `linear-gradient(${angle}deg, ${p.gradientFrom} 0%, ${mid} 48%, ${p.gradientTo} 100%)`
      : `linear-gradient(${angle}deg, ${p.gradientFrom} 0%, ${p.gradientTo} 100%)`;
  COLOR_PRESET_SURFACES[k] = {
    gradientCss,
    titleColor: p.titleColor,
    textColor: p.textColor,
    btnBg: p.buttonColor,
    btnFg: p.buttonTextColor,
    badgeBg: p.badgeColor,
    badgeFg: p.badgeTextColor != null ? p.badgeTextColor : p.titleColor,
    cardBorder: p.borderColor,
  };
}

/**
 * @param {import("../../types/ad.js").Ad} ad
 * @returns {OfferSurface}
 */
export function resolvePublicBannerSurface(ad) {
  const g1 = ad?.gradientFrom;
  const g2 = ad?.gradientTo;
  if (g1 && g2) {
    const meta = getBannerMetaFromTexts(ad?.texts);
    return {
      gradientCss: `linear-gradient(145deg, ${g1} 0%, ${g2} 100%)`,
      titleColor: ad.titleColor || "#ffffff",
      textColor: ad.textColor || "rgba(255, 255, 255, 0.9)",
      btnBg: ad.buttonColor || "#ffffff",
      btnFg: ad.buttonTextColor || "#1e40af",
      badgeBg: ad.badgeColor || "rgba(255, 255, 255, 0.2)",
      badgeFg: meta.badgeTextColor || ad.titleColor || "#ffffff",
      cardBorder: ad.borderColor || "rgba(147, 197, 253, 0.35)",
    };
  }

  const meta = getBannerMetaFromTexts(ad?.texts);
  const cp = meta.colorPreset && String(meta.colorPreset).trim().toLowerCase();
  if (cp && COLOR_PRESET_SURFACES[cp]) return COLOR_PRESET_SURFACES[cp];

  const tp = ad?.themePreset != null ? String(ad.themePreset).toLowerCase() : "";
  if (LEGACY_THEME_COLORS.includes(/** @type {any} */ (tp)) && PRESETS[tp]) return PRESETS[tp];

  return resolveOfferSurface(ad);
}

/**
 * Surface + premium accent tokens for banner renderer.
 * @param {import("../../types/ad.js").Ad} ad
 */
export function resolvePremiumBannerSurface(ad) {
  const base = resolvePublicBannerSurface(ad);
  const meta = getBannerMetaFromTexts(ad?.texts);
  const cp = meta.colorPreset && String(meta.colorPreset).trim().toLowerCase();
  const presetExtras = (cp && PREMIUM_THEME_EXTRAS[cp]) || PREMIUM_THEME_EXTRAS.blue_white || {};
  const extras = {
    ...presetExtras,
    ...(meta.saleStickerBg ? { saleStickerBg: meta.saleStickerBg, saleStickerFg: meta.saleStickerFg || "#fff" } : {}),
    ...(meta.badgeTextColor ? { badgeFg: meta.badgeTextColor } : {}),
    ...(meta.subtitleColor ? { accentColor: meta.subtitleColor } : {}),
    ...(meta.discountLineColor ? { accentCyan: meta.discountLineColor } : {}),
  };
  return {
    ...base,
    ...extras,
    companyNameColor: meta.companyNameColor || base.textColor,
    subtitleColor: meta.subtitleColor || extras.accentColor,
    descriptionColor: meta.descriptionColor || base.textColor,
    discountLineColor: meta.discountLineColor || extras.accentCyan || base.btnBg,
  };
}

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
