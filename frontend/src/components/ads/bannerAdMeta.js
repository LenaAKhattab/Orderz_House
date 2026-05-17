import { normalizeBannerTemplateId } from "./bannerDesignSystem";

/** @typedef {{ colorPreset?: string; salePercent?: string | number; phone?: string; whatsapp?: string; companyName?: string; logoUrl?: string; discountText?: string; openMode?: string; priority?: number; internalNotes?: string; imageMode?: string; backgroundImageUrl?: string; selectedAssetKey?: string; imageFit?: string; showTopBadge?: boolean; showDiscountBadge?: boolean; companyNameColor?: string; subtitleColor?: string; descriptionColor?: string; discountLineColor?: string }} BannerMeta */

export const BANNER_META_ID = "banner_meta";

export const OPEN_MODES = /** @type {const} */ (["NEW_TAB", "SAME_TAB", "INTERNAL_ROUTE", "WHATSAPP"]);

export const PRIORITY_OPTIONS = /** @type {const} */ ([
  { value: 0, label: "عادية" },
  { value: 50, label: "مميزة" },
  { value: 100, label: "عالية" },
]);

/** Stored in `theme_preset` — layout template for public cards. */
export const BANNER_TEMPLATES = /** @type {const} */ ([
  "classic_split",
  "product_focus",
  "luxury_center",
  "ribbon_strip",
  "business_partner",
  "minimal_clean",
]);

/** @deprecated Legacy ids still in DB */
export const LEGACY_BANNER_IDS = /** @type {const} */ (["banner_1", "banner_2", "banner_3", "banner_4", "banner_5"]);

/** Legacy color-only presets (before banner templates). */
export const LEGACY_THEME_COLORS = /** @type {const} */ (["purple", "green", "orange", "blue"]);

export { ADMIN_COLOR_PRESET_KEYS, ADMIN_COLOR_PRESET_LABELS_AR } from "./bannerColorPresets";

/** Keys for color packs (stored in texts row `banner_meta.colorPreset`). */
export const COLOR_PRESET_KEYS = /** @type {const} */ ([
  "cream_navy",
  "soft_lavender",
  "pastel_blue_violet",
  "navy_gold",
  "warm_beige",
  "purple_yellow",
  "blue_white",
  "darkblue_cyan",
  "green_nature",
  "red_sale",
  "orange_bright",
  "black_gold",
]);

export const IMAGE_MODES = /** @type {const} */ ([
  "none",
  "preset",
  "custom_main",
  "custom_bg",
  "preset_custom_bg",
  "foreground",
  "background",
  "both",
]);

const PHONE_ONLY = /^[\d\s+().-]{0,40}$/;

/**
 * @param {unknown} texts
 * @returns {BannerMeta}
 */
export function getBannerMetaFromTexts(texts) {
  if (!Array.isArray(texts)) return {};
  const row = texts.find((t) => t && typeof t === "object" && String(t.id) === BANNER_META_ID);
  if (!row || typeof row !== "object") return {};
  return {
    colorPreset: row.colorPreset != null ? String(row.colorPreset) : "",
    salePercent: row.salePercent,
    phone: row.phone != null ? String(row.phone) : "",
    whatsapp: row.whatsapp != null ? String(row.whatsapp) : "",
    companyName: row.companyName != null ? String(row.companyName) : "",
    logoUrl: row.logoUrl != null ? String(row.logoUrl) : "",
    discountText: row.discountText != null ? String(row.discountText) : "",
    openMode: row.openMode != null ? String(row.openMode) : "",
    priority: row.priority !== undefined && row.priority !== null ? Number(row.priority) : 0,
    internalNotes: row.internalNotes != null ? String(row.internalNotes) : "",
    imageMode: row.imageMode != null ? String(row.imageMode) : "",
    backgroundImageUrl: row.backgroundImageUrl != null ? String(row.backgroundImageUrl) : "",
    selectedAssetKey: row.selectedAssetKey != null ? String(row.selectedAssetKey) : "",
    imageFit: row.imageFit != null ? String(row.imageFit) : "contain",
    showTopBadge: row.showTopBadge !== false,
    showDiscountBadge: row.showDiscountBadge !== false,
    saleStickerBg: row.saleStickerBg != null ? String(row.saleStickerBg) : "",
    saleStickerFg: row.saleStickerFg != null ? String(row.saleStickerFg) : "",
    badgeTextColor: row.badgeTextColor != null ? String(row.badgeTextColor) : "",
    companyNameColor: row.companyNameColor != null ? String(row.companyNameColor) : "",
    subtitleColor: row.subtitleColor != null ? String(row.subtitleColor) : "",
    descriptionColor: row.descriptionColor != null ? String(row.descriptionColor) : "",
    discountLineColor: row.discountLineColor != null ? String(row.discountLineColor) : "",
  };
}

/**
 * @param {string | number | null | undefined} n
 * @returns {number | null}
 */
export function parseSalePercent(n) {
  if (n == null || n === "") return null;
  const v = Number.parseInt(String(n).trim(), 10);
  if (!Number.isFinite(v)) return null;
  return Math.min(100, Math.max(0, v));
}

/**
 * @param {import("../../types/ad.js").Ad} ad
 * @returns {import("./bannerDesignSystem.js").BannerTemplateId}
 */
export function resolveBannerTemplateId(_ad) {
  return normalizeBannerTemplateId(null);
}

/**
 * Digits only for wa.me
 * @param {string} raw
 */
export function digitsForWhatsApp(raw) {
  return String(raw || "").replace(/\D/g, "");
}

/**
 * Safe WhatsApp URL or null.
 * @param {string} raw
 */
export function buildWhatsAppHref(raw) {
  const d = digitsForWhatsApp(raw);
  if (!d || d.length < 6) return null;
  return `https://wa.me/${d}`;
}

/**
 * @param {string} s
 */
export function isSafePhoneLike(s) {
  if (s == null || !String(s).trim()) return true;
  return PHONE_ONLY.test(String(s).trim());
}

/**
 * @param {number | string | null | undefined} p
 */
export function priorityLabel(p) {
  const n = Number(p);
  const row = PRIORITY_OPTIONS.find((o) => o.value === n);
  return row ? row.label : "عادية";
}
