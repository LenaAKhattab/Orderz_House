/**
 * Visual palette options for admin color pickers (values are hex — same as backend).
 */

const c = (name, value) => ({ name, value });

export const BASIC_FIELD_COLOR_OPTIONS = [
  c("default", ""),
  c("navy", "#0f172a"),
  c("blue", "#2563eb"),
  c("sky", "#0284c7"),
  c("green", "#059669"),
  c("gold", "#d97706"),
  c("red", "#dc2626"),
  c("purple", "#7c3aed"),
  c("gray", "#64748b"),
  c("black", "#111827"),
  c("white", "#ffffff"),
];

export const PREMIUM_COLOR_DROPDOWN_OPTIONS = [
  c("default", ""),
  c("navy", "#0c4a6e"),
  c("blue", "#2563eb"),
  c("sky", "#0284c7"),
  c("green", "#16a34a"),
  c("gold", "#f59e0b"),
  c("red", "#dc2626"),
  c("purple", "#7c3aed"),
  c("gray", "#64748b"),
  c("black", "#111827"),
  c("white", "#ffffff"),
];

export const MAIN_SIMPLE_SWATCHES = [
  c("navy", "#0c4a6e"),
  c("blue", "#2563eb"),
  c("sky", "#0284c7"),
  c("green", "#16a34a"),
  c("gold", "#f59e0b"),
  c("red", "#dc2626"),
  c("purple", "#7c3aed"),
  c("gray", "#64748b"),
  c("black", "#111827"),
  c("white", "#ffffff"),
];

export const TEXT_BLOCK_INLINE_SWATCHES = [
  c("navy", "#0c4a6e"),
  c("blue", "#2563eb"),
  c("green", "#16a34a"),
  c("gold", "#f59e0b"),
  c("red", "#dc2626"),
  c("gray", "#64748b"),
];

export const COLOR_SWATCHES_GENERAL = [
  c("navy", "#0c4a6e"),
  c("blue", "#2563eb"),
  c("sky", "#0284c7"),
  c("green", "#16a34a"),
  c("gold", "#f59e0b"),
  c("red", "#dc2626"),
  c("purple", "#7c3aed"),
  c("gray", "#64748b"),
  c("black", "#111827"),
  c("white", "#ffffff"),
];

export const COLOR_SWATCHES_SOFT_BG = [
  c("white", "#ffffff"),
  c("lightSky", "#f0f9ff"),
  c("lightBlue", "#eff6ff"),
  c("lightGreen", "#f0fdf4"),
  c("lightGold", "#fffbeb"),
  c("lightPurple", "#faf5ff"),
  c("lightPink", "#fdf2f8"),
  c("lightGray", "#f8fafc"),
  c("dark", "#111827"),
];

export const COLOR_SWATCHES_BORDER = [
  c("light", "#e2e8f0"),
  c("gray", "#cbd5e1"),
  c("blueGray", "#94a3b8"),
  c("dark", "#475569"),
  c("white", "#ffffff"),
  c("nearTransparent", "#f1f5f9"),
];

export const COLOR_SWATCHES_BUTTON = [
  c("blue", "#2563eb"),
  c("sky", "#0284c7"),
  c("green", "#059669"),
  c("orange", "#ea580c"),
  c("gold", "#d97706"),
  c("purple", "#7c3aed"),
  c("pink", "#db2777"),
  c("darkGray", "#334155"),
  c("black", "#111827"),
];

export const COLOR_SWATCHES_BUTTON_TEXT = [
  c("white", "#ffffff"),
  c("offWhite", "#f8fafc"),
  c("cream", "#fef3c7"),
  c("black", "#111827"),
  c("darkGray", "#1e293b"),
];

export const PREMIUM_BG_DROPDOWN_OPTIONS = [c("default", ""), ...COLOR_SWATCHES_SOFT_BG];

export const PREMIUM_BUTTON_DROPDOWN_OPTIONS = [c("default", ""), ...COLOR_SWATCHES_BUTTON];

export const PREMIUM_BUTTON_TEXT_DROPDOWN_OPTIONS = [c("auto", ""), ...COLOR_SWATCHES_BUTTON_TEXT];

export const GRADIENT_QUICK_PRESETS = [
  { name: "none", gradientFrom: "", gradientTo: "" },
  { name: "sky", gradientFrom: "#e0f2fe", gradientTo: "#f0f9ff" },
  { name: "dark", gradientFrom: "#0f172a", gradientTo: "#334155" },
  { name: "warm", gradientFrom: "#ffedd5", gradientTo: "#fff7ed" },
  { name: "green", gradientFrom: "#d1fae5", gradientTo: "#ecfdf5" },
  { name: "purple", gradientFrom: "#ede9fe", gradientTo: "#faf5ff" },
];

export const TEXT_BLOCK_COLOR_OPTIONS = [
  c("navy", "#0c4a6e"),
  c("blue", "#2563eb"),
  c("sky", "#0284c7"),
  c("green", "#16a34a"),
  c("gold", "#f59e0b"),
  c("red", "#dc2626"),
  c("purple", "#7c3aed"),
  c("gray", "#64748b"),
  c("black", "#111827"),
  c("white", "#ffffff"),
];

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

export function hexLuminance(hex) {
  const rgb = parseHexRgb(hex);
  if (!rgb) return null;
  const lin = rgb.map((channel) => {
    const x = channel / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

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
