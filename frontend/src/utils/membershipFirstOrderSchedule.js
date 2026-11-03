import { localeFromEnFlag, pt } from "../i18n/activeLocale.js";
import { isLatinUiLocale } from "../i18n/intlLocale.js";
import { pluralCategoryFor } from "../i18n/plural.js";

const MS = "platformUtils.membershipSchedule";

/** Catalog form for a month count: Arabic grammar unchanged (1, 2, 3–10, 11+); other locales via Intl.PluralRules. */
function monthsKey(n, locale) {
  if (!isLatinUiLocale(locale)) {
    if (n === 1) return "monthOne";
    if (n === 2) return "monthTwo";
    if (n >= 3 && n <= 10) return "monthsFew";
    return "monthsMany";
  }
  const category = pluralCategoryFor(locale, n);
  if (category === "one") return "monthOne";
  // Romanian "few" (2–19: "3 luni") vs "other" (20+: "20 de luni").
  if (category === "few") return "monthsFew";
  return "monthsMany";
}

/**
 * @param {unknown} months
 * @param {string} [locale] Arabic unless a locale is given; follows German / Dutch / Romanian UIs.
 */
export function durationMonthsLabel(months, locale = localeFromEnFlag(false)) {
  const n = Number(months);
  if (!Number.isInteger(n) || n < 1) return null;
  return pt(`${MS}.${monthsKey(n, locale)}`, { count: n }, locale);
}

/**
 * @param {Record<string, unknown> | null} subscription
 * @param {{ waiting?: string, starts?: string, expiry?: string, duration?: (months: unknown) => string } | null} [copy]
 * @param {string} [locale] fallback copy locale (Arabic unless given; follows German / Dutch / Romanian UIs)
 */
export function membershipScheduleView(subscription, copy = null, locale = localeFromEnFlag(false)) {
  if (!subscription) {
    return { awaitingFirstOrder: false, durationLabel: null };
  }
  const approved = String(subscription.activationStatus || "") === "company_approved";
  const notStarted = String(subscription.status || "") === "assigned_not_started";
  const awaitingFirstOrder =
    approved &&
    notStarted &&
    subscription.hasFirstOrder !== true &&
    !subscription.actualStartDate &&
    !subscription.expiryDate;

  const months = subscription.entitlementDurationMonths;
  return {
    awaitingFirstOrder,
    statusLabel: awaitingFirstOrder ? copy?.waiting || pt(`${MS}.awaitingFirstOrder`, undefined, locale) : null,
    durationLabel: copy?.duration ? copy.duration(months) : durationMonthsLabel(months, locale),
    startLabel: awaitingFirstOrder ? copy?.starts || pt(`${MS}.startsOnFirstOrder`, undefined, locale) : null,
    expiryLabel: awaitingFirstOrder ? copy?.expiry || pt(`${MS}.expiryAfterStart`, undefined, locale) : null,
  };
}
