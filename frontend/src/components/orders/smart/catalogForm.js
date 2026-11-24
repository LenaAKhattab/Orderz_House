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

/** S7: structured field types (one level of sub-fields) and the types allowed inside them. */
export const STRUCTURED_TYPES = ["repeater", "conditional_group"];
export const SUB_FIELD_TYPES = ["text", "textarea", "number", "decimal", "select", "multiselect", "checkbox", "radio", "date", "datetime", "url"];
export const MAX_SUB_FIELDS = 12;
export const MAX_REPEATER_ITEMS = 20;

const regexCache = new Map();
/**
 * S7 `validationRegex`: anchored exactly like the server (`^(?:pattern)$`, flag `u`). An invalid pattern never
 * blocks the customer (the server vets patterns on save) → returns null.
 */
export function compileValidationRegex(pattern) {
  if (typeof pattern !== "string" || !pattern) return null;
  if (regexCache.has(pattern)) return regexCache.get(pattern);
  let re = null;
  try {
    re = new RegExp(`^(?:${pattern})$`, "u");
  } catch {
    re = null;
  }
  if (regexCache.size > 200) regexCache.clear();
  regexCache.set(pattern, re);
  return re;
}

/** The server tests the cleaned (trimmed) text, so the client does too. */
export function matchesValidationRegex(field, value) {
  const re = compileValidationRegex(field?.validationRegex);
  if (!re || typeof value !== "string") return true;
  return re.test(value.trim());
}

/** Error code for one non-empty value (top-level, repeater row or group sub-field). Mirrors the server reasons. */
function scalarError(f, v) {
  if (f.type === "number" || f.type === "decimal") {
    const s = String(v).trim().replace(/,/g, ".");
    if (!(f.type === "decimal" ? DEC2 : INT).test(s)) return "invalid_number";
    if (f.min !== undefined && f.min !== null && Number(s) < f.min) return "below_min";
    if (f.max !== undefined && f.max !== null && Number(s) > f.max) return "above_max";
    return null;
  }
  if (f.type === "text" || f.type === "textarea") {
    if (String(v).length > (f.maxLength || 3000)) return "too_long";
    return matchesValidationRegex(f, String(v)) ? null : "invalid_format";
  }
  if (f.type === "url") {
    try {
      const u = new URL(String(v).trim());
      if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".")) return "invalid_url";
    } catch {
      return "invalid_url";
    }
    return null;
  }
  if (f.type === "select" || f.type === "radio") {
    return Array.isArray(f.options) && f.options.length && !f.options.some((o) => o.value === v) ? "invalid_option" : null;
  }
  if (f.type === "multiselect" || f.type === "file") {
    if (f.min !== undefined && f.min !== null && v.length < f.min) return f.type === "file" ? "invalid_file" : "below_min";
    if (f.max !== undefined && f.max !== null && v.length > f.max) return "above_max";
  }
  return null;
}

/** Required + value checks for one field. Returns an error code or null. */
function leafError(f, v) {
  if (isEmpty(v) || (f.type === "checkbox" && f.required && v !== true)) return f.required ? "required" : null;
  return scalarError(f, v);
}

/** Sub-fields of a repeater row / conditional group; errors keyed `parent[i].sub` / `parent.sub` (server keys). */
function validateSubFields(subFields, src, prefix, errors) {
  const obj = src && typeof src === "object" && !Array.isArray(src) ? src : {};
  for (const sf of subFields || []) {
    if (!fieldVisible(sf, obj)) continue;
    const e = leafError(sf, obj[sf.key]);
    if (e) errors[`${prefix}.${sf.key}`] = e;
  }
}

function repeaterRows(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * Mirrors the server reasons (and error keys) so messages come from `smartOrders.form.errors.<reason>`:
 * `refs` (repeater count / required), `refs[0].title` (row sub-field), `print.size` (group sub-field).
 */
export function validateServiceDraft(service, draft) {
  const errors = {};
  if (!service) return errors;
  const values = draft?.values || {};
  for (const f of service.fields || []) {
    if (!fieldVisible(f, values)) continue; // hidden → dropped (also for groups)
    const v = values[f.key];
    if (f.type === "conditional_group") {
      validateSubFields(f.fields, v, f.key, errors);
      continue;
    }
    if (f.type === "repeater") {
      // minItems ≥ 1 means rows are needed even when the field is not marked required.
      const needsRows = (f.minItems || 0) > 0;
      if (!needsRows && isEmpty(v)) {
        if (f.required) errors[f.key] = "required";
        continue;
      }
      if (v !== undefined && v !== null && !Array.isArray(v)) {
        errors[f.key] = "invalid";
        continue;
      }
      const rows = repeaterRows(v);
      if (rows.length > (f.maxItems ?? MAX_REPEATER_ITEMS)) errors[f.key] = "above_max";
      else if (f.minItems !== undefined && rows.length < f.minItems) errors[f.key] = "below_min";
      else rows.forEach((row, i) => validateSubFields(f.fields, row, `${f.key}[${i}]`, errors));
      continue;
    }
    const e = leafError(f, v);
    if (e) errors[f.key] = e;
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

function payloadValue(f, v) {
  if (f.type === "file") return v.map((file) => file.name);
  if (f.type === "datetime") {
    // datetime-local is the user's local time → send an explicit ISO instant.
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toISOString();
  }
  return v;
}

/** Visible, non-empty sub-values only (hidden sub-fields are dropped, like the server). */
function subPayload(subFields, src) {
  const obj = src && typeof src === "object" && !Array.isArray(src) ? src : {};
  const out = {};
  for (const sf of subFields || []) {
    if (!fieldVisible(sf, obj)) continue;
    const v = obj[sf.key];
    if (isEmpty(v) && v !== false) continue;
    out[sf.key] = payloadValue(sf, v);
  }
  return out;
}

/** Multipart `serviceForm` JSON: only visible fields; files are referenced by their upload names. */
export function buildServiceFormPayload(service, draft) {
  if (!service || !draft?.serviceCode) return null;
  const values = {};
  for (const f of service.fields || []) {
    if (!fieldVisible(f, draft.values || {})) continue;
    const v = draft.values?.[f.key];
    if (f.type === "repeater") {
      const rows = repeaterRows(v).map((row) => subPayload(f.fields, row));
      if (rows.length) values[f.key] = rows;
      continue;
    }
    if (f.type === "conditional_group") {
      const g = subPayload(f.fields, v);
      if (Object.keys(g).length) values[f.key] = g;
      continue;
    }
    if (isEmpty(v) && v !== false) continue;
    values[f.key] = payloadValue(f, v);
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
