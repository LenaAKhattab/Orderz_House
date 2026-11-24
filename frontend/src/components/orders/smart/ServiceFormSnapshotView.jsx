import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";
import "../../../styles/smartOrders.css";
import { pickLocalized } from "./catalogForm";

/**
 * Read-only render of an order's immutable service snapshot: labels and option texts come from the
 * snapshot itself (never the live catalog), so later catalog edits cannot change what is shown.
 */
export default function ServiceFormSnapshotView({ serviceForm, title = null }) {
  const { t, locale } = useTranslation();
  if (!serviceForm) return null;
  const values = serviceForm.values || {};
  const sep = locale === "ar" ? "، " : ", ";
  /** Display text for one scalar value (top-level or sub-field); null when empty. */
  const scalar = (f, v) => {
    if (v === undefined || v === null || v === "") return null;
    const optLabel = (val) => pickLocalized(f.options?.find((o) => o.value === val)?.label, locale) || val;
    if (f.type === "checkbox") return v ? t("smartOrders.form.yes") : t("smartOrders.form.no");
    if (f.type === "select" || f.type === "radio") return optLabel(v);
    if (f.type === "multiselect") return (Array.isArray(v) ? v : []).map(optLabel).join(sep) || null;
    if (f.type === "file") return (Array.isArray(v) ? v : []).map((x) => x?.name).filter(Boolean).join(", ") || null;
    return String(v);
  };
  /** S7 sub-values: "Title: Paper 1 · Pages: 3" (labels/options come from the snapshot itself). */
  const subLine = (f, obj) =>
    (f.fields || [])
      .map((sf) => {
        const txt = scalar(sf, obj?.[sf.key]);
        return txt === null ? null : `${pickLocalized(sf.label, locale)}: ${txt}`;
      })
      .filter(Boolean)
      .join(" · ");
  const display = (f) => {
    const v = values[f.key];
    if (f.type === "repeater") {
      const rows = (Array.isArray(v) ? v : []).map((row) => subLine(f, row)).filter(Boolean);
      if (!rows.length) return null;
      return (
        <ol className="smart-snapshot__rows" data-testid={`snapshot-repeater-${f.key}`}>
          {rows.map((line, i) => (
            <li key={i} dir="auto">
              {line}
            </li>
          ))}
        </ol>
      );
    }
    if (f.type === "conditional_group") {
      const line = v && typeof v === "object" ? subLine(f, v) : "";
      return line || null;
    }
    return scalar(f, v);
  };
  const q = serviceForm.quantity || {};
  return (
    <section className="smart-snapshot" data-testid="service-form-snapshot" data-version={serviceForm.version}>
      <h3>{title || t("smartOrders.form.snapshotTitle")}</h3>
      <dl>
        <div>
          <dt>{t("smartOrders.serviceStep.reviewService")}</dt>
          <dd data-testid="snapshot-service-name">{pickLocalized(serviceForm.name, locale)}</dd>
        </div>
        <div>
          <dt>{t("smartOrders.serviceStep.reviewQuantity")}</dt>
          <dd dir="auto" data-testid="snapshot-quantity">
            {q.unspecified
              ? t("smartOrders.form.unspecified")
              : `${q.value != null ? Number(q.value).toString() : "—"} ${t(`smartOrders.units.${q.unit}`)}`}
          </dd>
        </div>
        {(serviceForm.fields || []).map((f) => {
          const v = display(f);
          if (v === null) return null;
          return (
            <div key={f.key}>
              <dt>{pickLocalized(f.label, locale)}</dt>
              <dd dir="auto">{v}</dd>
            </div>
          );
        })}
      </dl>
      <p className="help">{t("smartOrders.form.snapshotVersion", { version: serviceForm.version })}</p>
    </section>
  );
}
