import { useId } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";
import "../../../styles/smartOrders.css";
import { fieldVisible, pickLocalized } from "./catalogForm";

/**
 * Renders a catalog service's versioned fields + quantity. Every control has a label, description and
 * error association (aria-describedby / aria-invalid); conditional fields render in place when visible.
 */
export default function DynamicServiceForm({ service, draft, onChange, errors = {}, showErrors = false, disabled = false }) {
  const { t, locale } = useTranslation();
  const uid = useId();
  if (!service) return null;
  const values = draft?.values || {};
  const setValue = (key, v) => onChange({ ...draft, values: { ...values, [key]: v } });
  const errFor = (key) => (showErrors && errors[key] ? t(`smartOrders.form.errors.${errors[key]}`) : "");
  const q = service.quantity || {};
  const unitLabel = t(`smartOrders.units.${q.unit}`);
  const qId = `${uid}-qty`;
  const qErr = errFor("quantity");

  const renderControl = (f, id, describedBy, invalid) => {
    const common = {
      id,
      disabled,
      "aria-describedby": describedBy || undefined,
      "aria-invalid": invalid || undefined,
      "aria-required": f.required || undefined,
    };
    const v = values[f.key];
    const placeholder = pickLocalized(f.placeholder, locale) || undefined;
    switch (f.type) {
      case "textarea":
        return (
          <textarea
            {...common}
            className="input"
            rows={3}
            maxLength={f.maxLength}
            placeholder={placeholder}
            value={v ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        );
      case "number":
      case "decimal":
        return (
          <input
            {...common}
            className="input"
            dir="ltr"
            inputMode={f.type === "decimal" ? "decimal" : "numeric"}
            placeholder={placeholder}
            value={v ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        );
      case "select":
        return (
          <select {...common} className="input" value={v ?? ""} onChange={(e) => setValue(f.key, e.target.value)}>
            <option value="">{t("smartOrders.form.choose")}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {pickLocalized(o.label, locale)}
              </option>
            ))}
          </select>
        );
      case "radio":
      case "multiselect": {
        const multi = f.type === "multiselect";
        const selected = multi ? (Array.isArray(v) ? v : []) : v;
        return (
          <div
            role={multi ? "group" : "radiogroup"}
            aria-labelledby={`${id}-label`}
            aria-describedby={describedBy || undefined}
            aria-invalid={invalid || undefined}
            aria-required={f.required || undefined}
            className="smart-choice-list"
            id={id}
            tabIndex={-1}
          >
            {f.options.map((o) => {
              const checked = multi ? selected.includes(o.value) : selected === o.value;
              return (
                <label key={o.value} className={`smart-choice${checked ? " smart-choice--on" : ""}`}>
                  <input
                    type={multi ? "checkbox" : "radio"}
                    name={`${uid}-${f.key}`}
                    value={o.value}
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      if (!multi) setValue(f.key, o.value);
                      else setValue(f.key, e.target.checked ? [...selected, o.value] : selected.filter((x) => x !== o.value));
                    }}
                  />
                  <span>{pickLocalized(o.label, locale)}</span>
                </label>
              );
            })}
          </div>
        );
      }
      case "checkbox":
        return (
          <label className="smart-check">
            <input {...common} type="checkbox" checked={v === true} onChange={(e) => setValue(f.key, e.target.checked)} />
            <span>{pickLocalized(f.label, locale)}</span>
          </label>
        );
      case "date":
        return <input {...common} type="date" className="input" value={v ?? ""} onChange={(e) => setValue(f.key, e.target.value)} />;
      case "datetime":
        return (
          <input {...common} type="datetime-local" className="input" value={v ?? ""} onChange={(e) => setValue(f.key, e.target.value)} />
        );
      case "url":
        return (
          <input
            {...common}
            type="url"
            dir="ltr"
            className="input"
            placeholder={placeholder || "https://"}
            value={v ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        );
      case "file": {
        const list = Array.isArray(v) ? v : [];
        return (
          <div className="smart-file-field">
            <input
              {...common}
              type="file"
              multiple={(f.max ?? 5) > 1}
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                const names = new Set(list.map((x) => x.name));
                setValue(f.key, [...list, ...picked.filter((x) => !names.has(x.name))].slice(0, f.max ?? 5));
                e.target.value = "";
              }}
            />
            {list.length ? (
              <ul className="smart-file-list">
                {list.map((file) => (
                  <li key={file.name}>
                    <span dir="auto">{file.name}</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={disabled}
                      onClick={() => setValue(f.key, list.filter((x) => x.name !== file.name))}
                    >
                      {t("smartOrders.form.removeFile")}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="help">{t("smartOrders.form.filesShared")}</div>
          </div>
        );
      }
      default:
        return (
          <input
            {...common}
            className="input"
            maxLength={f.maxLength}
            placeholder={placeholder}
            value={v ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        );
    }
  };

  return (
    <div className="smart-dyn-form" data-testid="dynamic-service-form" data-service={service.serviceCode}>
      <div className="field smart-dyn-field">
        <label htmlFor={qId} id={`${qId}-label`}>
          {t("smartOrders.form.quantity", { unit: unitLabel })}
          {q.required ? <span className="smart-req" aria-hidden="true"> *</span> : null}
        </label>
        <div className="smart-qty-row">
          <input
            id={qId}
            className="input"
            dir="ltr"
            inputMode={q.decimals ? "decimal" : "numeric"}
            value={draft?.quantityUnspecified ? "" : draft?.quantity ?? ""}
            disabled={disabled || Boolean(draft?.quantityUnspecified)}
            aria-required={q.required && !draft?.quantityUnspecified ? true : undefined}
            aria-invalid={qErr ? true : undefined}
            aria-describedby={`${qId}-help${qErr ? ` ${qId}-err` : ""}`}
            onChange={(e) => onChange({ ...draft, quantity: e.target.value })}
            data-testid="dynamic-quantity"
          />
          <span className="smart-unit" data-testid="dynamic-quantity-unit">
            {unitLabel}
          </span>
        </div>
        <div className="help" id={`${qId}-help`}>
          {q.min !== undefined && q.max !== undefined ? t("smartOrders.form.quantityRange", { min: q.min, max: q.max }) : null}
        </div>
        {q.allowUnspecified ? (
          <label className="smart-check">
            <input
              type="checkbox"
              checked={Boolean(draft?.quantityUnspecified)}
              disabled={disabled}
              onChange={(e) => onChange({ ...draft, quantityUnspecified: e.target.checked })}
            />
            <span>{t("smartOrders.form.unspecified")}</span>
          </label>
        ) : null}
        {qErr ? (
          <div className="field-error" role="alert" id={`${qId}-err`}>
            {qErr}
          </div>
        ) : null}
      </div>

      {(service.fields || []).map((f) => {
        if (!fieldVisible(f, values)) return null;
        const id = `${uid}-${f.key}`;
        const help = pickLocalized(f.help, locale);
        const err = errFor(f.key);
        const describedBy = [help ? `${id}-help` : "", err ? `${id}-err` : ""].filter(Boolean).join(" ");
        return (
          <div className="field smart-dyn-field" key={f.key} data-field={f.key} data-type={f.type}>
            {f.type !== "checkbox" ? (
              <label htmlFor={id} id={`${id}-label`}>
                {pickLocalized(f.label, locale)}
                {f.required ? <span className="smart-req" aria-hidden="true"> *</span> : null}
              </label>
            ) : null}
            {renderControl(f, id, describedBy, Boolean(err))}
            {help ? (
              <div className="help" id={`${id}-help`}>
                {help}
              </div>
            ) : null}
            {err ? (
              <div className="field-error" role="alert" id={`${id}-err`}>
                {err}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
