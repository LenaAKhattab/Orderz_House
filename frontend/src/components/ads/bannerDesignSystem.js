/**
 * Banner templates (structure) + themes (colors). Admin + public.
 */

import { isCornerAdAsset, resolveAdAssetUrl } from "./adVisualAssets";
import { ADMIN_COLOR_PRESET_KEYS, ADMIN_COLOR_PRESET_LABELS_AR } from "./bannerColorPresets";

export const IMAGE_MODES = /** @type {const} */ ([
  "none",
  "preset",
  "custom_main",
  "custom_bg",
  "preset_custom_bg",
]);

/** Canonical template ids stored in `theme_preset`. */
export const BANNER_TEMPLATE_IDS = /** @type {const} */ ([
  "classic_split",
  "product_focus",
  "luxury_center",
  "ribbon_strip",
  "business_partner",
  "minimal_clean",
]);

/** @deprecated Stored on old ads — resolved at read time. */
export const LEGACY_BANNER_TEMPLATE_MAP = Object.freeze({
  banner_1: "classic_split",
  banner_2: "product_focus",
  banner_3: "luxury_center",
  banner_4: "ribbon_strip",
  banner_5: "business_partner",
});

/** @typedef {typeof BANNER_TEMPLATE_IDS[number]} BannerTemplateId */
/** @typedef {typeof IMAGE_MODES[number]} ImageMode */

export const BANNER_TEMPLATES_CONFIG = [
  {
    id: "classic_split",
    label: "عرض كلاسيكي",
    hint: "نص يمين + صورة يسار — عروض عامة",
    structure: "classic_split",
    defaultAsset: "gold_gifts",
    defaultColorPreset: "cream_navy",
    imageModes: ["none", "preset", "custom_main", "custom_bg", "preset_custom_bg"],
    themes: [...ADMIN_COLOR_PRESET_KEYS],
  },
  {
    id: "product_focus",
    label: "تركيز المنتج",
    hint: "صورة كبيرة + خصم على الصورة",
    structure: "product_focus",
    defaultAsset: "red_gift",
    defaultColorPreset: "blue_white",
    imageModes: ["preset", "custom_main", "custom_bg", "preset_custom_bg"],
    themes: [...ADMIN_COLOR_PRESET_KEYS],
  },
  {
    id: "luxury_center",
    label: "عرض فاخر",
    hint: "عنوان مركزي — إحساس راقٍ",
    structure: "luxury_center",
    defaultAsset: "gold_gifts",
    defaultColorPreset: "navy_gold",
    imageModes: ["none", "preset", "custom_main", "custom_bg", "preset_custom_bg"],
    themes: [...ADMIN_COLOR_PRESET_KEYS],
  },
  {
    id: "ribbon_strip",
    label: "شريط إعلان",
    hint: "شريط أفقي — تنبيه سريع",
    structure: "ribbon_strip",
    defaultAsset: "gold_confetti",
    defaultColorPreset: "red_sale",
    imageModes: ["none", "preset", "custom_main", "custom_bg"],
    themes: [...ADMIN_COLOR_PRESET_KEYS],
  },
  {
    id: "business_partner",
    label: "ترويج أعمال",
    hint: "شراكة / أعمال — صورة مصافحة",
    structure: "business_partner",
    defaultAsset: "handshake",
    defaultColorPreset: "warm_beige",
    imageModes: ["preset", "custom_main", "custom_bg", "preset_custom_bg"],
    themes: [...ADMIN_COLOR_PRESET_KEYS],
  },
  {
    id: "minimal_clean",
    label: "بسيط ونظيف",
    hint: "عنوان كبير — بدون زخرفة ثقيلة",
    structure: "minimal_clean",
    defaultAsset: null,
    defaultColorPreset: "blue_white",
    imageModes: ["none", "preset", "custom_main", "custom_bg"],
    themes: [...ADMIN_COLOR_PRESET_KEYS],
  },
];

/** Extra tokens per color preset — merged in renderer. */
export const PREMIUM_THEME_EXTRAS = Object.freeze({
  cream_navy: {
    accentColor: "#8b7cf7",
    accentCyan: "#0ea5e9",
    topBadgeBg: "#f5ebe0",
    topBadgeFg: "#78350f",
    saleStickerBg: "#fdba74",
    saleStickerFg: "#431407",
    decorOpacity: 0.55,
  },
  soft_lavender: {
    accentColor: "#a78bfa",
    accentCyan: "#38bdf8",
    topBadgeBg: "#ede9fe",
    topBadgeFg: "#5b21b6",
    saleStickerBg: "#c4b5fd",
    saleStickerFg: "#4c1d95",
    decorOpacity: 0.5,
  },
  pastel_blue_violet: {
    accentColor: "#818cf8",
    accentCyan: "#22d3ee",
    topBadgeBg: "#e0f2fe",
    topBadgeFg: "#0369a1",
    saleStickerBg: "#fda4af",
    saleStickerFg: "#881337",
    decorOpacity: 0.48,
  },
  navy_gold: {
    accentColor: "#fbbf24",
    accentCyan: "#fcd34d",
    topBadgeBg: "rgba(251, 191, 36, 0.2)",
    topBadgeFg: "#fef3c7",
    saleStickerBg: "#d97706",
    saleStickerFg: "#1c1917",
    decorOpacity: 0.35,
  },
  warm_beige: {
    accentColor: "#ea580c",
    accentCyan: "#0d9488",
    topBadgeBg: "#ffedd5",
    topBadgeFg: "#9a3412",
    saleStickerBg: "#fb923c",
    saleStickerFg: "#431407",
    decorOpacity: 0.5,
  },
  purple_yellow: {
    accentColor: "#a855f7",
    accentCyan: "#eab308",
    topBadgeBg: "#f3e8ff",
    topBadgeFg: "#6b21a8",
    saleStickerBg: "#fde047",
    saleStickerFg: "#713f12",
    decorOpacity: 0.48,
  },
  blue_white: {
    accentColor: "#2563eb",
    accentCyan: "#0ea5e9",
    topBadgeBg: "#dbeafe",
    topBadgeFg: "#1e40af",
    saleStickerBg: "#38bdf8",
    saleStickerFg: "#0c4a6e",
    decorOpacity: 0.45,
  },
  darkblue_cyan: {
    accentColor: "#22d3ee",
    accentCyan: "#67e8f9",
    topBadgeBg: "rgba(34, 211, 238, 0.15)",
    topBadgeFg: "#ecfeff",
    saleStickerBg: "#0891b2",
    saleStickerFg: "#f0fdfa",
    decorOpacity: 0.4,
  },
  green_nature: {
    accentColor: "#16a34a",
    accentCyan: "#14b8a6",
    topBadgeBg: "#dcfce7",
    topBadgeFg: "#166534",
    saleStickerBg: "#4ade80",
    saleStickerFg: "#14532d",
    decorOpacity: 0.48,
  },
  red_sale: {
    accentColor: "#dc2626",
    accentCyan: "#f97316",
    topBadgeBg: "#fee2e2",
    topBadgeFg: "#991b1b",
    saleStickerBg: "#ef4444",
    saleStickerFg: "#fff",
    decorOpacity: 0.42,
  },
  orange_bright: {
    accentColor: "#ea580c",
    accentCyan: "#f59e0b",
    topBadgeBg: "#ffedd5",
    topBadgeFg: "#9a3412",
    saleStickerBg: "#fb923c",
    saleStickerFg: "#431407",
    decorOpacity: 0.45,
  },
  black_gold: {
    accentColor: "#fbbf24",
    accentCyan: "#fcd34d",
    topBadgeBg: "rgba(251, 191, 36, 0.15)",
    topBadgeFg: "#fef3c7",
    saleStickerBg: "#ca8a04",
    saleStickerFg: "#1c1917",
    decorOpacity: 0.32,
  },
});

/**
 * @param {string | null | undefined} id
 * @returns {BannerTemplateId}
 */
/** Single public/admin layout — legacy template ids map here at read time. */
export function normalizeBannerTemplateId(_id) {
  return "classic_split";
}

/**
 * @param {string} id
 */
export function getTemplateConfig(id) {
  const canonical = normalizeBannerTemplateId(id);
  return BANNER_TEMPLATES_CONFIG.find((c) => c.id === canonical) || BANNER_TEMPLATES_CONFIG[0];
}

/**
 * @param {string} templateId
 * @param {string} [colorPreset]
 */
export function getThemesForTemplate(_templateId, colorPreset) {
  const active = (colorPreset ?? "").toString().trim();
  return ADMIN_COLOR_PRESET_KEYS.map((value) => ({
    value,
    label: ADMIN_COLOR_PRESET_LABELS_AR[value] || THEME_LABELS_AR[value] || value,
    isActive: active === value,
  }));
}

export const THEME_LABELS_AR = Object.freeze({
  ...ADMIN_COLOR_PRESET_LABELS_AR,
  soft_lavender: "لافندر ناعم",
  pastel_blue_violet: "أزرق بنفسجي",
  warm_beige: "بيج دافئ",
  purple_yellow: "بنفسجي / أصفر",
  darkblue_cyan: "أزرق داكن / سماوي",
  orange_bright: "برتقالي",
  black_gold: "أسود / ذهبي",
});

export const IMAGE_MODE_LABELS_AR = Object.freeze({
  none: "بدون صورة",
  preset: "صورة جاهزة داخل الإعلان",
  custom_main: "صورة مخصصة كرئيسية",
  custom_bg: "صورة مخصصة كخلفية",
  preset_custom_bg: "صورة جاهزة + خلفية مخصصة",
});

/**
 * @param {import("./bannerAdMeta.js").BannerMeta} meta
 * @param {import("../../types/ad.js").Ad} ad
 */
function normalizeImageMode(meta, ad) {
  let mode = meta.imageMode != null ? String(meta.imageMode).trim().toLowerCase() : "";
  if (mode === "foreground") return meta.selectedAssetKey ? "preset" : "custom_main";
  if (mode === "background") return "custom_bg";
  if (mode === "both") return meta.selectedAssetKey ? "preset_custom_bg" : "custom_main";

  if (IMAGE_MODES.includes(/** @type {any} */ (mode))) return mode;

  const hasAsset = Boolean(meta.selectedAssetKey?.trim());
  const hasFg = Boolean(ad?.images?.[0]?.url);
  const hasBg = Boolean(meta.backgroundImageUrl?.trim());
  if (hasAsset && hasBg) return "preset_custom_bg";
  if (hasAsset) return "preset";
  if (hasFg && hasBg) return "preset_custom_bg";
  if (hasBg) return "custom_bg";
  if (hasFg) return "custom_main";
  return "none";
}

/**
 * @param {import("../../types/ad.js").Ad} ad
 * @param {import("./bannerAdMeta.js").BannerMeta} meta
 */
export function resolveImagePresentation(ad, meta) {
  const mode = normalizeImageMode(meta, ad);
  const assetUrl = resolveAdAssetUrl(meta.selectedAssetKey);
  const customMain = ad?.images?.[0] || null;
  const bgRaw = meta.backgroundImageUrl != null ? String(meta.backgroundImageUrl).trim() : "";
  const imageFit = meta.imageFit === "cover" ? "cover" : "contain";

  let foreground = null;
  if (mode === "preset" || mode === "preset_custom_bg") {
    if (assetUrl && !isCornerAdAsset(meta.selectedAssetKey)) {
      foreground = { id: "preset-asset", url: assetUrl, alt: "" };
    }
  } else if (mode === "custom_main") {
    foreground = customMain;
  }

  const showBackground = mode === "custom_bg" || mode === "preset_custom_bg";
  const backgroundUrl = showBackground && bgRaw ? bgRaw : null;

  return {
    mode,
    foreground,
    backgroundUrl,
    imageFit,
    showForeground: Boolean(foreground?.url),
    showBackground: Boolean(backgroundUrl),
  };
}

/**
 * @param {string} templateId
 */
export function defaultColorPresetForTemplate(templateId) {
  return getTemplateConfig(templateId).defaultColorPreset || "cream_navy";
}

/**
 * @param {string} templateId
 * @returns {string | null}
 */
export function defaultAssetForTemplate(templateId) {
  const cfg = getTemplateConfig(templateId);
  return cfg.defaultAsset || null;
}
