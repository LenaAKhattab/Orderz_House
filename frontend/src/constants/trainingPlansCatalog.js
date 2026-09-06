/**
 * Public Training packages for `/plans` (commercial/educational).
 * Separate from Marketplace Membership — static catalog for WhatsApp inquiry CTAs.
 */

export const PLANS_CATEGORY = Object.freeze({
  TRAINING: "training",
  MEMBERSHIP: "membership",
});

export const DEFAULT_PLANS_CATEGORY = PLANS_CATEGORY.TRAINING;

export const TRAINING_WHATSAPP_E164 = "962791433341";

/** @typedef {"basic" | "professional" | "premium"} TrainingPackageId */

/**
 * @type {ReadonlyArray<{
 *   id: TrainingPackageId;
 *   accent: "basic" | "professional" | "premium";
 *   featured: boolean;
 *   priceJod: number;
 *   nameAr: string;
 *   nameEn: string;
 *   shortDescAr: string;
 *   shortDescEn: string;
 *   featuresAr: string[];
 *   featuresEn: string[];
 *   highlightFeatureIndex: number;
 *   whatsappMessageAr: string;
 * }>}
 */
export const TRAINING_PACKAGES = Object.freeze([
  {
    id: "basic",
    accent: "basic",
    featured: false,
    priceJod: 49,
    nameAr: "الباقة الأساسية",
    nameEn: "Basic Package",
    shortDescAr: "خيار الدخول الأمثل لبدء مسار Full Stack بالذكاء الاصطناعي.",
    shortDescEn: "The entry option to start your AI-powered Full Stack path.",
    featuresAr: [
      "دورة Full Stack Developer بالذكاء الاصطناعي",
      "محتوى تدريبي مسجل",
      "تدريب عملي ومشاريع تطبيقية",
      "شهر واحد عضوية SILVER في أوردرز هاوس للعمل الحر",
    ],
    featuresEn: [
      "Full Stack Developer with AI course",
      "Recorded training content",
      "Practical training and applied projects",
      "One month SILVER Marketplace Membership",
    ],
    highlightFeatureIndex: 0,
    whatsappMessageAr:
      "مرحبًا، أرغب بالاستفسار والتسجيل في الباقة الأساسية للتدريب بسعر 49 د.أ، وأود معرفة تفاصيل الدورة وطريقة التسجيل.",
  },
  {
    id: "professional",
    accent: "professional",
    featured: true,
    priceJod: 249,
    nameAr: "الباقة الاحترافية",
    nameEn: "Professional Package",
    shortDescAr: "الباقة الأكثر طلبًا لمسار تدريب متكامل مع عضوية شهرين.",
    shortDescEn: "The most requested package for a complete path with two months membership.",
    featuresAr: [
      "دورة Full Stack Developer بالذكاء الاصطناعي",
      "دورة كتابة المحتوى",
      "دورة Graphic Design",
      "محتوى تدريبي مسجل",
      "مشاريع وتطبيقات عملية",
      "شهران عضوية SILVER في أوردرز هاوس للعمل الحر",
      "ثلاث شهادات مشاركة من الشركة",
    ],
    featuresEn: [
      "Full Stack Developer with AI course",
      "Content writing course",
      "Graphic Design course",
      "Recorded training content",
      "Practical projects and applications",
      "Two months SILVER Marketplace Membership",
      "Three participation certificates from the company",
    ],
    highlightFeatureIndex: 0,
    whatsappMessageAr:
      "مرحبًا، أرغب بالاستفسار والتسجيل في الباقة الاحترافية للتدريب بسعر 249 د.أ، وأود معرفة تفاصيل الدورات وطريقة التسجيل.",
  },
  {
    id: "premium",
    accent: "premium",
    featured: false,
    priceJod: 349,
    nameAr: "الباقة المميزة",
    nameEn: "Premium Package",
    shortDescAr: "الحزمة الأشمل مع ثلاثة أشهر عضوية وشهادة خبرة مبرمج.",
    shortDescEn: "The most complete package with three months membership and an experience certificate.",
    featuresAr: [
      "دورة Full Stack Developer بالذكاء الاصطناعي",
      "دورة كتابة المحتوى",
      "دورة Graphic Design",
      "محتوى تدريبي مسجل",
      "مشاريع احترافية عملية",
      "ثلاثة أشهر عضوية SILVER في أوردرز هاوس للعمل الحر",
      "ثلاث شهادات مشاركة من الشركة",
      "شهادة خبرة مبرمج من الشركة",
    ],
    featuresEn: [
      "Full Stack Developer with AI course",
      "Content writing course",
      "Graphic Design course",
      "Recorded training content",
      "Professional practical projects",
      "Three months SILVER Marketplace Membership",
      "Three participation certificates from the company",
      "Programmer experience certificate from the company",
    ],
    highlightFeatureIndex: 0,
    whatsappMessageAr:
      "مرحبًا، أرغب بالاستفسار والتسجيل في الباقة المميزة للتدريب بسعر 349 د.أ، وأود معرفة تفاصيل الدورات وطريقة التسجيل.",
  },
]);

/**
 * @param {string | null | undefined} raw
 * @returns {"training" | "membership"}
 */
export function resolvePlansCategory(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value === PLANS_CATEGORY.MEMBERSHIP || value === "memberships" || value === "marketplace") {
    return PLANS_CATEGORY.MEMBERSHIP;
  }
  return PLANS_CATEGORY.TRAINING;
}

/**
 * Build WhatsApp deep link with package-specific Arabic message.
 * @param {{ whatsappMessageAr: string }} pkg
 * @returns {string}
 */
export function buildTrainingWhatsAppUrl(pkg) {
  const text = encodeURIComponent(String(pkg?.whatsappMessageAr || "").trim());
  const base = `https://wa.me/${TRAINING_WHATSAPP_E164}`;
  return text ? `${base}?text=${text}` : base;
}
