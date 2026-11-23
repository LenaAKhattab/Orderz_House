import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";
import "../../../styles/smartOrders.css";
import { adminServiceCatalogOrderOptionsRequest, publicServiceCatalogRequest } from "../../../services/api";
import DynamicServiceForm from "./DynamicServiceForm";
import { emptyServiceDraft, pickLocalized } from "./catalogForm";

/**
 * Wizard step: Category → Service → service-specific fields + quantity. The catalog comes from the
 * server (admin audience includes admin-only services). "General request" keeps the legacy free form.
 */
export default function ServiceCatalogStep({
  audience = "admin",
  draft,
  onDraftChange,
  onServiceResolved,
  errors = {},
  showErrors = false,
  disabled = false,
}) {
  const { t, locale } = useTranslation();
  const [catalog, setCatalog] = useState(null);
  const [failed, setFailed] = useState(false);
  const [pickedCategoryId, setCategoryId] = useState("");

  useEffect(() => {
    let cancelled = false;
    const req = audience === "admin" ? adminServiceCatalogOrderOptionsRequest() : publicServiceCatalogRequest();
    req
      .then((res) => {
        if (!cancelled) setCatalog(res?.data || { categories: [], services: [] });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [audience]);

  const services = useMemo(() => catalog?.services || [], [catalog]);
  const selected = services.find((s) => s.serviceCode === draft?.serviceCode) || null;

  useEffect(() => {
    if (typeof onServiceResolved === "function") onServiceResolved(selected);
  }, [selected, onServiceResolved]);

  if (failed) return <p className="oh-inline-alert">{t("smartOrders.serviceStep.loadFailed")}</p>;
  if (!catalog) return <p className="help">{t("smartOrders.serviceStep.loading")}</p>;

  // A chosen service always determines the category (derived, not synced via an effect).
  const categoryId = selected ? selected.categoryId : pickedCategoryId;
  const catName = (c) => (locale === "ar" ? c.name : c.nameEn || c.name);
  const inCategory = services.filter((s) => !categoryId || s.categoryId === categoryId);

  return (
    <div className="smart-service-step" data-testid="service-catalog-step">
      <h2 style={{ marginBottom: 4 }}>{t("smartOrders.serviceStep.title")}</h2>
      <p className="help" style={{ marginBottom: 12 }}>
        {t("smartOrders.serviceStep.subtitle")}
      </p>
      <div className="admin-co-fields">
        <div className="field">
          <label htmlFor="smart-svc-category">{t("smartOrders.serviceStep.category")}</label>
          <select
            id="smart-svc-category"
            className="input"
            value={categoryId}
            disabled={disabled}
            onChange={(e) => {
              setCategoryId(e.target.value);
              if (selected && selected.categoryId !== e.target.value) onDraftChange(emptyServiceDraft());
            }}
          >
            <option value="">{t("smartOrders.form.choose")}</option>
            {catalog.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {catName(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="smart-svc-service">{t("smartOrders.serviceStep.service")}</label>
          <select
            id="smart-svc-service"
            className="input"
            value={draft?.serviceCode || ""}
            disabled={disabled}
            data-testid="service-select"
            onChange={(e) => {
              const svc = services.find((s) => s.serviceCode === e.target.value);
              onDraftChange(svc ? { ...emptyServiceDraft(), serviceCode: svc.serviceCode, version: svc.version } : emptyServiceDraft());
            }}
          >
            <option value="">{t("smartOrders.serviceStep.noService")}</option>
            {inCategory.map((s) => (
              <option key={s.serviceCode} value={s.serviceCode}>
                {pickLocalized(s.name, locale)}
              </option>
            ))}
          </select>
          {!selected ? <div className="help">{t("smartOrders.serviceStep.noServiceHint")}</div> : null}
          {selected ? (
            <div className="help" data-testid="service-version">
              {t("smartOrders.serviceStep.versionLabel", { version: selected.version })}
            </div>
          ) : null}
        </div>
      </div>
      {selected ? (
        <DynamicServiceForm
          service={selected}
          draft={draft}
          onChange={onDraftChange}
          errors={errors}
          showErrors={showErrors}
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}
