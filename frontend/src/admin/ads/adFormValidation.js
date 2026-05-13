/**
 * Client-side checks before save — does not replace backend validation.
 * URL rules mirror backend adsSanitize (http(s), mailto, tel, or relative /...).
 */

/** @param {string} s */
export function isValidOptionalUrl(s) {
  if (s == null || typeof s !== "string") return true;
  const t = s.trim();
  if (!t) return true;
  if (t.startsWith("/") && !t.startsWith("//")) return true;
  try {
    const u = new URL(t);
    return ["http:", "https:", "mailto:", "tel:"].includes(u.protocol);
  } catch {
    return false;
  }
}

/**
 * Count images that will survive backend sanitize (valid non-empty URL).
 * @param {unknown[]} images
 */
export function countValidImages(images) {
  if (!Array.isArray(images)) return 0;
  let n = 0;
  for (const img of images) {
    if (!img || typeof img !== "object") continue;
    const u = img.url != null ? String(img.url).trim() : "";
    if (u && isValidOptionalUrl(u)) n += 1;
  }
  return n;
}

/**
 * @param {object} form
 * @returns {{ errors: Record<string, string>, warnings: string[], imageUrlErrors: Record<number, string> }}
 */
export function validateAdFormFrontend(form) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<number, string>} */
  const imageUrlErrors = {};
  const warnings = [];

  if (!form?.title || !String(form.title).trim()) {
    errors.title = "العنوان مطلوب.";
  }

  if (form.ctaUrl != null && String(form.ctaUrl).trim() && !isValidOptionalUrl(form.ctaUrl)) {
    errors.ctaUrl = "رابط الزر غير صحيح.";
  }

  if (form.ctaText != null && String(form.ctaText).trim() && !(form.ctaUrl != null && String(form.ctaUrl).trim())) {
    errors.ctaUrl = "عند إدخال نص الزر يجب إدخال رابط صالح للزر.";
  }

  const images = Array.isArray(form.images) ? form.images : [];
  images.forEach((img, idx) => {
    const u = img?.url != null ? String(img.url).trim() : "";
    if (u && !isValidOptionalUrl(img.url)) {
      imageUrlErrors[idx] = "رابط الصورة غير صحيح.";
    }
  });

  return { errors, warnings, imageUrlErrors };
}

/** True if there is any blocking error object (excluding empty imageUrlErrors). */
export function hasBlockingErrors(result) {
  const { errors, imageUrlErrors } = result;
  if (Object.keys(errors).length > 0) return true;
  return Object.keys(imageUrlErrors || {}).length > 0;
}
