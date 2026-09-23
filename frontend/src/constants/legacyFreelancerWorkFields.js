/** Mirror of backend legacyFreelancerWorkFields — UI labels + stable keys for users.legacy_work_areas */

export const LEGACY_WORK_FIELDS = Object.freeze([
  Object.freeze({ key: "content_writing", labelAr: "كتابة محتوى" }),
  Object.freeze({ key: "design", labelAr: "تصميم" }),
  Object.freeze({ key: "programming", labelAr: "برمجة" }),
]);

export const LEGACY_WORK_FIELD_KEYS = Object.freeze(LEGACY_WORK_FIELDS.map((f) => f.key));

export const LEGACY_WORK_FIELD_LABEL_BY_KEY = Object.freeze(
  Object.fromEntries(LEGACY_WORK_FIELDS.map((f) => [f.key, f.labelAr])),
);

export const WORK_FIELDS_REQUIRED_MESSAGE = "يرجى اختيار مجال عمل واحد على الأقل.";

export function workFieldLabels(keys) {
  const list = Array.isArray(keys) ? keys : [];
  return list.map((k) => LEGACY_WORK_FIELD_LABEL_BY_KEY[k] || k).filter(Boolean);
}
