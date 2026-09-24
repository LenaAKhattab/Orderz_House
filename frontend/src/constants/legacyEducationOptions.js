/**
 * Education level + graduation-year helpers for Legacy Freelancer registration.
 * Keep aligned with backend/src/constants/legacyEducationOptions.js
 */

export const EDUCATION_LEVEL_OPTIONS = Object.freeze([
  { value: "أقل من الثانوية", label: "أقل من الثانوية" },
  { value: "الثانوية العامة", label: "الثانوية العامة" },
  { value: "دبلوم", label: "دبلوم" },
  { value: "بكالوريوس", label: "بكالوريوس" },
  { value: "دبلوم عالٍ", label: "دبلوم عالٍ" },
  { value: "ماجستير", label: "ماجستير" },
  { value: "دكتوراه", label: "دكتوراه" },
  { value: "__other__", label: "أخرى" },
]);

export const EDUCATION_OTHER_VALUE = "__other__";
export const GRADUATION_NOT_YET_VALUE = "not_graduated_yet";
export const GRADUATION_NOT_YET_LABEL_AR = "لم أتخرج بعد";
export const GRADUATION_YEAR_MIN = 1960;

export function currentGraduationYearMax(now = new Date()) {
  return now.getFullYear() + 1;
}

export function buildGraduationYearOptions(now = new Date()) {
  const max = currentGraduationYearMax(now);
  const years = [];
  for (let y = max; y >= GRADUATION_YEAR_MIN; y -= 1) {
    years.push({ value: String(y), label: String(y) });
  }
  years.push({ value: GRADUATION_NOT_YET_VALUE, label: GRADUATION_NOT_YET_LABEL_AR });
  return years;
}
