/**
 * Client-side checks before save — mirrors backend URL safety rules.
 */

import {
  OPEN_MODES,
  buildWhatsAppHref,
  isSafePhoneLike,
} from "../../components/ads/bannerAdMeta";
import { AD_ASSET_KEYS } from "../../components/ads/adVisualAssets";
import { resolveAdImageMode } from "./adFormUtils";

/** @param {string} s */
export function isValidOptionalUrl(s) {
  if (s == null || typeof s !== "string") return true;
  const t = s.trim();
  if (!t) return true;
  if (t.toLowerCase().startsWith("data:")) return false;
  if (t.startsWith("/") && !t.startsWith("//")) return true;
  try {
    const u = new URL(t);
    if (u.protocol === "javascript:") return false;
    return ["http:", "https:", "mailto:", "tel:"].includes(u.protocol);
  } catch {
    return false;
  }
}

/** @param {string} s */
export function isValidImageUrl(s) {
  if (s == null || typeof s !== "string") return true;
  const t = s.trim();
  if (!t) return true;
  if (t.toLowerCase().startsWith("data:")) return false;
  return isValidOptionalUrl(t);
}

/**
 * @param {unknown[]} images
 */
export function countValidImages(images) {
  if (!Array.isArray(images)) return 0;
  let n = 0;
  for (const img of images) {
    if (!img || typeof img !== "object") continue;
    const u = img.url != null ? String(img.url).trim() : "";
    if (u && isValidImageUrl(u)) n += 1;
  }
  return n;
}

/**
 * @param {object} form
 * @param {{ requireReason?: boolean, t?: (key: string) => string }} [opts]
 */
export function validateAdFormFrontend(form, opts = {}) {
  const tr = opts.t ?? ((key) => key);

  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<number, string>} */
  const imageUrlErrors = {};
  const warnings = [];

  if (!form?.companyName || !String(form.companyName).trim()) {
    errors.companyName = tr("ads.validation.companyNameRequired");
  }

  if (!form?.title || !String(form.title).trim()) {
    errors.title = tr("ads.validation.titleRequired");
  }

  if (!form?.ctaText || !String(form.ctaText).trim()) {
    errors.ctaText = tr("ads.validation.ctaTextRequired");
  }

  const openMode = form?.openMode != null ? String(form.openMode).trim().toUpperCase() : "NEW_TAB";
  if (!OPEN_MODES.includes(/** @type {any} */ (openMode))) {
    errors.openMode = tr("ads.validation.openModeInvalid");
  }

  if (openMode === "WHATSAPP") {
    const wa = form?.whatsapp != null ? String(form.whatsapp).trim() : "";
    if (!wa || !buildWhatsAppHref(wa)) {
      errors.whatsapp = tr("ads.validation.whatsappInvalid");
    }
  } else if (!form?.ctaUrl || !String(form.ctaUrl).trim()) {
    errors.ctaUrl = tr("ads.validation.ctaUrlRequired");
  } else if (!isValidOptionalUrl(form.ctaUrl)) {
    errors.ctaUrl = tr("ads.validation.ctaUrlInvalid");
  } else if (openMode === "INTERNAL_ROUTE" && !String(form.ctaUrl).trim().startsWith("/")) {
    errors.ctaUrl = tr("ads.validation.ctaUrlInternal");
  }

  const images = Array.isArray(form.images) ? form.images : [];
  images.forEach((img, idx) => {
    const u = img?.url != null ? String(img.url).trim() : "";
    if (u && !isValidImageUrl(img.url)) {
      imageUrlErrors[idx] = tr("ads.validation.imageUrlInvalid");
    }
  });

  if (form.logoUrl != null && String(form.logoUrl).trim() && !isValidImageUrl(form.logoUrl)) {
    errors.logoUrl = tr("ads.validation.logoUrlInvalid");
  }

  if (form.backgroundImageUrl != null && String(form.backgroundImageUrl).trim() && !isValidImageUrl(form.backgroundImageUrl)) {
    errors.backgroundImageUrl = tr("ads.validation.backgroundImageUrlInvalid");
  }

  const imgMode = resolveAdImageMode(form);
  if (imgMode === "preset" || imgMode === "preset_custom_bg") {
    const key = form?.selectedAssetKey != null ? String(form.selectedAssetKey).trim() : "";
    if (!key || !AD_ASSET_KEYS.includes(key)) {
      errors.selectedAssetKey = tr("ads.validation.selectedAssetRequired");
    }
  }
  if (imgMode === "custom_bg" || imgMode === "preset_custom_bg") {
    const bg = form?.backgroundImageUrl != null ? String(form.backgroundImageUrl).trim() : "";
    if (!bg || !isValidImageUrl(bg)) {
      errors.backgroundImageUrl = tr("ads.validation.backgroundImageRequired");
    }
  }
  if (imgMode === "custom_main" && countValidImages(images) < 1) {
    imageUrlErrors[0] = tr("ads.validation.imageRequired");
  }

  const saleRaw = form?.salePercent != null ? String(form.salePercent).trim() : "";
  if (saleRaw) {
    if (!/^\d+$/.test(saleRaw)) {
      errors.salePercent = tr("ads.validation.salePercentInteger");
    } else {
      const n = Number.parseInt(saleRaw, 10);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        errors.salePercent = tr("ads.validation.salePercentRange");
      }
    }
  }

  if (!isSafePhoneLike(form?.phone)) {
    errors.phone = tr("ads.validation.phoneInvalid");
  }
  if (form?.whatsapp && !isSafePhoneLike(form.whatsapp)) {
    errors.whatsapp = tr("ads.validation.whatsappCharsInvalid");
  }

  if (form.startDate && form.endDate) {
    const sd = new Date(form.startDate);
    const ed = new Date(form.endDate);
    if (!Number.isNaN(sd.getTime()) && !Number.isNaN(ed.getTime()) && ed < sd) {
      errors.endDate = tr("ads.validation.endBeforeStart");
    }
  }

  if (opts.requireReason) {
    const note = form?.adminNote != null ? String(form.adminNote).trim() : "";
    if (note.length < 3) {
      errors.adminNote = tr("ads.validation.adminNoteRequired");
    }
  }

  return { errors, warnings, imageUrlErrors };
}

export function hasBlockingErrors(result) {
  const { errors, imageUrlErrors } = result;
  if (Object.keys(errors).length > 0) return true;
  return Object.keys(imageUrlErrors || {}).length > 0;
}
