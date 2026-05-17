/**
 * Escape HTML entities for stored/display text (ads content).
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function sanitizeOptionalUrl(value) {
  if (value == null || typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  if (t.startsWith("/") && !t.startsWith("//")) return t.slice(0, 2048);
  try {
    const u = new URL(t);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString().slice(0, 2048);
    if (u.protocol === "mailto:" || u.protocol === "tel:") return u.toString().slice(0, 2048);
  } catch {
    return null;
  }
  return null;
}

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]{3,40})$/;

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function sanitizeOptionalColor(value) {
  if (value == null || typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  if (COLOR_RE.test(t)) return t.slice(0, 64);
  return null;
}

/**
 * @param {unknown} arr
 * @returns {Array<{ id: string, content: string, color?: string, fontSize?: string, fontWeight?: string, position?: string }>}
 */
const BANNER_META_ID = "banner_meta";
const COLOR_PRESET_KEYS = new Set([
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
const IMAGE_MODES = new Set([
  "none",
  "preset",
  "custom_main",
  "custom_bg",
  "preset_custom_bg",
  "foreground",
  "background",
  "both",
]);
const AD_ASSET_KEYS = new Set(["handshake", "gold_confetti", "smiley_face", "red_ribbon", "red_gift", "gold_gifts"]);
const OPEN_MODES = new Set(["NEW_TAB", "SAME_TAB", "INTERNAL_ROUTE", "WHATSAPP"]);
const PRIORITY_VALUES = new Set([0, 50, 100]);
const PHONE_LIKE = /^[\d\s+().-]{0,40}$/;

/**
 * @param {unknown} texts
 * @returns {Record<string, unknown>}
 */
function parseBannerMetaFromTexts(texts) {
  if (!Array.isArray(texts)) return {};
  const row = texts.find((t) => t && typeof t === "object" && String(t.id) === BANNER_META_ID);
  return row && typeof row === "object" ? row : {};
}

/**
 * Strip admin-only keys from texts JSON before public API responses.
 * @param {unknown} texts
 */
function textsForPublicResponse(texts) {
  if (!Array.isArray(texts)) return [];
  return texts.map((item) => {
    if (!item || typeof item !== "object" || String(item.id) !== BANNER_META_ID) return item;
    const { internalNotes, adminNote, ...rest } = item;
    return rest;
  });
}

function sanitizeBannerMetaRow(item) {
  const row = {
    id: BANNER_META_ID,
    content: escapeHtml(item.content != null ? String(item.content) : "").slice(0, 4000),
  };
  const cpRaw = item.colorPreset != null ? String(item.colorPreset).trim().toLowerCase() : "";
  if (COLOR_PRESET_KEYS.has(cpRaw)) row.colorPreset = cpRaw;

  if (item.salePercent !== undefined && item.salePercent !== null && item.salePercent !== "") {
    const n = Number.parseInt(String(item.salePercent).trim(), 10);
    if (Number.isFinite(n)) row.salePercent = Math.min(100, Math.max(0, n));
  }

  if (item.discountText != null && String(item.discountText).trim()) {
    row.discountText = escapeHtml(String(item.discountText).trim()).slice(0, 120);
  }

  if (item.companyName != null && String(item.companyName).trim()) {
    row.companyName = escapeHtml(String(item.companyName).trim()).slice(0, 200);
  }

  const logoUrl = sanitizeOptionalUrl(item.logoUrl);
  if (logoUrl) row.logoUrl = logoUrl;

  const om = item.openMode != null ? String(item.openMode).trim().toUpperCase() : "";
  if (OPEN_MODES.has(om)) row.openMode = om;

  if (item.priority !== undefined && item.priority !== null && item.priority !== "") {
    const p = Number.parseInt(String(item.priority).trim(), 10);
    if (PRIORITY_VALUES.has(p)) row.priority = p;
  }

  if (item.phone != null && PHONE_LIKE.test(String(item.phone).trim())) {
    row.phone = escapeHtml(String(item.phone).trim()).slice(0, 40);
  }
  if (item.whatsapp != null && PHONE_LIKE.test(String(item.whatsapp).trim())) {
    row.whatsapp = escapeHtml(String(item.whatsapp).trim()).slice(0, 40);
  }

  if (item.internalNotes != null && String(item.internalNotes).trim()) {
    row.internalNotes = escapeHtml(String(item.internalNotes).trim()).slice(0, 4000);
  }

  const im = item.imageMode != null ? String(item.imageMode).trim().toLowerCase() : "";
  if (IMAGE_MODES.has(im)) row.imageMode = im;

  const bgUrl = sanitizeOptionalUrl(item.backgroundImageUrl);
  if (bgUrl) row.backgroundImageUrl = bgUrl;

  if (item.showTopBadge === false) row.showTopBadge = false;
  if (item.showDiscountBadge === false) row.showDiscountBadge = false;

  const assetKey = item.selectedAssetKey != null ? String(item.selectedAssetKey).trim() : "";
  if (assetKey && AD_ASSET_KEYS.has(assetKey)) row.selectedAssetKey = assetKey;

  const imageFit = item.imageFit != null ? String(item.imageFit).trim().toLowerCase() : "";
  if (imageFit === "contain" || imageFit === "cover") row.imageFit = imageFit;

  const stickerBg = sanitizeOptionalColor(item.saleStickerBg);
  if (stickerBg) row.saleStickerBg = stickerBg;
  const stickerFg = sanitizeOptionalColor(item.saleStickerFg);
  if (stickerFg) row.saleStickerFg = stickerFg;
  const badgeTxt = sanitizeOptionalColor(item.badgeTextColor);
  if (badgeTxt) row.badgeTextColor = badgeTxt;

  return row;
}

function sanitizeTextsArray(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  let bannerMetaIncluded = false;
  for (const item of arr.slice(0, 24)) {
    if (!item || typeof item !== "object") continue;
    const id = escapeHtml(item.id != null ? String(item.id) : "").slice(0, 64) || `t-${out.length}`;
    if (id === BANNER_META_ID) {
      if (bannerMetaIncluded) continue;
      out.push(sanitizeBannerMetaRow(item));
      bannerMetaIncluded = true;
      continue;
    }
    const row = {
      id,
      content: escapeHtml(item.content != null ? String(item.content) : "").slice(0, 4000),
    };
    const c = sanitizeOptionalColor(item.color);
    if (c) row.color = c;
    if (item.fontSize != null && String(item.fontSize).length <= 16) row.fontSize = escapeHtml(String(item.fontSize));
    if (item.fontWeight != null && String(item.fontWeight).length <= 16) row.fontWeight = escapeHtml(String(item.fontWeight));
    if (["top", "middle", "bottom"].includes(item.position)) row.position = item.position;
    out.push(row);
  }
  return out;
}

/**
 * @param {unknown} arr
 * @returns {Array<{ id: string, url: string, alt?: string, position?: string, objectFit?: string }>}
 */
function sanitizeImagesArray(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const item of arr.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const url = sanitizeOptionalUrl(item.url);
    if (!url) continue;
    const id = escapeHtml(item.id != null ? String(item.id) : "").slice(0, 64) || `img-${out.length}`;
    const row = {
      id,
      url,
      alt: item.alt != null ? escapeHtml(String(item.alt)).slice(0, 500) : undefined,
    };
    if (["top", "bottom", "left", "right", "background"].includes(item.position)) row.position = item.position;
    if (["cover", "contain"].includes(item.objectFit)) row.objectFit = item.objectFit;
    out.push(row);
  }
  return out;
}

module.exports = {
  escapeHtml,
  sanitizeOptionalUrl,
  sanitizeOptionalColor,
  sanitizeTextsArray,
  sanitizeImagesArray,
  BANNER_META_ID,
  parseBannerMetaFromTexts,
  textsForPublicResponse,
  OPEN_MODES,
  PRIORITY_VALUES,
};
