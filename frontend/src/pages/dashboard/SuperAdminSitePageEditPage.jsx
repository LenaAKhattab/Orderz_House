import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { editWebsiteBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { EDIT_WEBSITE_BASE } from "../../constants/superAdminWebsiteSections";
import { getPublicSitePagePath } from "../../constants/publicSitePages";
import { getSuperAdminSitePageRequest, updateSuperAdminSitePageRequest } from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import "./superAdminSitePages.css";

function errorMessage(err) {
  return err?.response?.data?.message || "تعذر تنفيذ العملية. حاول مجدداً.";
}

function FormField({ label, hint, children, className = "" }) {
  return (
    <label className={["oh-site-page-form__field", className].filter(Boolean).join(" ")}>
      <span className="oh-site-page-form__label">{label}</span>
      {children}
      {hint ? <span className="oh-site-page-form__hint">{hint}</span> : null}
    </label>
  );
}

function ToggleField({ label, checked, onChange, disabled }) {
  return (
    <label className="oh-site-page-form__field oh-site-page-form__field--toggle">
      <span className="oh-site-page-form__label">{label}</span>
      <span className="oh-site-page-form__toggle">
        <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
        <span>{checked ? "مفعّل" : "غير مفعّل"}</span>
      </span>
    </label>
  );
}

export default function SuperAdminSitePageEditPage() {
  const { id } = useParams();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(null);
  const [title, setTitle] = useState("");
  const [menuLabel, setMenuLabel] = useState("");
  const [content, setContent] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [showInMobileMenu, setShowInMobileMenu] = useState(true);
  const [showInFooter, setShowInFooter] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  const applyPage = useCallback((next) => {
    setPage(next);
    setTitle(next?.title || "");
    setMenuLabel(next?.menuLabel || "");
    setContent(next?.content || "");
    setMetaTitle(next?.metaTitle || "");
    setMetaDescription(next?.metaDescription || "");
    setIsPublished(Boolean(next?.isPublished));
    setShowInMobileMenu(Boolean(next?.showInMobileMenu));
    setShowInFooter(Boolean(next?.showInFooter));
    setSortOrder(Number(next?.sortOrder) || 0);
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSuperAdminSitePageRequest(id);
      applyPage(res?.data?.page || null);
    } catch (err) {
      setError(errorMessage(err));
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [applyPage, id]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await updateSuperAdminSitePageRequest(id, {
        title: title.trim(),
        menuLabel: menuLabel.trim(),
        content,
        metaTitle: metaTitle.trim() || null,
        metaDescription: metaDescription.trim() || null,
        isPublished,
        showInMobileMenu,
        showInFooter,
        sortOrder: Number(sortOrder) || 0,
      });
      applyPage(res?.data?.page || null);
      showToast({ type: "success", message: "تم حفظ الصفحة." });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const breadcrumbs = [
    ...editWebsiteBreadcrumbs("dashboard.breadcrumbs.websitePages").slice(0, -1),
    { label: page?.title || "تعديل الصفحة" },
  ];

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={page?.title || "تعديل الصفحة"}
        description="عدّل محتوى الصفحة وإعدادات ظهورها في الفوتر وقائمة الهاتف."
        breadcrumbs={breadcrumbs}
      />

      <DashboardSection title="محتوى الصفحة">
        {loading ? <DashboardLoadingState label="جاري تحميل الصفحة…" /> : null}
        {!loading && error && !page ? (
          <DashboardErrorState
            message={error}
            actions={
              <Button type="button" variant="secondary" onClick={loadPage}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : null}

        {!loading && page ? (
          <form className="oh-site-page-form" onSubmit={handleSubmit}>
            <div className="oh-site-page-form__card">
              {page.slug ? (
                <p className="oh-site-page-form__path-hint">
                  رابط الصفحة:{" "}
                  <span className="oh-site-page-form__path-value" dir="ltr">
                    {getPublicSitePagePath(page.slug)}
                  </span>
                </p>
              ) : null}

              <div className="oh-site-page-form__grid oh-site-page-form__grid--2">
                <FormField label="عنوان الصفحة">
                  <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} required />
                </FormField>
                <FormField label="اسم الرابط في القائمة">
                  <input
                    value={menuLabel}
                    onChange={(e) => setMenuLabel(e.target.value)}
                    disabled={saving}
                    required
                  />
                </FormField>
              </div>

              <div className="oh-site-page-form__grid oh-site-page-form__grid--2">
                <FormField label="ترتيب الظهور">
                  <input
                    type="number"
                    min="0"
                    max="9999"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    disabled={saving}
                  />
                </FormField>
                <ToggleField
                  label="منشورة"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  disabled={saving}
                />
              </div>

              <div className="oh-site-page-form__grid oh-site-page-form__grid--2">
                <ToggleField
                  label="إظهار في قائمة الهاتف"
                  checked={showInMobileMenu}
                  onChange={(e) => setShowInMobileMenu(e.target.checked)}
                  disabled={saving}
                />
                <ToggleField
                  label="إظهار في الفوتر"
                  checked={showInFooter}
                  onChange={(e) => setShowInFooter(e.target.checked)}
                  disabled={saving}
                />
              </div>

              <FormField
                label="المحتوى"
                hint="اكتب النص بشكل عادي. افصل الفقرات بسطر فارغ. استخدم ## قبل العنوان الفرعي."
                className="oh-site-page-form__field--full"
              >
                <textarea
                  className="oh-site-page-form__content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={saving}
                />
              </FormField>

              <details className="oh-site-page-form__seo">
                <summary className="oh-site-page-form__seo-summary">إعدادات SEO اختيارية</summary>
                <div className="oh-site-page-form__seo-body">
                  <FormField label="عنوان SEO (اختياري)">
                    <input
                      value={metaTitle}
                      onChange={(e) => setMetaTitle(e.target.value)}
                      disabled={saving}
                    />
                  </FormField>
                  <FormField label="وصف SEO (اختياري)">
                    <textarea
                      className="oh-site-page-form__seo-desc"
                      value={metaDescription}
                      onChange={(e) => setMetaDescription(e.target.value)}
                      disabled={saving}
                      rows={3}
                    />
                  </FormField>
                </div>
              </details>

              {error ? <p className="oh-site-page-form__error">{error}</p> : null}

              <div className="oh-site-page-form__actions">
                <Button type="submit" disabled={saving}>
                  {saving ? "جاري الحفظ…" : "حفظ التعديلات"}
                </Button>
                <Link to={`${EDIT_WEBSITE_BASE}/pages`} className="btn btn-secondary">
                  العودة للقائمة
                </Link>
              </div>
            </div>
          </form>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
