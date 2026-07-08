import {
  COUNTRY_OVERRIDE_STORAGE_KEY,
  DISPLAY_CURRENCY,
  JOD_TO_EGP_RATE,
  SUBSCRIPTION_ACTIVATION_FEE_JOD,
} from "../config/currencyDisplayConfig.js";

const EGYPT_COUNTRY_CODES = new Set(["EG", "EGY", "EGYPT"]);

function formatJodAmount(amountJod, locale = "ar") {
  if (amountJod === null || amountJod === undefined) return null;
  const n = Number(amountJod);
  if (!Number.isFinite(n)) return null;
  const formatted = n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n === 0) return locale === "en" ? "Free" : "مجانية";
  return locale === "en" ? `${formatted} JOD` : `${formatted} د.أ`;
}

export function normalizeCountryCode(value) {
  if (value == null) return null;
  const code = String(value).trim().toUpperCase();
  if (!code) return null;
  if (code === "EGYPT") return "EG";
  if (code.length === 2) return code;
  return code;
}

export function isEgyptCountry(countryCode) {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return false;
  return EGYPT_COUNTRY_CODES.has(normalized);
}

export function getDisplayCurrencyForCountry(countryCode) {
  return isEgyptCountry(countryCode) ? DISPLAY_CURRENCY.EGP : DISPLAY_CURRENCY.JOD;
}

function readStoredCountryOverride() {
  if (typeof window === "undefined") return null;
  try {
    return normalizeCountryCode(window.localStorage.getItem(COUNTRY_OVERRIDE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function readQueryCountryOverride(searchParams) {
  if (!searchParams) return null;
  const fromCountry = normalizeCountryCode(searchParams.get("country"));
  if (fromCountry) return fromCountry;
  return null;
}

/**
 * Resolve ISO country for display currency.
 * Priority: user profile → GET /public/geo → localStorage override → query param.
 * CF-IPCountry is read on the server; pass result as geoCountryCode.
 */
export function resolveUserCountryCode({ user = null, searchParams = null, geoCountryCode = null } = {}) {
  const fromProfile =
    normalizeCountryCode(user?.billingCountry) ||
    normalizeCountryCode(user?.billing_country) ||
    normalizeCountryCode(user?.country);

  if (fromProfile) return fromProfile;

  const fromGeo = normalizeCountryCode(geoCountryCode);
  if (fromGeo) return fromGeo;

  const fromStorage = readStoredCountryOverride();
  if (fromStorage) return fromStorage;

  const fromQuery = readQueryCountryOverride(searchParams);
  if (fromQuery) return fromQuery;

  return null;
}

export function convertJodToEgp(amountJod) {
  const n = Number(amountJod);
  if (!Number.isFinite(n)) return null;
  return n * JOD_TO_EGP_RATE;
}

export function formatEgpAmount(amountEgp, locale = "ar") {
  const n = Number(amountEgp);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  const formatted = rounded.toLocaleString(locale === "en" ? "en-US" : "ar-EG", {
    maximumFractionDigits: 0,
  });
  return locale === "en" ? `${formatted} EGP` : `${formatted} ج.م`;
}

/**
 * @param {number | null | undefined} amountJod
 * @param {{ locale?: string; displayCurrency?: string }} [options]
 */
export function formatPriceFromJod(amountJod, { locale = "ar", displayCurrency = DISPLAY_CURRENCY.JOD } = {}) {
  if (amountJod === null || amountJod === undefined) return null;
  const n = Number(amountJod);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return formatJodAmount(0, locale);

  if (displayCurrency === DISPLAY_CURRENCY.EGP) {
    const egp = convertJodToEgp(n);
    return egp == null ? null : formatEgpAmount(egp, locale);
  }

  return formatJodAmount(n, locale);
}

/**
 * Map plan headline price for public cards (display-only; checkout stays JOD).
 *
 * @param {Record<string, unknown>} plan
 * @param {{ main: string; sub: string | null }} basePrice from getLocalizedPlanCardDisplay
 * @param {string} locale
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 * @param {string} displayCurrency
 */
export function resolvePlanPriceDisplay(plan, basePrice, locale, t, displayCurrency) {
  if (displayCurrency !== DISPLAY_CURRENCY.EGP) {
    return { main: basePrice.main, sub: basePrice.sub, checkoutHint: null };
  }

  const totalJod = Number(plan?.priceJod);
  if (!Number.isFinite(totalJod) || totalJod === 0) {
    return { main: basePrice.main, sub: basePrice.sub, checkoutHint: null };
  }

  const checkoutJodRaw = plan?.stripeCheckoutAmountJod;
  const checkoutJod =
    checkoutJodRaw != null && Number.isFinite(Number(checkoutJodRaw)) ? Number(checkoutJodRaw) : totalJod;
  const mainJod = checkoutJod;

  const main = formatPriceFromJod(mainJod, { locale, displayCurrency: DISPLAY_CURRENCY.EGP }) || basePrice.main;
  const equivalentJod = formatJodAmount(mainJod, locale);
  let sub = equivalentJod ? t("plans.currency.equivalentJod", { amount: equivalentJod }) : null;

  if (checkoutJodRaw != null && checkoutJod !== totalJod) {
    const totalEgp = formatPriceFromJod(totalJod, { locale, displayCurrency: DISPLAY_CURRENCY.EGP });
    if (totalEgp) {
      sub =
        locale === "en"
          ? `Total: ${totalEgp}${sub ? ` · ${sub}` : ""}`
          : `الإجمالي ${totalEgp}${sub ? ` · ${sub}` : ""}`;
    }
  }

  return {
    main,
    sub,
    checkoutHint: t("plans.currency.checkoutChargedInJod"),
  };
}

export function formatActivationFeeAmount(locale, displayCurrency) {
  return (
    formatPriceFromJod(SUBSCRIPTION_ACTIVATION_FEE_JOD, { locale, displayCurrency }) ||
    formatJodAmount(SUBSCRIPTION_ACTIVATION_FEE_JOD, locale)
  );
}

export function formatFreePlanActivationFeeNote(locale, t, displayCurrency) {
  const amount = formatActivationFeeAmount(locale, displayCurrency);
  return t("plans.freePlanActivationFeeNote", { amount });
}
