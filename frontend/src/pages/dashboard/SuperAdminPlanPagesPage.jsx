import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import {
  createPlanPageRequest,
  deletePlanPageRequest,
  listAdminPlanPagesRequest,
  updatePlanPageRequest,
} from "../../services/api";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import "../../admin/plans/super-admin-plan-pages.css";

const EMPTY_FORM = {
  title: "",
  subtitle: "",
  slug: "",
  isPublic: false,
  isActive: true,
  startsAt: "",
  endsAt: "",
};

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
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPage, setEditingPage] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

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

  const openCreate = () => {
    setEditingPage(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (page) => {
    setEditingPage(page);
    setForm({
      title: page.title || "",
      subtitle: page.subtitle || "",
      slug: page.slug || "",
      isPublic: Boolean(page.isPublic),
      isActive: Boolean(page.isActive),
      startsAt: page.startsAt ? String(page.startsAt).slice(0, 16) : "",
      endsAt: page.endsAt ? String(page.endsAt).slice(0, 16) : "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setEditingPage(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      slug: form.slug.trim() || null,
      pageType: "special",
      isPublic: Boolean(form.isPublic),
      isActive: Boolean(form.isActive),
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    };
    try {
      if (editingPage) {
        await updatePlanPageRequest(editingPage.id, payload);
      } else {
        await createPlanPageRequest(payload);
      }
      closeModal();
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

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
        subtitle="أنشئ صفحات باقات قابلة للمشاركة مثل /plans/freelancers وأدر خطط كل صفحة."
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.planPages")}
        actions={
          <Button type="button" variant="primary" onClick={openCreate}>
            صفحة جديدة
          </Button>
        }
      />

      {loading ? <DashboardLoadingState label="جاري تحميل صفحات الباقات..." /> : null}
      {!loading && error && !modalOpen ? <DashboardErrorState message={error} onRetry={refresh} /> : null}

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
                  <Button type="button" variant="secondary" size="sm" onClick={() => openEdit(page)}>
                    تعديل الصفحة
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    as={Link}
                    to={`/dashboard/super-admin/plans?section=pages&pageId=${page.id}`}
                  >
                    إدارة الباقات
                  </Button>
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

      {modalOpen ? (
        <div className="modal-overlay" role="presentation" onClick={closeModal}>
          <form
            className="modal card admin-plan-page-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-page-modal-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <h2 id="plan-page-modal-title">{editingPage ? "تعديل صفحة الباقات" : "صفحة باقات جديدة"}</h2>
            {error ? <p className="auth-form-error">{error}</p> : null}
            <label>
              العنوان
              <input
                required
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </label>
            <label>
              العنوان الفرعي
              <textarea
                rows={3}
                value={form.subtitle}
                onChange={(e) => setForm((prev) => ({ ...prev, subtitle: e.target.value }))}
              />
            </label>
            <label>
              Slug (مثال: freelancers)
              <input
                value={form.slug}
                disabled={editingPage?.pageType === "default"}
                placeholder="freelancers"
                onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => setForm((prev) => ({ ...prev, isPublic: e.target.checked }))}
              />
              <span>ظاهرة في القوائم العامة</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              <span>نشطة</span>
            </label>
            <label>
              تبدأ في
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((prev) => ({ ...prev, startsAt: e.target.value }))}
              />
            </label>
            <label>
              تنتهي في
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm((prev) => ({ ...prev, endsAt: e.target.value }))}
              />
            </label>
            <div className="modal__actions">
              <Button type="button" variant="secondary" onClick={closeModal} disabled={submitting}>
                إلغاء
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </DashboardShell>
  );
};

export default SuperAdminPlanPagesPage;
