/**
 * Visual palette options for admin color pickers (values are hex — same as backend).
 */

/**
 * Simplified admin UI — four main rows + presets (same labels across rows).
 * بدون تحديد handled via allowEmpty on the picker, not in this array.
 */
/**
 * ألوان حقول القسم الأول (عنوان / وصف / شارة) — «افتراضي» = فارغ للتوافق مع الحفظ.
 */
export const BASIC_FIELD_COLOR_OPTIONS = [
  { label: "افتراضي", value: "" },
  { label: "كحلي", value: "#0f172a" },
  { label: "أزرق", value: "#2563eb" },
  { label: "سماوي", value: "#0284c7" },
  { label: "أخضر", value: "#059669" },
  { label: "ذهبي", value: "#d97706" },
  { label: "أحمر", value: "#dc2626" },
  { label: "بنفسجي", value: "#7c3aed" },
  { label: "رمادي", value: "#64748b" },
  { label: "أسود", value: "#111827" },
  { label: "أبيض", value: "#ffffff" },
];

export const MAIN_SIMPLE_SWATCHES = [
  { label: "كحلي", value: "#0c4a6e" },
  { label: "أزرق", value: "#2563eb" },
  { label: "سماوي", value: "#0284c7" },
  { label: "أخضر", value: "#16a34a" },
  { label: "ذهبي", value: "#f59e0b" },
  { label: "أحمر", value: "#dc2626" },
  { label: "بنفسجي", value: "#7c3aed" },
  { label: "رمادي", value: "#64748b" },
  { label: "أسود", value: "#111827" },
  { label: "أبيض", value: "#ffffff" },
];

/** Inline text-block row: افتراضي = inherit main text color (empty string). */
export const TEXT_BLOCK_INLINE_SWATCHES = [
  { label: "كحلي", value: "#0c4a6e" },
  { label: "أزرق", value: "#2563eb" },
  { label: "أخضر", value: "#16a34a" },
  { label: "ذهبي", value: "#f59e0b" },
  { label: "أحمر", value: "#dc2626" },
  { label: "رمادي", value: "#64748b" },
];

/** Main accent / text / UI colors */
export const COLOR_SWATCHES_GENERAL = [
  { label: "كحلي", value: "#0c4a6e" },
  { label: "أزرق", value: "#2563eb" },
  { label: "سماوي", value: "#0284c7" },
  { label: "أخضر", value: "#16a34a" },
  { label: "ذهبي", value: "#f59e0b" },
  { label: "أحمر", value: "#dc2626" },
  { label: "بنفسجي", value: "#7c3aed" },
  { label: "رمادي", value: "#64748b" },
  { label: "أسود", value: "#111827" },
  { label: "أبيض", value: "#ffffff" },
];

/** Soft backgrounds for cards */
export const COLOR_SWATCHES_SOFT_BG = [
  { label: "أبيض", value: "#ffffff" },
  { label: "سماوي فاتح", value: "#f0f9ff" },
  { label: "أزرق فاتح", value: "#eff6ff" },
  { label: "أخضر فاتح", value: "#f0fdf4" },
  { label: "ذهبي فاتح", value: "#fffbeb" },
  { label: "بنفسجي فاتح", value: "#faf5ff" },
  { label: "وردي فاتح", value: "#fdf2f8" },
  { label: "رمادي فاتح", value: "#f8fafc" },
  { label: "داكن", value: "#111827" },
];

/** Muted borders / dividers */
export const COLOR_SWATCHES_BORDER = [
  { label: "فاتح", value: "#e2e8f0" },
  { label: "رمادي", value: "#cbd5e1" },
  { label: "أزرق رمادي", value: "#94a3b8" },
  { label: "داكن", value: "#475569" },
  { label: "أبيض", value: "#ffffff" },
  { label: "شفاف تقريبًا", value: "#f1f5f9" },
];

/** Button fills — vibrant */
export const COLOR_SWATCHES_BUTTON = [
  { label: "أزرق", value: "#2563eb" },
  { label: "سماوي", value: "#0284c7" },
  { label: "أخضر", value: "#059669" },
  { label: "برتقالي", value: "#ea580c" },
  { label: "ذهبي", value: "#d97706" },
  { label: "بنفسجي", value: "#7c3aed" },
  { label: "وردي", value: "#db2777" },
  { label: "رمادي داكن", value: "#334155" },
  { label: "أسود", value: "#111827" },
];

/** Text on buttons — light */
export const COLOR_SWATCHES_BUTTON_TEXT = [
  { label: "أبيض", value: "#ffffff" },
  { label: "شبه أبيض", value: "#f8fafc" },
  { label: "كريمي", value: "#fef3c7" },
  { label: "أسود", value: "#111827" },
  { label: "رمادي داكن", value: "#1e293b" },
];

/** Gradient quick presets (both ends) */
export const GRADIENT_QUICK_PRESETS = [
  { label: "بدون تدرج", gradientFrom: "", gradientTo: "" },
  { label: "تدرج سماوي", gradientFrom: "#e0f2fe", gradientTo: "#f0f9ff" },
  { label: "تدرج داكن", gradientFrom: "#0f172a", gradientTo: "#334155" },
  { label: "تدرج دافئ", gradientFrom: "#ffedd5", gradientTo: "#fff7ed" },
  { label: "تدرج أخضر", gradientFrom: "#d1fae5", gradientTo: "#ecfdf5" },
  { label: "تدرج بنفسجي", gradientFrom: "#ede9fe", gradientTo: "#faf5ff" },
];

/** Text block: includes «افتراضي» as empty + same general swatches */
export const TEXT_BLOCK_COLOR_OPTIONS = [
  { label: "كحلي", value: "#0c4a6e" },
  { label: "أزرق", value: "#2563eb" },
  { label: "سماوي", value: "#0284c7" },
  { label: "أخضر", value: "#16a34a" },
  { label: "ذهبي", value: "#f59e0b" },
  { label: "أحمر", value: "#dc2626" },
  { label: "بنفسجي", value: "#7c3aed" },
  { label: "رمادي", value: "#64748b" },
  { label: "أسود", value: "#111827" },
  { label: "أبيض", value: "#ffffff" },
];

/**
 * Normalize hex for native color input (#rrggbb).
 * @param {string} [raw]
 * @returns {string}
 */
/**
 * Parse #rgb / #rrggbb to [r,g,b] 0–255 or null.
 * @param {string} hex
 * @returns {[number, number, number] | null}
 */
export function parseHexRgb(hex) {
  if (hex == null || typeof hex !== "string") return null;
  let h = hex.trim();
  if (!h.startsWith("#")) return null;
  h = h.slice(1);
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) ? null : [r, g, b];
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) ? null : [r, g, b];
  }
  return null;
}

/**
 * Relative luminance 0–1 (sRGB).
 * @param {string} hex
 * @returns {number | null}
 */
export function hexLuminance(hex) {
  const rgb = parseHexRgb(hex);
  if (!rgb) return null;
  const lin = rgb.map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * Auto button label color: dark text on light buttons, white on dark.
 * @param {string} buttonHex
 * @returns {string}
 */
export function pickContrastButtonText(buttonHex) {
  const lum = hexLuminance(buttonHex);
  if (lum == null) return "#ffffff";
  return lum > 0.45 ? "#111827" : "#ffffff";
}

export function toPickerHex(raw) {
  if (raw == null || typeof raw !== "string") return "#ffffff";
  const t = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t;
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    const r = t[1];
    const g = t[2];
    const b = t[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#ffffff";
}
