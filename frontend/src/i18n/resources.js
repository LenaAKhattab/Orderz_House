import arCommon from "../locales/ar/common.json";
import arNav from "../locales/ar/nav.json";
import arFooter from "../locales/ar/footer.json";
import arHome from "../locales/ar/home.json";
import arAuth from "../locales/ar/auth.json";
import arServices from "../locales/ar/services.json";
import arPlans from "../locales/ar/plans.json";
import arAbout from "../locales/ar/about.json";
import arOrders from "../locales/ar/orders.json";
import arAccountDeletion from "../locales/ar/accountDeletion.json";

import enCommon from "../locales/en/common.json";
import enNav from "../locales/en/nav.json";
import enFooter from "../locales/en/footer.json";
import enHome from "../locales/en/home.json";
import enAuth from "../locales/en/auth.json";
import enServices from "../locales/en/services.json";
import enPlans from "../locales/en/plans.json";
import enAbout from "../locales/en/about.json";
import enOrders from "../locales/en/orders.json";
import enAccountDeletion from "../locales/en/accountDeletion.json";

export const DEFAULT_LOCALE = "ar";
export const SUPPORTED_LOCALES = ["ar", "en"];
export const LOCALE_STORAGE_KEY = "oh_locale";

/** @type {Record<string, Record<string, object>>} */
export const resources = {
  ar: {
    common: arCommon,
    nav: arNav,
    footer: arFooter,
    home: arHome,
    auth: arAuth,
    services: arServices,
    plans: arPlans,
    about: arAbout,
    orders: arOrders,
    accountDeletion: arAccountDeletion,
  },
  en: {
    common: enCommon,
    nav: enNav,
    footer: enFooter,
    home: enHome,
    auth: enAuth,
    services: enServices,
    plans: enPlans,
    about: enAbout,
    orders: enOrders,
    accountDeletion: enAccountDeletion,
  },
};

export function isSupportedLocale(value) {
  return SUPPORTED_LOCALES.includes(String(value || "").trim());
}

export function getLocaleDirection(locale) {
  return locale === "en" ? "ltr" : "rtl";
}

/** Merge extra namespaces into the shared resources object (used by dashboard layout chunk). */
export function mergeLocaleNamespaces(extra) {
  if (!extra || typeof extra !== "object") return;
  for (const locale of Object.keys(extra)) {
    if (!resources[locale]) resources[locale] = {};
    Object.assign(resources[locale], extra[locale]);
  }
}

