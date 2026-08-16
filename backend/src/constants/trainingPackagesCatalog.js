/**
 * Default public Training packages (WhatsApp inquiry CTAs on /plans).
 * Not subscription/checkout plans. Not Marketplace Membership.
 */

const TRAINING_PACKAGES_SETTING_KEY = "public_training_packages";

const ACCENTS = Object.freeze(["basic", "professional", "premium"]);

const DEFAULT_TRAINING_PACKAGES = Object.freeze([
  {
    code: "basic",
    accent: "basic",
    featured: false,
    isVisible: true,
    sortOrder: 10,
    priceJod: 49,
    durationMonths: null,
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
    badgeAr: "",
    badgeEn: "",
    whatsappMessageAr:
      "مرحبًا، أرغب بالاستفسار والتسجيل في الباقة الأساسية للتدريب بسعر 49 د.أ، وأود معرفة تفاصيل الدورة وطريقة التسجيل.",
  },
  {
    code: "professional",
    accent: "professional",
    featured: true,
    isVisible: true,
    sortOrder: 20,
    priceJod: 249,
    durationMonths: null,
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
    badgeAr: "الأكثر طلبًا",
    badgeEn: "Most requested",
    whatsappMessageAr:
      "مرحبًا، أرغب بالاستفسار والتسجيل في الباقة الاحترافية للتدريب بسعر 249 د.أ، وأود معرفة تفاصيل الدورات وطريقة التسجيل.",
  },
  {
    code: "premium",
    accent: "premium",
    featured: false,
    isVisible: true,
    sortOrder: 30,
    priceJod: 349,
    durationMonths: null,
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
    badgeAr: "",
    badgeEn: "",
    whatsappMessageAr:
      "مرحبًا، أرغب بالاستفسار والتسجيل في الباقة المميزة للتدريب بسعر 349 د.أ، وأود معرفة تفاصيل الدورات وطريقة التسجيل.",
  },
]);

function cloneDefaultTrainingPackages() {
  return DEFAULT_TRAINING_PACKAGES.map((pkg) => ({
    ...pkg,
    featuresAr: [...pkg.featuresAr],
    featuresEn: [...pkg.featuresEn],
  }));
}

module.exports = {
  TRAINING_PACKAGES_SETTING_KEY,
  ACCENTS,
  DEFAULT_TRAINING_PACKAGES,
  cloneDefaultTrainingPackages,
};
