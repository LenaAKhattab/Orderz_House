/** @param {string} [url] */
export function isExternalUrl(url) {
  if (!url || typeof url !== "string") return false;
  return /^https?:\/\//i.test(url.trim());
}

/**
 * @param {string} text
 * @param {number} max
 */
export function truncateText(text, max) {
  if (text == null || typeof text !== "string") return "";
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trim()}…`;
}

/**
 * @param {import("../../types/ad.js").Ad} ad
 * @param {string} href
 */
export function linkTargetRel(ad, href) {
  const ext = isExternalUrl(href);
  const openNew = Boolean(ad.openInNewTab);
  if (openNew || ext) {
    return { target: "_blank", rel: "noopener noreferrer" };
  }
  return { target: "_self", rel: undefined };
}

/**
 * @param {import("../../types/ad.js").Ad} ad
 */
export function primaryHref(ad) {
  const u = ad.ctaUrl || ad.secondaryCtaUrl;
  return u && String(u).trim() ? String(u).trim() : null;
}
