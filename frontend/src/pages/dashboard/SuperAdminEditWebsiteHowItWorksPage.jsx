import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { editWebsiteBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { EDIT_WEBSITE_BASE } from "../../constants/superAdminWebsiteSections";
import { HOW_IT_WORKS_PAGES } from "../../constants/howItWorksPages";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/siteEditorResources";
import {
  listSuperAdminWebsitePagesRequest,
  updateSuperAdminWebsitePageRequest,
} from "../../services/api";
import "./superAdminEditWebsitePage.css";

export default function SuperAdminEditWebsiteHowItWorksPage() {
  const { t } = useTranslation();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busySlug, setBusySlug] = useState(null);

  const operationError = useCallback(
    (err) => err?.response?.data?.message || t("siteEditor.errors.operationFailed"),
    [t],
  );

  const loadPages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listSuperAdminWebsitePagesRequest();
      const all = Array.isArray(res?.data?.pages) ? res.data.pages : [];
      const howPages = HOW_IT_WORKS_PAGES.map((meta) => {
        const row = all.find((p) => p.slug === meta.slug);
        return { ...meta, ...(row || {}), title: row?.title || t(meta.adminLabelKey) };
      });
      setPages(howPages);
    } catch (err) {
      setError(operationError(err));
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, [operationError, t]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  const toggleVisibility = async (page) => {
    setBusySlug(page.slug);
    try {
      await updateSuperAdminWebsitePageRequest(page.slug, { isActive: !page.isActive });
      await loadPages();
    } catch (err) {
      window.alert(operationError(err));
    } finally {
      setBusySlug(null);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("siteEditor.howItWorksHub.pageTitle")}
        description={t("siteEditor.howItWorksHub.pageDescription")}
        breadcrumbs={editWebsiteBreadcrumbs("dashboard.breadcrumbs.howItWorks")}
      />

      <DashboardSection title={t("siteEditor.howItWorksHub.sectionTitle")}>
        {loading ? <DashboardLoadingState label={t("siteEditor.common.loadingPages")} /> : null}
        {!loading && error ? (
          <DashboardErrorState
            message={error}
            actions={
              <Button type="button" variant="secondary" onClick={loadPages}>
                {t("siteEditor.common.retry")}
              </Button>
            }
          />
        ) : null}
        {!loading && !error ? (
          <div className="oh-website-hiw-pages">
            {pages.map((page) => {
              const visible = Boolean(page.isActive);
              const busy = busySlug === page.slug;
              return (
                <article key={page.slug} className="oh-website-hiw-page-card">
                  <div className="oh-website-hiw-page-card__head">
                    <div className="oh-website-hiw-page-card__copy">
                      <h3 className="oh-website-hiw-page-card__title">{page.title}</h3>
                      <p className="oh-website-hiw-page-card__path">{page.path}</p>
                    </div>
                    <span
                      className={`oh-website-hiw-page-card__badge${visible ? " oh-website-hiw-page-card__badge--visible" : ""}`}
                    >
                      {visible ? t("siteEditor.common.visible") : t("siteEditor.common.hidden")}
                    </span>
                  </div>
                  <div className="oh-website-hiw-page-card__actions">
                    <Link
                      to={`${EDIT_WEBSITE_BASE}/how-it-works/${page.slug}`}
                      className="btn btn-primary btn-sm"
                    >
                      {t("siteEditor.common.edit")}
                    </Link>
                    <Button
                      type="button"
                      variant="secondary"
                      className="btn-sm"
                      disabled={busy}
                      onClick={() => toggleVisibility(page)}
                    >
                      {busy
                        ? t("siteEditor.common.busy")
                        : visible
                          ? t("siteEditor.common.hide")
                          : t("siteEditor.common.show")}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
