/**
 * Special Offer Package — independent promotional package (tier special_offer).
 * purchaseMode=checkout uses dedicated marketplace plan, not SILVER/PRO/ELITE.
 */
import { isNewLocale, localizeSystemText } from "../i18n/systemContent.js";
import { TRAINING_WHATSAPP_E164 } from "./trainingPlansCatalog.js";
import { ct, ctAr, ctEnglish, withCatalogLabels } from "./constantsI18n.js";

export const SPECIAL_OFFER_PURCHASE_MODE = Object.freeze({
  CHECKOUT: "checkout",
  WHATSAPP: "whatsapp",
});

export const SPECIAL_OFFER_PLAN_TIER_CODE = "special_offer";

/**
 * Access levels: `labelKey` is the catalog key; legacy `labelAr` returns the non-English UI label (Arabic, or the
 * active de / nl / ro locale) and `labelEn` the English label.
 */
export const SPECIAL_OFFER_ACCESS_LEVEL_OPTIONS = Object.freeze(
  [
    { key: "starter", level: 1 },
    { key: "silver", level: 2 },
    { key: "pro", level: 3 },
    { key: "elite", level: 5 },
  ].map((row) =>
    Object.freeze(
      withCatalogLabels(row, `specialOfferPackage.accessLevels.${row.key}`, { labelAr: "local", labelEn: "en" }),
    ),
  ),
);

export const SPECIAL_OFFER_DEFAULT_REFUND_EXPLANATION_AR = `يُسترد مبلغ 100 دينار بواقع 20 دينارًا عن كل شهر نشط ومؤهل، حتى استرداد كامل مبلغ 100 دينار، ضمن مدة التزام مقدارها 6 أشهر. يمكن أن تكون الأشهر المؤهلة متتالية أو متفرقة.

إذا لم تعمل في شهر معين، فلا توجد غرامة ولا دفعة جديدة؛ لكن ذلك الشهر لا يولّد مبلغ استرداد بقيمة 20 دينارًا.

الدخل الناتج عن تنفيذ الطلبات منفصل تمامًا عن مبلغ الاسترداد.

المبلغ ليس رسوم تقديم، أو مقابلة، أو دورة تدريبية، ولا يمثل ضمانًا للعمل أو الدخل.`;

export const SPECIAL_OFFER_DEFAULT_REFUND_EXPLANATION_EN = `A refund of 100 JOD is issued at 20 JOD for each active, eligible month, until the full 100 JOD is refunded, within a 6-month commitment period. Eligible months may be consecutive or separate.

If you do not work in a given month, there is no penalty and no new payment; that month does not generate a 20 JOD refund.

Income from completing Orders is entirely separate from the refund amount.

The amount is not an application fee, an interview fee, or a training-course fee, and it is not a guarantee of work or income.`;

const SPECIAL_OFFER_EN_BY_FIELD = Object.freeze({
  title: { "باقة العرض": "Special offer" },
  subtitle: {
    "عرض ترويجي لفترة محدودة — عروض أكثر بسعر خاص.": "A limited-time promotion — more bids at a special price.",
  },
  badgeText: { "عرض خاص": "Special offer" },
  ribbonText: { "لفترة محدودة": "Limited time" },
  ctaLabel: {
    "احصل على العرض الآن": "Get this offer now",
    "تواصل للحصول على العرض": "Contact us for this offer",
  },
  microcopy: {
    "بدون التزام، يمكنك الترقية في أي وقت": "No commitment. You can upgrade at any time.",
    "بدون التزام، يمكنك الترقية أو الإلغاء في أي وقت": "No commitment. You can upgrade or cancel at any time.",
  },
});

function englishSpecialOfferText(offer, field, arabic) {
  const direct = String(offer?.[`${field}En`] || "").trim();
  if (direct) return direct;
  if (field === "refundExplanationAr") {
    const refundEn = String(offer?.refundExplanationEn || "").trim();
    if (refundEn) return refundEn;
    if (arabic.trim() === SPECIAL_OFFER_DEFAULT_REFUND_EXPLANATION_AR.trim()) {
      return SPECIAL_OFFER_DEFAULT_REFUND_EXPLANATION_EN;
    }
    return "";
  }
  return SPECIAL_OFFER_EN_BY_FIELD[field]?.[arabic.trim()] || "";
}

/**
 * Special-offer system content for a UI locale. Arabic: the stored Arabic field; English: the English field or the
 * canonical English copy ("" when none); German / Dutch / Romanian: the system-content translation of the English
 * (else Arabic) source.
 */
export function localizedSpecialOfferText(offer, field, locale) {
  const arabic = String(offer?.[field] ?? "");
  if (isNewLocale(locale)) {
    return localizeSystemText(locale, { ar: arabic, en: englishSpecialOfferText(offer, field, arabic) });
  }
  if (locale !== "en") return arabic;
  return englishSpecialOfferText(offer, field, arabic);
}

const REFUND_SECTION_TITLE_KEYS = Object.freeze(["monthlyRefund", "inactiveMonths", "ordersIncome", "importantNotice"]);

/** Arabic refund section titles (catalog: platformConstants.specialOfferPackage.refundSectionTitles). */
export const SPECIAL_OFFER_REFUND_SECTION_TITLES_AR = Object.freeze(
  REFUND_SECTION_TITLE_KEYS.map((key) => ctAr(`specialOfferPackage.refundSectionTitles.${key}`)),
);

/** Refund section titles for a UI locale (default: Arabic, or the active de / nl / ro locale). */
export function specialOfferRefundSectionTitles(locale) {
  return REFUND_SECTION_TITLE_KEYS.map((key) => ct(`specialOfferPackage.refundSectionTitles.${key}`, undefined, locale));
}

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

/** Arabic / English copies (catalog: platformConstants.specialOfferPackage.lockedWarning). */
export const SPECIAL_OFFER_LOCKED_WARNING_AR = ctAr("specialOfferPackage.lockedWarning");

export const SPECIAL_OFFER_LOCKED_WARNING_EN = ctEnglish("specialOfferPackage.lockedWarning");

/** Locked-offer warning for any UI locale (`isEn ? …_EN : …_AR` replacement). */
export function specialOfferLockedWarning(locale) {
  return ct("specialOfferPackage.lockedWarning", undefined, locale);
}

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
    titleEn: src.titleEn ?? "",
    subtitle: src.subtitle ?? "",
    subtitleEn: src.subtitleEn ?? "",
    badgeText: src.badgeText ?? SPECIAL_OFFER_DEFAULTS.badgeText,
    badgeTextEn: src.badgeTextEn ?? "",
    ribbonText: src.ribbonText ?? SPECIAL_OFFER_DEFAULTS.ribbonText,
    ribbonTextEn: src.ribbonTextEn ?? "",
    priceJod: src.priceJod ?? SPECIAL_OFFER_DEFAULTS.priceJod,
    originalPriceJod: src.originalPriceJod ?? "",
    totalOffers: src.totalOffers ?? SPECIAL_OFFER_DEFAULTS.totalOffers,
    dailyLimit: src.dailyLimit ?? SPECIAL_OFFER_DEFAULTS.dailyLimit,
    durationDays: src.durationDays ?? SPECIAL_OFFER_DEFAULTS.durationDays,
    maxProjectValueJod: src.maxProjectValueJod ?? "",
    accessLevelKey,
    ctaLabel: src.ctaLabel ?? SPECIAL_OFFER_DEFAULTS.ctaLabel,
    ctaLabelEn: src.ctaLabelEn ?? "",
    microcopy: src.microcopy ?? SPECIAL_OFFER_DEFAULTS.microcopy,
    microcopyEn: src.microcopyEn ?? "",
    refundExplanationAr: src.refundExplanationAr ?? SPECIAL_OFFER_DEFAULTS.refundExplanationAr,
    refundExplanationEn: src.refundExplanationEn ?? "",
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
    titleEn: String(form.titleEn || "").trim(),
    subtitle: String(form.subtitle || "").trim(),
    subtitleEn: String(form.subtitleEn || "").trim(),
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
    badgeTextEn: String(form.badgeTextEn || "").trim(),
    ribbonTextEn: String(form.ribbonTextEn || "").trim(),
    ctaLabel: String(form.ctaLabel || "").trim() || SPECIAL_OFFER_DEFAULTS.ctaLabel,
    ctaLabelEn: String(form.ctaLabelEn || "").trim(),
    microcopy: String(form.microcopy || "").trim(),
    microcopyEn: String(form.microcopyEn || "").trim(),
    refundExplanationAr: String(form.refundExplanationAr || "").trim(),
    refundExplanationEn: String(form.refundExplanationEn || "").trim(),
    whatsappMessageAr: String(form.whatsappMessageAr || "").trim(),
    purchaseMode,
    linkedPlanCode: null,
  };
}
