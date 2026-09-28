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
import { getPublicSitePagePath } from "../../constants/publicSitePages";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/siteEditorResources";
import { listSuperAdminSitePagesRequest } from "../../services/api";
import "./superAdminSitePages.css";

function StatusBadge({ active, onLabel, offLabel }) {
  return (
    <span className={`oh-site-pages-badge ${active ? "oh-site-pages-badge--on" : "oh-site-pages-badge--off"}`}>
      {active ? onLabel : offLabel}
    </span>
  );
}

export default function SuperAdminSitePagesPage() {
  const { t } = useTranslation();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listSuperAdminSitePagesRequest();
      setPages(Array.isArray(res?.data?.pages) ? res.data.pages : []);
    } catch (err) {
      setError(err?.response?.data?.message || t("siteEditor.errors.loadPagesFailed"));
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("siteEditor.sitePages.pageTitle")}
        description={t("siteEditor.sitePages.pageDescription")}
        breadcrumbs={editWebsiteBreadcrumbs("dashboard.breadcrumbs.websitePages")}
      />

      <DashboardSection title={t("siteEditor.sitePages.sectionTitle")}>
        <div className="oh-site-pages-toolbar">
          <p className="oh-site-pages-toolbar__hint">{t("siteEditor.sitePages.toolbarHint")}</p>
        </div>

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

        {!loading && !error && pages.length > 0 ? (
          <div className="oh-site-pages-table-wrap">
            <table className="oh-site-pages-table">
              <thead>
                <tr>
                  <th>{t("siteEditor.sitePages.tableTitle")}</th>
                  <th>{t("siteEditor.sitePages.tableLink")}</th>
                  <th>{t("siteEditor.sitePages.tablePublish")}</th>
                  <th>{t("siteEditor.sitePages.tableMobile")}</th>
                  <th>{t("siteEditor.sitePages.tableFooter")}</th>
                  <th>{t("siteEditor.sitePages.tableAction")}</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.id}>
                    <td>
                      <div className="oh-site-pages-table__title">{page.title}</div>
                      <div>{page.menuLabel}</div>
                    </td>
                    <td>
                      <div className="oh-site-pages-table__slug">{getPublicSitePagePath(page.slug)}</div>
                    </td>
                    <td>
                      <StatusBadge
                        active={page.isPublished}
                        onLabel={t("siteEditor.common.published")}
                        offLabel={t("siteEditor.common.draft")}
                      />
                    </td>
                    <td>
                      <StatusBadge
                        active={page.showInMobileMenu}
                        onLabel={t("siteEditor.common.yes")}
                        offLabel={t("siteEditor.common.no")}
                      />
                    </td>
                    <td>
                      <StatusBadge
                        active={page.showInFooter}
                        onLabel={t("siteEditor.common.yes")}
                        offLabel={t("siteEditor.common.no")}
                      />
                    </td>
                    <td>
                      <Link
                        to={`${EDIT_WEBSITE_BASE}/pages/${page.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        {t("siteEditor.common.edit")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
