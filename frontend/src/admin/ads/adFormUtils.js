/** Layout fixed for simplified admin — public home rail uses {@link HomeOfferCard} styling. */
const LAYOUT_DEFAULTS = {
  layoutType: "image_top",
  textAlign: "right",
  imagePosition: "top",
  buttonPosition: "bottom",
};

export function emptyAdForm() {
  return {
    title: "",
    subtitle: "",
    description: "",
    badgeText: "",
    badgeColor: "",
    texts: [],
    images: [],
    ctaText: "",
    ctaUrl: "",
    secondaryCtaText: "",
    secondaryCtaUrl: "",
    openInNewTab: true,
    backgroundColor: "",
    gradientFrom: "",
    gradientTo: "",
    titleColor: "",
    textColor: "",
    buttonColor: "",
    buttonTextColor: "",
    borderColor: "",
    ...LAYOUT_DEFAULTS,
    isActive: true,
    isSticky: true,
    isClickableCard: false,
    placement: "home_right_panel",
    sortOrder: 0,
    isFeatured: false,
    themePreset: "",
    schedulingMode: "simple",
    startDate: "",
    endDate: "",
  };
}

export function mapApiAdToForm(ad) {
  if (!ad) return emptyAdForm();
  const dt = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const hasSchedule = Boolean(ad.startDate || ad.endDate);
  return {
    ...emptyAdForm(),
    ...ad,
    texts: ad.texts || [],
    images: (ad.images || []).slice(0, 1),
    sortOrder: Number(ad.sortOrder) || 0,
    startDate: dt(ad.startDate),
    endDate: dt(ad.endDate),
    schedulingMode: hasSchedule ? "scheduled" : "simple",
    placement: ad.placement || "home_right_panel",
    isFeatured: Boolean(ad.isFeatured),
    themePreset: ad.themePreset ? String(ad.themePreset) : "",
  };
}

export function buildPayloadFromForm(f) {
  const toIsoOrNull = (v) => {
    if (!v || !String(v).trim()) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const strOrNull = (v) => {
    if (v == null) return null;
    const t = String(v).trim();
    return t ? t : null;
  };

  const start = f.startDate && String(f.startDate).trim() ? toIsoOrNull(f.startDate) : null;
  const end = f.endDate && String(f.endDate).trim() ? toIsoOrNull(f.endDate) : null;

  const tp = f.themePreset != null && String(f.themePreset).trim() ? String(f.themePreset).trim().toLowerCase() : null;

  return {
    title: f.title,
    subtitle: strOrNull(f.subtitle),
    description: strOrNull(f.description),
    badgeText: strOrNull(f.badgeText),
    badgeColor: strOrNull(f.badgeColor),
    texts: Array.isArray(f.texts) ? f.texts : [],
    images: Array.isArray(f.images) ? f.images.slice(0, 1) : [],
    ctaText: strOrNull(f.ctaText),
    ctaUrl: strOrNull(f.ctaUrl),
    secondaryCtaText: strOrNull(f.secondaryCtaText),
    secondaryCtaUrl: strOrNull(f.secondaryCtaUrl),
    openInNewTab: Boolean(f.openInNewTab),
    backgroundColor: strOrNull(f.backgroundColor),
    gradientFrom: strOrNull(f.gradientFrom),
    gradientTo: strOrNull(f.gradientTo),
    titleColor: strOrNull(f.titleColor),
    textColor: strOrNull(f.textColor),
    buttonColor: strOrNull(f.buttonColor),
    buttonTextColor: strOrNull(f.buttonTextColor),
    borderColor: strOrNull(f.borderColor),
    ...LAYOUT_DEFAULTS,
    isActive: Boolean(f.isActive),
    isSticky: f.isSticky !== undefined ? Boolean(f.isSticky) : true,
    isClickableCard: Boolean(f.isClickableCard),
    placement: f.placement || "home_right_panel",
    sortOrder: Number(f.sortOrder) || 0,
    startDate: start,
    endDate: end,
    isFeatured: Boolean(f.isFeatured),
    themePreset: ["purple", "green", "orange", "blue"].includes(tp) ? tp : null,
  };
}
