import { buildPayloadFromForm, emptyAdForm } from "./adFormUtils";

/** Preview-only copy when a field is still empty (never saved to API). */
const PREVIEW_FALLBACKS = {
  companyName: "متجر هدايا",
  title: "إعلان حصري",
  subtitle: "ربح الانتباه",
  description: "أضف وصفاً قصيراً لجذب الانتباه…",
  ctaText: "احصل على العرض الآن",
  badgeText: "عرض محدود",
  salePercent: "20",
};

function pickField(draft, key, fallback) {
  const v = draft?.[key];
  if (v != null && String(v).trim() !== "") return String(v).trim();
  return fallback;
}

/**
 * @param {object} draft
 * @returns {import("../../types/ad.js").Ad & { _previewDisplay?: { useFallbacks: boolean } }}
 */
export function buildAdminPreviewAd(draft) {
  if (!draft || typeof draft !== "object") return null;

  const hasRealContent = Boolean(draft.title?.trim() || draft.companyName?.trim());

  const merged = {
    ...emptyAdForm(),
    ...draft,
    title: pickField(draft, "title", PREVIEW_FALLBACKS.title),
    subtitle: draft.subtitle?.trim()
      ? String(draft.subtitle).trim()
      : draft.description?.trim()
        ? ""
        : PREVIEW_FALLBACKS.subtitle,
    companyName: pickField(draft, "companyName", PREVIEW_FALLBACKS.companyName),
    description: pickField(draft, "description", PREVIEW_FALLBACKS.description),
    salePercent: pickField(draft, "salePercent", PREVIEW_FALLBACKS.salePercent),
    ctaText: pickField(draft, "ctaText", PREVIEW_FALLBACKS.ctaText),
    badgeText: pickField(draft, "badgeText", PREVIEW_FALLBACKS.badgeText),
    ctaUrl: draft.ctaUrl?.trim() || (draft.openMode === "WHATSAPP" ? "" : "#"),
  };

  const base = buildPayloadFromForm(merged, { publish: Boolean(draft.isActive) });

  return {
    ...base,
    id: draft.id || "preview",
    ctaUrl: base.ctaUrl || "#",
    _previewDisplay: { useFallbacks: !hasRealContent },
  };
}
