import {
  formatInstallmentSummary,
  formatOrderValueRange,
  isOfferActive,
  planListItems,
} from "../../components/plans/planDisplayUtils";
import { resources } from "../../i18n/resources";
import { getLocalizedField } from "./getLocalizedField";

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

function resolveCardString(plan, field, locale, localeKey, cardBundle) {
  const base = plan?.[field] != null ? String(plan[field]).trim() : "";

  if (locale === "en") {
    const enExplicit = plan?.[`${field}En`] ?? plan?.[`${field}_en`];
    if (enExplicit != null && String(enExplicit).trim() !== "") {
      return String(enExplicit).trim();
    }
    // API/base column beats hardcoded locale cards when DB has content.
    if (base) return base;
    const fromLocale = cardBundle?.[field];
    if (fromLocale != null && String(fromLocale).trim() !== "") {
      return String(fromLocale).trim();
    }
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
  const formatted = n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n === 0) return locale === "en" ? "Free" : "مجانية";
  return locale === "en" ? `${formatted} JOD` : `${formatted} د.أ`;
}

function getLocalizedFeatures(plan, locale, localeKey, cardBundle) {
  if (Array.isArray(plan?.planFeatures) && plan.planFeatures.length > 0) {
    const fromDb = plan.planFeatures
      .filter((item) => item?.isIncluded !== false)
      .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
      .map((item) => {
        if (locale === "en" && item?.featureTextEn) return String(item.featureTextEn);
        return String(item.featureText || item);
      })
      .filter(Boolean);
    if (fromDb.length > 0) return fromDb.slice(0, 14);
  }

  const apiFeatures = planListItems(plan, locale);
  if (apiFeatures.length > 0) {
    return apiFeatures.slice(0, 14);
  }

  if (locale === "en" && Array.isArray(cardBundle?.features) && cardBundle.features.length > 0) {
    return cardBundle.features.map((item) => String(item));
  }

  return apiFeatures.slice(0, 14);
}

function getLocalizedOrderValueRange(plan, locale, cardBundle) {
  const fromApi = formatOrderValueRange(plan);
  if (fromApi) return fromApi;
  if (locale === "en" && cardBundle?.orderValue) {
    return String(cardBundle.orderValue);
  }
  return fromApi;
}

function getLocalizedInstallmentSummary(plan, locale, t, cardBundle) {
  const fromApi =
    locale === "en"
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
      : formatInstallmentSummary(plan);
  if (fromApi) return fromApi;
  if (locale === "en" && cardBundle?.installment) {
    return String(cardBundle.installment);
  }
  return fromApi;
}

function getLocalizedPriceHeadline(plan, locale, t) {
  if (plan?.saleActive && plan?.effectivePriceJod != null && plan?.originalPriceJod != null) {
    const original = formatPlanPriceJod(plan.originalPriceJod, locale);
    const effective = formatPlanPriceJod(plan.effectivePriceJod, locale);
    const pct = Number(plan.salePercentage);
    const reason =
      locale === "en"
        ? String(plan.saleReasonEn || plan.saleReason || "").trim()
        : String(plan.saleReason || "").trim();
    return {
      main: effective || "—",
      sub: null,
      sale: {
        active: true,
        original,
        percentage: Number.isFinite(pct) ? pct : null,
        reason: reason || null,
        badge:
          Number.isFinite(pct) && pct > 0
            ? locale === "en"
              ? t("plans.sale.percentOff", { percent: pct })
              : t("plans.sale.percentOff", { percent: pct })
            : null,
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
      locale === "en" && Number.isFinite(totalAmount)
        ? t("plans.priceTotal", {
            amount: totalAmount.toLocaleString("en-US", { maximumFractionDigits: 2 }),
          })
        : `الإجمالي ${total}`;
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
 * Priority for English: API `*En` columns → API base (Arabic) fields → `en/plans.json` cards fallback.
 * Arabic copy comes from API/DB fields directly.
 *
 * @param {Record<string, unknown>} plan
 * @param {string} locale
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function getLocalizedPlanCardDisplay(plan, locale, t) {
  const localeKey = getPlanLocaleKey(plan);
  const cardBundle = locale === "en" ? getCardLocaleBundle("en", localeKey) : null;

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
