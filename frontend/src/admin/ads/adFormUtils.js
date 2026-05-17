/** Fixed horizontal banner — admin edits content/colors only. */

import {

  BANNER_META_ID,

  LEGACY_THEME_COLORS,

  OPEN_MODES,

  buildWhatsAppHref,

  getBannerMetaFromTexts,

} from "../../components/ads/bannerAdMeta";

import { COLOR_PRESET_DB_PATCH } from "../../components/ads/homeOffersTheme";

import { PREMIUM_THEME_EXTRAS } from "../../components/ads/bannerDesignSystem";



export const FIXED_BANNER_TEMPLATE = "classic_split";



const DEFAULT_PATCH = COLOR_PRESET_DB_PATCH.blue_white;

const DEFAULT_EXTRAS = PREMIUM_THEME_EXTRAS.blue_white || {};



const LAYOUT_DEFAULTS = {

  layoutType: "image_top",

  textAlign: "right",

  imagePosition: "top",

  buttonPosition: "bottom",

};



/**

 * @param {string | undefined} _tp

 */

function normalizeTemplateForForm(_tp) {

  return FIXED_BANNER_TEMPLATE;

}



/** @param {string} legacy */

function legacyThemeToColorPreset(legacy) {

  const k = String(legacy || "").toLowerCase();

  if (k === "purple") return "purple_yellow";

  if (k === "green") return "green_nature";

  if (k === "orange") return "orange_bright";

  if (k === "blue") return "blue_white";

  return "blue_white";

}



/** @param {unknown[]} texts */

function textsWithoutBannerMeta(texts) {

  if (!Array.isArray(texts)) return [];

  return texts.filter((t) => !(t && typeof t === "object" && String(t.id) === BANNER_META_ID));

}



/**

 * @param {object} f

 */

function resolveCtaFromOpenMode(f) {

  const openMode = f.openMode != null ? String(f.openMode).trim().toUpperCase() : "NEW_TAB";

  const mode = OPEN_MODES.includes(/** @type {any} */ (openMode)) ? openMode : "NEW_TAB";



  let ctaUrl = f.ctaUrl != null ? String(f.ctaUrl).trim() : "";

  let openInNewTab = Boolean(f.openInNewTab);



  if (mode === "WHATSAPP") {

    const wa = buildWhatsAppHref(f.whatsapp);

    ctaUrl = wa || "";

    openInNewTab = true;

  } else if (mode === "INTERNAL_ROUTE") {

    openInNewTab = false;

  } else if (mode === "SAME_TAB") {

    openInNewTab = false;

  } else {

    openInNewTab = true;

  }



  return { ctaUrl: ctaUrl || null, openInNewTab, openMode: mode };

}



/** @param {string | null | undefined} v */

function strOrNull(v) {

  if (v == null) return null;

  const t = String(v).trim();

  return t ? t : null;

}



/** Derive banner image mode from preset asset + optional background URL. */

export function resolveAdImageMode(f) {

  const hasBg = Boolean(strOrNull(f?.backgroundImageUrl));

  const hasPreset = Boolean(strOrNull(f?.selectedAssetKey));

  if (hasBg && hasPreset) return "preset_custom_bg";

  if (hasBg) return "custom_bg";

  if (hasPreset) return "preset";

  return "none";

}



/** Prefer form value, then preset patch, then default patch. */

function colorField(formVal, presetVal, defaultVal) {

  const f = strOrNull(formVal);

  if (f) return f;

  const p = strOrNull(presetVal);

  if (p) return p;

  return strOrNull(defaultVal);

}



export function emptyAdForm() {

  return {

    title: "",

    subtitle: "",

    description: "",

    companyName: "",

    badgeText: "",

    badgeColor: DEFAULT_PATCH.badgeColor || "",

    badgeTextColor: DEFAULT_PATCH.badgeTextColor || "",

    texts: [],

    images: [],

    logoUrl: "",

    ctaText: "",

    ctaUrl: "",

    openMode: "NEW_TAB",

    secondaryCtaText: "",

    secondaryCtaUrl: "",

    openInNewTab: true,

    backgroundColor: DEFAULT_PATCH.backgroundColor || "",

    gradientFrom: DEFAULT_PATCH.gradientFrom || "",

    gradientTo: DEFAULT_PATCH.gradientTo || "",

    titleColor: DEFAULT_PATCH.titleColor || "",

    textColor: DEFAULT_PATCH.textColor || "",

    buttonColor: DEFAULT_PATCH.buttonColor || "",

    buttonTextColor: DEFAULT_PATCH.buttonTextColor || "",

    borderColor: DEFAULT_PATCH.borderColor || "",

    saleStickerBg: DEFAULT_EXTRAS.saleStickerBg || "",

    saleStickerFg: DEFAULT_EXTRAS.saleStickerFg || "",

    companyNameColor: "",

    subtitleColor: "",

    descriptionColor: "",

    discountLineColor: "",

    ...LAYOUT_DEFAULTS,

    isActive: false,

    isSticky: true,

    isClickableCard: false,

    placement: "home_right_panel",

    sortOrder: 0,

    isFeatured: false,

    priority: 0,

    themePreset: FIXED_BANNER_TEMPLATE,

    colorPreset: "blue_white",

    imageMode: "preset",

    selectedAssetKey: "gold_gifts",

    imageFit: "contain",

    backgroundImageUrl: "",

    showTopBadge: true,

    showDiscountBadge: true,

    salePercent: "",

    discountText: "",

    phone: "",

    whatsapp: "",

    internalNotes: "",

    adminNote: "",

    startDate: "",

    endDate: "",

  };

}



export function mapApiAdToForm(ad) {

  if (!ad) return emptyAdForm();

  const dt = (iso) => {

    if (!iso) return "";

    const d = new Date(iso);

    if (Number.isNaN(d.getTime())) return "";

    const p = (n) => String(n).padStart(2, "0");

    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;

  };



  const meta = getBannerMetaFromTexts(ad.texts);

  const flatCompany = ad.companyName != null ? String(ad.companyName) : meta.companyName || "";

  const flatLogo = ad.logoUrl != null ? String(ad.logoUrl) : meta.logoUrl || "";

  const flatDiscount = ad.discountText != null ? String(ad.discountText) : meta.discountText || "";

  const flatOpenMode = ad.openMode != null ? String(ad.openMode) : meta.openMode || "NEW_TAB";

  const flatPriority = ad.priority !== undefined && ad.priority !== null ? Number(ad.priority) : meta.priority ?? 0;

  const flatInternal = ad.internalNotes != null ? String(ad.internalNotes) : meta.internalNotes || "";



  const rawTheme = ad.themePreset != null ? String(ad.themePreset).trim().toLowerCase() : "";

  let colorPreset = meta.colorPreset && String(meta.colorPreset).trim() ? String(meta.colorPreset).trim() : "blue_white";

  if (LEGACY_THEME_COLORS.includes(/** @type {any} */ (rawTheme))) {

    colorPreset = legacyThemeToColorPreset(rawTheme);

  }



  const cpPatch = COLOR_PRESET_DB_PATCH[colorPreset] || DEFAULT_PATCH;

  const cpExtras = PREMIUM_THEME_EXTRAS[colorPreset] || DEFAULT_EXTRAS;



  let openMode = flatOpenMode && OPEN_MODES.includes(/** @type {any} */ (flatOpenMode.toUpperCase()))

    ? flatOpenMode.toUpperCase()

    : "NEW_TAB";

  if (!flatOpenMode && ad.ctaUrl && String(ad.ctaUrl).includes("wa.me")) {

    openMode = "WHATSAPP";

  } else if (!flatOpenMode && ad.ctaUrl && String(ad.ctaUrl).trim().startsWith("/")) {

    openMode = "INTERNAL_ROUTE";

  } else if (!flatOpenMode && ad.openInNewTab === false) {

    openMode = "SAME_TAB";

  }



  return {

    ...emptyAdForm(),

    ...ad,

    texts: textsWithoutBannerMeta(ad.texts),

    images: (ad.images || []).slice(0, 1),

    sortOrder: Number(ad.sortOrder) || 0,

    startDate: dt(ad.startDate),

    endDate: dt(ad.endDate),

    placement: ad.placement || "home_right_panel",

    isFeatured: Boolean(ad.isFeatured),

    themePreset: FIXED_BANNER_TEMPLATE,

    colorPreset,

    gradientFrom: ad.gradientFrom || cpPatch.gradientFrom || "",

    gradientTo: ad.gradientTo || cpPatch.gradientTo || "",

    titleColor: ad.titleColor || cpPatch.titleColor || "",

    textColor: ad.textColor || cpPatch.textColor || "",

    buttonColor: ad.buttonColor || cpPatch.buttonColor || "",

    buttonTextColor: ad.buttonTextColor || cpPatch.buttonTextColor || "",

    badgeColor: ad.badgeColor || cpPatch.badgeColor || "",

    badgeTextColor: meta.badgeTextColor || cpPatch.badgeTextColor || "",

    borderColor: ad.borderColor || cpPatch.borderColor || "",

    backgroundColor: ad.backgroundColor || cpPatch.backgroundColor || "",

    saleStickerBg: meta.saleStickerBg || cpExtras.saleStickerBg || "",

    saleStickerFg: meta.saleStickerFg || cpExtras.saleStickerFg || "",

    companyNameColor: meta.companyNameColor || ad.textColor || cpPatch.textColor || "",

    subtitleColor: meta.subtitleColor || cpExtras.accentColor || "",

    descriptionColor: meta.descriptionColor || ad.textColor || cpPatch.textColor || "",

    discountLineColor: meta.discountLineColor || cpExtras.accentCyan || "",

    companyName: flatCompany,

    logoUrl: flatLogo,

    discountText: flatDiscount,

    openMode,

    priority: [0, 50, 100].includes(flatPriority) ? flatPriority : 0,

    salePercent: meta.salePercent != null && meta.salePercent !== "" ? String(meta.salePercent) : "",

    phone: meta.phone != null ? String(meta.phone) : ad.phone != null ? String(ad.phone) : "",

    whatsapp: meta.whatsapp != null ? String(meta.whatsapp) : ad.whatsapp != null ? String(ad.whatsapp) : "",

    internalNotes: flatInternal,

    adminNote: "",

    imageMode: meta.imageMode && String(meta.imageMode).trim() ? String(meta.imageMode).trim().toLowerCase() : "preset",

    selectedAssetKey: meta.selectedAssetKey != null ? String(meta.selectedAssetKey) : "gold_gifts",

    imageFit: meta.imageFit === "cover" ? "cover" : "contain",

    backgroundImageUrl: meta.backgroundImageUrl != null ? String(meta.backgroundImageUrl) : "",

    showTopBadge: meta.showTopBadge !== false,

    showDiscountBadge: meta.showDiscountBadge !== false,

  };

}



/**

 * @param {object} f

 * @param {{ publish?: boolean }} [opts]

 */

export function buildPayloadFromForm(f, opts = {}) {

  const toIsoOrNull = (v) => {

    if (!v || !String(v).trim()) return null;

    const d = new Date(v);

    return Number.isNaN(d.getTime()) ? null : d.toISOString();

  };



  const start = f.startDate && String(f.startDate).trim() ? toIsoOrNull(f.startDate) : null;

  const end = f.endDate && String(f.endDate).trim() ? toIsoOrNull(f.endDate) : null;



  const cpKey = f.colorPreset != null && String(f.colorPreset).trim() ? String(f.colorPreset).trim().toLowerCase() : "blue_white";

  const colorPatch = COLOR_PRESET_DB_PATCH[cpKey] || DEFAULT_PATCH;



  const saleRaw = f.salePercent != null ? String(f.salePercent).trim() : "";

  let saleNum = null;

  if (saleRaw !== "") {

    const n = Number.parseInt(saleRaw, 10);

    if (Number.isFinite(n)) saleNum = Math.min(100, Math.max(0, n));

  }



  const phoneTrim = f.phone != null ? String(f.phone).trim() : "";

  const waTrim = f.whatsapp != null ? String(f.whatsapp).trim() : "";

  const priority = [0, 50, 100].includes(Number(f.priority)) ? Number(f.priority) : 0;

  const { ctaUrl, openInNewTab, openMode } = resolveCtaFromOpenMode(f);



  const metaRow = {

    id: BANNER_META_ID,

    content: "",

    colorPreset: cpKey,

    openMode,

    priority,

    ...(saleNum !== null ? { salePercent: saleNum } : {}),

    ...(strOrNull(f.discountText) ? { discountText: String(f.discountText).trim() } : {}),

    ...(strOrNull(f.companyName) ? { companyName: String(f.companyName).trim() } : {}),

    ...(strOrNull(f.logoUrl) ? { logoUrl: String(f.logoUrl).trim() } : {}),

    ...(phoneTrim ? { phone: phoneTrim } : {}),

    ...(waTrim ? { whatsapp: waTrim } : {}),

    ...(strOrNull(f.internalNotes) ? { internalNotes: String(f.internalNotes).trim() } : {}),

    ...(resolveAdImageMode(f) !== "none" ? { imageMode: resolveAdImageMode(f) } : {}),

    ...(strOrNull(f.selectedAssetKey) ? { selectedAssetKey: String(f.selectedAssetKey).trim() } : {}),

    ...(f.imageFit === "cover" ? { imageFit: "cover" } : { imageFit: "contain" }),

    ...(strOrNull(f.backgroundImageUrl) ? { backgroundImageUrl: String(f.backgroundImageUrl).trim() } : {}),

    ...(strOrNull(f.saleStickerBg) ? { saleStickerBg: String(f.saleStickerBg).trim() } : {}),

    ...(strOrNull(f.saleStickerFg) ? { saleStickerFg: String(f.saleStickerFg).trim() } : {}),

    ...(strOrNull(f.badgeTextColor) ? { badgeTextColor: String(f.badgeTextColor).trim() } : {}),

    ...(strOrNull(f.companyNameColor) ? { companyNameColor: String(f.companyNameColor).trim() } : {}),

    ...(strOrNull(f.subtitleColor) ? { subtitleColor: String(f.subtitleColor).trim() } : {}),

    ...(strOrNull(f.descriptionColor) ? { descriptionColor: String(f.descriptionColor).trim() } : {}),

    ...(strOrNull(f.discountLineColor) ? { discountLineColor: String(f.discountLineColor).trim() } : {}),

    showTopBadge: f.showTopBadge !== false,

    showDiscountBadge: f.showDiscountBadge !== false,

  };



  const otherTexts = textsWithoutBannerMeta(Array.isArray(f.texts) ? f.texts : []);

  const textsPayload = [...otherTexts, metaRow];



  const isActive = opts.publish === true ? true : opts.publish === false ? false : Boolean(f.isActive);



  return {

    title: f.title,

    subtitle: strOrNull(f.subtitle),

    description: strOrNull(f.description),

    badgeText: strOrNull(f.badgeText),

    badgeColor: colorField(f.badgeColor, colorPatch.badgeColor, DEFAULT_PATCH.badgeColor),

    texts: textsPayload,

    images: Array.isArray(f.images) ? f.images.slice(0, 1) : [],

    ctaText: strOrNull(f.ctaText),

    ctaUrl,

    secondaryCtaText: strOrNull(f.secondaryCtaText),

    secondaryCtaUrl: strOrNull(f.secondaryCtaUrl),

    openInNewTab,

    backgroundColor: colorField(f.backgroundColor, colorPatch.backgroundColor, ""),

    gradientFrom: colorField(f.gradientFrom, colorPatch.gradientFrom, DEFAULT_PATCH.gradientFrom),

    gradientTo: colorField(f.gradientTo, colorPatch.gradientTo, DEFAULT_PATCH.gradientTo),

    titleColor: colorField(f.titleColor, colorPatch.titleColor, DEFAULT_PATCH.titleColor),

    textColor: colorField(f.textColor, colorPatch.textColor, DEFAULT_PATCH.textColor),

    buttonColor: colorField(f.buttonColor, colorPatch.buttonColor, DEFAULT_PATCH.buttonColor),

    buttonTextColor: colorField(f.buttonTextColor, colorPatch.buttonTextColor, DEFAULT_PATCH.buttonTextColor),

    borderColor: colorField(f.borderColor, colorPatch.borderColor, DEFAULT_PATCH.borderColor),

    ...LAYOUT_DEFAULTS,

    isActive,

    isSticky: f.isSticky !== undefined ? Boolean(f.isSticky) : true,

    isClickableCard: Boolean(f.isClickableCard),

    placement: f.placement || "home_right_panel",

    sortOrder: Number(f.sortOrder) || 0,

    startDate: start,

    endDate: end,

    isFeatured: priority >= 50,

    themePreset: FIXED_BANNER_TEMPLATE,

  };

}


