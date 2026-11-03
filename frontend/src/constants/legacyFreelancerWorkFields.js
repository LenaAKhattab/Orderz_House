/** Mirror of backend legacyFreelancerWorkFields — UI labels + stable keys for users.legacy_work_areas */
import { ct, ctAr, withCatalogLabels } from "./constantsI18n.js";

/**
 * `key` is the stored value; `labelKey` the catalog key. The legacy `labelAr` getter follows the non-English UI
 * branch (Arabic, or the active de / nl / ro locale) — unchanged for Arabic / English.
 */
export const LEGACY_WORK_FIELDS = Object.freeze(
  ["content_writing", "design", "programming"].map((key) =>
    Object.freeze(withCatalogLabels({ key }, `legacyFreelancerWorkFields.fields.${key}`, { labelAr: "local" })),
  ),
);

export const LEGACY_WORK_FIELD_KEYS = Object.freeze(LEGACY_WORK_FIELDS.map((f) => f.key));

/** key → label (getters: non-English UI branch, see LEGACY_WORK_FIELDS). */
export const LEGACY_WORK_FIELD_LABEL_BY_KEY = Object.freeze(
  Object.defineProperties(
    {},
    Object.fromEntries(
      LEGACY_WORK_FIELDS.map((f) => [f.key, { enumerable: true, get: () => f.labelAr }]),
    ),
  ),
);

/** Arabic copy (catalog: platformConstants.legacyFreelancerWorkFields.required). */
export const WORK_FIELDS_REQUIRED_MESSAGE = ctAr("legacyFreelancerWorkFields.required");

/** "Select at least one work area" for a UI locale (default: Arabic, or the active de / nl / ro locale). */
export function workFieldsRequiredMessage(locale) {
  return ct("legacyFreelancerWorkFields.required", undefined, locale);
}

/** @param {string} [locale] default: Arabic, or the active de / nl / ro locale */
export function workFieldLabels(keys, locale) {
  const list = Array.isArray(keys) ? keys : [];
  return list
    .map((k) =>
      LEGACY_WORK_FIELD_KEYS.includes(k) ? ct(`legacyFreelancerWorkFields.fields.${k}`, undefined, locale) : k,
    )
    .filter(Boolean);
}
