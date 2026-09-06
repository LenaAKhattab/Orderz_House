/**
 * Special Offer Package — independent promotional package (tier special_offer).
 * purchaseMode=checkout uses dedicated marketplace plan, not SILVER/PRO/ELITE.
 */
import { TRAINING_WHATSAPP_E164 } from "./trainingPlansCatalog.js";

export const SPECIAL_OFFER_PURCHASE_MODE = Object.freeze({
  CHECKOUT: "checkout",
  WHATSAPP: "whatsapp",
});

export const SPECIAL_OFFER_PLAN_TIER_CODE = "special_offer";

export const SPECIAL_OFFER_ACCESS_LEVEL_OPTIONS = Object.freeze([
  { key: "starter", level: 1, labelAr: "مستوى STARTER", labelEn: "STARTER level" },
  { key: "silver", level: 2, labelAr: "مستوى SILVER", labelEn: "SILVER level" },
  { key: "pro", level: 3, labelAr: "مستوى PRO", labelEn: "PRO level" },
  { key: "elite", level: 5, labelAr: "مستوى ELITE", labelEn: "ELITE level" },
]);

export const SPECIAL_OFFER_DEFAULT_REFUND_EXPLANATION_AR = `يُسترد مبلغ 100 دينار بواقع 20 دينارًا عن كل شهر نشط ومؤهل، حتى استرداد كامل مبلغ 100 دينار، ضمن مدة التزام مقدارها 6 أشهر. يمكن أن تكون الأشهر المؤهلة متتالية أو متفرقة.

إذا لم تعمل في شهر معين، فلا توجد غرامة ولا دفعة جديدة؛ لكن ذلك الشهر لا يولّد مبلغ استرداد بقيمة 20 دينارًا.

الدخل الناتج عن تنفيذ الطلبات منفصل تمامًا عن مبلغ الاسترداد.

المبلغ ليس رسوم تقديم، أو مقابلة، أو دورة تدريبية، ولا يمثل ضمانًا للعمل أو الدخل.`;

export const SPECIAL_OFFER_REFUND_SECTION_TITLES_AR = Object.freeze([
  "الاسترداد الشهري",
  "الأشهر غير النشطة",
  "الدخل من الطلبات",
  "تنبيه مهم",
]);

export const SPECIAL_OFFER_DEFAULTS = Object.freeze({
  isVisible: false,
  title: "باقة العرض",
  subtitle: "عرض ترويجي لفترة محدودة — عروض أكثر بسعر خاص.",
  badgeText: "عرض خاص",
  ribbonText: "لفترة محدودة",
  priceJod: 29,
  originalPriceJod: 39,
  totalOffers: 50,
  dailyLimit: 5,
  durationDays: 30,
  maxProjectValueJod: 25,
  articleAccessLevel: 2,
  accessLevelKey: "silver",
  ctaLabel: "احصل على العرض الآن",
  microcopy: "بدون التزام، يمكنك الترقية أو الإلغاء في أي وقت",
  refundExplanationAr: SPECIAL_OFFER_DEFAULT_REFUND_EXPLANATION_AR,
  whatsappMessageAr:
    "مرحبًا، أرغب بالاستفادة من باقة العرض الخاصة في Orderz House ومعرفة تفاصيل التسجيل.",
  purchaseMode: SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT,
  linkedPlanCode: null,
  linkedMarketplacePlanId: null,
  offerVersion: 1,
  planTierCode: SPECIAL_OFFER_PLAN_TIER_CODE,
  benefitsLocked: false,
  purchaseCount: 0,
  canCreateNewVersion: false,
});

export const SPECIAL_OFFER_LOCKED_WARNING_AR =
  "هذه باقة عرض تم شراؤها من مستخدمين، لذلك تم تجميد السعر والمزايا. يمكنك إخفاؤها أو إنشاء عرض جديد، وسيحتفظ المشتركون الحاليون بالمزايا التي دفعوا عليها.";

export const SPECIAL_OFFER_LOCKED_WARNING_EN =
  "This special offer has been purchased by users, so price and benefits are frozen. You can hide it or create a new offer; current buyers keep the benefits they paid for.";

export function accessLevelKeyFromArticleLevel(level) {
  const n = Number(level);
  if (n >= 5) return "elite";
  if (n >= 3) return "pro";
  if (n >= 2) return "silver";
  return "starter";
}

export function articleAccessLevelFromKey(key) {
  const found = SPECIAL_OFFER_ACCESS_LEVEL_OPTIONS.find((o) => o.key === String(key || "").toLowerCase());
  return found ? found.level : 2;
}

export function resolveSpecialOfferPurchaseMode(pkg) {
  const mode = String(pkg?.purchaseMode || "")
    .trim()
    .toLowerCase();
  if (mode === SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP) return SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP;
  if (Number(pkg?.priceJod) > 0) return SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT;
  return SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP;
}

export function isSpecialOfferCheckoutSupported(pkg) {
  if (!pkg || typeof pkg !== "object") return false;
  if (pkg.checkoutSupported === true) return true;
  return (
    resolveSpecialOfferPurchaseMode(pkg) === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT &&
    Number(pkg.priceJod) > 0
  );
}

export function isSpecialOfferVisible(pkg) {
  if (!pkg || typeof pkg !== "object") return false;
  if (pkg.isVisible === false) return false;
  if (!String(pkg.title || "").trim()) return false;
  if (!(Number(pkg.priceJod) >= 0)) return false;
  if (!(Number(pkg.totalOffers) > 0)) return false;
  if (!(Number(pkg.dailyLimit) > 0)) return false;
  if (!(Number(pkg.durationDays) > 0)) return false;
  return true;
}

export function normalizePublicSpecialOffer(pkg) {
  if (!pkg || typeof pkg !== "object") return null;
  if (pkg.catalogSource && pkg.catalogSource !== "special_offer") return null;
  const purchaseMode = resolveSpecialOfferPurchaseMode(pkg);
  const checkoutSupported = isSpecialOfferCheckoutSupported({ ...pkg, purchaseMode });
  const normalized = {
    ...SPECIAL_OFFER_DEFAULTS,
    ...pkg,
    isVisible: pkg.isVisible !== false,
    purchaseMode: checkoutSupported
      ? SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT
      : SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP,
    checkoutSupported,
    linkedPlanCode: null,
    accessLevelKey:
      pkg.accessLevelKey || accessLevelKeyFromArticleLevel(pkg.articleAccessLevel),
  };
  return isSpecialOfferVisible(normalized) ? normalized : null;
}

export function hasSpecialOfferRefundExplanation(offer) {
  return Boolean(String(offer?.refundExplanationAr || "").trim());
}

export function splitSpecialOfferRefundSections(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildSpecialOfferWhatsAppUrl(pkg) {
  const text = encodeURIComponent(
    String(pkg?.whatsappMessageAr || SPECIAL_OFFER_DEFAULTS.whatsappMessageAr).trim(),
  );
  const base = `https://wa.me/${TRAINING_WHATSAPP_E164}`;
  return text ? `${base}?text=${text}` : base;
}

export function formStateFromSpecialOffer(pkg) {
  const src = pkg && typeof pkg === "object" ? pkg : SPECIAL_OFFER_DEFAULTS;
  const accessLevelKey =
    src.accessLevelKey || accessLevelKeyFromArticleLevel(src.articleAccessLevel);
  return {
    isVisible: Boolean(src.isVisible),
    title: src.title ?? SPECIAL_OFFER_DEFAULTS.title,
    subtitle: src.subtitle ?? "",
    badgeText: src.badgeText ?? SPECIAL_OFFER_DEFAULTS.badgeText,
    ribbonText: src.ribbonText ?? SPECIAL_OFFER_DEFAULTS.ribbonText,
    priceJod: src.priceJod ?? SPECIAL_OFFER_DEFAULTS.priceJod,
    originalPriceJod: src.originalPriceJod ?? "",
    totalOffers: src.totalOffers ?? SPECIAL_OFFER_DEFAULTS.totalOffers,
    dailyLimit: src.dailyLimit ?? SPECIAL_OFFER_DEFAULTS.dailyLimit,
    durationDays: src.durationDays ?? SPECIAL_OFFER_DEFAULTS.durationDays,
    maxProjectValueJod: src.maxProjectValueJod ?? "",
    accessLevelKey,
    ctaLabel: src.ctaLabel ?? SPECIAL_OFFER_DEFAULTS.ctaLabel,
    microcopy: src.microcopy ?? SPECIAL_OFFER_DEFAULTS.microcopy,
    refundExplanationAr: src.refundExplanationAr ?? SPECIAL_OFFER_DEFAULTS.refundExplanationAr,
    whatsappMessageAr: src.whatsappMessageAr ?? SPECIAL_OFFER_DEFAULTS.whatsappMessageAr,
    purchaseMode: resolveSpecialOfferPurchaseMode(src),
    offerVersion: Number(src.offerVersion) || 1,
    planTierCode: src.planTierCode || SPECIAL_OFFER_PLAN_TIER_CODE,
    linkedMarketplacePlanId: src.linkedMarketplacePlanId || null,
    benefitsLocked: Boolean(src.benefitsLocked),
    purchaseCount: Number(src.purchaseCount) || 0,
    canCreateNewVersion: Boolean(src.canCreateNewVersion || src.benefitsLocked),
  };
}

export function payloadFromSpecialOfferForm(form) {
  const original =
    form.originalPriceJod === "" || form.originalPriceJod == null
      ? null
      : Number(form.originalPriceJod);
  const maxProject =
    form.maxProjectValueJod === "" || form.maxProjectValueJod == null
      ? null
      : Number(form.maxProjectValueJod);
  const purchaseMode = resolveSpecialOfferPurchaseMode(form);
  const accessLevelKey = String(form.accessLevelKey || "silver").toLowerCase();
  return {
    isVisible: Boolean(form.isVisible),
    title: String(form.title || "").trim(),
    subtitle: String(form.subtitle || "").trim(),
    badgeText: String(form.badgeText || "").trim() || SPECIAL_OFFER_DEFAULTS.badgeText,
    ribbonText: String(form.ribbonText || "").trim() || SPECIAL_OFFER_DEFAULTS.ribbonText,
    priceJod: Number(form.priceJod),
    originalPriceJod: Number.isFinite(original) ? original : null,
    totalOffers: Number(form.totalOffers),
    dailyLimit: Number(form.dailyLimit),
    durationDays: Number(form.durationDays),
    maxProjectValueJod: Number.isFinite(maxProject) ? maxProject : null,
    accessLevelKey,
    articleAccessLevel: articleAccessLevelFromKey(accessLevelKey),
    ctaLabel: String(form.ctaLabel || "").trim() || SPECIAL_OFFER_DEFAULTS.ctaLabel,
    microcopy: String(form.microcopy || "").trim(),
    refundExplanationAr: String(form.refundExplanationAr || "").trim(),
    whatsappMessageAr: String(form.whatsappMessageAr || "").trim(),
    purchaseMode,
    linkedPlanCode: null,
  };
}
