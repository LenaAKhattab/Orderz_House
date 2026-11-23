/**
 * Smart Orders S2 — client-side helpers for catalog-driven forms. UX only: the server re-validates every
 * value against the exact service version (and rejects tampering).
 */

/** Localized catalog text with fallback: requested locale → English → Arabic. */
export function pickLocalized(obj, locale) {
  if (!obj || typeof obj !== "object") return "";
  return obj[locale] || obj.en || obj.ar || "";
}

export function emptyServiceDraft() {
  return { serviceCode: "", version: null, values: {}, quantity: "", quantityUnspecified: false };
}

export function fieldVisible(field, values) {
  if (!field?.showIf) return true;
  const v = values[field.showIf.field];
  if (Array.isArray(v)) return v.some((x) => field.showIf.in.includes(x));
  return field.showIf.in.includes(v);
}

function isEmpty(v) {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

const DEC2 = /^-?\d{1,10}(\.\d{1,2})?$/;
const INT = /^-?\d{1,10}$/;

/** Mirrors the server reasons so messages come from `smartOrders.form.errors.<reason>`. */
export function validateServiceDraft(service, draft) {
  const errors = {};
  if (!service) return errors;
  const values = draft?.values || {};
  for (const f of service.fields || []) {
    if (!fieldVisible(f, values)) continue;
    const v = values[f.key];
    if (isEmpty(v) || (f.type === "checkbox" && f.required && v !== true)) {
      if (f.required) errors[f.key] = "required";
      continue;
    }
    if (f.type === "number" || f.type === "decimal") {
      const s = String(v).trim().replace(/,/g, ".");
      if (!(f.type === "decimal" ? DEC2 : INT).test(s)) errors[f.key] = "invalid_number";
      else if (f.min !== undefined && Number(s) < f.min) errors[f.key] = "below_min";
      else if (f.max !== undefined && Number(s) > f.max) errors[f.key] = "above_max";
    } else if ((f.type === "text" || f.type === "textarea") && String(v).length > (f.maxLength || 3000)) {
      errors[f.key] = "too_long";
    } else if (f.type === "url") {
      try {
        const u = new URL(String(v).trim());
        if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".")) errors[f.key] = "invalid_url";
      } catch {
        errors[f.key] = "invalid_url";
      }
    } else if (f.type === "multiselect" || f.type === "file") {
      if (f.min !== undefined && v.length < f.min) errors[f.key] = f.type === "file" ? "invalid_file" : "below_min";
      if (f.max !== undefined && v.length > f.max) errors[f.key] = "above_max";
    }
  }
  const q = service.quantity || {};
  if (draft?.quantityUnspecified) {
    if (!q.allowUnspecified) errors.quantity = "unspecified_not_allowed";
  } else if (!isEmpty(draft?.quantity)) {
    const s = String(draft.quantity).trim().replace(/,/g, ".");
    if (!(q.decimals ? DEC2 : INT).test(s) || Number(s) <= 0) errors.quantity = "invalid_number";
    else if (q.min !== undefined && Number(s) < q.min) errors.quantity = "below_min";
    else if (q.max !== undefined && Number(s) > q.max) errors.quantity = "above_max";
  } else if (q.required) {
    errors.quantity = "required";
  }
  return errors;
}

/** Multipart `serviceForm` JSON: only visible fields; files are referenced by their upload names. */
export function buildServiceFormPayload(service, draft) {
  if (!service || !draft?.serviceCode) return null;
  const values = {};
  for (const f of service.fields || []) {
    if (!fieldVisible(f, draft.values || {})) continue;
    const v = draft.values?.[f.key];
    if (isEmpty(v) && v !== false) continue;
    if (f.type === "file") values[f.key] = v.map((file) => file.name);
    else if (f.type === "datetime") {
      // datetime-local is the user's local time → send an explicit ISO instant.
      const d = new Date(v);
      values[f.key] = Number.isNaN(d.getTime()) ? v : d.toISOString();
    } else values[f.key] = v;
  }
  return {
    serviceCode: service.serviceCode,
    version: service.version,
    values,
    quantity: draft.quantityUnspecified ? null : String(draft.quantity || "").trim() || null,
    quantityUnspecified: Boolean(draft.quantityUnspecified),
  };
}

/** Files picked inside dynamic file fields (uploaded with the order attachments). */
export function serviceDraftFiles(service, draft) {
  const out = [];
  for (const f of service?.fields || []) {
    if (f.type !== "file" || !fieldVisible(f, draft?.values || {})) continue;
    for (const file of draft?.values?.[f.key] || []) out.push(file);
  }
  return out;
}

/** Focus the first invalid dynamic control (called after a failed Next/submit). */
export function focusFirstDynamicError(errors) {
  const keys = Object.keys(errors || {});
  if (!keys.length) return;
  window.requestAnimationFrame(() => {
    const root = document.querySelector('[data-testid="dynamic-service-form"]');
    if (!root) return;
    const order = ["quantity", ...Array.from(root.querySelectorAll("[data-field]")).map((el) => el.dataset.field)];
    const first = order.find((k) => keys.includes(k));
    const el =
      first === "quantity"
        ? root.querySelector('[data-testid="dynamic-quantity"]')
        : root.querySelector(`[data-field="${first}"] input, [data-field="${first}"] select, [data-field="${first}"] textarea`);
    el?.focus();
  });
}
