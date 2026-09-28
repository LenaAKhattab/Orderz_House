import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "../../i18n/LanguageProvider";

const ROUTE_TITLES = [
  ["/dashboard/super-admin/users", "common.titles.users"],
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
