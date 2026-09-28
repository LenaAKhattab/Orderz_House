export function formatMoney(value, currency = "د.أ") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${new Intl.NumberFormat("ar-JO-u-nu-latn", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
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
