import { countryCodeToFlag } from "../utils/countryDisplay";

/** ISO-2 Arab countries allowed at registration (matches backend authValidators). */
const ARAB_COUNTRY_ENTRIES = [
  { code: "DZ", nameAr: "الجزائر", dialCode: "+213" },
  { code: "BH", nameAr: "البحرين", dialCode: "+973" },
  { code: "KM", nameAr: "جزر القمر", dialCode: "+269" },
  { code: "DJ", nameAr: "جيبوتي", dialCode: "+253" },
  { code: "EG", nameAr: "مصر", dialCode: "+20" },
  { code: "IQ", nameAr: "العراق", dialCode: "+964" },
  { code: "JO", nameAr: "الأردن", dialCode: "+962" },
  { code: "KW", nameAr: "الكويت", dialCode: "+965" },
  { code: "LB", nameAr: "لبنان", dialCode: "+961" },
  { code: "LY", nameAr: "ليبيا", dialCode: "+218" },
  { code: "MR", nameAr: "موريتانيا", dialCode: "+222" },
  { code: "MA", nameAr: "المغرب", dialCode: "+212" },
  { code: "OM", nameAr: "عُمان", dialCode: "+968" },
  { code: "PS", nameAr: "فلسطين", dialCode: "+970" },
  { code: "QA", nameAr: "قطر", dialCode: "+974" },
  { code: "SA", nameAr: "السعودية", dialCode: "+966" },
  { code: "SD", nameAr: "السودان", dialCode: "+249" },
  { code: "SO", nameAr: "الصومال", dialCode: "+252" },
  { code: "SY", nameAr: "سوريا", dialCode: "+963" },
  { code: "TN", nameAr: "تونس", dialCode: "+216" },
  { code: "AE", nameAr: "الإمارات", dialCode: "+971" },
  { code: "YE", nameAr: "اليمن", dialCode: "+967" },
];

export const DEFAULT_DIAL_CODE = "+962";

export const ARAB_COUNTRIES = Object.freeze(
  ARAB_COUNTRY_ENTRIES.map((entry) => ({
    ...entry,
    flag: countryCodeToFlag(entry.code),
  })).sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar")),
);
