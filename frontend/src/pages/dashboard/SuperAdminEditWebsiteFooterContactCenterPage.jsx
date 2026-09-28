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
  FOOTER_CONTACT_CENTER_FALLBACKS,
  coalesceFooterVisible,
} from "../../constants/footerSettings";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/siteEditorResources";
import {
  getSuperAdminFooterSettingsRequest,
  updateSuperAdminFooterContactCenterRequest,
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

function FormField({ label, visible, onVisibleChange, visibilityLabel, children, disabled, t }) {
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
    </div>
  );
}

export default function SuperAdminEditWebsiteFooterContactCenterPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState({ ...FOOTER_CONTACT_CENTER_FALLBACKS });
  const [helperText, setHelperText] = useState(FOOTER_CONTACT_CENTER_FALLBACKS.helperText);
  const [buttonText, setButtonText] = useState(FOOTER_CONTACT_CENTER_FALLBACKS.buttonText);
  const [visible, setVisible] = useState(true);
  const [helperTextVisible, setHelperTextVisible] = useState(true);
  const [buttonVisible, setButtonVisible] = useState(true);

  const operationError = useCallback(
    (err) => err?.response?.data?.message || t("siteEditor.errors.operationFailed"),
    [t],
  );

  const applyContactCenter = useCallback((next) => {
    const snapshot = {
      helperText: next?.helperText || FOOTER_CONTACT_CENTER_FALLBACKS.helperText,
      buttonText: next?.buttonText || FOOTER_CONTACT_CENTER_FALLBACKS.buttonText,
      visible: coalesceFooterVisible(next?.visible, true),
      helperTextVisible: coalesceFooterVisible(next?.helperTextVisible, true),
      buttonVisible: coalesceFooterVisible(next?.buttonVisible, true),
    };
    setSaved(snapshot);
    setHelperText(snapshot.helperText);
    setButtonText(snapshot.buttonText);
    setVisible(snapshot.visible);
    setHelperTextVisible(snapshot.helperTextVisible);
    setButtonVisible(snapshot.buttonVisible);
    setLoaded(true);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSuperAdminFooterSettingsRequest();
      applyContactCenter(res?.data?.settings?.contactCenter || null);
    } catch (err) {
      setError(operationError(err));
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [applyContactCenter, operationError]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const isDirty =
    helperText.trim() !== saved.helperText.trim() ||
    buttonText.trim() !== saved.buttonText.trim() ||
    visible !== saved.visible ||
    helperTextVisible !== saved.helperTextVisible ||
    buttonVisible !== saved.buttonVisible;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || !isDirty) return;
    setSaving(true);
    setError("");
    try {
      const res = await updateSuperAdminFooterContactCenterRequest({
        helperText: helperText.trim(),
        buttonText: buttonText.trim(),
        visible,
        helperTextVisible,
        buttonVisible,
      });
      applyContactCenter(res?.data?.contactCenter || null);
      showToast({ type: "success", message: t("siteEditor.footerContactCenter.toastSaved") });
    } catch (err) {
      setError(operationError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("siteEditor.footerContactCenter.pageTitle")}
        description={t("siteEditor.footerContactCenter.pageDescription")}
        breadcrumbs={editWebsiteFooterBreadcrumbs("dashboard.breadcrumbs.footerContactCenter")}
      />

      <DashboardSection title={t("siteEditor.footerContactCenter.sectionTitle")}>
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
                  <span className="oh-site-page-form__label">
                    {t("siteEditor.footerContactCenter.showContactCenterInFooter")}
                  </span>
                  <VisibilityToggle
                    label={t("siteEditor.footerContactCenter.showContactCenterInFooter")}
                    checked={visible}
                    onChange={(e) => setVisible(e.target.checked)}
                    disabled={saving}
                    t={t}
                  />
                </div>
              </div>

              <FormField
                label={t("siteEditor.footerContactCenter.helperTextLabel")}
                visible={helperTextVisible}
                onVisibleChange={(e) => setHelperTextVisible(e.target.checked)}
                visibilityLabel={t("siteEditor.footerContactCenter.showHelperText")}
                disabled={saving}
                t={t}
              >
                <input
                  className="oh-site-page-form__input"
                  value={helperText}
                  onChange={(e) => setHelperText(e.target.value)}
                  required
                  maxLength={200}
                  disabled={saving}
                />
              </FormField>

              <FormField
                label={t("siteEditor.footerContactCenter.buttonTextLabel")}
                visible={buttonVisible}
                onVisibleChange={(e) => setButtonVisible(e.target.checked)}
                visibilityLabel={t("siteEditor.footerContactCenter.showContactCenterButton")}
                disabled={saving}
                t={t}
              >
                <input
                  className="oh-site-page-form__input"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  required
                  maxLength={120}
                  disabled={saving}
                />
              </FormField>

              <p className="oh-site-pages-toolbar__hint" style={{ marginTop: 4, marginBottom: 12 }}>
                {t("siteEditor.footerContactCenter.buttonBehaviorHint")}
              </p>

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
