/**
 * Client Create Order: one creation attempt = one order. The key combines a per-form-instance id with a
 * hash of the submitted content, so resubmitting the same content (double click, retry, browser Back from
 * Stripe + submit again) maps to the SAME order on the server, while any edit is a new, intentional attempt.
 * Characters: letters, digits, ':' and '-' (server accepts [A-Za-z0-9:_-]{8,120}).
 */
export function newCreationInstanceId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** FNV-1a (32-bit) of the submitted content: same content → same key within one form instance. */
function contentHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function clientCreationKey(instanceId, form, files) {
  const signature = JSON.stringify({
    title: String(form?.title || "").trim(),
    description: String(form?.description || "").trim(),
    categoryId: String(form?.categoryId || ""),
    subSubcategoryId: String(form?.subSubcategoryId || ""),
    extraCategoryIds: form?.extraCategoryIds || [],
    projectType: form?.projectType || "",
    budget: String(form?.budget || ""),
    bidBudgetMin: String(form?.bidBudgetMin || ""),
    bidBudgetMax: String(form?.bidBudgetMax || ""),
    durationValue: String(form?.durationValue || ""),
    durationUnit: form?.durationUnit || "",
    skills: form?.preferredSkills || [],
    files: (files || []).map((f) => [f?.name, f?.size, f?.lastModified]),
  });
  return `${instanceId}:${contentHash(signature)}`;
}
