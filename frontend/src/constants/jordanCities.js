/**
 * Practical Jordan cities/localities for Legacy Freelancer address UX.
 * Keep in sync with backend/src/constants/jordanCities.js
 */

export const JORDAN_CITIES = Object.freeze([
  "عمّان",
  "الزرقاء",
  "إربد",
  "الرصيفة",
  "السلط",
  "العقبة",
  "مادبا",
  "جرش",
  "عجلون",
  "المفرق",
  "الكرك",
  "الطفيلة",
  "معان",
  "الرمثا",
  "سحاب",
  "ناعور",
  "وادي السير",
  "ماركا",
  "صويلح",
  "الجبيهة",
  "خلدا",
  "تلاع العلي",
  "الشميساني",
  "العبدلي",
  "جبل الحسين",
  "جبل النصر",
  "ماركا الشمالية",
  "القويسمة",
  "أبو نصير",
  "طبربور",
  "الياسمين",
  "اليادودة",
  "المقابلين",
  "مرج الحمام",
  "الجيزة",
  "الموقر",
  "حسبان",
  "الفحيص",
  "ماحص",
  "عين الباشا",
  "دير علا",
  "الشونة الجنوبية",
  "الشونة الشمالية",
  "الأزرق",
  "الصفاوي",
  "الحصن",
  "بيت راس",
  "كفر يوبا",
  "كفر جايز",
  "النعيمة",
  "سوم",
  "المزار الشمالي",
  "كفر عوان",
  "كفرنجة",
  "عنجرة",
  "صخور",
  "دير أبي سعيد",
  "المزار الجنوبي",
  "مؤتة",
  "الثنية",
  "فقوع",
  "القصر",
  "غور الصافي",
  "غور المزرعة",
  "الأغوار الوسطى",
  "وادي موسى",
  "البتراء",
  "الشوبك",
  "الحسا",
  "الجفر",
  "القويرة",
  "الديسة",
  "حقل",
  "الرويشد",
  "الصالحية",
  "الخالدية",
  "سما السرحان",
  "رحاب",
  "المنارة",
  "حوشا",
  "الخربة السمراء",
]);

export const CITY_OTHER_VALUE = "__other__";
export const CITY_OTHER_LABEL_AR = "أخرى";

export function normalizeJordanCityKey(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u064B-\u065F\u0670]/g, "") // strip Arabic diacritics / shadda
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();
}

const JORDAN_CITY_BY_NORM = Object.freeze(
  Object.fromEntries(JORDAN_CITIES.map((c) => [normalizeJordanCityKey(c), c])),
);

export function isKnownJordanCity(raw) {
  const key = normalizeJordanCityKey(raw);
  return Boolean(key && JORDAN_CITY_BY_NORM[key]);
}

export function canonicalJordanCity(raw) {
  const key = normalizeJordanCityKey(raw);
  return JORDAN_CITY_BY_NORM[key] || null;
}

export function listJordanCityOptions() {
  return JORDAN_CITIES.map((labelAr) => ({ value: labelAr, label: labelAr }));
}
