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
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/siteEditorResources";
import { getSuperAdminSitePageRequest, updateSuperAdminSitePageRequest } from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import "./superAdminSitePages.css";

function FormField({ label, hint, children, className = "" }) {
  return (
    <label className={["oh-site-page-form__field", className].filter(Boolean).join(" ")}>
      <span className="oh-site-page-form__label">{label}</span>
      {children}
      {hint ? <span className="oh-site-page-form__hint">{hint}</span> : null}
    </label>
  );
}

function ToggleField({ label, checked, onChange, disabled, onLabel, offLabel }) {
  return (
    <label className="oh-site-page-form__field oh-site-page-form__field--toggle">
      <span className="oh-site-page-form__label">{label}</span>
      <span className="oh-site-page-form__toggle">
        <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
        <span>{checked ? onLabel : offLabel}</span>
      </span>
    </label>
  );
}

export default function SuperAdminSitePageEditPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(null);
  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [menuLabel, setMenuLabel] = useState("");
  const [menuLabelEn, setMenuLabelEn] = useState("");
  const [content, setContent] = useState("");
  const [contentEn, setContentEn] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [showInMobileMenu, setShowInMobileMenu] = useState(true);
  const [showInFooter, setShowInFooter] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  const operationError = useCallback(
    (err) => err?.response?.data?.message || t("siteEditor.errors.operationFailed"),
    [t],
  );

  const applyPage = useCallback((next) => {
    setPage(next);
    setTitle(next?.title || "");
    setTitleEn(next?.titleEn || "");
    setMenuLabel(next?.menuLabel || "");
    setMenuLabelEn(next?.menuLabelEn || "");
    setContent(next?.content || "");
    setContentEn(next?.contentEn || "");
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
      setError(operationError(err));
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [applyPage, id, operationError]);

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
        titleEn: titleEn.trim(),
        menuLabel: menuLabel.trim(),
        menuLabelEn: menuLabelEn.trim(),
        content,
        contentEn,
        metaTitle: metaTitle.trim() || null,
        metaDescription: metaDescription.trim() || null,
        isPublished,
        showInMobileMenu,
        showInFooter,
        sortOrder: Number(sortOrder) || 0,
      });
      applyPage(res?.data?.page || null);
      showToast({ type: "success", message: t("siteEditor.sitePageEdit.toastSaved") });
    } catch (err) {
      setError(operationError(err));
    } finally {
      setSaving(false);
    }
  };

  const editFallback = t("siteEditor.sitePageEdit.editPageFallback");
  const breadcrumbs = [
    ...editWebsiteBreadcrumbs("dashboard.breadcrumbs.websitePages").slice(0, -1),
    { label: page?.title || editFallback },
  ];

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={page?.title || editFallback}
        description={t("siteEditor.sitePageEdit.pageDescription")}
        breadcrumbs={breadcrumbs}
      />

      <DashboardSection title={t("siteEditor.sitePageEdit.sectionTitle")}>
        {loading ? <DashboardLoadingState label={t("siteEditor.common.loadingPage")} /> : null}
        {!loading && error && !page ? (
          <DashboardErrorState
            message={error}
            actions={
              <Button type="button" variant="secondary" onClick={loadPage}>
                {t("siteEditor.common.retry")}
              </Button>
            }
          />
        ) : null}

        {!loading && page ? (
          <form className="oh-site-page-form" onSubmit={handleSubmit}>
            <div className="oh-site-page-form__card">
              {page.slug ? (
                <p className="oh-site-page-form__path-hint">
                  {t("siteEditor.sitePageEdit.pagePathLabel")}{" "}
                  <span className="oh-site-page-form__path-value" dir="ltr">
                    {getPublicSitePagePath(page.slug)}
                  </span>
                </p>
              ) : null}

              <div className="oh-site-page-form__grid oh-site-page-form__grid--2">
                <FormField label={t("siteEditor.sitePageEdit.pageTitle")}>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} required />
                </FormField>
                <FormField label={t("siteEditor.sitePageEdit.menuLabel")}>
                  <input
                    value={menuLabel}
                    onChange={(e) => setMenuLabel(e.target.value)}
                    disabled={saving}
                    required
                  />
                </FormField>
                <FormField label={t("siteEditor.sitePageEdit.pageTitleEn")}>
                  <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} disabled={saving} />
                </FormField>
                <FormField label={t("siteEditor.sitePageEdit.menuLabelEn")}>
                  <input value={menuLabelEn} onChange={(e) => setMenuLabelEn(e.target.value)} disabled={saving} />
                </FormField>
              </div>

              <div className="oh-site-page-form__grid oh-site-page-form__grid--2">
                <FormField label={t("siteEditor.sitePageEdit.sortOrder")}>
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
                  label={t("siteEditor.sitePageEdit.publishedToggle")}
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  disabled={saving}
                  onLabel={t("siteEditor.common.enabled")}
                  offLabel={t("siteEditor.common.disabled")}
                />
              </div>

              <div className="oh-site-page-form__grid oh-site-page-form__grid--2">
                <ToggleField
                  label={t("siteEditor.sitePageEdit.showMobile")}
                  checked={showInMobileMenu}
                  onChange={(e) => setShowInMobileMenu(e.target.checked)}
                  disabled={saving}
                  onLabel={t("siteEditor.common.enabled")}
                  offLabel={t("siteEditor.common.disabled")}
                />
                <ToggleField
                  label={t("siteEditor.sitePageEdit.showFooter")}
                  checked={showInFooter}
                  onChange={(e) => setShowInFooter(e.target.checked)}
                  disabled={saving}
                  onLabel={t("siteEditor.common.enabled")}
                  offLabel={t("siteEditor.common.disabled")}
                />
              </div>

              <FormField
                label={t("siteEditor.sitePageEdit.contentLabel")}
                hint={t("siteEditor.sitePageEdit.contentHint")}
                className="oh-site-page-form__field--full"
              >
                <textarea
                  className="oh-site-page-form__content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={saving}
                />
              </FormField>
              <FormField
                label={t("siteEditor.sitePageEdit.contentLabelEn")}
                hint={t("siteEditor.sitePageEdit.contentHint")}
                className="oh-site-page-form__field--full"
              >
                <textarea
                  className="oh-site-page-form__content"
                  value={contentEn}
                  onChange={(e) => setContentEn(e.target.value)}
                  disabled={saving}
                />
              </FormField>

              <details className="oh-site-page-form__seo">
                <summary className="oh-site-page-form__seo-summary">{t("siteEditor.sitePageEdit.seoOptional")}</summary>
                <div className="oh-site-page-form__seo-body">
                  <FormField label={t("siteEditor.sitePageEdit.metaTitle")}>
                    <input
                      value={metaTitle}
                      onChange={(e) => setMetaTitle(e.target.value)}
                      disabled={saving}
                    />
                  </FormField>
                  <FormField label={t("siteEditor.sitePageEdit.metaDescription")}>
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
                  {saving ? t("siteEditor.common.saving") : t("siteEditor.common.saveChanges")}
                </Button>
                <Link to={`${EDIT_WEBSITE_BASE}/pages`} className="btn btn-secondary">
                  {t("siteEditor.sitePageEdit.backToList")}
                </Link>
              </div>
            </div>
          </form>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
