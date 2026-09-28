import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "../../i18n/LanguageProvider";

const ROUTE_TITLES = [
  ["/dashboard/super-admin/financial-center", "common.titles.financialCenter"],
  ["/dashboard/super-admin/financial-claims", "common.titles.claims"],
  ["/dashboard/super-admin/fazat-settlements", "common.titles.settlements"],
  ["/dashboard/super-admin/institutions", "common.titles.institutions"],
  ["/dashboard/legacy-freelancers", "common.titles.legacy"],
  ["/dashboard/super-admin/analysis", "common.titles.analysis"],
  ["/dashboard/super-admin/users", "common.titles.users"],
  ["/dashboard/super-admin/courses", "common.titles.courses"],
  ["/dashboard/super-admin/articles", "common.titles.articles"],
  ["/dashboard/super-admin/orders", "common.titles.orders"],
  ["/dashboard/super-admin/subscriptions", "common.titles.subscriptions"],
  ["/dashboard/super-admin/plans", "common.titles.plans"],
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
