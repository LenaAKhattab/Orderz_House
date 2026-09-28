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
  FOOTER_WORKING_HOURS_FALLBACKS,
  coalesceFooterVisible,
} from "../../constants/footerSettings";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/siteEditorResources";
import {
  getSuperAdminFooterSettingsRequest,
  updateSuperAdminFooterWorkingHoursRequest,
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

export default function SuperAdminEditWebsiteFooterHoursPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState({ ...FOOTER_WORKING_HOURS_FALLBACKS });
  const [title, setTitle] = useState(FOOTER_WORKING_HOURS_FALLBACKS.title);
  const [text, setText] = useState(FOOTER_WORKING_HOURS_FALLBACKS.text);
  const [visible, setVisible] = useState(true);
  const [titleVisible, setTitleVisible] = useState(true);
  const [textVisible, setTextVisible] = useState(true);

  const operationError = useCallback(
    (err) => err?.response?.data?.message || t("siteEditor.errors.operationFailed"),
    [t],
  );

  const applyHours = useCallback((next) => {
    const snapshot = {
      title: next?.title || FOOTER_WORKING_HOURS_FALLBACKS.title,
      text: next?.text || FOOTER_WORKING_HOURS_FALLBACKS.text,
      visible: coalesceFooterVisible(next?.visible, true),
      titleVisible: coalesceFooterVisible(next?.titleVisible, true),
      textVisible: coalesceFooterVisible(next?.textVisible, true),
    };
    setSaved(snapshot);
    setTitle(snapshot.title);
    setText(snapshot.text);
    setVisible(snapshot.visible);
    setTitleVisible(snapshot.titleVisible);
    setTextVisible(snapshot.textVisible);
    setLoaded(true);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSuperAdminFooterSettingsRequest();
      applyHours(res?.data?.settings?.workingHours || null);
    } catch (err) {
      setError(operationError(err));
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [applyHours, operationError]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const isDirty =
    title.trim() !== saved.title.trim() ||
    text.trim() !== saved.text.trim() ||
    visible !== saved.visible ||
    titleVisible !== saved.titleVisible ||
    textVisible !== saved.textVisible;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || !isDirty) return;
    setSaving(true);
    setError("");
    try {
      const res = await updateSuperAdminFooterWorkingHoursRequest({
        title: title.trim(),
        text: text.trim(),
        visible,
        titleVisible,
        textVisible,
      });
      applyHours(res?.data?.workingHours || null);
      showToast({ type: "success", message: t("siteEditor.footerHours.toastSaved") });
    } catch (err) {
      setError(operationError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("siteEditor.footerHours.pageTitle")}
        description={t("siteEditor.footerHours.pageDescription")}
        breadcrumbs={editWebsiteFooterBreadcrumbs("dashboard.breadcrumbs.footerWorkingHours")}
      />

      <DashboardSection title={t("siteEditor.footerHours.sectionTitle")}>
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
                  <span className="oh-site-page-form__label">{t("siteEditor.footerHours.showSectionInFooter")}</span>
                  <VisibilityToggle
                    label={t("siteEditor.footerHours.showWorkingHoursSectionInFooter")}
                    checked={visible}
                    onChange={(e) => setVisible(e.target.checked)}
                    disabled={saving}
                    t={t}
                  />
                </div>
              </div>

              <FormField
                label={t("siteEditor.footerHours.sectionTitleField")}
                visible={titleVisible}
                onVisibleChange={(e) => setTitleVisible(e.target.checked)}
                disabled={saving}
                t={t}
              >
                <input
                  className="oh-site-page-form__input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={120}
                  disabled={saving}
                />
              </FormField>

              <FormField
                label={t("siteEditor.footerHours.textField")}
                visible={textVisible}
                onVisibleChange={(e) => setTextVisible(e.target.checked)}
                visibilityLabel={t("siteEditor.footerHours.showHoursTextOnSite")}
                disabled={saving}
                t={t}
              >
                <textarea
                  className="oh-site-page-form__textarea"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  required
                  maxLength={500}
                  rows={3}
                  disabled={saving}
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
