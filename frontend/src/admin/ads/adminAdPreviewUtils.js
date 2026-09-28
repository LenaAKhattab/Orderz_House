import { buildPayloadFromForm, emptyAdForm } from "./adFormUtils";

function pickField(draft, key, fallback) {
  const v = draft?.[key];
  if (v != null && String(v).trim() !== "") return String(v).trim();
  return fallback;
}

/**
 * @param {object} draft
 * @param {Record<string, string>} [fallbacks]
 * @returns {import("../../types/ad.js").Ad & { _previewDisplay?: { useFallbacks: boolean } }}
 */
export function buildAdminPreviewAd(draft, fallbacks = {}) {
  if (!draft || typeof draft !== "object") return null;

  const hasRealContent = Boolean(draft.title?.trim() || draft.companyName?.trim());

  const merged = {
    ...emptyAdForm(),
    ...draft,
    title: pickField(draft, "title", fallbacks.title ?? ""),
    subtitle: draft.subtitle?.trim()
      ? String(draft.subtitle).trim()
      : draft.description?.trim()
        ? ""
        : fallbacks.subtitle ?? "",
    companyName: pickField(draft, "companyName", fallbacks.companyName ?? ""),
    description: pickField(draft, "description", fallbacks.description ?? ""),
    salePercent: pickField(draft, "salePercent", fallbacks.salePercent ?? "20"),
    ctaText: pickField(draft, "ctaText", fallbacks.ctaText ?? ""),
    badgeText: pickField(draft, "badgeText", fallbacks.badgeText ?? ""),
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
