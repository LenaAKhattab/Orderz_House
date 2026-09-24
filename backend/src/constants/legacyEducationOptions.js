/**
 * Education level + graduation-year helpers for Legacy Freelancer registration.
 */

const EDUCATION_LEVEL_OPTIONS = Object.freeze([
  { value: "أقل من الثانوية", labelAr: "أقل من الثانوية" },
  { value: "الثانوية العامة", labelAr: "الثانوية العامة" },
  { value: "دبلوم", labelAr: "دبلوم" },
  { value: "بكالوريوس", labelAr: "بكالوريوس" },
  { value: "دبلوم عالٍ", labelAr: "دبلوم عالٍ" },
  { value: "ماجستير", labelAr: "ماجستير" },
  { value: "دكتوراه", labelAr: "دكتوراه" },
  { value: "__other__", labelAr: "أخرى" },
]);

const EDUCATION_OTHER_VALUE = "__other__";
const GRADUATION_NOT_YET_VALUE = "not_graduated_yet";
const GRADUATION_NOT_YET_LABEL_AR = "لم أتخرج بعد";
const GRADUATION_YEAR_MIN = 1960;

function currentGraduationYearMax(now = new Date()) {
  return now.getFullYear() + 1;
}

function buildGraduationYearOptions(now = new Date()) {
  const max = currentGraduationYearMax(now);
  const years = [];
  for (let y = max; y >= GRADUATION_YEAR_MIN; y -= 1) {
    years.push({ value: String(y), labelAr: String(y) });
  }
  years.push({ value: GRADUATION_NOT_YET_VALUE, labelAr: GRADUATION_NOT_YET_LABEL_AR });
  return years;
}

function normalizeGraduationYearValue(raw) {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return null;
  const s = String(raw).trim();
  if (
    s === GRADUATION_NOT_YET_VALUE ||
    s === GRADUATION_NOT_YET_LABEL_AR ||
    s === "لم اتخرج بعد"
  ) {
    return GRADUATION_NOT_YET_VALUE;
  }
  const n = typeof raw === "number" ? raw : Number(s.replace(/,/g, ""));
  if (!Number.isInteger(n)) return null;
  const max = currentGraduationYearMax();
  if (n < GRADUATION_YEAR_MIN || n > max) return null;
  return n;
}

function isKnownEducationLevel(raw) {
  const s = String(raw || "").trim();
  if (!s || s === EDUCATION_OTHER_VALUE) return false;
  return EDUCATION_LEVEL_OPTIONS.some((o) => o.value === s && o.value !== EDUCATION_OTHER_VALUE);
}

module.exports = {
  EDUCATION_LEVEL_OPTIONS,
  EDUCATION_OTHER_VALUE,
  GRADUATION_NOT_YET_VALUE,
  GRADUATION_NOT_YET_LABEL_AR,
  GRADUATION_YEAR_MIN,
  currentGraduationYearMax,
  buildGraduationYearOptions,
  normalizeGraduationYearValue,
  isKnownEducationLevel,
};
