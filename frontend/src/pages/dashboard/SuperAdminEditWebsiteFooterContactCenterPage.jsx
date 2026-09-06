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
import {
  getSuperAdminFooterSettingsRequest,
  updateSuperAdminFooterContactCenterRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import "./superAdminSitePages.css";

function errorMessage(err) {
  return err?.response?.data?.message || "تعذر تنفيذ العملية. حاول مجدداً.";
}

function VisibilityToggle({ label, checked, onChange, disabled }) {
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
      <span>{checked ? "ظاهر" : "مخفي"}</span>
    </label>
  );
}

function FormField({ label, visible, onVisibleChange, visibilityLabel, children, disabled }) {
  return (
    <div className="oh-site-page-form__field">
      <div className="oh-site-page-form__field-head">
        <span className="oh-site-page-form__label">{label}</span>
        <VisibilityToggle
          label={visibilityLabel || `إظهار ${label} في الموقع`}
          checked={visible}
          onChange={onVisibleChange}
          disabled={disabled}
        />
      </div>
      {children}
    </div>
  );
}

export default function SuperAdminEditWebsiteFooterContactCenterPage() {
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
      setError(errorMessage(err));
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [applyContactCenter]);

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
      showToast({ type: "success", message: "تم حفظ مركز التواصل بنجاح." });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="مركز التواصل"
        description="تعديل محتوى مركز التواصل الظاهر في تذييل الموقع."
        breadcrumbs={editWebsiteFooterBreadcrumbs("dashboard.breadcrumbs.footerContactCenter")}
      />

      <DashboardSection title="مركز التواصل">
        <p className="oh-site-pages-toolbar__hint" style={{ marginBottom: 12 }}>
          <Link to={FOOTER_EDIT_BASE}>← العودة إلى أقسام التذييل</Link>
        </p>
        {loading ? <DashboardLoadingState label="جاري تحميل الإعدادات…" /> : null}
        {!loading && error && !loaded ? (
          <DashboardErrorState
            message={error}
            actions={
              <Button type="button" variant="secondary" onClick={loadSettings}>
                إعادة المحاولة
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
                  <span className="oh-site-page-form__label">إظهار مركز التواصل في تذييل الموقع</span>
                  <VisibilityToggle
                    label="إظهار مركز التواصل في تذييل الموقع"
                    checked={visible}
                    onChange={(e) => setVisible(e.target.checked)}
                    disabled={saving}
                  />
                </div>
              </div>

              <FormField
                label="النص التوضيحي"
                visible={helperTextVisible}
                onVisibleChange={(e) => setHelperTextVisible(e.target.checked)}
                visibilityLabel="إظهار النص التوضيحي"
                disabled={saving}
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
                label="نص الزر"
                visible={buttonVisible}
                onVisibleChange={(e) => setButtonVisible(e.target.checked)}
                visibilityLabel="إظهار زر مركز التواصل"
                disabled={saving}
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
                زر مركز التواصل يوجّه دائماً إلى صفحة المشاكل والاقتراحات حسب دور المستخدم، أو إلى تسجيل الدخول
                للزائر.
              </p>

              <div className="oh-site-page-form__actions">
                <Button type="submit" disabled={saving || !isDirty}>
                  {saving ? "جاري الحفظ…" : "حفظ التعديلات"}
                </Button>
              </div>
            </div>
          </form>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}

