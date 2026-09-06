/** Display-only currencies. Official stored amounts remain JOD. */

export const BASE_CURRENCY = "JOD";

export const SUPPORTED_DISPLAY_CURRENCIES = [
  "JOD",
  "USD",
  "SAR",
  "AED",
  "QAR",
  "KWD",
  "BHD",
  "OMR",
  "EGP",
  "EUR",
  "GBP",
];

export const CURRENCY_LABELS = {
  JOD: "د.أ",
  SAR: "ر.س",
  AED: "د.إ",
  QAR: "ر.ق",
  KWD: "د.ك",
  BHD: "د.ب",
  OMR: "ر.ع",
  EGP: "ج.م",
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
};

export const PREFERRED_DISPLAY_CURRENCY_STORAGE_KEY = "orderzhouse_preferred_display_currency";

export const DISPLAY_DISCLAIMER = "القيمة تقريبية حسب سعر الصرف الحالي.";
export const OFFICIAL_CURRENCY_COPY = "العملة الرسمية المعتمدة داخل Orderz House هي الدينار الأردني.";
export const INDICATIVE_COPY = "القيمة المحوّلة إرشادية فقط ولا تعتبر سعرًا نهائيًا أو التزامًا ماليًا.";
export const PREFERENCE_LABEL = "العملة التقريبية المفضلة";
export const PREFERENCE_HINT =
  "تُستخدم هذه العملة للعرض فقط، بينما تبقى جميع الحسابات بالدينار الأردني.";

export const MANUAL_PREFERENCE_OPTIONS = [
  { value: "auto", label: "تلقائي حسب الدولة" },
  { value: "USD", label: "USD" },
  { value: "SAR", label: "ر.س (SAR)" },
  { value: "AED", label: "د.إ (AED)" },
  { value: "QAR", label: "ر.ق (QAR)" },
  { value: "KWD", label: "د.ك (KWD)" },
  { value: "BHD", label: "د.ب (BHD)" },
  { value: "OMR", label: "ر.ع (OMR)" },
  { value: "EGP", label: "ج.م (EGP)" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "JOD", label: "د.أ (JOD)" },
];
