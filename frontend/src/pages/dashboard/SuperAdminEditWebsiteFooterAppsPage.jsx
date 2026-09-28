import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { editWebsiteFooterBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { FOOTER_EDIT_BASE } from "../../constants/superAdminWebsiteSections";
import {
  FOOTER_APP_DOWNLOAD_FALLBACKS,
  coalesceFooterVisible,
} from "../../constants/footerAppDownloads";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/siteEditorResources";
import {
  getSuperAdminFooterAppDownloadsRequest,
  updateSuperAdminFooterAppDownloadsRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import "./superAdminSitePages.css";

function VisibilityToggle({ label, checked, onChange, disabled, t }) {
  return (
    <label className="oh-site-page-form__visibility" data-on={checked ? "true" : "false"}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-checked={checked}
        aria-label={label}
      />
      <span>{checked ? t("siteEditor.common.visible") : t("siteEditor.common.hidden")}</span>
    </label>
  );
}

function FormField({ label, hint, visible, onVisibleChange, visibilityLabel, children, disabled, t }) {
  return (
    <div className="oh-site-page-form__field">
      <div className="oh-site-page-form__field-head">
        <span className="oh-site-page-form__label">{label}</span>
        <VisibilityToggle
          label={visibilityLabel || t("siteEditor.common.showFieldOnSite", { label })}
          checked={visible}
          onChange={onVisibleChange}
          disabled={disabled}
          t={t}
        />
      </div>
      {children}
      {hint ? <span className="oh-site-page-form__hint">{hint}</span> : null}
    </div>
  );
}

export default function SuperAdminEditWebsiteFooterAppsPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState({
    titleAr: FOOTER_APP_DOWNLOAD_FALLBACKS.titleAr,
    googlePlayUrl: FOOTER_APP_DOWNLOAD_FALLBACKS.googlePlayUrl,
    appStoreUrl: FOOTER_APP_DOWNLOAD_FALLBACKS.appStoreUrl,
    visible: true,
    titleVisible: true,
    googlePlayVisible: true,
    appStoreVisible: true,
  });
  const [titleAr, setTitleAr] = useState(FOOTER_APP_DOWNLOAD_FALLBACKS.titleAr);
  const [googlePlayUrl, setGooglePlayUrl] = useState(FOOTER_APP_DOWNLOAD_FALLBACKS.googlePlayUrl);
  const [appStoreUrl, setAppStoreUrl] = useState(FOOTER_APP_DOWNLOAD_FALLBACKS.appStoreUrl);
  const [visible, setVisible] = useState(true);
  const [titleVisible, setTitleVisible] = useState(true);
  const [googlePlayVisible, setGooglePlayVisible] = useState(true);
  const [appStoreVisible, setAppStoreVisible] = useState(true);

  const operationError = useCallback(
    (err) => err?.response?.data?.message || t("siteEditor.errors.operationFailed"),
    [t],
  );

  const applySettings = useCallback((next) => {
    const snapshot = {
      titleAr: next?.titleAr || FOOTER_APP_DOWNLOAD_FALLBACKS.titleAr,
      googlePlayUrl: next?.googlePlayUrl || FOOTER_APP_DOWNLOAD_FALLBACKS.googlePlayUrl,
      appStoreUrl: next?.appStoreUrl || FOOTER_APP_DOWNLOAD_FALLBACKS.appStoreUrl,
      visible: coalesceFooterVisible(next?.visible, true),
      titleVisible: coalesceFooterVisible(next?.titleVisible, true),
      googlePlayVisible: coalesceFooterVisible(next?.googlePlayVisible, true),
      appStoreVisible: coalesceFooterVisible(next?.appStoreVisible, true),
    };
    setSaved(snapshot);
    setTitleAr(snapshot.titleAr);
    setGooglePlayUrl(snapshot.googlePlayUrl);
    setAppStoreUrl(snapshot.appStoreUrl);
    setVisible(snapshot.visible);
    setTitleVisible(snapshot.titleVisible);
    setGooglePlayVisible(snapshot.googlePlayVisible);
    setAppStoreVisible(snapshot.appStoreVisible);
    setLoaded(true);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSuperAdminFooterAppDownloadsRequest();
      applySettings(res?.data?.settings || null);
    } catch (err) {
      setError(operationError(err));
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [applySettings, operationError]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const isDirty =
    titleAr.trim() !== saved.titleAr.trim() ||
    googlePlayUrl.trim() !== saved.googlePlayUrl.trim() ||
    appStoreUrl.trim() !== saved.appStoreUrl.trim() ||
    visible !== saved.visible ||
    titleVisible !== saved.titleVisible ||
    googlePlayVisible !== saved.googlePlayVisible ||
    appStoreVisible !== saved.appStoreVisible;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || !isDirty) return;
    setSaving(true);
    setError("");
    try {
      const res = await updateSuperAdminFooterAppDownloadsRequest({
        titleAr: titleAr.trim(),
        googlePlayUrl: googlePlayUrl.trim(),
        appStoreUrl: appStoreUrl.trim(),
        visible,
        titleVisible,
        googlePlayVisible,
        appStoreVisible,
      });
      applySettings(res?.data?.settings || null);
      showToast({ type: "success", message: t("siteEditor.footerApps.toastSaved") });
    } catch (err) {
      setError(operationError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("siteEditor.footerApps.pageTitle")}
        description={t("siteEditor.footerApps.pageDescription")}
        breadcrumbs={editWebsiteFooterBreadcrumbs("dashboard.breadcrumbs.footerAppDownloads")}
      />

      <DashboardSection title={t("siteEditor.footerApps.sectionTitle")}>
        <p className="oh-site-pages-toolbar__hint" style={{ marginBottom: 12 }}>
          <Link to={FOOTER_EDIT_BASE}>{t("siteEditor.common.backToFooterSections")}</Link>
        </p>
        {loading ? <DashboardLoadingState label={t("siteEditor.common.loadingSettings")} /> : null}
        {!loading && error && !loaded ? (
          <DashboardErrorState
            message={error}
            actions={
              <Button type="button" variant="secondary" onClick={loadSettings}>
                {t("siteEditor.common.retry")}
              </Button>
            }
          />
        ) : null}

        {!loading && loaded ? (
          <form className="oh-site-page-form" onSubmit={handleSubmit}>
            <div className="oh-site-page-form__card">
              {error ? <p className="oh-site-page-form__error">{error}</p> : null}

              <div className="oh-site-page-form__field oh-site-page-form__section-toggle">
                <div className="oh-site-page-form__field-head">
                  <span className="oh-site-page-form__label">{t("siteEditor.footerApps.showSectionInFooter")}</span>
                  <VisibilityToggle
                    label={t("siteEditor.footerApps.showAppDownloadsSectionInFooter")}
                    checked={visible}
                    onChange={(e) => setVisible(e.target.checked)}
                    disabled={saving}
                    t={t}
                  />
                </div>
              </div>

              <FormField
                label={t("siteEditor.footerApps.sectionTitleField")}
                hint={t("siteEditor.footerApps.sectionTitleHint")}
                visible={titleVisible}
                onVisibleChange={(e) => setTitleVisible(e.target.checked)}
                visibilityLabel={t("siteEditor.footerApps.showSectionTitleOnSite")}
                disabled={saving}
                t={t}
              >
                <input
                  className="oh-site-page-form__input"
                  value={titleAr}
                  onChange={(e) => setTitleAr(e.target.value)}
                  required
                  maxLength={120}
                  disabled={saving}
                  dir="rtl"
                />
              </FormField>

              <FormField
                label={t("siteEditor.footerApps.googlePlayUrl")}
                visible={googlePlayVisible}
                onVisibleChange={(e) => setGooglePlayVisible(e.target.checked)}
                visibilityLabel={t("siteEditor.footerApps.showGooglePlayOnSite")}
                disabled={saving}
                t={t}
              >
                <input
                  className="oh-site-page-form__input"
                  type="url"
                  value={googlePlayUrl}
                  onChange={(e) => setGooglePlayUrl(e.target.value)}
                  required
                  maxLength={2048}
                  disabled={saving}
                  dir="ltr"
                  placeholder="https://play.google.com/store/apps/details?id=…"
                />
              </FormField>

              <FormField
                label={t("siteEditor.footerApps.appStoreUrl")}
                visible={appStoreVisible}
                onVisibleChange={(e) => setAppStoreVisible(e.target.checked)}
                visibilityLabel={t("siteEditor.footerApps.showAppStoreOnSite")}
                disabled={saving}
                t={t}
              >
                <input
                  className="oh-site-page-form__input"
                  type="url"
                  value={appStoreUrl}
                  onChange={(e) => setAppStoreUrl(e.target.value)}
                  required
                  maxLength={2048}
                  disabled={saving}
                  dir="ltr"
                  placeholder="https://apps.apple.com/…/app/…"
                />
              </FormField>

              <div className="oh-site-page-form__actions">
                <Button type="submit" disabled={saving || !isDirty}>
                  {saving ? t("siteEditor.common.saving") : t("siteEditor.common.saveChanges")}
                </Button>
              </div>
            </div>
          </form>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
