/** UI constants for the admin ad builder (values match backend). */

/** Single public placement for all ads — not editable in the builder. */
export const FIXED_AD_PLACEMENT = "home_right_panel";

export const LAYOUT_OPTIONS = [
  { value: "image_top", layoutKey: "image_top" },
  { value: "image_background", layoutKey: "image_background" },
  { value: "text_only", layoutKey: "text_only" },
  { value: "split", layoutKey: "split" },
  { value: "minimal_banner", layoutKey: "minimal_banner" },
  { value: "carousel", layoutKey: "carousel" },
];

/** Hint when layout changes — recommends assets for this layout. */
export const LAYOUT_HINT_KEYS = {
  image_top: "layoutHints.image_top",
  image_background: "layoutHints.image_background",
  text_only: "layoutHints.text_only",
  split: "layoutHints.split",
  minimal_banner: "layoutHints.minimal_banner",
  carousel: "layoutHints.carousel",
};

export const PLACEMENT_OPTIONS = [
  { value: "home_right_panel", placementKey: "home_right_panel", publicActive: true, note: null },
  { value: "home_after_hero", placementKey: "home_after_hero", publicActive: false, noteKey: "placements.home_after_hero.note" },
  { value: "services_page", placementKey: "services_page", publicActive: false, noteKey: "placements.services_page.note" },
  { value: "global_sidebar", placementKey: "global_sidebar", publicActive: false, noteKey: "placements.global_sidebar.note" },
];

export const IMAGE_POSITION_OPTIONS = [
  { value: "top", positionKey: "imageTop" },
  { value: "bottom", positionKey: "imageBottom" },
  { value: "left", positionKey: "left" },
  { value: "right", positionKey: "right" },
  { value: "background", positionKey: "background" },
];

export const TEXT_POSITION_OPTIONS = [
  { value: "top", positionKey: "textTop" },
  { value: "middle", positionKey: "textMiddle" },
  { value: "bottom", positionKey: "textBottom" },
];

/** Maps friendly labels to stored CSS values (backend accepts string ≤16 chars). */
export const FONT_SIZE_PRESETS = [
  { sizeKey: "small", value: "0.8125rem" },
  { sizeKey: "normal", value: "0.9375rem" },
  { sizeKey: "medium", value: "1.0625rem" },
  { sizeKey: "large", value: "1.25rem" },
];

export const FONT_WEIGHT_PRESETS = [
  { weightKey: "normal", value: "400" },
  { weightKey: "medium", value: "600" },
  { weightKey: "bold", value: "700" },
];

/**
 * One-click palette presets — only fills color fields; admin can edit after.
 */
export const STYLE_PRESETS = [
  {
    id: "classic_navy",
    presetKey: "classic_navy",
    colors: {
      backgroundColor: "#0f172a",
      titleColor: "#f8fafc",
      textColor: "#cbd5e1",
      buttonColor: "#3b82f6",
      buttonTextColor: "#ffffff",
      borderColor: "#334155",
      badgeColor: "#38bdf8",
      gradientFrom: "#0f172a",
      gradientTo: "#1e3a5f",
    },
  },
  {
    id: "soft_sky",
    presetKey: "soft_sky",
    colors: {
      backgroundColor: "#f0f9ff",
      titleColor: "#0c4a6e",
      textColor: "#334155",
      buttonColor: "#0284c7",
      buttonTextColor: "#ffffff",
      borderColor: "#bae6fd",
      badgeColor: "#7dd3fc",
      gradientFrom: "#e0f2fe",
      gradientTo: "#f0f9ff",
    },
  },
  {
    id: "clean_white",
    presetKey: "clean_white",
    colors: {
      backgroundColor: "#ffffff",
      titleColor: "#0f172a",
      textColor: "#475569",
      buttonColor: "#2563eb",
      buttonTextColor: "#ffffff",
      borderColor: "#e2e8f0",
      badgeColor: "#e2e8f0",
      gradientFrom: "#f8fafc",
      gradientTo: "#ffffff",
    },
  },
  {
    id: "premium_dark",
    presetKey: "premium_dark",
    colors: {
      backgroundColor: "#18181b",
      titleColor: "#fafafa",
      textColor: "#a1a1aa",
      buttonColor: "#eab308",
      buttonTextColor: "#18181b",
      borderColor: "#3f3f46",
      badgeColor: "#f59e0b",
      gradientFrom: "#27272a",
      gradientTo: "#18181b",
    },
  },
  {
    id: "warm_offer",
    presetKey: "warm_offer",
    colors: {
      backgroundColor: "#fff7ed",
      titleColor: "#9a3412",
      textColor: "#57534e",
      buttonColor: "#ea580c",
      buttonTextColor: "#ffffff",
      borderColor: "#fed7aa",
      badgeColor: "#fb923c",
      gradientFrom: "#ffedd5",
      gradientTo: "#fff7ed",
    },
  },
  {
    id: "success_green",
    presetKey: "success_green",
    colors: {
      backgroundColor: "#ecfdf5",
      titleColor: "#065f46",
      textColor: "#374151",
      buttonColor: "#059669",
      buttonTextColor: "#ffffff",
      borderColor: "#a7f3d0",
      badgeColor: "#34d399",
      gradientFrom: "#d1fae5",
      gradientTo: "#ecfdf5",
    },
  },
];

/** @param {string} value @param {(key: string) => string} t */
export function getLayoutOption(value, t) {
  const o = LAYOUT_OPTIONS.find((item) => item.value === value) || LAYOUT_OPTIONS[0];
  return {
    ...o,
    label: t(`ads.layouts.${o.layoutKey}.label`),
    description: t(`ads.layouts.${o.layoutKey}.description`),
  };
}

/** @param {string} value @param {(key: string) => string} t */
export function getPlacementOption(value, t) {
  const o = PLACEMENT_OPTIONS.find((item) => item.value === value) || PLACEMENT_OPTIONS[0];
  return {
    ...o,
    label: t(`ads.placements.${o.placementKey}.label`),
    note: o.noteKey ? t(`ads.${o.noteKey}`) : null,
  };
}
