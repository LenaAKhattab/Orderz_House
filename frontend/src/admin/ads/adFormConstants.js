/** UI constants for the admin ad builder (labels stay Arabic; values match backend). */

export const LAYOUT_OPTIONS = [
  {
    value: "image_top",
    label: "صورة بالأعلى",
    description: "مناسب لإعلان يحتوي صورة واضحة بالأعلى ونص بالأسفل.",
  },
  {
    value: "image_background",
    label: "صورة كخلفية",
    description: "مناسب للإعلانات البصرية مع نص فوق الصورة.",
  },
  {
    value: "text_only",
    label: "نص فقط",
    description: "مناسب للتنبيهات والعروض النصية.",
  },
  {
    value: "split",
    label: "تقسيم صورة ونص",
    description: "مناسب لعرض صورة بجانب النص.",
  },
  {
    value: "minimal_banner",
    label: "بانر بسيط",
    description: "مناسب لإعلان صغير وخفيف.",
  },
  {
    value: "carousel",
    label: "صور متعددة",
    description: "مناسب لأكثر من صورة داخل إعلان واحد.",
  },
];

/** Hint when layout changes — recommends assets for this layout. */
export const LAYOUT_HINTS = {
  image_top: "يُفضّل إضافة صورة واحدة على الأقل لإبراز الإعلان.",
  image_background: "هذا النوع يحتاج إلى صورة واحدة على الأقل.",
  text_only: "ركّز على العنوان والوصف؛ الصور اختيارية.",
  split: "يُفضّل صورة واحدة على الأقل لتوازن الشكل.",
  minimal_banner: "اختصر النص؛ البانر مصمّم لمساحة صغيرة.",
  carousel: "يُفضّل إضافة صورتين أو أكثر لعرض التمرير بشكل جيد.",
};

export const PLACEMENT_OPTIONS = [
  {
    value: "home_right_panel",
    label: "يمين الصفحة الرئيسية",
    publicActive: true,
    note: null,
  },
  {
    value: "home_after_hero",
    label: "أسفل الهيرو",
    publicActive: false,
    note: "ملاحظة: هذا المكان قد لا يكون مفعّلًا في الواجهة العامة بعد.",
  },
  {
    value: "services_page",
    label: "صفحة الخدمات",
    publicActive: false,
    note: "ملاحظة: هذا المكان قد لا يكون مفعّلًا في الواجهة العامة بعد.",
  },
  {
    value: "global_sidebar",
    label: "الشريط الجانبي العام",
    publicActive: false,
    note: "ملاحظة: هذا المكان قد لا يكون مفعّلًا في الواجهة العامة بعد.",
  },
];

export const IMAGE_POSITION_OPTIONS = [
  { value: "top", label: "أعلى الإعلان" },
  { value: "bottom", label: "أسفل الإعلان" },
  { value: "left", label: "يسار" },
  { value: "right", label: "يمين" },
  { value: "background", label: "خلفية" },
];

export const TEXT_POSITION_OPTIONS = [
  { value: "top", label: "أعلى" },
  { value: "middle", label: "وسط" },
  { value: "bottom", label: "أسفل" },
];

/** Maps friendly Arabic labels to stored CSS values (backend accepts string ≤16 chars). */
export const FONT_SIZE_PRESETS = [
  { label: "صغير", value: "0.8125rem" },
  { label: "عادي", value: "0.9375rem" },
  { label: "متوسط", value: "1.0625rem" },
  { label: "كبير", value: "1.25rem" },
];

export const FONT_WEIGHT_PRESETS = [
  { label: "عادي", value: "400" },
  { label: "متوسط", value: "600" },
  { label: "عريض", value: "700" },
];

/**
 * One-click palette presets — only fills color fields; admin can edit after.
 */
export const STYLE_PRESETS = [
  {
    id: "classic_navy",
    label: "أزرق كلاسيكي",
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
    label: "سماوي ناعم",
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
    label: "أبيض نظيف",
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
    label: "داكن فاخر",
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
    label: "عرض دافئ",
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
    label: "أخضر نجاح",
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

export function getLayoutOption(value) {
  return LAYOUT_OPTIONS.find((o) => o.value === value) || LAYOUT_OPTIONS[0];
}

export function getPlacementOption(value) {
  return PLACEMENT_OPTIONS.find((o) => o.value === value) || PLACEMENT_OPTIONS[0];
}
