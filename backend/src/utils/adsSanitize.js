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
function sanitizeTextsArray(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const item of arr.slice(0, 24)) {
    if (!item || typeof item !== "object") continue;
    const id = escapeHtml(item.id != null ? String(item.id) : "").slice(0, 64) || `t-${out.length}`;
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
};
