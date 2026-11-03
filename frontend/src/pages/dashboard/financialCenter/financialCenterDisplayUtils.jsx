import { getActiveLocale, pt } from "../../../i18n/activeLocale.js";
import { pickIntlTag } from "../../../i18n/intlLocale.js";

/** Historical tag for both Arabic and English (Latin digits); German / Dutch / Romanian use their own. */
const FC_INTL_LEGACY = { ar: "ar-JO-u-nu-latn", en: "ar-JO-u-nu-latn" };

/** Official JOD amount (never FX). `currency` defaults to the catalog JOD suffix (platformPages.common.jodSuffix). */
export function formatMoney(value, currency, locale = getActiveLocale()) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const suffix = currency === undefined ? pt("platformPages.common.jodSuffix", undefined, locale) : currency;
  return `${new Intl.NumberFormat(pickIntlTag(locale, FC_INTL_LEGACY), { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value))} ${suffix}`;
}

export function formatDate(value, locale = getActiveLocale()) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat(pickIntlTag(locale, FC_INTL_LEGACY), { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function sourceLabel(type, t) {
  if (type === "manual") return t("finance.financialCenter.sourceManual");
  if (type === "subscription_payment") return t("finance.financialCenter.sourceSubscriptions");
  if (type === "order_payment") return t("finance.financialCenter.sourceOrders");
  return type || "—";
}

export function accountStatusBadge(status, t) {
  const map = {
    none: ["fc-badge--inactive", t("finance.financialCenter.accountNone")],
    active: ["fc-badge--active", t("finance.financialCenter.accountActive")],
    suspended: ["fc-badge--cancelled", t("finance.financialCenter.accountSuspended")],
  };
  const [cls, label] = map[status] || ["fc-badge--inactive", status];
  return <span className={`fc-badge ${cls}`}>{label}</span>;
}

export function FcTdEllipsis({ children, className = "", dir }) {
  const display = children == null || children === false ? "—" : children;
  const titleText =
    typeof display === "string" || typeof display === "number" ? String(display) : undefined;
  return (
    <td
      className={`fc-cell-ellipsis${className ? ` ${className}` : ""}`}
      title={titleText}
      dir={dir}
    >
      {display}
    </td>
  );
}
