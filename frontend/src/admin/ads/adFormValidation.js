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
 * @param {{ requireReason?: boolean }} [opts]
 */
export function validateAdFormFrontend(form, opts = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<number, string>} */
  const imageUrlErrors = {};
  const warnings = [];

  if (!form?.companyName || !String(form.companyName).trim()) {
    errors.companyName = "اسم الشركة مطلوب.";
  }

  if (!form?.title || !String(form.title).trim()) {
    errors.title = "العنوان مطلوب.";
  }

  if (!form?.ctaText || !String(form.ctaText).trim()) {
    errors.ctaText = "نص زر الإجراء مطلوب.";
  }

  const openMode = form?.openMode != null ? String(form.openMode).trim().toUpperCase() : "NEW_TAB";
  if (!OPEN_MODES.includes(/** @type {any} */ (openMode))) {
    errors.openMode = "نوع فتح الرابط غير صالح.";
  }

  if (openMode === "WHATSAPP") {
    const wa = form?.whatsapp != null ? String(form.whatsapp).trim() : "";
    if (!wa || !buildWhatsAppHref(wa)) {
      errors.whatsapp = "أدخل رقم واتساب صالحًا (6 أرقام على الأقل).";
    }
  } else if (!form?.ctaUrl || !String(form.ctaUrl).trim()) {
    errors.ctaUrl = "رابط الإجراء مطلوب.";
  } else if (!isValidOptionalUrl(form.ctaUrl)) {
    errors.ctaUrl = "رابط الإجراء غير صحيح.";
  } else if (openMode === "INTERNAL_ROUTE" && !String(form.ctaUrl).trim().startsWith("/")) {
    errors.ctaUrl = "المسار الداخلي يجب أن يبدأ بـ /";
  }

  const images = Array.isArray(form.images) ? form.images : [];
  images.forEach((img, idx) => {
    const u = img?.url != null ? String(img.url).trim() : "";
    if (u && !isValidImageUrl(img.url)) {
      imageUrlErrors[idx] = "رابط الصورة غير صحيح.";
    }
  });

  if (form.logoUrl != null && String(form.logoUrl).trim() && !isValidImageUrl(form.logoUrl)) {
    errors.logoUrl = "رابط الشعار غير صحيح.";
  }

  if (form.backgroundImageUrl != null && String(form.backgroundImageUrl).trim() && !isValidImageUrl(form.backgroundImageUrl)) {
    errors.backgroundImageUrl = "رابط صورة الخلفية غير صحيح.";
  }

  const imgMode = resolveAdImageMode(form);
  if (imgMode === "preset" || imgMode === "preset_custom_bg") {
    const key = form?.selectedAssetKey != null ? String(form.selectedAssetKey).trim() : "";
    if (!key || !AD_ASSET_KEYS.includes(key)) {
      errors.selectedAssetKey = "اختر صورة جاهزة من القائمة.";
    }
  }
  if (imgMode === "custom_bg" || imgMode === "preset_custom_bg") {
    const bg = form?.backgroundImageUrl != null ? String(form.backgroundImageUrl).trim() : "";
    if (!bg || !isValidImageUrl(bg)) {
      errors.backgroundImageUrl = "ارفع صورة خلفية أو ألصق رابطًا صالحًا.";
    }
  }
  if (imgMode === "custom_main" && countValidImages(images) < 1) {
    imageUrlErrors[0] = "ارفع صورة أو ألصق رابطًا صالحًا.";
  }

  const saleRaw = form?.salePercent != null ? String(form.salePercent).trim() : "";
  if (saleRaw) {
    if (!/^\d+$/.test(saleRaw)) {
      errors.salePercent = "أدخل عددًا صحيحًا بين 0 و 100.";
    } else {
      const n = Number.parseInt(saleRaw, 10);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        errors.salePercent = "أدخل نسبة خصم بين 0 و 100.";
      }
    }
  }

  if (!isSafePhoneLike(form?.phone)) {
    errors.phone = "رقم الهاتف يحتوي على رموز غير مسموحة.";
  }
  if (form?.whatsapp && !isSafePhoneLike(form.whatsapp)) {
    errors.whatsapp = "رقم واتساب يحتوي على رموز غير مسموحة.";
  }

  if (form.startDate && form.endDate) {
    const sd = new Date(form.startDate);
    const ed = new Date(form.endDate);
    if (!Number.isNaN(sd.getTime()) && !Number.isNaN(ed.getTime()) && ed < sd) {
      errors.endDate = "تاريخ النهاية يجب أن يكون بعد تاريخ البداية.";
    }
  }

  if (opts.requireReason) {
    const note = form?.adminNote != null ? String(form.adminNote).trim() : "";
    if (note.length < 3) {
      errors.adminNote = "سبب الإجراء مطلوب (3 أحرف على الأقل).";
    }
  }

  return { errors, warnings, imageUrlErrors };
}

export function hasBlockingErrors(result) {
  const { errors, imageUrlErrors } = result;
  if (Object.keys(errors).length > 0) return true;
  return Object.keys(imageUrlErrors || {}).length > 0;
}
