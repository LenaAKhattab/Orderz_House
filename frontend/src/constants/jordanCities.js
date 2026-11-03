/**
 * Practical Jordan cities/localities for Legacy Freelancer address UX.
 * Keep in sync with backend/src/constants/jordanCities.js
 *
 * The Arabic name is the stored VALUE (never translate it). Display labels for German / Dutch / Romanian come
 * from the catalog (platformConstants.jordanCities.cities.<slug>); Arabic / English keep showing the Arabic
 * value, exactly as before.
 */
import { isNewLocale } from "../i18n/systemContent.js";
import { localeFromEnFlag } from "../i18n/activeLocale.js";
import { ct, ctAr } from "./constantsI18n.js";

/** [stored Arabic value, catalog slug] */
const JORDAN_CITY_ENTRIES = Object.freeze([
  ["عمّان", "amman"],
  ["الزرقاء", "zarqa"],
  ["إربد", "irbid"],
  ["الرصيفة", "russeifa"],
  ["السلط", "salt"],
  ["العقبة", "aqaba"],
  ["مادبا", "madaba"],
  ["جرش", "jerash"],
  ["عجلون", "ajloun"],
  ["المفرق", "mafraq"],
  ["الكرك", "karak"],
  ["الطفيلة", "tafilah"],
  ["معان", "maan"],
  ["الرمثا", "ramtha"],
  ["سحاب", "sahab"],
  ["ناعور", "naour"],
  ["وادي السير", "wadiAlSeer"],
  ["ماركا", "marka"],
  ["صويلح", "sweileh"],
  ["الجبيهة", "jubeiha"],
  ["خلدا", "khalda"],
  ["تلاع العلي", "tlaaAlAli"],
  ["الشميساني", "shmeisani"],
  ["العبدلي", "abdali"],
  ["جبل الحسين", "jabalAlHussein"],
  ["جبل النصر", "jabalAlNasr"],
  ["ماركا الشمالية", "markaNorth"],
  ["القويسمة", "quweismeh"],
  ["أبو نصير", "abuNseir"],
  ["طبربور", "tabarbour"],
  ["الياسمين", "yasmeen"],
  ["اليادودة", "yadoudeh"],
  ["المقابلين", "muqabalain"],
  ["مرج الحمام", "marjAlHamam"],
  ["الجيزة", "jizah"],
  ["الموقر", "muwaqqar"],
  ["حسبان", "hisban"],
  ["الفحيص", "fuheis"],
  ["ماحص", "mahis"],
  ["عين الباشا", "ainAlBasha"],
  ["دير علا", "deirAlla"],
  ["الشونة الجنوبية", "southShuna"],
  ["الشونة الشمالية", "northShuna"],
  ["الأزرق", "azraq"],
  ["الصفاوي", "safawi"],
  ["الحصن", "husn"],
  ["بيت راس", "beitRas"],
  ["كفر يوبا", "kafrYuba"],
  ["كفر جايز", "kafrJayez"],
  ["النعيمة", "nuaimeh"],
  ["سوم", "soum"],
  ["المزار الشمالي", "northMazar"],
  ["كفر عوان", "kafrAwan"],
  ["كفرنجة", "kufranjah"],
  ["عنجرة", "anjara"],
  ["صخور", "sukhur"],
  ["دير أبي سعيد", "deirAbiSaid"],
  ["المزار الجنوبي", "southMazar"],
  ["مؤتة", "mutah"],
  ["الثنية", "thaniyah"],
  ["فقوع", "faqqu"],
  ["القصر", "qasr"],
  ["غور الصافي", "ghorAlSafi"],
  ["غور المزرعة", "ghorAlMazraa"],
  ["الأغوار الوسطى", "middleJordanValley"],
  ["وادي موسى", "wadiMusa"],
  ["البتراء", "petra"],
  ["الشوبك", "shoubak"],
  ["الحسا", "hasa"],
  ["الجفر", "jafr"],
  ["القويرة", "quwaira"],
  ["الديسة", "disi"],
  ["حقل", "haql"],
  ["الرويشد", "ruwaished"],
  ["الصالحية", "salhiyah"],
  ["الخالدية", "khalidiyah"],
  ["سما السرحان", "samaAlSarhan"],
  ["رحاب", "rehab"],
  ["المنارة", "manara"],
  ["حوشا", "housha"],
  ["الخربة السمراء", "khirbetAlSamra"],
]);

export const JORDAN_CITIES = Object.freeze(JORDAN_CITY_ENTRIES.map(([value]) => value));

const JORDAN_CITY_SLUG_BY_VALUE = Object.freeze(Object.fromEntries(JORDAN_CITY_ENTRIES));

export const CITY_OTHER_VALUE = "__other__";
/** Arabic "other" label (catalog: platformConstants.jordanCities.other). */
export const CITY_OTHER_LABEL_AR = ctAr("jordanCities.other");

/** "Other" option label for a UI locale (default: Arabic, or the active de / nl / ro locale). */
export function cityOtherLabel(locale) {
  return ct("jordanCities.other", undefined, locale);
}

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

/**
 * Display label of a stored city value. Arabic / English: the stored Arabic value (unchanged);
 * German / Dutch / Romanian: the catalog name. Unknown / custom values are returned as typed.
 * @param {string} value
 * @param {string} [locale] default: Arabic, or the active de / nl / ro locale
 */
export function jordanCityLabel(value, locale) {
  const slug = JORDAN_CITY_SLUG_BY_VALUE[value];
  const loc = locale || localeFromEnFlag(false);
  if (!slug || !isNewLocale(loc)) return value;
  return ct(`jordanCities.cities.${slug}`, undefined, loc);
}

/** @param {string} [locale] default: Arabic, or the active de / nl / ro locale */
export function listJordanCityOptions(locale) {
  return JORDAN_CITIES.map((value) => ({ value, label: jordanCityLabel(value, locale) }));
}
