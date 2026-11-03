/**
 * Education level + graduation-year helpers for Legacy Freelancer registration.
 * Keep aligned with backend/src/constants/legacyEducationOptions.js
 *
 * `value` is the stored (Arabic) value — never translate it. `label` follows the non-English UI branch (Arabic, or
 * the active de / nl / ro locale; catalog platformConstants.legacyEducationOptions) — unchanged for Arabic / English.
 */
import { ct, ctAr, withCatalogLabels } from "./constantsI18n.js";

const levelOption = (value, slug) =>
  Object.freeze(withCatalogLabels({ value }, `legacyEducationOptions.levels.${slug}`, { label: "local" }));

export const EDUCATION_LEVEL_OPTIONS = Object.freeze([
  levelOption("أقل من الثانوية", "belowSecondary"),
  levelOption("الثانوية العامة", "secondary"),
  levelOption("دبلوم", "diploma"),
  levelOption("بكالوريوس", "bachelor"),
  levelOption("دبلوم عالٍ", "higherDiploma"),
  levelOption("ماجستير", "master"),
  levelOption("دكتوراه", "doctorate"),
  levelOption("__other__", "other"),
]);

export const EDUCATION_OTHER_VALUE = "__other__";
export const GRADUATION_NOT_YET_VALUE = "not_graduated_yet";
/** Arabic label (catalog: platformConstants.legacyEducationOptions.graduationNotYet). */
export const GRADUATION_NOT_YET_LABEL_AR = ctAr("legacyEducationOptions.graduationNotYet");
export const GRADUATION_YEAR_MIN = 1960;

export function currentGraduationYearMax(now = new Date()) {
  return now.getFullYear() + 1;
}

/** @param {string} [locale] label locale of the "not graduated yet" row (default: Arabic, or active de / nl / ro) */
export function buildGraduationYearOptions(now = new Date(), locale) {
  const max = currentGraduationYearMax(now);
  const years = [];
  for (let y = max; y >= GRADUATION_YEAR_MIN; y -= 1) {
    years.push({ value: String(y), label: String(y) });
  }
  years.push({ value: GRADUATION_NOT_YET_VALUE, label: ct("legacyEducationOptions.graduationNotYet", undefined, locale) });
  return years;
}
