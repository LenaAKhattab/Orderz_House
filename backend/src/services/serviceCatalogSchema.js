/**
 * Smart Orders S2 — declarative service form schema (pure, no DB).
 *
 * Catalog definitions are untrusted configuration: they are normalised through an allowlist
 * (types, keys, units, locales). There are no regexes or executable rules in definitions; order
 * values are validated with fixed, linear-time checks only.
 */
const { createPublicApiError } = require("../utils/publicApiError");

const LOCALES = Object.freeze(["ar", "en", "de", "nl", "ro"]);
const REQUIRED_LOCALES = Object.freeze(["ar", "en"]);
const FIELD_TYPES = Object.freeze([
  "text",
  "textarea",
  "number",
  "decimal",
  "select",
  "multiselect",
  "checkbox",
  "radio",
  "date",
  "datetime",
  "file",
  "url",
]);
const OPTION_TYPES = new Set(["select", "multiselect", "radio"]);
const QUANTITY_UNITS = Object.freeze([
  "pages",
  "words",
  "documents",
  "slides",
  "worksheets",
  "files",
  "dashboards",
  "concepts",
  "designs",
  "screens",
  "features",
  "projects",
  "minutes",
  "clips",
  "posts",
  "campaigns",
  "hours",
  "units",
]);
const PRICE_MODES = Object.freeze(["fixed", "per_unit", "package", "manual_quote", "range"]);
const VISIBILITIES = Object.freeze(["public", "admin_only"]);

const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const OPTION_VALUE_RE = /^[a-z0-9][a-z0-9_]{0,39}$/;
const SERVICE_CODE_RE = /^[a-z][a-z0-9_]{2,59}$/;
const MAX_FIELDS = 30;
const MAX_OPTIONS = 40;
const MAX_LABEL = 160;
const MAX_HELP = 400;
const DEFAULT_TEXT_MAX = 200;
const DEFAULT_TEXTAREA_MAX = 3000;
const MAX_TEXTAREA = 8000;
const MAX_URL = 500;
const MAX_NUMBER = 1e9;

function schemaError(code, messageAr, fieldErrors) {
  const err = createPublicApiError(messageAr, 400, code);
  if (fieldErrors) err.fieldErrors = fieldErrors;
  return err;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

/** Text content is displayed as text only; strip control chars + angle brackets defensively. */
function cleanText(raw, max) {
  if (raw === undefined || raw === null) return "";
  const s = String(raw)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[<>]/g, "")
    .trim();
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeLocalized(raw, { max, required, path }) {
  const src = isPlainObject(raw) ? raw : {};
  const out = {};
  for (const loc of LOCALES) {
    const v = cleanText(src[loc], max);
    if (v) out[loc] = v;
  }
  if (required) {
    for (const loc of REQUIRED_LOCALES) {
      if (!out[loc]) {
        throw schemaError("SERVICE_CATALOG_INVALID", "تعريف الخدمة غير صالح.", { [path]: `missing_${loc}` });
      }
    }
  }
  return out;
}

function finiteOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= MAX_NUMBER ? n : NaN;
}

function normalizeField(raw, idx, seenKeys) {
  const path = `fields[${idx}]`;
  if (!isPlainObject(raw)) throw schemaError("SERVICE_CATALOG_INVALID", "تعريف الحقل غير صالح.", { [path]: "invalid" });
  const key = String(raw.key || "").trim();
  if (!KEY_RE.test(key) || seenKeys.has(key)) {
    throw schemaError("SERVICE_CATALOG_INVALID", "مفتاح الحقل غير صالح أو مكرر.", { [`${path}.key`]: "invalid_or_duplicate" });
  }
  seenKeys.add(key);
  const type = String(raw.type || "").trim();
  if (!FIELD_TYPES.includes(type)) {
    throw schemaError("SERVICE_CATALOG_INVALID", "نوع الحقل غير مدعوم.", { [`${path}.type`]: "unsupported" });
  }
  const field = {
    key,
    type,
    label: normalizeLocalized(raw.label, { max: MAX_LABEL, required: true, path: `${path}.label` }),
    placeholder: normalizeLocalized(raw.placeholder, { max: MAX_LABEL, required: false, path: `${path}.placeholder` }),
    help: normalizeLocalized(raw.help, { max: MAX_HELP, required: false, path: `${path}.help` }),
    required: raw.required === true,
  };
  if (type === "number" || type === "decimal" || type === "multiselect" || type === "file") {
    const min = finiteOrNull(raw.min);
    const max = finiteOrNull(raw.max);
    if (Number.isNaN(min) || Number.isNaN(max) || (min !== null && max !== null && min > max)) {
      throw schemaError("SERVICE_CATALOG_INVALID", "حدود الحقل غير صالحة.", { [`${path}.min`]: "invalid" });
    }
    if (min !== null) field.min = min;
    if (max !== null) field.max = max;
  }
  if (type === "text" || type === "textarea") {
    const cap = type === "text" ? 500 : MAX_TEXTAREA;
    const ml = finiteOrNull(raw.maxLength);
    field.maxLength =
      ml && ml > 0 ? Math.min(Math.floor(ml), cap) : type === "text" ? DEFAULT_TEXT_MAX : DEFAULT_TEXTAREA_MAX;
  }
  if (OPTION_TYPES.has(type)) {
    const opts = Array.isArray(raw.options) ? raw.options : [];
    if (opts.length < 1 || opts.length > MAX_OPTIONS) {
      throw schemaError("SERVICE_CATALOG_INVALID", "خيارات الحقل غير صالحة.", { [`${path}.options`]: "count" });
    }
    const seen = new Set();
    field.options = opts.map((o, j) => {
      const value = String(o?.value || "").trim();
      if (!OPTION_VALUE_RE.test(value) || seen.has(value)) {
        throw schemaError("SERVICE_CATALOG_INVALID", "قيمة الخيار غير صالحة أو مكررة.", {
          [`${path}.options[${j}].value`]: "invalid_or_duplicate",
        });
      }
      seen.add(value);
      return { value, label: normalizeLocalized(o?.label, { max: MAX_LABEL, required: true, path: `${path}.options[${j}].label` }) };
    });
  }
  if (raw.showIf !== undefined && raw.showIf !== null) {
    const s = raw.showIf;
    const ref = String(s?.field || "").trim();
    if (!isPlainObject(s) || !seenKeys.has(ref) || ref === key) {
      // Conditions may only reference EARLIER fields: no cycles, linear evaluation.
      throw schemaError("SERVICE_CATALOG_INVALID", "شرط الإظهار غير صالح.", { [`${path}.showIf`]: "invalid" });
    }
    const values = Array.isArray(s.in) ? s.in : s.equals !== undefined ? [s.equals] : [];
    const clean = values
      .map((v) => (typeof v === "boolean" ? v : String(v)))
      .filter((v) => typeof v === "boolean" || OPTION_VALUE_RE.test(v))
      .slice(0, MAX_OPTIONS);
    if (!clean.length) throw schemaError("SERVICE_CATALOG_INVALID", "شرط الإظهار غير صالح.", { [`${path}.showIf`]: "invalid" });
    field.showIf = { field: ref, in: clean };
  }
  return field;
}

/**
 * Normalise an Admin-submitted service definition. Returns `{ meta, schema }` where `schema` is the
 * immutable versioned part (unit, quantity rules, fields, names) stored per version.
 */
function normalizeServiceDefinition(raw) {
  if (!isPlainObject(raw)) throw schemaError("SERVICE_CATALOG_INVALID", "تعريف الخدمة غير صالح.");
  const serviceCode = String(raw.serviceCode || "").trim();
  if (!SERVICE_CODE_RE.test(serviceCode)) {
    throw schemaError("SERVICE_CATALOG_INVALID", "رمز الخدمة غير صالح.", { serviceCode: "invalid" });
  }
  const categoryId = Number(raw.categoryId);
  if (!Number.isInteger(categoryId) || categoryId < 1) {
    throw schemaError("SERVICE_CATALOG_INVALID", "التصنيف غير صالح.", { categoryId: "invalid" });
  }
  const subSub = raw.subSubcategoryId === undefined || raw.subSubcategoryId === null || raw.subSubcategoryId === "" ? null : Number(raw.subSubcategoryId);
  if (subSub !== null && (!Number.isInteger(subSub) || subSub < 1)) {
    throw schemaError("SERVICE_CATALOG_INVALID", "التصنيف الفرعي غير صالح.", { subSubcategoryId: "invalid" });
  }
  const visibility = VISIBILITIES.includes(raw.visibility) ? raw.visibility : "public";
  const priceMode = PRICE_MODES.includes(raw.priceMode) ? raw.priceMode : "manual_quote";
  const sortOrder = Number.isInteger(Number(raw.sortOrder)) ? Math.max(0, Math.min(100000, Number(raw.sortOrder))) : 0;

  const q = isPlainObject(raw.quantity) ? raw.quantity : {};
  const unit = String(q.unit || "").trim();
  if (!QUANTITY_UNITS.includes(unit)) {
    throw schemaError("SERVICE_CATALOG_INVALID", "وحدة الكمية غير مدعومة.", { "quantity.unit": "unsupported" });
  }
  const qMin = finiteOrNull(q.min);
  const qMax = finiteOrNull(q.max);
  if (Number.isNaN(qMin) || Number.isNaN(qMax) || (qMin !== null && qMin < 0) || (qMin !== null && qMax !== null && qMin > qMax)) {
    throw schemaError("SERVICE_CATALOG_INVALID", "حدود الكمية غير صالحة.", { "quantity.min": "invalid" });
  }
  const quantity = {
    unit,
    required: q.required === true,
    allowUnspecified: q.allowUnspecified === true,
    decimals: q.decimals === true,
    ...(qMin !== null ? { min: qMin } : {}),
    ...(qMax !== null ? { max: qMax } : {}),
  };

  const rawFields = Array.isArray(raw.fields) ? raw.fields : [];
  if (rawFields.length > MAX_FIELDS) {
    throw schemaError("SERVICE_CATALOG_INVALID", "عدد الحقول كبير جدًا.", { fields: "too_many" });
  }
  const seenKeys = new Set();
  const fields = rawFields.map((f, i) => normalizeField(f, i, seenKeys));

  return {
    meta: { serviceCode, categoryId, subSubcategoryId: subSub, visibility, priceMode, sortOrder },
    schema: {
      name: normalizeLocalized(raw.name, { max: MAX_LABEL, required: true, path: "name" }),
      description: normalizeLocalized(raw.description, { max: 1000, required: false, path: "description" }),
      quantity,
      fields,
    },
  };
}

/** Field types a client says it can render (Flutter sends its supported list). */
function schemaUsesOnly(schema, allowedTypes) {
  if (!allowedTypes) return true;
  const allowed = new Set(allowedTypes);
  return (schema?.fields || []).every((f) => allowed.has(f.type));
}

// ---------------------------------------------------------------------------
// Order value validation
// ---------------------------------------------------------------------------

function isEmptyValue(v) {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

function parseDecimalText(raw, decimals) {
  const s = String(raw ?? "").trim().replace(/,/g, ".");
  const re = decimals ? /^-?\d{1,10}(\.\d{1,2})?$/ : /^-?\d{1,10}$/;
  if (!re.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function normalizeUrl(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length > MAX_URL) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || !u.hostname.includes(".")) return null;
  return u.toString();
}

function fieldVisible(field, values) {
  if (!field.showIf) return true;
  const v = values[field.showIf.field];
  if (Array.isArray(v)) return v.some((x) => field.showIf.in.includes(x));
  return field.showIf.in.includes(v);
}

/**
 * Validate submitted values against a service schema version.
 * @param {object} schema versioned service schema
 * @param {{ values?: object, quantity?: any, quantityUnspecified?: boolean }} input
 * @param {{ uploadedFileNames?: string[] }} ctx original names of files uploaded in the same request
 * @returns {{ values: object, quantity: string|null, quantityUnspecified: boolean }}
 */
function validateOrderForm(schema, input, ctx = {}) {
  const errors = {};
  const src = isPlainObject(input?.values) ? input.values : {};
  const known = new Set((schema.fields || []).map((f) => f.key));
  for (const k of Object.keys(src)) {
    if (!known.has(k)) errors[k] = "unknown_field";
  }
  const uploaded = new Set((ctx.uploadedFileNames || []).map((n) => String(n)));
  const out = {};
  for (const field of schema.fields || []) {
    const raw = Object.prototype.hasOwnProperty.call(src, field.key) ? src[field.key] : undefined;
    if (!fieldVisible(field, out)) continue; // hidden → dropped
    if (isEmptyValue(raw) || (field.type === "checkbox" && raw === false && field.required)) {
      if (field.required) errors[field.key] = "required";
      else if (field.type === "checkbox" && raw === false) out[field.key] = false;
      continue;
    }
    switch (field.type) {
      case "text":
      case "textarea": {
        if (typeof raw !== "string") {
          errors[field.key] = "invalid";
          break;
        }
        const v = cleanText(raw, MAX_TEXTAREA + 1);
        if (!v) {
          if (field.required) errors[field.key] = "required";
        } else if (v.length > field.maxLength) errors[field.key] = "too_long";
        else out[field.key] = v;
        break;
      }
      case "number":
      case "decimal": {
        const n = parseDecimalText(raw, field.type === "decimal");
        if (n === null) errors[field.key] = "invalid_number";
        else if (field.min !== undefined && n < field.min) errors[field.key] = "below_min";
        else if (field.max !== undefined && n > field.max) errors[field.key] = "above_max";
        else out[field.key] = field.type === "decimal" ? n.toFixed(2) : n;
        break;
      }
      case "select":
      case "radio": {
        const v = String(raw);
        if (!field.options.some((o) => o.value === v)) errors[field.key] = "invalid_option";
        else out[field.key] = v;
        break;
      }
      case "multiselect": {
        const arr = Array.isArray(raw) ? raw.map(String) : null;
        if (!arr || new Set(arr).size !== arr.length || arr.some((v) => !field.options.some((o) => o.value === v))) {
          errors[field.key] = "invalid_option";
        } else if (field.min !== undefined && arr.length < field.min) errors[field.key] = "below_min";
        else if (field.max !== undefined && arr.length > field.max) errors[field.key] = "above_max";
        else out[field.key] = arr;
        break;
      }
      case "checkbox":
        if (raw === true || raw === "true") out[field.key] = true;
        else if (raw === false || raw === "false") out[field.key] = false;
        else errors[field.key] = "invalid";
        break;
      case "date":
        if (typeof raw !== "string" || !isValidDate(raw)) errors[field.key] = "invalid_date";
        else out[field.key] = raw;
        break;
      case "datetime": {
        const d = typeof raw === "string" && raw.length <= 40 ? new Date(raw) : null;
        if (!d || Number.isNaN(d.getTime())) errors[field.key] = "invalid_date";
        else out[field.key] = d.toISOString();
        break;
      }
      case "url": {
        const u = typeof raw === "string" ? normalizeUrl(raw) : null;
        if (!u) errors[field.key] = "invalid_url";
        else out[field.key] = u;
        break;
      }
      case "file": {
        const names = Array.isArray(raw) ? raw.map((n) => String(n)) : null;
        if (!names || names.some((n) => !uploaded.has(n)) || new Set(names).size !== names.length) {
          errors[field.key] = "invalid_file";
        } else if (field.max !== undefined && names.length > field.max) errors[field.key] = "above_max";
        else out[field.key] = names.map((name) => ({ name }));
        break;
      }
      default:
        errors[field.key] = "unsupported";
    }
  }

  const q = schema.quantity || {};
  let quantity = null;
  const unspecified = input?.quantityUnspecified === true || input?.quantityUnspecified === "true";
  if (unspecified) {
    if (!q.allowUnspecified) errors.quantity = "unspecified_not_allowed";
  } else if (!isEmptyValue(input?.quantity)) {
    const n = parseDecimalText(input.quantity, q.decimals === true);
    if (n === null) errors.quantity = "invalid_number";
    else if (n <= 0) errors.quantity = "below_min";
    else if (q.min !== undefined && n < q.min) errors.quantity = "below_min";
    else if (q.max !== undefined && n > q.max) errors.quantity = "above_max";
    else quantity = q.decimals ? n.toFixed(2) : String(n);
  } else if (q.required) {
    errors.quantity = "required";
  }

  if (Object.keys(errors).length) {
    throw schemaError("SMART_ORDER_FORM_INVALID", "بيانات نموذج الخدمة غير مكتملة أو غير صالحة.", errors);
  }
  return { values: out, quantity, quantityUnspecified: unspecified && Boolean(q.allowUnspecified) };
}

/** Parse the multipart `serviceForm` JSON. Returns null when no service was chosen. */
function parseServiceFormInput(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  let obj = raw;
  if (typeof raw === "string") {
    if (raw.length > 100000) throw schemaError("SMART_ORDER_FORM_INVALID", "نموذج الخدمة كبير جدًا.");
    try {
      obj = JSON.parse(raw);
    } catch {
      throw schemaError("SMART_ORDER_FORM_INVALID", "نموذج الخدمة غير صالح.");
    }
  }
  if (!isPlainObject(obj)) throw schemaError("SMART_ORDER_FORM_INVALID", "نموذج الخدمة غير صالح.");
  const serviceCode = String(obj.serviceCode || "").trim();
  if (!serviceCode) return null;
  if (!SERVICE_CODE_RE.test(serviceCode)) throw schemaError("SMART_ORDER_FORM_INVALID", "الخدمة غير صالحة.", { serviceCode: "invalid" });
  const version = obj.version === undefined || obj.version === null ? null : Number(obj.version);
  if (version !== null && (!Number.isInteger(version) || version < 1)) {
    throw schemaError("SMART_ORDER_FORM_INVALID", "نسخة النموذج غير صالحة.", { version: "invalid" });
  }
  return {
    serviceCode,
    version,
    values: isPlainObject(obj.values) ? obj.values : {},
    quantity: obj.quantity,
    quantityUnspecified: obj.quantityUnspecified === true,
  };
}

module.exports = {
  LOCALES,
  FIELD_TYPES,
  QUANTITY_UNITS,
  PRICE_MODES,
  VISIBILITIES,
  SERVICE_CODE_RE,
  normalizeServiceDefinition,
  validateOrderForm,
  parseServiceFormInput,
  schemaUsesOnly,
  fieldVisible,
};
