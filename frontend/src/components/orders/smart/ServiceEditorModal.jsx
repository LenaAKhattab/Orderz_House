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
import { MAX_REPEATER_ITEMS, MAX_SUB_FIELDS, SUB_FIELD_TYPES, emptyServiceDraft } from "./catalogForm";
import {
  MAX_PACKAGES,
  PRICE_CURRENCIES,
  buildPricingPayload,
  fieldPayload,
  isCompilablePattern,
  isValidPriceModifier,
  pricingDraftFrom,
  validatePricing,
} from "./catalogEditorUtils";

const LOCALES = ["ar", "en", "de", "nl", "ro"];
const LOCALE_NAMES = { ar: "العربية", en: "English", de: "Deutsch", nl: "Nederlands", ro: "Română" };
const FIELD_TYPES = [
  "text", "textarea", "number", "decimal", "select", "multiselect", "checkbox", "radio", "date", "datetime", "file", "url",
  "repeater", "conditional_group",
];
const OPTION_TYPES = new Set(["select", "multiselect", "radio"]);
const BOUND_TYPES = new Set(["number", "decimal", "multiselect", "file"]);
const MODIFIER_TYPES = new Set(["checkbox", "number", "decimal"]);
const STRUCTURED = new Set(["repeater", "conditional_group"]);
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

const newSubField = (n) => ({ key: `item_${n}`, type: "text", label: {}, required: false });

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

/** Inline error under an editor input (server field error or a local hint). */
function FieldErr({ text }) {
  return text ? (
    <span className="field-error" role="alert">
      {text}
    </span>
  ) : null;
}

/**
 * One field definition. Used for top-level fields and (with `isSub`) for repeater / group sub-fields:
 * sub-fields cannot be files or structured (one level only).
 */
function FieldEditor({ f, path, siblings, isSub = false, onChange, onRemove, onMove, errAt }) {
  const { t } = useTranslation();
  const e = (k) => t(`smartOrders.catalog.editor.${k}`);
  const types = isSub ? SUB_FIELD_TYPES : FIELD_TYPES;
  const regexLocalBad = (f.type === "text" || f.type === "textarea") && !isCompilablePattern(f.validationRegex);
  const setSub = (j, patch) => onChange({ fields: (f.fields || []).map((x, k) => (k === j ? { ...x, ...patch } : x)) });
  const moveSub = (j, dir) => {
    const arr = [...(f.fields || [])];
    const k = j + dir;
    if (k < 0 || k >= arr.length) return;
    [arr[j], arr[k]] = [arr[k], arr[j]];
    onChange({ fields: arr });
  };

  return (
    <div className="smart-editor-field" data-testid={`catalog-field-${path}`}>
      <div className="smart-editor-field__head">
        <strong dir="ltr">{f.key || "—"}</strong>
        <div className="smart-catalog-row__actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMove(-1)} aria-label={e("moveUp")}>
            ↑
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMove(1)} aria-label={e("moveDown")}>
            ↓
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRemove}>
            {e("remove")}
          </button>
        </div>
      </div>
      <div className="smart-editor-grid">
        <label className="field">
          <span className="label">{e("fieldKey")}</span>
          <input className="input" dir="ltr" value={f.key} onChange={(ev) => onChange({ key: ev.target.value.trim().toLowerCase() })} />
          <FieldErr text={errAt(`${path}.key`)} />
        </label>
        <label className="field">
          <span className="label">{e("fieldType")}</span>
          <select
            className="input"
            value={f.type}
            onChange={(ev) => {
              const type = ev.target.value;
              onChange({
                type,
                options: OPTION_TYPES.has(type) ? f.options || [{ value: "option_1", label: {} }] : undefined,
                fields: STRUCTURED.has(type) ? (f.fields?.length ? f.fields : [newSubField(1)]) : undefined,
              });
            }}
          >
            {types.map((ft) => (
              <option key={ft} value={ft}>
                {t(`smartOrders.fieldTypes.${ft}`)}
              </option>
            ))}
          </select>
          <FieldErr text={errAt(`${path}.type`)} />
        </label>
        <label className="smart-check">
          <input type="checkbox" checked={Boolean(f.required)} onChange={(ev) => onChange({ required: ev.target.checked })} />
          <span>{e("fieldRequired")}</span>
        </label>
        {BOUND_TYPES.has(f.type) ? (
          <>
            <label className="field">
              <span className="label">{e("min")}</span>
              <input className="input" dir="ltr" value={f.min ?? ""} onChange={(ev) => onChange({ min: ev.target.value })} />
              <FieldErr text={errAt(`${path}.min`)} />
            </label>
            <label className="field">
              <span className="label">{e("max")}</span>
              <input className="input" dir="ltr" value={f.max ?? ""} onChange={(ev) => onChange({ max: ev.target.value })} />
            </label>
          </>
        ) : null}
        {f.type === "text" || f.type === "textarea" ? (
          <label className="field">
            <span className="label">{e("maxLength")}</span>
            <input className="input" dir="ltr" value={f.maxLength ?? ""} onChange={(ev) => onChange({ maxLength: ev.target.value })} />
          </label>
        ) : null}
        {MODIFIER_TYPES.has(f.type) ? (
          <label className="field">
            <span className="label">{e("priceModifier")}</span>
            <input
              className="input"
              dir="ltr"
              inputMode="decimal"
              value={f.priceModifier ?? ""}
              onChange={(ev) => onChange({ priceModifier: ev.target.value })}
              data-testid={`catalog-modifier-${path}`}
            />
            <span className="help">
              {f.type === "checkbox" ? e("priceModifierHintCheckbox") : e("priceModifierHintNumber")} {e("modifierPrivate")}
            </span>
            <FieldErr text={errAt(`${path}.priceModifier`) || (!isValidPriceModifier(f.priceModifier) ? e("invalidValue") : "")} />
          </label>
        ) : null}
        {f.type === "repeater" ? (
          <>
            <label className="field">
              <span className="label">{e("minItems")}</span>
              <input className="input" dir="ltr" inputMode="numeric" value={f.minItems ?? ""} onChange={(ev) => onChange({ minItems: ev.target.value })} />
            </label>
            <label className="field">
              <span className="label">{e("maxItems")}</span>
              <input
                className="input"
                dir="ltr"
                inputMode="numeric"
                placeholder={String(MAX_REPEATER_ITEMS)}
                value={f.maxItems ?? ""}
                onChange={(ev) => onChange({ maxItems: ev.target.value })}
              />
              <FieldErr text={errAt(`${path}.maxItems`)} />
            </label>
          </>
        ) : null}
        <label className="field">
          <span className="label">{e("showIf")}</span>
          <select
            className="input"
            value={f.showIf?.field || ""}
            onChange={(ev) => onChange({ showIf: ev.target.value ? { field: ev.target.value, in: f.showIf?.in || [true] } : undefined })}
          >
            <option value="">{e("showIfAlways")}</option>
            {siblings.map((p) => (
              <option key={p.key} value={p.key}>
                {p.key}
              </option>
            ))}
          </select>
          <FieldErr text={errAt(`${path}.showIf`)} />
        </label>
        {f.showIf ? (
          <label className="field">
            <span className="label">{e("showIfValue")}</span>
            <input
              className="input"
              dir="ltr"
              value={(f.showIf.in || []).map(String).join(",")}
              onChange={(ev) =>
                onChange({
                  showIf: {
                    field: f.showIf.field,
                    in: ev.target.value
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
      <LocaleInputs label={e("fieldLabel")} value={f.label} required onChange={(label) => onChange({ label })} />
      <details>
        <summary>{`${e("placeholder")} / ${e("help")}`}</summary>
        <LocaleInputs label={e("placeholder")} value={f.placeholder} onChange={(placeholder) => onChange({ placeholder })} />
        <LocaleInputs label={e("help")} value={f.help} multiline onChange={(help) => onChange({ help })} />
      </details>

      {f.type === "text" || f.type === "textarea" ? (
        <details open={Boolean(f.validationRegex)}>
          <summary>{e("validationRegex")}</summary>
          <label className="field">
            <span className="label">{e("validationRegex")}</span>
            <input
              className="input"
              dir="ltr"
              maxLength={200}
              value={f.validationRegex ?? ""}
              onChange={(ev) => onChange({ validationRegex: ev.target.value })}
              data-testid={`catalog-regex-${path}`}
            />
            <span className="help">{e("validationRegexHint")}</span>
            <FieldErr text={errAt(`${path}.validationRegex`) || (regexLocalBad ? e("regexUnsafe") : "")} />
          </label>
          <LocaleInputs label={e("validationMessage")} value={f.validationMessage} onChange={(validationMessage) => onChange({ validationMessage })} />
        </details>
      ) : null}

      {OPTION_TYPES.has(f.type) ? (
        <div className="field">
          <span className="label">{e("options")}</span>
          <FieldErr text={errAt(`${path}.options`)} />
          {(f.options || []).map((o, j) => (
            <div key={j} className="smart-editor-field">
              <div className="smart-editor-field__head">
                <label className="field" style={{ flex: 1 }}>
                  <span className="help">{e("optionValue")}</span>
                  <input
                    className="input"
                    dir="ltr"
                    value={o.value}
                    onChange={(ev) => onChange({ options: f.options.map((x, k) => (k === j ? { ...x, value: ev.target.value.trim().toLowerCase() } : x)) })}
                  />
                  <FieldErr text={errAt(`${path}.options[${j}].value`)} />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span className="help">{e("priceModifier")}</span>
                  <input
                    className="input"
                    dir="ltr"
                    inputMode="decimal"
                    value={o.priceModifier ?? ""}
                    onChange={(ev) => onChange({ options: f.options.map((x, k) => (k === j ? { ...x, priceModifier: ev.target.value } : x)) })}
                  />
                  <FieldErr text={errAt(`${path}.options[${j}].priceModifier`) || (!isValidPriceModifier(o.priceModifier) ? e("invalidValue") : "")} />
                </label>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange({ options: f.options.filter((_, k) => k !== j) })}>
                  {e("remove")}
                </button>
              </div>
              <LocaleInputs
                label={e("fieldLabel")}
                value={o.label}
                required
                onChange={(label) => onChange({ options: f.options.map((x, k) => (k === j ? { ...x, label } : x)) })}
              />
            </div>
          ))}
          <span className="help">
            {e("priceModifierHintOption")} {e("modifierPrivate")}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onChange({ options: [...(f.options || []), { value: `option_${(f.options || []).length + 1}`, label: {} }] })}
          >
            {e("addOption")}
          </button>
        </div>
      ) : null}

      {STRUCTURED.has(f.type) && !isSub ? (
        <div className="smart-editor-subfields" data-testid={`catalog-subfields-${path}`}>
          <span className="label">{e("subFields")}</span>
          <span className="help">{e("subFieldsHint")}</span>
          <FieldErr text={errAt(`${path}.fields`)} />
          {(f.fields || []).map((sf, j) => (
            <FieldEditor
              key={j}
              f={sf}
              path={`${path}.fields[${j}]`}
              siblings={(f.fields || []).slice(0, j)}
              isSub
              onChange={(patch) => setSub(j, patch)}
              onRemove={() => onChange({ fields: f.fields.filter((_, k) => k !== j) })}
              onMove={(dir) => moveSub(j, dir)}
              errAt={errAt}
            />
          ))}
          <div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={(f.fields || []).length >= MAX_SUB_FIELDS}
              onClick={() => onChange({ fields: [...(f.fields || []), newSubField((f.fields || []).length + 1)] })}
            >
              {e("addSubField")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** S5 catalog pricing for the chosen price mode (amounts are decimal strings). */
function PricingEditor({ priceMode, value, onChange, errAt }) {
  const { t } = useTranslation();
  const e = (k) => t(`smartOrders.catalog.editor.${k}`);
  if (priceMode === "manual_quote") return <p className="help">{e("pricingManual")}</p>;
  const amountInput = (k, label) => (
    <label className="field" key={k}>
      <span className="label">{label}</span>
      <input className="input" dir="ltr" inputMode="decimal" value={value[k] ?? ""} onChange={(ev) => onChange({ ...value, [k]: ev.target.value })} data-testid={`catalog-pricing-${k}`} />
      <FieldErr text={errAt(`pricing.${k}`)} />
    </label>
  );
  const setPkg = (i, patch) => onChange({ ...value, packages: value.packages.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  return (
    <fieldset className="field" data-testid="catalog-pricing" style={{ gridColumn: "1 / -1" }}>
      <legend className="label">{e("pricingHeading")}</legend>
      <p className="help">{e("pricingHint")}</p>
      <div className="smart-editor-grid">
        <label className="field">
          <span className="label">{e("currency")}</span>
          <select className="input" value={value.currency} onChange={(ev) => onChange({ ...value, currency: ev.target.value })}>
            {PRICE_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <FieldErr text={errAt("pricing.currency")} />
        </label>
        {priceMode === "fixed" ? amountInput("amount", e("amount")) : null}
        {priceMode === "per_unit" ? [amountInput("unitAmount", e("unitAmount")), amountInput("minAmount", e("minAmountOptional"))] : null}
        {priceMode === "range" ? [amountInput("minAmount", e("minAmount")), amountInput("maxAmount", e("maxAmount"))] : null}
      </div>
      {priceMode === "package" ? (
        <div className="field">
          <span className="label">{e("packages")}</span>
          <FieldErr text={errAt("pricing.packages")} />
          {value.packages.map((p, i) => (
            <div className="smart-editor-field" key={i}>
              <div className="smart-editor-grid">
                <label className="field">
                  <span className="label">{e("packageCode")}</span>
                  <input className="input" dir="ltr" value={p.code} onChange={(ev) => setPkg(i, { code: ev.target.value.trim().toLowerCase() })} />
                  <FieldErr text={errAt(`pricing.packages[${i}].code`)} />
                </label>
                <label className="field">
                  <span className="label">{e("packageAmount")}</span>
                  <input className="input" dir="ltr" inputMode="decimal" value={p.amount} onChange={(ev) => setPkg(i, { amount: ev.target.value })} />
                  <FieldErr text={errAt(`pricing.packages[${i}].amount`)} />
                </label>
                <div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onChange({ ...value, packages: value.packages.filter((_, j) => j !== i) })}
                  >
                    {e("remove")}
                  </button>
                </div>
              </div>
              <LocaleInputs label={e("packageLabel")} value={p.label} required onChange={(label) => setPkg(i, { label })} />
              <FieldErr text={errAt(`pricing.packages[${i}].label`)} />
            </div>
          ))}
          <div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={value.packages.length >= MAX_PACKAGES}
              onClick={() => onChange({ ...value, packages: [...value.packages, { code: `package_${value.packages.length + 1}`, label: {}, amount: "" }] })}
            >
              {e("addPackage")}
            </button>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}

/** Create / edit one catalog service. Saving a changed definition creates a new immutable version. */
export default function ServiceEditorModal({ serviceId, categories, onClose, onSaved }) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const isNew = !serviceId;
  const [tab, setTab] = useState("basics");
  const [def, setDef] = useState(() => blankDefinition(categories[0]?.id));
  const [pricing, setPricing] = useState(() => pricingDraftFrom(null));
  const [versions, setVersions] = useState([]);
  const [changeNote, setChangeNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [previewDraft, setPreviewDraft] = useState(emptyServiceDraft);
  const [serverErrors, setServerErrors] = useState({});

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
        setPricing(pricingDraftFrom(s.pricing));
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

  const pricingErrors = useMemo(() => validatePricing(def.priceMode, pricing), [def.priceMode, pricing]);
  const errAt = (path) => {
    const code = serverErrors[path] || pricingErrors[path];
    if (!code) return "";
    return code === "unsafe" ? t("smartOrders.catalog.editor.regexUnsafe") : t("smartOrders.catalog.editor.invalidValue");
  };

  const previewService = useMemo(
    () => ({
      serviceCode: def.serviceCode || "preview",
      version: 0,
      name: def.name,
      quantity: { ...def.quantity, min: num(def.quantity?.min), max: num(def.quantity?.max) },
      fields: def.fields.map((f) => ({ ...fieldPayload(f), options: f.options || [] })),
    }),
    [def],
  );

  const save = async () => {
    setBusy(true);
    setServerErrors({});
    try {
      const pricingPayload = buildPricingPayload(def.priceMode, pricing);
      const payload = {
        ...def,
        quantity: { ...def.quantity, min: num(def.quantity?.min), max: num(def.quantity?.max) },
        fields: def.fields.map(fieldPayload),
        ...(pricingPayload ? { pricing: pricingPayload } : {}),
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
      if (fe && typeof fe === "object") setServerErrors(fe);
      const unsafe = fe && Object.values(fe).includes("unsafe");
      const detail = fe ? ` (${Object.keys(fe).slice(0, 3).join(", ")})` : "";
      push({
        type: "error",
        title: t("smartOrders.catalog.saveFailed"),
        message: unsafe ? `${t("smartOrders.catalog.editor.regexUnsafe")}${detail}` : `${getSafeApiErrorMessage(e)}${detail}`,
      });
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
              <select className="input" value={def.priceMode} onChange={(e) => set({ priceMode: e.target.value })} data-testid="catalog-price-mode">
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
            <PricingEditor priceMode={def.priceMode} value={pricing} onChange={setPricing} errAt={errAt} />
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
              <FieldEditor
                key={i}
                f={f}
                path={`fields[${i}]`}
                siblings={def.fields.slice(0, i)}
                onChange={(patch) => setField(i, patch)}
                onRemove={() => setDef((d) => ({ ...d, fields: d.fields.filter((_, j) => j !== i) }))}
                onMove={(dir) => moveField(i, dir)}
                errAt={errAt}
              />
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
