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

/**
 * Maps catalog/API plan id or slug to `plans.cards.*` locale keys.
 * id 1 → free, id 2 → standard, id 3 → platinum (also by `name` slug).
 *
 * @param {Record<string, unknown> | null | undefined} plan
 * @returns {"free" | "standard" | "platinum" | null}
 */
export function getPlanLocaleKey(plan) {
  if (!plan) return null;
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
  const fromApi = getLocalizedField(plan, field, locale);
  const base = plan?.[field] != null ? String(plan[field]) : "";

  if (locale === "en") {
    if (fromApi && fromApi !== base) return fromApi;
    const fromLocale = cardBundle?.[field];
    if (fromLocale != null && String(fromLocale).trim() !== "") return String(fromLocale);
    // Unmapped plans (no localeKey / cards.* entry, no *_en API fields) keep Arabic catalog text.
    return base;
  }

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
  if (locale === "en" && Array.isArray(cardBundle?.features) && cardBundle.features.length > 0) {
    return cardBundle.features.map((item) => String(item));
  }
  // Arabic: catalog `features` / API fields via planListItems — no en/plans.json cards mirror.
  return planListItems(plan);
}

function getLocalizedOrderValueRange(plan, locale, cardBundle) {
  if (locale === "en" && cardBundle?.orderValue) {
    return String(cardBundle.orderValue);
  }
  return formatOrderValueRange(plan);
}

function getLocalizedInstallmentSummary(plan, locale, t, cardBundle) {
  if (locale === "en" && cardBundle?.installment) {
    return String(cardBundle.installment);
  }
  if (locale === "en") {
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
  }
  return formatInstallmentSummary(plan);
}

function getLocalizedPriceHeadline(plan, locale, t) {
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
    return { main: checkout, sub: totalLabel };
  }

  return { main: total || "—", sub: null };
}

/**
 * @param {Record<string, unknown>} plan
 * @param {boolean} featured
 * @param {string} locale
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function getLocalizedPlanBadge(plan, featured, locale, t) {
  if (plan?.label) return String(plan.label);
  if (featured && plan?.isPopular) return t("plans.badges.mostPopular");
  if (featured && plan?.isFeatured) return t("plans.badges.premium");
  if (featured) return t("plans.badges.mostPopular");
  return null;
}

/**
 * Resolve localized plan card copy for public Plans UI.
 *
 * English copy for ids 1–3 comes from `en/plans.json` → `cards.{free|standard|platinum}`.
 * Arabic copy comes from the merged catalog / API fields.
 * New plan ids need either `cards.*` locale entries, API `*_en` fields, or will show Arabic in EN.
 *
 * @param {Record<string, unknown>} plan
 * @param {string} locale
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function getLocalizedPlanCardDisplay(plan, locale, t) {
  const localeKey = getPlanLocaleKey(plan);
  const cardBundle = locale === "en" ? getCardLocaleBundle("en", localeKey) : null;

  const offerActive = isOfferActive(plan);
  const offerFromPlan = offerActive && plan?.offerLabel ? String(plan.offerLabel).trim() : "";
  const offerLabel = resolveCardString(
    { offerLabel: offerFromPlan },
    "offerLabel",
    locale,
    localeKey,
    cardBundle,
  );

  return {
    title: resolveCardString(plan, "title", locale, localeKey, cardBundle) || plan?.name || "—",
    description: resolveCardString(plan, "description", locale, localeKey, cardBundle),
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
