import {
  formatInstallmentSummary,
  formatOrderValueRange,
  isOfferActive,
  planListItems,
} from "../../components/plans/planDisplayUtils.js";
import { resources } from "../../i18n/resources.js";
import { pt } from "../../i18n/activeLocale.js";
import { pickIntlTag } from "../../i18n/intlLocale.js";
import { isNewLocale } from "../../i18n/systemContent.js";
import { getLocalizedField } from "./getLocalizedField.js";
import { localizeSystemCopyForNewLocale, resolveUiLocale } from "./newLocaleSystemCopy.js";

const PLAN_LOCALE_KEYS = {
  1: "free",
  2: "standard",
  3: "platinum",
  orderzhouse_free: "free",
  orderzhouse_50_jod: "standard",
  orderzhouse_platinum: "platinum",
};

const TIER_LABEL_ALIASES = {
  basic: "basic",
  advance: "advance",
  advanced: "advance",
  premium: "premium",
  popular: "popular",
  "pro+": "proPlus",
  proplus: "proPlus",
  platinum: "platinum",
};

function normalizeTierLabelToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function resolveTierLabelKey(rawLabel) {
  const token = normalizeTierLabelToken(rawLabel);
  if (!token) return null;
  return TIER_LABEL_ALIASES[token] || null;
}

function localizeTierLabel(rawLabel, locale, t) {
  const tierKey = resolveTierLabelKey(rawLabel);
  if (tierKey) return t(`plans.tierLabels.${tierKey}`);
  return rawLabel || null;
}

/**
 * Maps catalog/API plan id or slug to `plans.cards.*` locale keys.
 * id 1 → free, id 2 → standard, id 3 → platinum (also by `name` slug).
 *
 * @param {Record<string, unknown> | null | undefined} plan
 * @returns {"free" | "standard" | "platinum" | null}
 */
export function getPlanLocaleKey(plan) {
  if (!plan) return null;
  // Marketplace Membership must never inherit legacy free/standard/platinum locale cards
  // (DB ids can collide with canonical legacy plan ids 1–3).
  if (
    plan.catalogSource === "marketplace_membership" ||
    plan.marketplaceMembership === true
  ) {
    return null;
  }
  const id = String(plan.id ?? "");
  const name = String(plan.name ?? "");
  return PLAN_LOCALE_KEYS[id] || PLAN_LOCALE_KEYS[name] || null;
}

function getCardLocaleBundle(locale, localeKey) {
  if (!localeKey) return null;
  const bundle = resources[locale]?.plans?.cards?.[localeKey];
  return bundle && typeof bundle === "object" ? bundle : null;
}

function containsArabicScript(value) {
  return /[\u0600-\u06FF]/.test(String(value || ""));
}

function cardBundleKey(localeKey, field, cardBundle) {
  const value = cardBundle?.[field];
  if (!localeKey || value == null || String(value).trim() === "") return null;
  return `plans.cards.${localeKey}.${field}`;
}

function resolveCardString(plan, field, locale, localeKey, cardBundle) {
  const base = plan?.[field] != null ? String(plan[field]).trim() : "";

  if (isNewLocale(locale)) {
    // German / Dutch / Romanian: system-content translation → plans.cards bundle → never Arabic script.
    const enExplicit = plan?.[`${field}En`] ?? plan?.[`${field}_en`];
    const arabic = getLocalizedField(plan, field, "ar") || base;
    const localized = localizeSystemCopyForNewLocale(locale, {
      ar: arabic,
      en: enExplicit,
      key: cardBundleKey(localeKey, field, cardBundle),
    });
    return localized && !containsArabicScript(localized) ? localized : "";
  }

  if (locale === "en") {
    const enExplicit = plan?.[`${field}En`] ?? plan?.[`${field}_en`];
    if (enExplicit != null && String(enExplicit).trim() !== "" && !containsArabicScript(enExplicit)) {
      return String(enExplicit).trim();
    }
    const fromLocale = cardBundle?.[field];
    if (fromLocale != null && String(fromLocale).trim() !== "" && (!base || containsArabicScript(base))) {
      return String(fromLocale).trim();
    }
    if (base && !containsArabicScript(base)) return base;
    if (fromLocale != null && String(fromLocale).trim() !== "") return String(fromLocale).trim();
    return "";
  }

  const fromApi = getLocalizedField(plan, field, locale);
  return fromApi || base;
}

/**
 * @param {number | null | undefined} priceJod
 * @param {string} [locale="ar"]
 * @returns {string | null}
 */
export function formatPlanPriceJod(priceJod, locale = "ar") {
  if (priceJod === null || priceJod === undefined) return null;
  const n = Number(priceJod);
  if (!Number.isFinite(n)) return null;
  const uiLocale = resolveUiLocale(locale);
  const formatted = n.toLocaleString(pickIntlTag(uiLocale, { ar: "en-US", en: "en-US" }), { maximumFractionDigits: 2 });
  if (n === 0) return pt("platformCore.planPrice.free", undefined, uiLocale);
  return pt("platformCore.money.jodAmount", { amount: formatted }, uiLocale);
}

/** German / Dutch / Romanian feature row: static catalog key (mapped plans) → system-content translation. */
function newLocaleFeatureText(item, locale) {
  const featureKey = item && typeof item === "object" ? item.featureKey : null;
  if (featureKey) {
    const fromCatalog = pt(featureKey, undefined, locale);
    if (fromCatalog && fromCatalog !== featureKey) return fromCatalog;
  }
  const arabic = item && typeof item === "object" ? item.featureText : item;
  const localized = localizeSystemCopyForNewLocale(locale, { ar: arabic, en: item?.featureTextEn });
  return localized && !containsArabicScript(localized) ? localized : "";
}

function getLocalizedFeatures(plan, locale, localeKey, cardBundle) {
  const latinUi = locale === "en" || isNewLocale(locale);
  if (Array.isArray(plan?.planFeatures) && plan.planFeatures.length > 0) {
    const fromDb = plan.planFeatures
      .filter((item) => item?.isIncluded !== false)
      .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
      .map((item) => {
        if (locale === "en") {
          const english = item?.featureTextEn ? String(item.featureTextEn).trim() : "";
          if (english && !containsArabicScript(english)) return english;
          const base = String(item.featureText || "");
          if (base && !containsArabicScript(base)) return base;
          return "";
        }
        if (isNewLocale(locale)) return newLocaleFeatureText(item, locale);
        return String(item.featureText || item);
      })
      .filter(Boolean);
    if (fromDb.length > 0) return fromDb.slice(0, 14);
    if (latinUi && Array.isArray(cardBundle?.features) && cardBundle.features.length > 0) {
      return cardBundle.features.map((item) => String(item)).slice(0, 14);
    }
  }

  const listed = planListItems(plan, locale);
  const apiFeatures = isNewLocale(locale)
    ? listed
        .map((item) => (containsArabicScript(item) ? localizeSystemCopyForNewLocale(locale, { ar: item }) : item))
        .filter((item) => item && !containsArabicScript(item))
    : listed;
  if (apiFeatures.length > 0) {
    return apiFeatures.slice(0, 14);
  }

  if (latinUi && Array.isArray(cardBundle?.features) && cardBundle.features.length > 0) {
    return cardBundle.features.map((item) => String(item));
  }

  return apiFeatures.slice(0, 14);
}

function getLocalizedOrderValueRange(plan, locale, cardBundle) {
  // The Arabic and English cards always showed the Arabic range copy; German / Dutch / Romanian get their own.
  const fromApi = formatOrderValueRange(plan, isNewLocale(locale) ? locale : "ar");
  if (fromApi) return fromApi;
  if ((locale === "en" || isNewLocale(locale)) && cardBundle?.orderValue) {
    return String(cardBundle.orderValue);
  }
  return fromApi;
}

function getLocalizedInstallmentSummary(plan, locale, t, cardBundle) {
  const fromApi =
    locale === "en" || isNewLocale(locale)
      ? (() => {
          const inst = plan?.installmentPlan;
          if (!inst || typeof inst !== "object") return null;
          const parts = [];
          if (inst.upfrontJod != null) {
            parts.push(t("plans.installmentAtSignup", { amount: Number(inst.upfrontJod) }));
          }
          if (inst.monthlyJod != null && inst.months != null) {
            parts.push(
              t("plans.installmentMonthly", {
                amount: Number(inst.monthlyJod),
                months: inst.months,
              }),
            );
          }
          return parts.length > 0 ? parts.join(" · ") : null;
        })()
      : formatInstallmentSummary(plan, "ar");
  if (fromApi) return fromApi;
  if ((locale === "en" || isNewLocale(locale)) && cardBundle?.installment) {
    return String(cardBundle.installment);
  }
  return fromApi;
}

function localizedSaleReason(plan, locale) {
  if (locale === "en") {
    return (
      String(plan.saleReasonEn || "").trim() ||
      (containsArabicScript(plan.saleReason) ? "" : String(plan.saleReason || "").trim())
    );
  }
  if (isNewLocale(locale)) {
    const localized = localizeSystemCopyForNewLocale(locale, { ar: plan.saleReason, en: plan.saleReasonEn });
    return localized && !containsArabicScript(localized) ? localized : "";
  }
  return String(plan.saleReason || "").trim();
}

function getLocalizedPriceHeadline(plan, locale, t) {
  if (plan?.saleActive && plan?.effectivePriceJod != null && plan?.originalPriceJod != null) {
    const original = formatPlanPriceJod(plan.originalPriceJod, locale);
    const effective = formatPlanPriceJod(plan.effectivePriceJod, locale);
    const pct = Number(plan.salePercentage);
    const reason = localizedSaleReason(plan, locale);
    return {
      main: effective || "—",
      sub: null,
      sale: {
        active: true,
        original,
        percentage: Number.isFinite(pct) ? pct : null,
        reason: reason || null,
        badge: Number.isFinite(pct) && pct > 0 ? t("plans.sale.percentOff", { percent: pct }) : null,
      },
    };
  }

  const total = formatPlanPriceJod(plan?.priceJod, locale);
  const checkout =
    plan?.stripeCheckoutAmountJod != null
      ? formatPlanPriceJod(plan.stripeCheckoutAmountJod, locale)
      : null;

  if (checkout && total && checkout !== total) {
    const totalAmount = Number(plan.priceJod);
    const totalLabel =
      (locale === "en" || isNewLocale(locale)) && Number.isFinite(totalAmount)
        ? t("plans.priceTotal", {
            amount: totalAmount.toLocaleString(pickIntlTag(locale, { en: "en-US" }), { maximumFractionDigits: 2 }),
          })
        : pt("platformCore.planPrice.total", { total }, resolveUiLocale(locale));
    return { main: checkout, sub: totalLabel, sale: null };
  }

  return { main: total || "—", sub: null, sale: null };
}

/**
 * @param {Record<string, unknown>} plan
 * @param {boolean} featured
 * @param {string} locale
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function getLocalizedPlanBadge(plan, featured, locale, t) {
  const englishTierSource =
    plan?.labelEn || plan?.label_en || (locale === "en" ? getLocalizedField(plan, "label", locale) : plan?.label);
  const localizedFromTier = localizeTierLabel(englishTierSource, locale, t);
  if (localizedFromTier && resolveTierLabelKey(englishTierSource)) {
    return localizedFromTier;
  }

  const label = getLocalizedField(plan, "label", locale);
  const mappedLabel = localizeTierLabel(label, locale, t);
  if (mappedLabel && resolveTierLabelKey(label)) return mappedLabel;
  if (label) return label;

  if (featured && plan?.isPopular) return t("plans.badges.mostPopular");
  if (featured && plan?.isFeatured) return t("plans.badges.premium");
  if (featured) return t("plans.badges.mostPopular");
  return null;
}

/**
 * Resolve localized plan card copy for public Plans UI.
 *
 * Priority for English: API `*En` columns → `en/plans.json` cards when the base text is Arabic → non-Arabic base text.
 * Arabic copy comes from API/DB fields directly.
 * German / Dutch / Romanian: system-content translation → `<locale>/plans.json` cards → never Arabic script.
 *
 * @param {Record<string, unknown>} plan
 * @param {string} locale
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function getLocalizedPlanCardDisplay(plan, locale, t) {
  const localeKey = getPlanLocaleKey(plan);
  const cardBundle =
    locale === "en"
      ? getCardLocaleBundle("en", localeKey)
      : isNewLocale(locale)
        ? getCardLocaleBundle(locale, localeKey) || getCardLocaleBundle("en", localeKey)
        : null;

  const offerActive = isOfferActive(plan);
  const offerLabel = resolveCardString(
    {
      offerLabel: offerActive && plan?.offerLabel ? String(plan.offerLabel).trim() : "",
      offerLabelEn: offerActive && plan?.offerLabelEn ? String(plan.offerLabelEn).trim() : "",
    },
    "offerLabel",
    locale,
    localeKey,
    cardBundle,
  );

  return {
    title: resolveCardString(plan, "title", locale, localeKey, cardBundle) || plan?.name || "—",
    description: resolveCardString(plan, "description", locale, localeKey, cardBundle),
    priceIntroText: resolveCardString(plan, "priceIntroText", locale, localeKey, cardBundle),
    features: getLocalizedFeatures(plan, locale, localeKey, cardBundle),
    orderRange: getLocalizedOrderValueRange(plan, locale, cardBundle),
    installment: getLocalizedInstallmentSummary(plan, locale, t, cardBundle),
    paymentNotes: resolveCardString(plan, "paymentNotes", locale, localeKey, cardBundle),
    activationRequirements: resolveCardString(
      plan,
      "activationRequirements",
      locale,
      localeKey,
      cardBundle,
    ),
    refundPolicy: resolveCardString(plan, "refundPolicy", locale, localeKey, cardBundle),
    offerLabel,
    price: getLocalizedPriceHeadline(plan, locale, t),
  };
}
