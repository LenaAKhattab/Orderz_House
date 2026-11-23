import { useEffect, useMemo, useState } from "react";
import DashboardModal from "../../dashboard/DashboardModal";
import { useToast } from "../../ui/toastContext";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";
import "../../../styles/smartOrders.css";
import {
  adminCreateCatalogServiceRequest,
  adminGetCatalogServiceRequest,
  adminUpdateCatalogServiceRequest,
} from "../../../services/api";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import { formatLocaleDateTime } from "../../../i18n/formatLocale";
import DynamicServiceForm from "./DynamicServiceForm";
import { emptyServiceDraft } from "./catalogForm";

const LOCALES = ["ar", "en", "de", "nl", "ro"];
const LOCALE_NAMES = { ar: "العربية", en: "English", de: "Deutsch", nl: "Nederlands", ro: "Română" };
const FIELD_TYPES = ["text", "textarea", "number", "decimal", "select", "multiselect", "checkbox", "radio", "date", "datetime", "file", "url"];
const OPTION_TYPES = new Set(["select", "multiselect", "radio"]);
const BOUND_TYPES = new Set(["number", "decimal", "multiselect", "file"]);
const UNITS = [
  "pages", "words", "documents", "slides", "worksheets", "files", "dashboards", "concepts", "designs",
  "screens", "features", "projects", "minutes", "clips", "posts", "campaigns", "hours", "units",
];
const PRICE_MODES = ["fixed", "per_unit", "package", "manual_quote", "range"];

function blankDefinition(categoryId) {
  return {
    serviceCode: "",
    categoryId: categoryId || "",
    visibility: "public",
    priceMode: "manual_quote",
    sortOrder: 0,
    name: {},
    description: {},
    quantity: { unit: "units", required: false, allowUnspecified: true, decimals: false },
    fields: [],
  };
}

function LocaleInputs({ value, onChange, label, multiline = false, required = false, testid }) {
  return (
    <fieldset className="field" data-testid={testid}>
      <legend className="label">{label}</legend>
      <div className="smart-locale-grid">
        {LOCALES.map((loc) => {
          const Tag = multiline ? "textarea" : "input";
          return (
            <label key={loc} className="field">
              <span className="help">
                {LOCALE_NAMES[loc]}
                {required && (loc === "ar" || loc === "en") ? " *" : ""}
              </span>
              <Tag
                className="input"
                dir={loc === "ar" ? "rtl" : "ltr"}
                rows={multiline ? 2 : undefined}
                value={value?.[loc] || ""}
                data-locale={loc}
                onChange={(e) => onChange({ ...(value || {}), [loc]: e.target.value })}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function num(v) {
  return v === "" || v === null || v === undefined ? undefined : Number(v);
}

/** Create / edit one catalog service. Saving a changed definition creates a new immutable version. */
export default function ServiceEditorModal({ serviceId, categories, onClose, onSaved }) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const isNew = !serviceId;
  const [tab, setTab] = useState("basics");
  const [def, setDef] = useState(() => blankDefinition(categories[0]?.id));
  const [versions, setVersions] = useState([]);
  const [changeNote, setChangeNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [previewDraft, setPreviewDraft] = useState(emptyServiceDraft);

  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;
    adminGetCatalogServiceRequest(serviceId)
      .then((res) => {
        if (cancelled) return;
        const s = res?.data?.service;
        setDef({
          serviceCode: s.serviceCode,
          categoryId: s.categoryId,
          subSubcategoryId: s.subSubcategoryId,
          visibility: s.visibility,
          priceMode: s.priceMode,
          sortOrder: s.sortOrder,
          name: s.name,
          description: s.description,
          quantity: s.quantity,
          fields: s.fields,
        });
        setVersions(res?.data?.versions || []);
        setLoaded(true);
      })
      .catch((e) => push({ type: "error", title: t("smartOrders.catalog.saveFailed"), message: getSafeApiErrorMessage(e) }));
    return () => {
      cancelled = true;
    };
  }, [isNew, serviceId, push, t]);

  const set = (patch) => setDef((d) => ({ ...d, ...patch }));
  const setQty = (patch) => setDef((d) => ({ ...d, quantity: { ...d.quantity, ...patch } }));
  const setField = (i, patch) => setDef((d) => ({ ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const moveField = (i, dir) =>
    setDef((d) => {
      const arr = [...d.fields];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...d, fields: arr };
    });

  const previewService = useMemo(
    () => ({
      serviceCode: def.serviceCode || "preview",
      version: 0,
      name: def.name,
      quantity: { ...def.quantity, min: num(def.quantity?.min), max: num(def.quantity?.max) },
      fields: def.fields.map((f) => ({ ...f, min: num(f.min), max: num(f.max), options: f.options || [] })),
    }),
    [def],
  );

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...def,
        quantity: { ...def.quantity, min: num(def.quantity?.min), max: num(def.quantity?.max) },
        fields: def.fields.map((f) => ({ ...f, min: num(f.min), max: num(f.max), maxLength: num(f.maxLength) })),
      };
      const res = isNew
        ? await adminCreateCatalogServiceRequest(payload)
        : await adminUpdateCatalogServiceRequest(serviceId, payload, changeNote);
      push({
        type: "success",
        title: t("smartOrders.catalog.saved"),
        message: t("smartOrders.catalog.savedVersion", { version: res?.data?.service?.version }),
      });
      onSaved?.();
    } catch (e) {
      const fe = e?.response?.data?.fieldErrors;
      const detail = fe ? ` (${Object.keys(fe).slice(0, 3).join(", ")})` : "";
      push({ type: "error", title: t("smartOrders.catalog.saveFailed"), message: `${getSafeApiErrorMessage(e)}${detail}` });
    } finally {
      setBusy(false);
    }
  };

  const catName = (c) => (locale === "ar" ? c.name : c.nameEn || c.name);
  const tabs = ["basics", "quantity", "fields", "preview"];

  return (
    <DashboardModal
      open
      title={isNew ? t("smartOrders.catalog.editor.titleNew") : t("smartOrders.catalog.editor.titleEdit", { code: def.serviceCode })}
      onClose={onClose}
      closeDisabled={busy}
      panelClassName="smart-editor-modal"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {t("smartOrders.catalog.editor.cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !loaded} data-testid="catalog-save">
            {t("smartOrders.catalog.editor.save")}
          </button>
        </>
      }
    >
      <div data-testid="catalog-editor">
        <div className="smart-editor-tabs" role="tablist">
          {tabs.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`btn ${tab === k ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTab(k)}
              data-testid={`catalog-tab-${k}`}
            >
              {t(`smartOrders.catalog.editor.tabs.${k}`)}
            </button>
          ))}
        </div>

        {tab === "basics" ? (
          <div className="smart-editor-grid">
            <label className="field">
              <span className="label">{t("smartOrders.catalog.editor.code")}</span>
              <input
                className="input"
                dir="ltr"
                value={def.serviceCode}
                disabled={!isNew}
                onChange={(e) => set({ serviceCode: e.target.value.trim().toLowerCase() })}
                data-testid="catalog-code"
              />
              <span className="help">{t("smartOrders.catalog.editor.codeHint")}</span>
            </label>
            <label className="field">
              <span className="label">{t("smartOrders.catalog.editor.category")}</span>
              <select className="input" value={def.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {catName(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">{t("smartOrders.catalog.editor.visibility")}</span>
              <select className="input" value={def.visibility} onChange={(e) => set({ visibility: e.target.value })}>
                <option value="public">{t("smartOrders.catalog.public")}</option>
                <option value="admin_only">{t("smartOrders.catalog.adminOnly")}</option>
              </select>
            </label>
            <label className="field">
              <span className="label">{t("smartOrders.catalog.editor.priceMode")}</span>
              <select className="input" value={def.priceMode} onChange={(e) => set({ priceMode: e.target.value })}>
                {PRICE_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`smartOrders.priceModes.${m}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">{t("smartOrders.catalog.editor.sortOrder")}</span>
              <input className="input" dir="ltr" inputMode="numeric" value={def.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
            </label>
            <div style={{ gridColumn: "1 / -1" }}>
              <p className="help">{t("smartOrders.catalog.editor.localeHint")}</p>
              <LocaleInputs
                label={t("smartOrders.catalog.editor.name")}
                value={def.name}
                required
                onChange={(name) => set({ name })}
                testid="catalog-name"
              />
              <LocaleInputs
                label={t("smartOrders.catalog.editor.descriptionLabel")}
                value={def.description}
                multiline
                onChange={(description) => set({ description })}
              />
            </div>
          </div>
        ) : null}

        {tab === "quantity" ? (
          <div className="smart-editor-grid">
            <label className="field">
              <span className="label">{t("smartOrders.catalog.editor.unit")}</span>
              <select className="input" value={def.quantity.unit} onChange={(e) => setQty({ unit: e.target.value })} data-testid="catalog-unit">
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t(`smartOrders.units.${u}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">{t("smartOrders.catalog.editor.min")}</span>
              <input className="input" dir="ltr" inputMode="decimal" value={def.quantity.min ?? ""} onChange={(e) => setQty({ min: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">{t("smartOrders.catalog.editor.max")}</span>
              <input className="input" dir="ltr" inputMode="decimal" value={def.quantity.max ?? ""} onChange={(e) => setQty({ max: e.target.value })} />
            </label>
            {[
              ["required", "quantityRequired"],
              ["allowUnspecified", "allowUnspecified"],
              ["decimals", "decimals"],
            ].map(([k, label]) => (
              <label key={k} className="smart-check">
                <input type="checkbox" checked={Boolean(def.quantity[k])} onChange={(e) => setQty({ [k]: e.target.checked })} />
                <span>{t(`smartOrders.catalog.editor.${label}`)}</span>
              </label>
            ))}
          </div>
        ) : null}

        {tab === "fields" ? (
          <div>
            {def.fields.length === 0 ? <p className="help">{t("smartOrders.catalog.editor.noFields")}</p> : null}
            {def.fields.map((f, i) => (
              <div className="smart-editor-field" key={i} data-testid={`catalog-field-${i}`}>
                <div className="smart-editor-field__head">
                  <strong dir="ltr">{f.key || "—"}</strong>
                  <div className="smart-catalog-row__actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveField(i, -1)} aria-label={t("smartOrders.catalog.editor.moveUp")}>
                      ↑
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveField(i, 1)} aria-label={t("smartOrders.catalog.editor.moveDown")}>
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setDef((d) => ({ ...d, fields: d.fields.filter((_, j) => j !== i) }))}
                    >
                      {t("smartOrders.catalog.editor.remove")}
                    </button>
                  </div>
                </div>
                <div className="smart-editor-grid">
                  <label className="field">
                    <span className="label">{t("smartOrders.catalog.editor.fieldKey")}</span>
                    <input className="input" dir="ltr" value={f.key} onChange={(e) => setField(i, { key: e.target.value.trim().toLowerCase() })} />
                  </label>
                  <label className="field">
                    <span className="label">{t("smartOrders.catalog.editor.fieldType")}</span>
                    <select
                      className="input"
                      value={f.type}
                      onChange={(e) =>
                        setField(i, {
                          type: e.target.value,
                          options: OPTION_TYPES.has(e.target.value) ? f.options || [{ value: "option_1", label: {} }] : undefined,
                        })
                      }
                    >
                      {FIELD_TYPES.map((ft) => (
                        <option key={ft} value={ft}>
                          {t(`smartOrders.fieldTypes.${ft}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="smart-check">
                    <input type="checkbox" checked={Boolean(f.required)} onChange={(e) => setField(i, { required: e.target.checked })} />
                    <span>{t("smartOrders.catalog.editor.fieldRequired")}</span>
                  </label>
                  {BOUND_TYPES.has(f.type) ? (
                    <>
                      <label className="field">
                        <span className="label">{t("smartOrders.catalog.editor.min")}</span>
                        <input className="input" dir="ltr" value={f.min ?? ""} onChange={(e) => setField(i, { min: e.target.value })} />
                      </label>
                      <label className="field">
                        <span className="label">{t("smartOrders.catalog.editor.max")}</span>
                        <input className="input" dir="ltr" value={f.max ?? ""} onChange={(e) => setField(i, { max: e.target.value })} />
                      </label>
                    </>
                  ) : null}
                  {f.type === "text" || f.type === "textarea" ? (
                    <label className="field">
                      <span className="label">{t("smartOrders.catalog.editor.maxLength")}</span>
                      <input className="input" dir="ltr" value={f.maxLength ?? ""} onChange={(e) => setField(i, { maxLength: e.target.value })} />
                    </label>
                  ) : null}
                  <label className="field">
                    <span className="label">{t("smartOrders.catalog.editor.showIf")}</span>
                    <select
                      className="input"
                      value={f.showIf?.field || ""}
                      onChange={(e) => setField(i, { showIf: e.target.value ? { field: e.target.value, in: f.showIf?.in || [true] } : undefined })}
                    >
                      <option value="">{t("smartOrders.catalog.editor.showIfAlways")}</option>
                      {def.fields.slice(0, i).map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.key}
                        </option>
                      ))}
                    </select>
                  </label>
                  {f.showIf ? (
                    <label className="field">
                      <span className="label">{t("smartOrders.catalog.editor.showIfValue")}</span>
                      <input
                        className="input"
                        dir="ltr"
                        value={(f.showIf.in || []).map(String).join(",")}
                        onChange={(e) =>
                          setField(i, {
                            showIf: {
                              field: f.showIf.field,
                              in: e.target.value
                                .split(",")
                                .map((x) => x.trim())
                                .filter(Boolean)
                                .map((x) => (x === "true" ? true : x === "false" ? false : x)),
                            },
                          })
                        }
                      />
                    </label>
                  ) : null}
                </div>
                <LocaleInputs label={t("smartOrders.catalog.editor.fieldLabel")} value={f.label} required onChange={(label) => setField(i, { label })} />
                <details>
                  <summary>{`${t("smartOrders.catalog.editor.placeholder")} / ${t("smartOrders.catalog.editor.help")}`}</summary>
                  <LocaleInputs label={t("smartOrders.catalog.editor.placeholder")} value={f.placeholder} onChange={(placeholder) => setField(i, { placeholder })} />
                  <LocaleInputs label={t("smartOrders.catalog.editor.help")} value={f.help} multiline onChange={(help) => setField(i, { help })} />
                </details>
                {OPTION_TYPES.has(f.type) ? (
                  <div className="field">
                    <span className="label">{t("smartOrders.catalog.editor.options")}</span>
                    {(f.options || []).map((o, j) => (
                      <div key={j} className="smart-editor-field">
                        <div className="smart-editor-field__head">
                          <label className="field" style={{ flex: 1 }}>
                            <span className="help">{t("smartOrders.catalog.editor.optionValue")}</span>
                            <input
                              className="input"
                              dir="ltr"
                              value={o.value}
                              onChange={(e) =>
                                setField(i, {
                                  options: f.options.map((x, k) => (k === j ? { ...x, value: e.target.value.trim().toLowerCase() } : x)),
                                })
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setField(i, { options: f.options.filter((_, k) => k !== j) })}
                          >
                            {t("smartOrders.catalog.editor.remove")}
                          </button>
                        </div>
                        <LocaleInputs
                          label={t("smartOrders.catalog.editor.fieldLabel")}
                          value={o.label}
                          required
                          onChange={(label) => setField(i, { options: f.options.map((x, k) => (k === j ? { ...x, label } : x)) })}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        setField(i, { options: [...(f.options || []), { value: `option_${(f.options || []).length + 1}`, label: {} }] })
                      }
                    >
                      {t("smartOrders.catalog.editor.addOption")}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="catalog-add-field"
              onClick={() =>
                setDef((d) => ({ ...d, fields: [...d.fields, { key: `field_${d.fields.length + 1}`, type: "text", label: {}, required: false }] }))
              }
            >
              {t("smartOrders.catalog.editor.addField")}
            </button>
          </div>
        ) : null}

        {tab === "preview" ? (
          <div data-testid="catalog-preview">
            <p className="help">{t("smartOrders.catalog.editor.previewHint")}</p>
            <DynamicServiceForm service={previewService} draft={previewDraft} onChange={setPreviewDraft} />
          </div>
        ) : null}

        {!isNew ? (
          <div className="smart-panel__section" style={{ marginTop: 16 }}>
            <p className="help">{t("smartOrders.catalog.editor.versionNotice")}</p>
            <label className="field">
              <span className="label">{t("smartOrders.catalog.editor.changeNote")}</span>
              <input className="input" maxLength={300} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
            </label>
            <h3>{t("smartOrders.catalog.editor.versions")}</h3>
            <ul className="smart-events">
              {versions.map((v) => (
                <li key={v.version}>
                  <span>
                    v{v.version}
                    {v.changeNote ? ` — ${v.changeNote}` : ""}
                  </span>
                  <span className="help">
                    {v.createdBy ? `${v.createdBy} · ` : ""}
                    {formatLocaleDateTime(v.createdAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </DashboardModal>
  );
}
