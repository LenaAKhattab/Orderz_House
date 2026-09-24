/**
 * Per-campaign Legacy contract field configuration + answer validation/storage.
 */
const { pool } = require("../config/db");
const { createPublicApiError } = require("../utils/publicApiError");
const {
  CONTRACT_FIELD_BY_KEY,
  CONTRACT_FIELDS,
  SENSITIVE_FIELD_KEYS,
  SYSTEM_ACCOUNT_FIELDS,
  SECTIONS,
  getContractCatalog,
  getDefaultFieldSeedRows,
} = require("../constants/legacyFreelancerContractCatalog");
const { parseDetailedSkillsPrograms } = require("../constants/legacyFreelancerWorkFields");
const {
  EDUCATION_OTHER_VALUE,
  buildGraduationYearOptions,
  normalizeGraduationYearValue,
} = require("../constants/legacyEducationOptions");
const { canonicalJordanCity, CITY_OTHER_VALUE } = require("../constants/jordanCities");

function coerceYesNo(value) {
  if (value === true || value === 1 || value === "1" || value === "true" || value === "yes" || value === "YES" || value === "نعم") {
    return true;
  }
  if (value === false || value === 0 || value === "0" || value === "false" || value === "no" || value === "NO" || value === "لا") {
    return false;
  }
  return null;
}

function isEmptyAnswer(value) {
  if (value == null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function conditionMet(conditional, answersMap) {
  if (!conditional || !conditional.fieldKey) return true;
  const parentVal = answersMap[conditional.fieldKey];
  const expected = conditional.equals;
  if (typeof expected === "boolean") {
    return coerceYesNo(parentVal) === expected;
  }
  return String(parentVal ?? "") === String(expected);
}

function normalizeTextLike(raw, maxLen = 500) {
  return String(raw).trim().replace(/\s+/g, " ").slice(0, maxLen);
}

function normalizeAnswerValue(fieldDef, raw) {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return null;
  if (fieldDef.key === "national_id") {
    const { normalizeAndValidateNationalId } = require("../utils/legacyFreelancerMemberId");
    return normalizeAndValidateNationalId(raw, { required: true });
  }
  switch (fieldDef.type) {
    case "yes_no":
    case "checkbox": {
      const b = coerceYesNo(raw);
      if (b == null) {
        throw createPublicApiError(`قيمة غير صالحة للحقل: ${fieldDef.labelAr}`, 400, "VALIDATION_ERROR");
      }
      return b;
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, "").trim());
      if (!Number.isFinite(n)) {
        throw createPublicApiError(`قيمة رقمية غير صالحة: ${fieldDef.labelAr}`, 400, "VALIDATION_ERROR");
      }
      return n;
    }
    case "year_select": {
      const normalized = normalizeGraduationYearValue(raw);
      if (normalized == null) {
        throw createPublicApiError(`سنة تخرج غير صالحة: ${fieldDef.labelAr}`, 400, "VALIDATION_ERROR");
      }
      return normalized;
    }
    case "date": {
      const s = String(raw).trim().slice(0, 32);
      const d = new Date(s);
      if (!Number.isFinite(d.getTime())) {
        throw createPublicApiError(`تاريخ غير صالح: ${fieldDef.labelAr}`, 400, "VALIDATION_ERROR");
      }
      return s.slice(0, 10);
    }
    case "select": {
      const v = normalizeTextLike(raw, 200);
      if (v === EDUCATION_OTHER_VALUE || v === CITY_OTHER_VALUE || v === "أخرى") {
        throw createPublicApiError(`يرجى كتابة قيمة مخصصة للحقل: ${fieldDef.labelAr}`, 400, "VALIDATION_ERROR");
      }
      const opts = fieldDef.options || [];
      const allowCustom = Boolean(fieldDef.allowCustomOther);
      if (opts.length && !opts.some((o) => o.value === v)) {
        // Historical free-text or "Other" custom value — allowed when catalog permits custom.
        if (!allowCustom) {
          throw createPublicApiError(`خيار غير صالح: ${fieldDef.labelAr}`, 400, "VALIDATION_ERROR");
        }
      }
      return v;
    }
    case "searchable_select": {
      let v = normalizeTextLike(raw, 200);
      if (v === CITY_OTHER_VALUE || v === "أخرى") {
        throw createPublicApiError(`يرجى كتابة اسم المدينة`, 400, "VALIDATION_ERROR");
      }
      if (fieldDef.key === "city") {
        const canon = canonicalJordanCity(v);
        if (canon) v = canon;
      }
      return v;
    }
    case "smart_text":
    case "textarea":
    case "text":
    case "phone":
    default:
      return normalizeTextLike(raw, fieldDef.type === "textarea" ? 4000 : 500);
  }
}

function maskSensitiveValue(fieldKey, value) {
  if (value == null) return null;
  if (!SENSITIVE_FIELD_KEYS.includes(fieldKey)) return value;
  const s = String(typeof value === "object" ? JSON.stringify(value) : value);
  if (s.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

async function ensureDefaultFieldsForCampaign(campaignId, client = null) {
  const runner = client || pool;
  const cid = Number(campaignId);
  if (!Number.isInteger(cid) || cid < 1) {
    throw createPublicApiError("معرف الحملة غير صالح.", 400, "VALIDATION_ERROR");
  }
  const seeds = getDefaultFieldSeedRows();
  for (const seed of seeds) {
    await runner.query(
      `INSERT INTO legacy_freelancer_invite_campaign_fields
         (campaign_id, field_key, label_ar, is_enabled, is_required, sort_order, config_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (campaign_id, field_key) DO NOTHING`,
      [
        cid,
        seed.fieldKey,
        seed.labelAr,
        seed.isEnabled,
        seed.isRequired && seed.isEnabled,
        seed.sortOrder,
        JSON.stringify(seed.configJson || {}),
      ],
    );
  }
  return getCampaignFieldConfig(cid, { client: runner, includeDisabled: true });
}

async function getCampaignFieldConfig(campaignId, { client = null, includeDisabled = true } = {}) {
  const runner = client || pool;
  const cid = Number(campaignId);
  const { rows } = await runner.query(
    `SELECT id, campaign_id, field_key, label_ar, is_enabled, is_required, sort_order, config_json, updated_at
       FROM legacy_freelancer_invite_campaign_fields
      WHERE campaign_id = $1
      ORDER BY sort_order ASC, id ASC`,
    [cid],
  );

  if (rows.length === 0) {
    // Soft ensure for campaigns created before migration seed
    await ensureDefaultFieldsForCampaign(cid, runner);
    const again = await runner.query(
      `SELECT id, campaign_id, field_key, label_ar, is_enabled, is_required, sort_order, config_json, updated_at
         FROM legacy_freelancer_invite_campaign_fields
        WHERE campaign_id = $1
        ORDER BY sort_order ASC, id ASC`,
      [cid],
    );
    return mapConfigRows(again.rows, { includeDisabled });
  }
  return mapConfigRows(rows, { includeDisabled });
}

function mapConfigRows(rows, { includeDisabled }) {
  const catalog = getContractCatalog();
  const items = rows
    .map((r) => {
      const def = CONTRACT_FIELD_BY_KEY[r.field_key];
      if (!def) return null;
      const cfg = r.config_json && typeof r.config_json === "object" ? r.config_json : {};
      let options = def.options ? def.options.map((o) => ({ ...o })) : null;
      if (def.type === "year_select") {
        options = buildGraduationYearOptions();
      }
      return {
        id: String(r.id),
        fieldKey: r.field_key,
        labelAr: r.label_ar || def.labelAr,
        helperAr: cfg.helperAr ?? def.helperAr ?? null,
        type: def.type,
        section: def.section,
        isEnabled: Boolean(r.is_enabled),
        isRequired: Boolean(r.is_required),
        sortOrder: Number(r.sort_order),
        options,
        conditional: def.conditional ? { ...def.conditional } : null,
        sensitive: Boolean(def.sensitive),
        informationalOnly: Boolean(def.informationalOnly),
        suggestionEnabled: Boolean(def.suggestionEnabled),
        controlLocked: Boolean(def.controlLocked),
        allowCustomOther: Boolean(def.allowCustomOther),
        otherValue: def.otherValue || null,
        otherLabelAr: def.otherLabelAr || null,
        notYetValue: def.notYetValue || null,
        notYetLabelAr: def.notYetLabelAr || null,
        updatedAt: r.updated_at,
      };
    })
    .filter(Boolean)
    .filter((f) => includeDisabled || f.isEnabled);

  return {
    systemAccountFields: SYSTEM_ACCOUNT_FIELDS.map((f) => ({
      ...f,
      isEnabled: true,
      isRequired: true,
      systemLocked: true,
      labelNote: "حقل أساسي للنظام",
    })),
    sections: catalog.sections,
    suggestionFieldKeys: catalog.suggestionFieldKeys,
    lockedControlFieldKeys: catalog.lockedControlFieldKeys,
    fields: items,
  };
}

function buildPublicFormFields(config) {
  return (config.fields || [])
    .filter((f) => f.isEnabled)
    .map((f) => {
      let options = f.options
        ? f.options.map((o) => ({ value: o.value, label: o.labelAr || o.label }))
        : null;
      if (f.type === "year_select") {
        options = buildGraduationYearOptions().map((o) => ({
          value: o.value,
          label: o.labelAr || o.label,
        }));
      }
      if (f.type === "searchable_select" && f.allowCustomOther) {
        const otherVal = f.otherValue || CITY_OTHER_VALUE;
        const otherLabel = f.otherLabelAr || "أخرى";
        const withoutDup = (options || []).filter((o) => o.value !== otherVal);
        options = [...withoutDup, { value: otherVal, label: otherLabel }];
      }
      if (f.type === "select" && f.allowCustomOther && f.otherValue) {
        // keep other in options for UI; submitted value must be custom text
      }
      return {
        key: f.fieldKey,
        label: f.labelAr,
        helper: f.helperAr || null,
        type: f.type,
        required: Boolean(f.isRequired),
        sortOrder: f.sortOrder,
        section: f.section,
        options,
        allowCustomOther: Boolean(f.allowCustomOther),
        otherValue: f.otherValue || null,
        otherLabel: f.otherLabelAr || null,
        suggestionEnabled: Boolean(f.suggestionEnabled),
        notYetValue: f.notYetValue || null,
        notYetLabel: f.notYetLabelAr || null,
        conditionalRule: f.conditional
          ? { fieldKey: f.conditional.fieldKey, equals: f.conditional.equals }
          : null,
      };
    });
}

async function replaceCampaignFieldConfig(campaignId, fieldsPayload, { actorAdminId = null } = {}) {
  const cid = Number(campaignId);
  if (!Array.isArray(fieldsPayload)) {
    throw createPublicApiError("تهيئة الحقول غير صالحة.", 400, "VALIDATION_ERROR");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureDefaultFieldsForCampaign(cid, client);

    const seen = new Set();
    for (const item of fieldsPayload) {
      const key = String(item.fieldKey || item.field_key || "").trim();
      const def = CONTRACT_FIELD_BY_KEY[key];
      if (!def) {
        throw createPublicApiError(`حقل غير معروف: ${key}`, 400, "VALIDATION_ERROR");
      }
      if (seen.has(key)) {
        throw createPublicApiError(`حقل مكرر: ${key}`, 400, "VALIDATION_ERROR");
      }
      seen.add(key);

      const isEnabled = item.isEnabled != null ? Boolean(item.isEnabled) : Boolean(item.is_enabled);
      let isRequired = item.isRequired != null ? Boolean(item.isRequired) : Boolean(item.is_required);
      if (!isEnabled) isRequired = false;
      const sortOrder =
        item.sortOrder != null
          ? Number(item.sortOrder)
          : item.sort_order != null
            ? Number(item.sort_order)
            : def.sortOrder;
      const labelAr = String(item.labelAr || item.label_ar || def.labelAr).trim().slice(0, 200) || def.labelAr;

      await client.query(
        `UPDATE legacy_freelancer_invite_campaign_fields
            SET label_ar = $3,
                is_enabled = $4,
                is_required = $5,
                sort_order = $6,
                updated_at = NOW()
          WHERE campaign_id = $1 AND field_key = $2`,
        [cid, key, labelAr, isEnabled, isRequired, sortOrder],
      );
    }

    await client.query(
      `INSERT INTO legacy_freelancer_invite_audit_logs
         (action, actor_admin_id, campaign_id, detail)
       VALUES ('LEGACY_FREELANCER_CAMPAIGN_FIELDS_UPDATED', $1, $2, $3::jsonb)`,
      [
        actorAdminId ? Number(actorAdminId) : null,
        cid,
        JSON.stringify({
          updatedFieldCount: seen.size,
          // never include answer values
          timestamp: new Date().toISOString(),
        }),
      ],
    );

    await client.query("COMMIT");
    return getCampaignFieldConfig(cid, { includeDisabled: true });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function restoreDefaultFieldConfig(campaignId, { actorAdminId = null } = {}) {
  const cid = Number(campaignId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM legacy_freelancer_invite_campaign_fields WHERE campaign_id = $1`, [cid]);
    await ensureDefaultFieldsForCampaign(cid, client);
    await client.query(
      `INSERT INTO legacy_freelancer_invite_audit_logs
         (action, actor_admin_id, campaign_id, detail)
       VALUES ('LEGACY_FREELANCER_CAMPAIGN_FIELDS_RESTORED', $1, $2, $3::jsonb)`,
      [actorAdminId ? Number(actorAdminId) : null, cid, JSON.stringify({ timestamp: new Date().toISOString() })],
    );
    await client.query("COMMIT");
    return getCampaignFieldConfig(cid, { includeDisabled: true });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Validate + normalize answers against campaign config.
 * Returns { normalized, canonicalUserPatches }.
 */
function validateAndNormalizeAnswers(configFields, rawAnswers) {
  const answersIn = rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers) ? rawAnswers : {};
  const enabled = (configFields || []).filter((f) => f.isEnabled);
  const enabledKeys = new Set(enabled.map((f) => f.fieldKey));

  for (const key of Object.keys(answersIn)) {
    if (!CONTRACT_FIELD_BY_KEY[key]) {
      throw createPublicApiError(`حقل غير مسموح: ${key}`, 400, "VALIDATION_ERROR");
    }
    if (!enabledKeys.has(key)) {
      throw createPublicApiError(`حقل غير مفعّل لهذه الحملة: ${key}`, 400, "VALIDATION_ERROR");
    }
  }

  // First pass: normalize provided values into map for condition evaluation
  const working = {};
  for (const f of enabled) {
    if (Object.prototype.hasOwnProperty.call(answersIn, f.fieldKey)) {
      const def = CONTRACT_FIELD_BY_KEY[f.fieldKey];
      working[f.fieldKey] = normalizeAnswerValue(def, answersIn[f.fieldKey]);
    }
  }

  const normalized = {};
  const canonicalUserPatches = {};

  for (const f of enabled) {
    const def = CONTRACT_FIELD_BY_KEY[f.fieldKey];
    const active = conditionMet(f.conditional, working);
    if (!active) {
      // Hidden conditional children must not cause validation errors; skip storing.
      continue;
    }
    const hasValue = Object.prototype.hasOwnProperty.call(working, f.fieldKey) && !isEmptyAnswer(working[f.fieldKey]);
    if (f.isRequired && !hasValue) {
      // checkbox/declaration false is empty for required
      if (def.type === "checkbox" || def.type === "yes_no") {
        if (working[f.fieldKey] !== true) {
          throw createPublicApiError(`الحقل مطلوب: ${f.labelAr}`, 400, "VALIDATION_ERROR");
        }
      } else {
        throw createPublicApiError(`الحقل مطلوب: ${f.labelAr}`, 400, "VALIDATION_ERROR");
      }
    }
    if (!hasValue && working[f.fieldKey] !== true && working[f.fieldKey] !== false) {
      continue;
    }
    const value = Object.prototype.hasOwnProperty.call(working, f.fieldKey)
      ? working[f.fieldKey]
      : normalizeAnswerValue(def, answersIn[f.fieldKey]);
    if (def.type === "checkbox" && f.isRequired && value !== true) {
      throw createPublicApiError(`يجب الموافقة: ${f.labelAr}`, 400, "VALIDATION_ERROR");
    }
    normalized[f.fieldKey] = value;
    if (def.canonicalUserColumn && value != null && value !== "") {
      canonicalUserPatches[def.canonicalUserColumn] =
        typeof value === "boolean" ? String(value) : value;
    }
  }

  return { normalized, canonicalUserPatches };
}

async function saveAnswers(client, { campaignId, userId, redemptionId, normalized }) {
  const entries = Object.entries(normalized || {});
  for (const [fieldKey, value] of entries) {
    await client.query(
      `INSERT INTO legacy_freelancer_invite_answers
         (campaign_id, user_id, redemption_id, field_key, value_json)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (user_id, campaign_id, field_key)
       DO UPDATE SET value_json = EXCLUDED.value_json, redemption_id = EXCLUDED.redemption_id, updated_at = NOW()`,
      [campaignId, userId, redemptionId || null, fieldKey, JSON.stringify(value)],
    );
  }
}

async function applyCanonicalUserPatches(client, userId, patches) {
  if (!patches || !Object.keys(patches).length) return;
  const allowed = new Set(["first_name", "father_name", "family_name", "skills"]);
  const sets = [];
  const params = [userId];
  for (const [col, val] of Object.entries(patches)) {
    if (!allowed.has(col)) continue;
    if (col === "skills") {
      const arr = parseDetailedSkillsPrograms(val);
      params.push(arr);
      sets.push(`skills = $${params.length}::text[]`);
      continue;
    }
    params.push(val == null ? null : String(val).slice(0, 200));
    sets.push(`${col} = $${params.length}`);
  }
  if (!sets.length) return;
  await client.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, params);
}

async function getAnswersForUser({ campaignId, userId, maskSensitive = true }) {
  const { rows } = await pool.query(
    `SELECT a.field_key, a.value_json, a.created_at, a.updated_at,
            f.label_ar, f.sort_order
       FROM legacy_freelancer_invite_answers a
       LEFT JOIN legacy_freelancer_invite_campaign_fields f
         ON f.campaign_id = a.campaign_id AND f.field_key = a.field_key
      WHERE a.campaign_id = $1 AND a.user_id = $2
      ORDER BY COALESCE(f.sort_order, 0) ASC, a.field_key ASC`,
    [Number(campaignId), Number(userId)],
  );

  const bySection = {};
  for (const s of Object.values(SECTIONS)) {
    bySection[s.key] = { key: s.key, labelAr: s.labelAr, fields: [] };
  }

  const flat = [];
  for (const r of rows) {
    const def = CONTRACT_FIELD_BY_KEY[r.field_key];
    let value = r.value_json;
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
      // unlikely wrapper
    }
    // pg returns jsonb already parsed
    if (maskSensitive) {
      value = maskSensitiveValue(r.field_key, value);
    }
    const labelAr =
      r.field_key === "national_id" && !maskSensitive
        ? "رقم الفريلانسر / الرقم الوطني"
        : r.label_ar || def?.labelAr || r.field_key;
    const item = {
      fieldKey: r.field_key,
      labelAr,
      section: def?.section || SECTIONS.EXTRA.key,
      type: def?.type || "text",
      value,
      sensitive: Boolean(def?.sensitive),
      masked: Boolean(maskSensitive && def?.sensitive),
    };
    flat.push(item);
    const sectionKey = item.section;
    if (!bySection[sectionKey]) {
      bySection[sectionKey] = { key: sectionKey, labelAr: sectionKey, fields: [] };
    }
    bySection[sectionKey].fields.push(item);
  }

  return {
    userId: String(userId),
    campaignId: String(campaignId),
    sections: Object.values(bySection).filter((s) => s.fields.length > 0),
    fields: flat,
  };
}

function extractNamesFromAnswersOrPayload(normalized, payload) {
  const first =
    (normalized && normalized.first_name) ||
    payload.firstName ||
    payload.first_name ||
    null;
  const father =
    (normalized && normalized.father_name) ||
    payload.fatherName ||
    payload.father_name ||
    null;
  const family =
    (normalized && normalized.family_name) ||
    payload.familyName ||
    payload.family_name ||
    null;
  if (first && father && family) {
    return {
      firstName: String(first).trim().slice(0, 120),
      fatherName: String(father).trim().slice(0, 120),
      familyName: String(family).trim().slice(0, 120),
    };
  }
  // Backward compatibility with older clients sending fullName only.
  const parts = String(payload.fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 3) {
    return {
      firstName: parts[0].slice(0, 120),
      fatherName: parts.slice(1, -1).join(" ").slice(0, 120),
      familyName: parts[parts.length - 1].slice(0, 120),
    };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], fatherName: parts[0], familyName: parts[1] };
  }
  if (first || father || family) {
    throw createPublicApiError("الاسم الأول واسم الأب واسم العائلة مطلوبة.", 400, "VALIDATION_ERROR");
  }
  throw createPublicApiError("الاسم الأول واسم الأب واسم العائلة مطلوبة.", 400, "VALIDATION_ERROR");
}

module.exports = {
  coerceYesNo,
  conditionMet,
  normalizeAnswerValue,
  maskSensitiveValue,
  ensureDefaultFieldsForCampaign,
  getCampaignFieldConfig,
  buildPublicFormFields,
  replaceCampaignFieldConfig,
  restoreDefaultFieldConfig,
  validateAndNormalizeAnswers,
  saveAnswers,
  applyCanonicalUserPatches,
  getAnswersForUser,
  extractNamesFromAnswersOrPayload,
  getContractCatalog,
  SENSITIVE_FIELD_KEYS,
};
