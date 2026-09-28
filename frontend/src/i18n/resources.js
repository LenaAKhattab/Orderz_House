import arCommon from "../locales/ar/common.json" with { type: "json" };
import arNav from "../locales/ar/nav.json" with { type: "json" };
import arFooter from "../locales/ar/footer.json" with { type: "json" };
import arHome from "../locales/ar/home.json" with { type: "json" };
import arAuth from "../locales/ar/auth.json" with { type: "json" };
import arServices from "../locales/ar/services.json" with { type: "json" };
import arPlans from "../locales/ar/plans.json" with { type: "json" };
import arAbout from "../locales/ar/about.json" with { type: "json" };
import arOrders from "../locales/ar/orders.json" with { type: "json" };
import arAccountDeletion from "../locales/ar/accountDeletion.json" with { type: "json" };

import enCommon from "../locales/en/common.json" with { type: "json" };
import enNav from "../locales/en/nav.json" with { type: "json" };
import enFooter from "../locales/en/footer.json" with { type: "json" };
import enHome from "../locales/en/home.json" with { type: "json" };
import enAuth from "../locales/en/auth.json" with { type: "json" };
import enServices from "../locales/en/services.json" with { type: "json" };
import enPlans from "../locales/en/plans.json" with { type: "json" };
import enAbout from "../locales/en/about.json" with { type: "json" };
import enOrders from "../locales/en/orders.json" with { type: "json" };
import enAccountDeletion from "../locales/en/accountDeletion.json" with { type: "json" };

export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALE_STORAGE_KEY,
  LEGACY_LOCALE_STORAGE_KEY,
  isSupportedLocale,
  getLocaleDirection,
} from "./localePreference.js";

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

/** Merge extra namespaces into the shared resources object (used by dashboard layout chunk). */
export function mergeLocaleNamespaces(extra) {
  if (!extra || typeof extra !== "object") return;
  for (const locale of Object.keys(extra)) {
    if (!resources[locale]) resources[locale] = {};
    Object.assign(resources[locale], extra[locale]);
  }
}

