import { useId } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";
import "../../../styles/smartOrders.css";
import { MAX_REPEATER_ITEMS, fieldVisible, pickLocalized } from "./catalogForm";

/**
 * Renders a catalog service's versioned fields + quantity. Every control has a label, description and
 * error association (aria-describedby / aria-invalid); conditional fields render in place when visible.
 * S7: repeaters (rows of sub-fields) and conditional groups render their sub-fields with per-row / per-group
 * errors keyed exactly like the server (`refs[0].title`, `print.size`).
 */
export default function DynamicServiceForm({ service, draft, onChange, errors = {}, showErrors = false, disabled = false }) {
  const { t, locale } = useTranslation();
  const uid = useId();
  if (!service) return null;
  const values = draft?.values || {};
  const setValue = (key, v) => onChange({ ...draft, values: { ...values, [key]: v } });
  const errFor = (key, field = null) => {
    if (!showErrors || !errors[key]) return "";
    // A field-specific format message (catalog-authored, localized) wins over the generic text.
    if (errors[key] === "invalid_format" && field) {
      const custom = pickLocalized(field.validationMessage, locale);
      if (custom) return custom;
    }
    return t(`smartOrders.form.errors.${errors[key]}`);
  };
  const q = service.quantity || {};
  const unitLabel = t(`smartOrders.units.${q.unit}`);
  const qId = `${uid}-qty`;
  const qErr = errFor("quantity");

  const renderControl = (f, id, describedBy, invalid, v, setV, scope = f.key) => {
    const common = {
      id,
      disabled,
      "aria-describedby": describedBy || undefined,
      "aria-invalid": invalid || undefined,
      "aria-required": f.required || undefined,
    };
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
            onChange={(e) => setV(e.target.value)}
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
            onChange={(e) => setV(e.target.value)}
          />
        );
      case "select":
        return (
          <select {...common} className="input" value={v ?? ""} onChange={(e) => setV(e.target.value)}>
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
                    name={`${uid}-${scope}`}
                    value={o.value}
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      if (!multi) setV(o.value);
                      else setV(e.target.checked ? [...selected, o.value] : selected.filter((x) => x !== o.value));
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
            <input {...common} type="checkbox" checked={v === true} onChange={(e) => setV(e.target.checked)} />
            <span>{pickLocalized(f.label, locale)}</span>
          </label>
        );
      case "date":
        return <input {...common} type="date" className="input" value={v ?? ""} onChange={(e) => setV(e.target.value)} />;
      case "datetime":
        return (
          <input {...common} type="datetime-local" className="input" value={v ?? ""} onChange={(e) => setV(e.target.value)} />
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
            onChange={(e) => setV(e.target.value)}
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
                setV([...list, ...picked.filter((x) => !names.has(x.name))].slice(0, f.max ?? 5));
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
                      onClick={() => setV(list.filter((x) => x.name !== file.name))}
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
            onChange={(e) => setV(e.target.value)}
          />
        );
    }
  };

  /** One labelled control (top-level field or a sub-field inside a row / group). */
  const renderField = (f, v, setV, errKey, id) => {
    const help = pickLocalized(f.help, locale);
    const err = errFor(errKey, f);
    const describedBy = [help ? `${id}-help` : "", err ? `${id}-err` : ""].filter(Boolean).join(" ");
    return (
      <div className="field smart-dyn-field" key={errKey} data-field={errKey} data-type={f.type}>
        {f.type !== "checkbox" ? (
          <label htmlFor={id} id={`${id}-label`}>
            {pickLocalized(f.label, locale)}
            {f.required ? <span className="smart-req" aria-hidden="true"> *</span> : null}
          </label>
        ) : null}
        {renderControl(f, id, describedBy, Boolean(err), v, setV, errKey)}
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
  };

  /** Sub-fields of one row / group: visibility uses the row's (group's) own values (earlier siblings). */
  const renderSubFields = (f, obj, setObj, prefix, idBase) =>
    (f.fields || []).map((sf) => {
      if (!fieldVisible(sf, obj)) return null;
      return renderField(sf, obj[sf.key], (x) => setObj({ ...obj, [sf.key]: x }), `${prefix}.${sf.key}`, `${idBase}-${sf.key}`);
    });

  const renderStructuredHead = (f, id) => {
    const help = pickLocalized(f.help, locale);
    return (
      <>
        <legend className="label" id={`${id}-label`}>
          {pickLocalized(f.label, locale)}
          {f.required || (f.type === "repeater" && (f.minItems || 0) > 0) ? (
            <span className="smart-req" aria-hidden="true">
              {" "}
              *
            </span>
          ) : null}
        </legend>
        {help ? (
          <div className="help" id={`${id}-help`}>
            {help}
          </div>
        ) : null}
      </>
    );
  };

  const renderRepeater = (f) => {
    const id = `${uid}-${f.key}`;
    const stored = Array.isArray(values[f.key]) ? values[f.key] : [];
    const minItems = f.minItems || 0;
    const maxItems = f.maxItems ?? MAX_REPEATER_ITEMS;
    // Show at least `minItems` rows so the customer sees what is expected (blank rows are not stored until edited).
    const rows = stored.length >= minItems ? stored : [...stored, ...Array.from({ length: minItems - stored.length }, () => ({}))];
    const setRows = (next) => setValue(f.key, next);
    const err = errFor(f.key, f);
    return (
      <fieldset className="field smart-dyn-field smart-repeater" key={f.key} data-field={f.key} data-type="repeater" aria-describedby={err ? `${id}-err` : undefined}>
        {renderStructuredHead(f, id)}
        <div className="help">
          {minItems
            ? t("smartOrders.form.rowsRange", { min: minItems, max: maxItems })
            : t("smartOrders.form.rowsMax", { max: maxItems })}
        </div>
        {rows.map((row, i) => (
          <div className="smart-repeater__row" key={i} role="group" aria-label={t("smartOrders.form.rowLabel", { n: i + 1 })} data-testid={`repeater-${f.key}-row-${i}`}>
            <div className="smart-repeater__row-head">
              <strong>{t("smartOrders.form.rowLabel", { n: i + 1 })}</strong>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={disabled || rows.length <= minItems}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                {t("smartOrders.form.removeRow")}
              </button>
            </div>
            <div className="smart-repeater__fields">
              {renderSubFields(
                f,
                row && typeof row === "object" ? row : {},
                (nextRow) => setRows(rows.map((r, j) => (j === i ? nextRow : r))),
                `${f.key}[${i}]`,
                `${id}-${i}`,
              )}
            </div>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={disabled || rows.length >= maxItems}
            onClick={() => setRows([...rows, {}])}
            data-testid={`repeater-${f.key}-add`}
          >
            {t("smartOrders.form.addRow")}
          </button>
        </div>
        {err ? (
          <div className="field-error" role="alert" id={`${id}-err`}>
            {err}
          </div>
        ) : null}
      </fieldset>
    );
  };

  const renderGroup = (f) => {
    const id = `${uid}-${f.key}`;
    const obj = values[f.key] && typeof values[f.key] === "object" && !Array.isArray(values[f.key]) ? values[f.key] : {};
    return (
      <fieldset className="field smart-dyn-field smart-group" key={f.key} data-field={f.key} data-type="conditional_group">
        {renderStructuredHead(f, id)}
        <div className="smart-repeater__fields">{renderSubFields(f, obj, (next) => setValue(f.key, next), f.key, id)}</div>
      </fieldset>
    );
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
        if (f.type === "repeater") return renderRepeater(f);
        if (f.type === "conditional_group") return renderGroup(f);
        return renderField(f, values[f.key], (x) => setValue(f.key, x), f.key, `${uid}-${f.key}`);
      })}
    </div>
  );
}
