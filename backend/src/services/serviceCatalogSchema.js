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
  // S7: structured fields (one level of sub-fields; never nested).
  "repeater",
  "conditional_group",
]);
/** Types allowed inside a repeater row / conditional group. */
const SUB_FIELD_TYPES = new Set(["text", "textarea", "number", "decimal", "select", "multiselect", "checkbox", "radio", "date", "datetime", "url"]);
const MAX_SUB_FIELDS = 12;
const MAX_REPEATER_ITEMS = 20;
const MODIFIER_RE = /^\d{1,7}(\.\d{1,2})?$/;
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

function normalizeField(raw, idx, seenKeys, { parentPath = null } = {}) {
  const path = parentPath ? `${parentPath}.fields[${idx}]` : `fields[${idx}]`;
  if (!isPlainObject(raw)) throw schemaError("SERVICE_CATALOG_INVALID", "تعريف الحقل غير صالح.", { [path]: "invalid" });
  const key = String(raw.key || "").trim();
  if (!KEY_RE.test(key) || seenKeys.has(key)) {
    throw schemaError("SERVICE_CATALOG_INVALID", "مفتاح الحقل غير صالح أو مكرر.", { [`${path}.key`]: "invalid_or_duplicate" });
  }
  seenKeys.add(key);
  const type = String(raw.type || "").trim();
  if (!FIELD_TYPES.includes(type) || (parentPath && !SUB_FIELD_TYPES.has(type))) {
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
      const opt = { value, label: normalizeLocalized(o?.label, { max: MAX_LABEL, required: true, path: `${path}.options[${j}].label` }) };
      const pm = normalizeModifier(o?.priceModifier, `${path}.options[${j}].priceModifier`);
      if (pm !== null) opt.priceModifier = pm;
      return opt;
    });
  }
  // S7: per-field price modifier (checkbox: added when ticked; number/decimal: per unit of the value).
  if (type === "checkbox" || type === "number" || type === "decimal") {
    const pm = normalizeModifier(raw.priceModifier, `${path}.priceModifier`);
    if (pm !== null) field.priceModifier = pm;
  }
  // S7: optional format rule for free text (vetted against catastrophic backtracking).
  if ((type === "text" || type === "textarea") && raw.validationRegex !== undefined && raw.validationRegex !== null && raw.validationRegex !== "") {
    field.validationRegex = normalizeRegex(raw.validationRegex, `${path}.validationRegex`);
    const msg = normalizeLocalized(raw.validationMessage, { max: MAX_LABEL, required: false, path: `${path}.validationMessage` });
    if (Object.keys(msg).length) field.validationMessage = msg;
  }
  if (type === "repeater" || type === "conditional_group") {
    const subs = Array.isArray(raw.fields) ? raw.fields : [];
    if (!subs.length || subs.length > MAX_SUB_FIELDS) {
      throw schemaError("SERVICE_CATALOG_INVALID", "الحقول الفرعية غير صالحة.", { [`${path}.fields`]: "count" });
    }
    const subKeys = new Set();
    field.fields = subs.map((f, j) => normalizeField(f, j, subKeys, { parentPath: path }));
    if (type === "repeater") {
      const minI = finiteOrNull(raw.minItems);
      const maxI = finiteOrNull(raw.maxItems);
      const lo = minI === null ? null : Math.floor(minI);
      const hi = maxI === null ? MAX_REPEATER_ITEMS : Math.floor(maxI);
      if (Number.isNaN(minI) || Number.isNaN(maxI) || (lo !== null && lo < 0) || hi < 1 || hi > MAX_REPEATER_ITEMS || (lo !== null && lo > hi)) {
        throw schemaError("SERVICE_CATALOG_INVALID", "حدود التكرار غير صالحة.", { [`${path}.maxItems`]: "invalid" });
      }
      if (lo !== null) field.minItems = lo;
      field.maxItems = hi;
    }
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

function normalizeModifier(v, path) {
  if (v === undefined || v === null || v === "") return null;
  const t = String(isPlainObject(v) ? v.amount ?? "" : v).trim();
  if (!MODIFIER_RE.test(t)) throw schemaError("SERVICE_CATALOG_INVALID", "معدّل السعر غير صالح.", { [path]: "invalid" });
  return t;
}

/**
 * Admin-authored patterns run on customer input, so only "safe" shapes are accepted:
 * ≤ 200 chars, no back-references / look-arounds, and no quantified group that itself contains a
 * quantifier (the classic catastrophic-backtracking shape, e.g. (a+)+).
 */
function normalizeRegex(raw, path) {
  const p = String(raw);
  const bad = () => schemaError("SERVICE_CATALOG_INVALID", "نمط التحقق غير صالح أو غير آمن.", { [path]: "unsafe" });
  if (p.length > 200) throw bad();
  // Back-references (\1, \k<name>) and look-arounds ((?=, (?!, (?<=, (?<!).
  if (/\\[1-9]|\\k<|\(\?[=!<]/.test(p)) throw bad();
  // A group containing a quantifier that is itself quantified: (a+)+, (\d*)*, (x{2,})+ …
  if (/\((?:[^()\\]|\\.)*[*+}](?:[^()\\]|\\.)*\)\s*[*+?{]/.test(p)) throw bad();
  try {
    // eslint-disable-next-line no-new
    new RegExp(`^(?:${p})$`, "u");
  } catch {
    throw bad();
  }
  return p;
}

const regexCache = new Map();
function safeRegexTest(pattern, value) {
  let re = regexCache.get(pattern);
  if (!re) {
    re = new RegExp(`^(?:${pattern})$`, "u");
    if (regexCache.size > 500) regexCache.clear();
    regexCache.set(pattern, re);
  }
  return re.test(value);
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

  const pricing = normalizePricing(priceMode, raw.pricing);

  return {
    meta: { serviceCode, categoryId, subSubcategoryId: subSub, visibility, priceMode, sortOrder },
    schema: {
      name: normalizeLocalized(raw.name, { max: MAX_LABEL, required: true, path: "name" }),
      description: normalizeLocalized(raw.description, { max: 1000, required: false, path: "description" }),
      quantity,
      fields,
      // S5: optional, only when configured (existing versions stay byte-identical → no new version).
      ...(pricing ? { pricing } : {}),
    },
  };
}

const PRICE_AMOUNT_RE = /^\d{1,9}(\.\d{1,2})?$/;

/** S5 pricing config per price mode. Amounts are decimal strings (never floats); currency JOD/AED. */
function normalizePricing(priceMode, raw) {
  if (priceMode === "manual_quote" || raw === undefined || raw === null) return null;
  if (!isPlainObject(raw)) throw schemaError("SERVICE_CATALOG_INVALID", "إعدادات التسعير غير صالحة.", { pricing: "invalid" });
  const currency = String(raw.currency || "").toUpperCase();
  if (!["JOD", "AED"].includes(currency)) {
    throw schemaError("SERVICE_CATALOG_INVALID", "عملة التسعير غير صالحة.", { "pricing.currency": "invalid" });
  }
  const amt = (v, path, { optional = false } = {}) => {
    if (optional && (v === undefined || v === null || v === "")) return undefined;
    const t = String(v ?? "").trim();
    if (!PRICE_AMOUNT_RE.test(t) || /^0+(\.0+)?$/.test(t)) {
      throw schemaError("SERVICE_CATALOG_INVALID", "مبلغ التسعير غير صالح.", { [path]: "invalid" });
    }
    return t;
  };
  const cents = (t) => {
    const [w, f = ""] = t.split(".");
    return Number(w) * 100 + Number(f.padEnd(2, "0"));
  };
  switch (priceMode) {
    case "fixed":
      return { currency, amount: amt(raw.amount, "pricing.amount") };
    case "per_unit": {
      const out = { currency, unitAmount: amt(raw.unitAmount, "pricing.unitAmount") };
      const min = amt(raw.minAmount, "pricing.minAmount", { optional: true });
      if (min !== undefined) out.minAmount = min;
      return out;
    }
    case "range": {
      const min = amt(raw.minAmount, "pricing.minAmount");
      const max = amt(raw.maxAmount, "pricing.maxAmount");
      if (cents(min) > cents(max)) throw schemaError("SERVICE_CATALOG_INVALID", "نطاق السعر غير صالح.", { "pricing.maxAmount": "invalid" });
      return { currency, minAmount: min, maxAmount: max };
    }
    case "package": {
      const list = Array.isArray(raw.packages) ? raw.packages : [];
      if (!list.length || list.length > 10) {
        throw schemaError("SERVICE_CATALOG_INVALID", "الباقات غير صالحة.", { "pricing.packages": "invalid" });
      }
      const seen = new Set();
      const packages = list.map((p, i) => {
        const code = String(p?.code || "").trim();
        if (!/^[a-z][a-z0-9_]{0,39}$/.test(code) || seen.has(code)) {
          throw schemaError("SERVICE_CATALOG_INVALID", "رمز الباقة غير صالح.", { [`pricing.packages[${i}].code`]: "invalid" });
        }
        seen.add(code);
        return {
          code,
          label: normalizeLocalized(p.label, { max: MAX_LABEL, required: true, path: `pricing.packages[${i}].label` }),
          amount: amt(p.amount, `pricing.packages[${i}].amount`),
        };
      });
      return { currency, packages };
    }
    default:
      return null;
  }
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

/** One scalar field value (shared by top-level fields, repeater rows and conditional groups). */
function validateScalar(field, raw, uploaded) {
  const out = {};
  const errors = {};
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
  if (errors[field.key]) return { error: errors[field.key] };
  if (!Object.prototype.hasOwnProperty.call(out, field.key)) return { has: false };
  // S7: optional per-field format rule (text/textarea only; compiled from a vetted pattern).
  if (field.validationRegex && typeof out[field.key] === "string" && !safeRegexTest(field.validationRegex, out[field.key])) {
    return { error: "invalid_format" };
  }
  return { has: true, value: out[field.key] };
}

/** Sub-fields of a group/row: required handling + scalar validation; errors keyed `parent.sub` / `parent[i].sub`. */
function validateSubFields(subFields, src, uploaded, prefix) {
  const errors = {};
  const out = {};
  const obj = isPlainObject(src) ? src : {};
  const known = new Set(subFields.map((f) => f.key));
  for (const k of Object.keys(obj)) if (!known.has(k)) errors[`${prefix}.${k}`] = "unknown_field";
  for (const f of subFields) {
    const raw = Object.prototype.hasOwnProperty.call(obj, f.key) ? obj[f.key] : undefined;
    if (!fieldVisible(f, out)) continue;
    if (isEmptyValue(raw) || (f.type === "checkbox" && raw === false && f.required)) {
      if (f.required) errors[`${prefix}.${f.key}`] = "required";
      else if (f.type === "checkbox" && raw === false) out[f.key] = false;
      continue;
    }
    const r = validateScalar(f, raw, uploaded);
    if (r.error) errors[`${prefix}.${f.key}`] = r.error;
    else if (r.has) out[f.key] = r.value;
  }
  return Object.keys(errors).length ? { errors } : { value: out };
}

function validateRepeater(field, raw, uploaded) {
  if (raw === undefined || raw === null) raw = [];
  if (!Array.isArray(raw) || raw.length > (field.maxItems ?? MAX_REPEATER_ITEMS)) {
    return { errors: { [field.key]: Array.isArray(raw) ? "above_max" : "invalid" } };
  }
  if (field.minItems !== undefined && raw.length < field.minItems) return { errors: { [field.key]: "below_min" } };
  const rows = [];
  const errors = {};
  raw.forEach((row, i) => {
    const r = validateSubFields(field.fields, row, uploaded, `${field.key}[${i}]`);
    if (r.errors) Object.assign(errors, r.errors);
    else rows.push(r.value);
  });
  return Object.keys(errors).length ? { errors } : { value: rows };
}

function validateGroup(field, raw, uploaded) {
  return validateSubFields(field.fields, raw, uploaded, field.key);
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
    const repeaterNeedsRows = field.type === "repeater" && (field.minItems || 0) > 0;
    if (field.type !== "conditional_group" && !repeaterNeedsRows && (isEmptyValue(raw) || (field.type === "checkbox" && raw === false && field.required))) {
      if (field.required) errors[field.key] = "required";
      else if (field.type === "checkbox" && raw === false) out[field.key] = false;
      continue;
    }
    if (field.type === "repeater") {
      const r = validateRepeater(field, raw, uploaded);
      if (r.errors) Object.assign(errors, r.errors);
      else out[field.key] = r.value;
      continue;
    }
    if (field.type === "conditional_group") {
      const r = validateGroup(field, raw, uploaded);
      if (r.errors) Object.assign(errors, r.errors);
      else if (Object.keys(r.value).length) out[field.key] = r.value;
      continue;
    }
    const r = validateScalar(field, raw, uploaded);
    if (r.error) errors[field.key] = r.error;
    else if (r.has) out[field.key] = r.value;
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
  normalizePricing,
  VISIBILITIES,
  SERVICE_CODE_RE,
  normalizeServiceDefinition,
  validateOrderForm,
  parseServiceFormInput,
  schemaUsesOnly,
  fieldVisible,
};
