import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import { deletePlanPageRequest, listAdminPlanPagesRequest } from "../../services/api";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import "../../admin/plans/super-admin-plan-pages.css";

function errorMessage(err) {
  return err?.response?.data?.message || "تعذر تنفيذ العملية.";
}

function formatPageLink(page) {
  if (page.pageType === "default" || !page.slug) return "/plans";
  return `/plans/${page.slug}`;
}

const SuperAdminPlanPagesPage = () => {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listAdminPlanPagesRequest();
      setPages(res?.data?.pages || []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = async (page) => {
    if (page.pageType === "default") return;
    if (!window.confirm(`حذف صفحة «${page.title}»؟`)) return;
    setSubmitting(true);
    setError("");
    try {
      await deletePlanPageRequest(page.id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const sortedPages = useMemo(
    () => [...pages].sort((a, b) => (a.pageType === "default" ? -1 : b.pageType === "default" ? 1 : a.id - b.id)),
    [pages],
  );

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="صفحات الباقات"
        subtitle="عرض صفحات الباقات وإدارة الباقات المرتبطة بكل صفحة."
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.planPages")}
      />

      {loading ? <DashboardLoadingState label="جاري تحميل صفحات الباقات..." /> : null}
      {!loading && error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}

      {!loading ? (
        <DashboardSection title="كل الصفحات">
          <div className="admin-plan-pages-grid">
            {sortedPages.map((page) => (
              <article key={page.id} className="card admin-plan-page-card">
                <div className="admin-plan-page-card__head">
                  <h3>{page.title}</h3>
                  <div className="admin-plan-page-card__badges">
                    <StatusBadge tone={page.pageType === "default" ? "info" : "neutral"}>
                      {page.pageType === "default" ? "افتراضية" : "خاصة"}
                    </StatusBadge>
                    <StatusBadge tone={page.isActive ? "success" : "warning"}>
                      {page.isActive ? "نشطة" : "غير نشطة"}
                    </StatusBadge>
                    {!page.isPublic ? <StatusBadge tone="neutral">غير مدرجة</StatusBadge> : null}
                  </div>
                </div>
                {page.subtitle ? <p className="admin-plan-page-card__subtitle">{page.subtitle}</p> : null}
                <p className="admin-plan-page-card__link">
                  الرابط: <Link to={formatPageLink(page)}>{formatPageLink(page)}</Link>
                </p>
                <div className="admin-plan-page-card__actions">
                  <Link
                    className="btn btn-secondary btn-sm"
                    to={`/dashboard/super-admin/plans?section=pages&pageId=${page.id}`}
                  >
                    إدارة الباقات
                  </Link>
                  {page.pageType !== "default" ? (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={submitting}
                      onClick={() => handleDelete(page)}
                    >
                      حذف
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </DashboardSection>
      ) : null}
    </DashboardShell>
  );
};

export default SuperAdminPlanPagesPage;
