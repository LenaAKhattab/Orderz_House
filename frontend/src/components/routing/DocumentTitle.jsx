import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "../../i18n/LanguageProvider";

/** Longer / more-specific prefixes first so nested dashboard paths win over role homes. */
const ROUTE_TITLES = [
  ["/dashboard/super-admin/financial-center", "common.titles.financialCenter"],
  ["/dashboard/super-admin/financial-claims", "common.titles.claims"],
  ["/dashboard/super-admin/fazat-settlements", "common.titles.settlements"],
  ["/dashboard/super-admin/institutions", "common.titles.institutions"],
  ["/dashboard/super-admin/referrals", "common.titles.referrals"],
  ["/dashboard/super-admin/analysis", "common.titles.analysis"],
  ["/dashboard/super-admin/users", "common.titles.users"],
  ["/dashboard/super-admin/courses", "common.titles.courses"],
  ["/dashboard/super-admin/articles", "common.titles.articles"],
  ["/dashboard/super-admin/orders", "common.titles.orders"],
  ["/dashboard/super-admin/subscriptions", "common.titles.subscriptions"],
  ["/dashboard/super-admin/plans", "common.titles.plans"],
  ["/dashboard/super-admin/ads", "common.titles.ads"],
  ["/dashboard/super-admin", "common.titles.superAdminDashboard"],
  ["/dashboard/legacy-freelancers", "common.titles.legacy"],
  ["/dashboard/admin/subscriptions", "common.titles.subscriptions"],
  ["/dashboard/admin/courses", "common.titles.courses"],
  ["/dashboard/admin/orders", "common.titles.orders"],
  ["/dashboard/admin/users", "common.titles.users"],
  ["/dashboard/admin/notifications", "common.titles.notifications"],
  ["/dashboard/admin/ads", "common.titles.ads"],
  ["/dashboard/admin", "common.titles.adminDashboard"],
  ["/dashboard/freelancer/courses", "common.titles.courses"],
  ["/dashboard/freelancer/plans", "common.titles.membership"],
  ["/dashboard/freelancer/settings", "common.titles.settings"],
  ["/dashboard/freelancer/notifications", "common.titles.notifications"],
  ["/dashboard/freelancer/orders", "common.titles.orders"],
  ["/dashboard/freelancer", "common.titles.freelancerDashboard"],
  ["/dashboard/client/orders", "common.titles.orders"],
  ["/dashboard/client/settings", "common.titles.settings"],
  ["/dashboard/client/notifications", "common.titles.notifications"],
  ["/dashboard/client", "common.titles.clientDashboard"],
  ["/dashboard/notifications", "common.titles.notifications"],
  ["/privacy-policy", "common.titles.privacy"],
  ["/terms-conditions", "common.titles.terms"],
  ["/forgot-password", "common.titles.forgotPassword"],
  ["/reset-password", "common.titles.resetPassword"],
  ["/register", "common.titles.register"],
  ["/login", "common.titles.login"],
  ["/plans", "common.titles.plans"],
  ["/orders", "common.titles.orders"],
  ["/services", "common.titles.services"],
  ["/about", "common.titles.about"],
  ["/", "common.titles.home"],
];

export default function DocumentTitle() {
  const { pathname, search, hash } = useLocation();
  const { t, locale } = useTranslation();

  useEffect(() => {
    const match = ROUTE_TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    const brand = t("common.brandWordmark");
    document.title = match ? `${t(match[1])} | ${brand}` : brand;
  }, [pathname, search, hash, t, locale]);

  return null;
}
