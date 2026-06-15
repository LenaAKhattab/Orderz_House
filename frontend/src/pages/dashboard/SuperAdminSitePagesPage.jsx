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
import { listSuperAdminSitePagesRequest } from "../../services/api";
import "./superAdminSitePages.css";

function errorMessage(err) {
  return err?.response?.data?.message || "تعذر تحميل الصفحات. حاول مجدداً.";
}

function StatusBadge({ active, onLabel, offLabel }) {
  return (
    <span className={`oh-site-pages-badge ${active ? "oh-site-pages-badge--on" : "oh-site-pages-badge--off"}`}>
      {active ? onLabel : offLabel}
    </span>
  );
}

export default function SuperAdminSitePagesPage() {
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
      setError(errorMessage(err));
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="الصفحات العامة"
        description="إدارة صفحات الموقع العامة (الفوتر وقائمة الموبايل)."
        breadcrumbs={editWebsiteBreadcrumbs("dashboard.breadcrumbs.websitePages")}
      />

      <DashboardSection title="قائمة الصفحات">
        <div className="oh-site-pages-toolbar">
          <p className="oh-site-pages-toolbar__hint">
            الصفحات المنشورة تظهر في «روابط مهمة» بالفوتر (سطح المكتب) وقائمة الموبايل حسب الإعدادات.
          </p>
        </div>

        {loading ? <DashboardLoadingState label="جاري تحميل الصفحات…" /> : null}
        {!loading && error ? (
          <DashboardErrorState
            message={error}
            actions={
              <Button type="button" variant="secondary" onClick={loadPages}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : null}

        {!loading && !error && pages.length > 0 ? (
          <div className="oh-site-pages-table-wrap">
            <table className="oh-site-pages-table">
              <thead>
                <tr>
                  <th>العنوان</th>
                  <th>الرابط</th>
                  <th>النشر</th>
                  <th>الموبايل</th>
                  <th>الفوتر</th>
                  <th>إجراء</th>
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
                      <StatusBadge active={page.isPublished} onLabel="منشورة" offLabel="مسودة" />
                    </td>
                    <td>
                      <StatusBadge active={page.showInMobileMenu} onLabel="نعم" offLabel="لا" />
                    </td>
                    <td>
                      <StatusBadge active={page.showInFooter} onLabel="نعم" offLabel="لا" />
                    </td>
                    <td>
                      <Link
                        to={`${EDIT_WEBSITE_BASE}/pages/${page.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        تعديل
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
