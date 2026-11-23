import { useCallback, useEffect, useState } from "react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardSection from "../../components/dashboard/DashboardSection";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/smartOrdersResources";
import "../../styles/smartOrders.css";
import { adminListServiceCatalogRequest, adminSetCatalogServiceActiveRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { pickLocalized } from "../../components/orders/smart/catalogForm";
import ServiceEditorModal from "../../components/orders/smart/ServiceEditorModal";

/** Admin / Super Admin service catalog: categories → services, versioned definitions, no deletes. */
export default function AdminServiceCatalogPage() {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [editor, setEditor] = useState(null); // { id } | { isNew: true }

  const load = useCallback(async () => {
    try {
      const res = await adminListServiceCatalogRequest();
      setData(res?.data || { categories: [], services: [] });
    } catch (e) {
      push({ type: "error", title: t("smartOrders.catalog.title"), message: getSafeApiErrorMessage(e) });
    }
  }, [push, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (svc) => {
    setBusyId(svc.id);
    try {
      await adminSetCatalogServiceActiveRequest(svc.id, !svc.isActive);
      await load();
    } catch (e) {
      push({ type: "error", title: t("smartOrders.catalog.saveFailed"), message: getSafeApiErrorMessage(e) });
    } finally {
      setBusyId("");
    }
  };

  const catName = (c) => (locale === "ar" ? c.name : c.nameEn || c.name);

  return (
    <DashboardShell className="smart-catalog-page">
      <DashboardPageHeader
        title={t("smartOrders.catalog.title")}
        description={t("smartOrders.catalog.description")}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditor({ isNew: true })} data-testid="catalog-new-service">
            {t("smartOrders.catalog.newService")}
          </button>
        }
      />
      <DashboardSection>
        <p className="help">{t("smartOrders.catalog.noDelete")}</p>
        {!data ? <p className="help">{t("smartOrders.catalog.loading")}</p> : null}
        {data
          ? data.categories.map((c) => {
              const list = data.services.filter((s) => s.categoryId === c.id);
              return (
                <section key={c.id} className="smart-catalog-group" data-testid={`catalog-category-${c.slug || c.id}`}>
                  <h2>{catName(c)}</h2>
                  {list.length === 0 ? <p className="help">{t("smartOrders.catalog.empty")}</p> : null}
                  {list.map((s) => (
                    <div key={s.id} className="smart-catalog-row" data-testid={`catalog-service-${s.serviceCode}`}>
                      <div>
                        <strong>{pickLocalized(s.name, locale)}</strong>
                        <div className="smart-catalog-row__meta">
                          <code dir="ltr">{s.serviceCode}</code>
                          <span className="oh-mini-chip">{t(`smartOrders.units.${s.quantity?.unit}`)}</span>
                          <span className={`oh-badge oh-badge--${s.isActive ? "success" : "neutral"}`}>
                            {s.isActive ? t("smartOrders.catalog.active") : t("smartOrders.catalog.inactive")}
                          </span>
                          <span className={`oh-badge oh-badge--${s.visibility === "admin_only" ? "warning" : "info"}`}>
                            {s.visibility === "admin_only" ? t("smartOrders.catalog.adminOnly") : t("smartOrders.catalog.public")}
                          </span>
                          <span className="help">
                            v{s.version} · {t("smartOrders.catalog.versionsCount", { count: s.versionCount ?? 1 })} ·{" "}
                            {t("smartOrders.catalog.ordersCount", { count: s.snapshotCount ?? 0 })}
                          </span>
                        </div>
                      </div>
                      <div className="smart-catalog-row__actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setEditor({ id: s.id })}>
                          {t("smartOrders.catalog.edit")}
                        </button>
                        <button type="button" className="btn btn-secondary" disabled={busyId === s.id} onClick={() => toggle(s)}>
                          {s.isActive ? t("smartOrders.catalog.deactivate") : t("smartOrders.catalog.activate")}
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              );
            })
          : null}
      </DashboardSection>
      {editor ? (
        <ServiceEditorModal
          serviceId={editor.id || null}
          categories={data?.categories || []}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      ) : null}
    </DashboardShell>
  );
}
