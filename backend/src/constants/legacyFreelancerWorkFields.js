/**
 * Legacy Freelancer self-declared work areas (مجال العمل).
 * Stored in users.legacy_work_areas as stable machine keys (text[]).
 * Must NOT reuse users.skills — that column holds detailed skills/programs from skills_programs.
 * Arabic labels are UI-only.
 */

const LEGACY_WORK_FIELDS = Object.freeze([
  Object.freeze({ key: "content_writing", labelAr: "كتابة محتوى" }),
  Object.freeze({ key: "design", labelAr: "تصميم" }),
  Object.freeze({ key: "programming", labelAr: "برمجة" }),
]);

const LEGACY_WORK_FIELD_KEYS = Object.freeze(LEGACY_WORK_FIELDS.map((f) => f.key));
const LEGACY_WORK_FIELD_LABEL_BY_KEY = Object.freeze(
  Object.fromEntries(LEGACY_WORK_FIELDS.map((f) => [f.key, f.labelAr])),
);
const LEGACY_WORK_FIELD_KEY_SET = Object.freeze(new Set(LEGACY_WORK_FIELD_KEYS));

const WORK_FIELDS_REQUIRED_MESSAGE = "يرجى اختيار مجال عمل واحد على الأقل.";

/**
 * @param {unknown} raw
 * @param {{ required?: boolean }} [opts]
 * @returns {string[]}
 */
function normalizeLegacyWorkFields(raw, { required = false } = {}) {
  let list = raw;
  if (typeof list === "string") {
    try {
      const parsed = JSON.parse(list);
      list = parsed;
    } catch {
      list = list.split(/[,|\n]/).map((s) => s.trim());
    }
  }
  if (!Array.isArray(list)) list = [];
  const out = [...new Set(list.map((x) => String(x || "").trim()).filter((k) => LEGACY_WORK_FIELD_KEY_SET.has(k)))];
  if (required && out.length === 0) {
    const err = new Error(WORK_FIELDS_REQUIRED_MESSAGE);
    err.code = "WORK_FIELDS_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  return out;
}

/**
 * Map stored work-area keys to display chips.
 * @param {unknown} keys
 */
function mapLegacyWorkFieldsPublic(keys) {
  const arr = Array.isArray(keys) ? keys : [];
  const selected = arr.map(String).filter((k) => LEGACY_WORK_FIELD_KEY_SET.has(k));
  return {
    keys: selected,
    labels: selected.map((k) => LEGACY_WORK_FIELD_LABEL_BY_KEY[k] || k),
    isEmpty: selected.length === 0,
  };
}

/**
 * Prefer users.legacy_work_areas; fall back to extracting known keys from users.skills
 * for rows written before migration 196.
 * @param {{ legacy_work_areas?: unknown, legacyWorkAreas?: unknown, skills?: unknown }} row
 */
function resolveLegacyWorkAreasFromUserRow(row) {
  const dedicated = row?.legacy_work_areas ?? row?.legacyWorkAreas;
  if (Array.isArray(dedicated) && dedicated.length) {
    return mapLegacyWorkFieldsPublic(dedicated);
  }
  return mapLegacyWorkFieldsPublic(row?.skills);
}

/**
 * Split a mixed skills array into detailed programs vs work-area keys (pure helper for tests/migrations).
 * @param {unknown} skills
 */
function partitionSkillsAndWorkAreas(skills) {
  const arr = Array.isArray(skills) ? skills.map(String) : [];
  const workAreas = [];
  const detailed = [];
  for (const item of arr) {
    const v = String(item || "").trim();
    if (!v) continue;
    if (LEGACY_WORK_FIELD_KEY_SET.has(v)) workAreas.push(v);
    else detailed.push(v);
  }
  return {
    workAreas: [...new Set(workAreas)],
    detailedSkills: detailed,
  };
}

/**
 * Parse skills_programs textarea into users.skills text[].
 * @param {unknown} raw
 * @returns {string[]|null}
 */
function parseDetailedSkillsPrograms(raw) {
  if (raw == null || raw === "") return null;
  const arr = String(raw)
    .split(/[,|\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !LEGACY_WORK_FIELD_KEY_SET.has(s))
    .slice(0, 40);
  return arr.length ? arr : null;
}

module.exports = {
  LEGACY_WORK_FIELDS,
  LEGACY_WORK_FIELD_KEYS,
  LEGACY_WORK_FIELD_LABEL_BY_KEY,
  WORK_FIELDS_REQUIRED_MESSAGE,
  normalizeLegacyWorkFields,
  mapLegacyWorkFieldsPublic,
  resolveLegacyWorkAreasFromUserRow,
  partitionSkillsAndWorkAreas,
  parseDetailedSkillsPrograms,
};
