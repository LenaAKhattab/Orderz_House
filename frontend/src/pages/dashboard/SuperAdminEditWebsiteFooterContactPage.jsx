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
import { FOOTER_CONTACT_FALLBACKS, coalesceFooterVisible } from "../../constants/footerSettings";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/siteEditorResources";
import {
  getSuperAdminFooterSettingsRequest,
  updateSuperAdminFooterContactRequest,
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

export default function SuperAdminEditWebsiteFooterContactPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState({ ...FOOTER_CONTACT_FALLBACKS });
  const [phone, setPhone] = useState(FOOTER_CONTACT_FALLBACKS.phone);
  const [email, setEmail] = useState(FOOTER_CONTACT_FALLBACKS.email);
  const [whatsapp, setWhatsapp] = useState(FOOTER_CONTACT_FALLBACKS.whatsapp);
  const [location, setLocation] = useState(FOOTER_CONTACT_FALLBACKS.location);
  const [visible, setVisible] = useState(true);
  const [phoneVisible, setPhoneVisible] = useState(true);
  const [emailVisible, setEmailVisible] = useState(true);
  const [whatsappVisible, setWhatsappVisible] = useState(true);
  const [locationVisible, setLocationVisible] = useState(true);

  const operationError = useCallback(
    (err) => err?.response?.data?.message || t("siteEditor.errors.operationFailed"),
    [t],
  );

  const applyContact = useCallback((next) => {
    const snapshot = {
      phone: next?.phone || FOOTER_CONTACT_FALLBACKS.phone,
      email: next?.email || FOOTER_CONTACT_FALLBACKS.email,
      whatsapp: next?.whatsapp || FOOTER_CONTACT_FALLBACKS.whatsapp,
      location: next?.location || FOOTER_CONTACT_FALLBACKS.location,
      visible: coalesceFooterVisible(next?.visible, true),
      phoneVisible: coalesceFooterVisible(next?.phoneVisible, true),
      emailVisible: coalesceFooterVisible(next?.emailVisible, true),
      whatsappVisible: coalesceFooterVisible(next?.whatsappVisible, true),
      locationVisible: coalesceFooterVisible(next?.locationVisible, true),
    };
    setSaved(snapshot);
    setPhone(snapshot.phone);
    setEmail(snapshot.email);
    setWhatsapp(snapshot.whatsapp);
    setLocation(snapshot.location);
    setVisible(snapshot.visible);
    setPhoneVisible(snapshot.phoneVisible);
    setEmailVisible(snapshot.emailVisible);
    setWhatsappVisible(snapshot.whatsappVisible);
    setLocationVisible(snapshot.locationVisible);
    setLoaded(true);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSuperAdminFooterSettingsRequest();
      applyContact(res?.data?.settings?.contact || null);
    } catch (err) {
      setError(operationError(err));
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [applyContact, operationError]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const isDirty =
    phone.trim() !== saved.phone.trim() ||
    email.trim() !== saved.email.trim() ||
    whatsapp.trim() !== saved.whatsapp.trim() ||
    location.trim() !== saved.location.trim() ||
    visible !== saved.visible ||
    phoneVisible !== saved.phoneVisible ||
    emailVisible !== saved.emailVisible ||
    whatsappVisible !== saved.whatsappVisible ||
    locationVisible !== saved.locationVisible;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || !isDirty) return;
    setSaving(true);
    setError("");
    try {
      const res = await updateSuperAdminFooterContactRequest({
        phone: phone.trim(),
        email: email.trim(),
        whatsapp: whatsapp.trim(),
        location: location.trim(),
        visible,
        phoneVisible,
        emailVisible,
        whatsappVisible,
        locationVisible,
      });
      applyContact(res?.data?.contact || null);
      showToast({ type: "success", message: t("siteEditor.footerContact.toastSaved") });
    } catch (err) {
      setError(operationError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("siteEditor.footerContact.pageTitle")}
        description={t("siteEditor.footerContact.pageDescription")}
        breadcrumbs={editWebsiteFooterBreadcrumbs("dashboard.breadcrumbs.footerContact")}
      />

      <DashboardSection title={t("siteEditor.footerContact.sectionTitle")}>
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
                  <span className="oh-site-page-form__label">{t("siteEditor.footerContact.showSectionInFooter")}</span>
                  <VisibilityToggle
                    label={t("siteEditor.footerContact.showContactSectionInFooter")}
                    checked={visible}
                    onChange={(e) => setVisible(e.target.checked)}
                    disabled={saving}
                    t={t}
                  />
                </div>
              </div>

              <FormField
                label={t("siteEditor.footerContact.phone")}
                visible={phoneVisible}
                onVisibleChange={(e) => setPhoneVisible(e.target.checked)}
                disabled={saving}
                t={t}
              >
                <input
                  className="oh-site-page-form__input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  maxLength={40}
                  disabled={saving}
                  dir="ltr"
                />
              </FormField>

              <FormField
                label={t("siteEditor.footerContact.email")}
                visible={emailVisible}
                onVisibleChange={(e) => setEmailVisible(e.target.checked)}
                disabled={saving}
                t={t}
              >
                <input
                  className="oh-site-page-form__input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={255}
                  disabled={saving}
                  dir="ltr"
                />
              </FormField>

              <FormField
                label={t("siteEditor.footerContact.whatsapp")}
                visible={whatsappVisible}
                onVisibleChange={(e) => setWhatsappVisible(e.target.checked)}
                disabled={saving}
                t={t}
              >
                <input
                  className="oh-site-page-form__input"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  required
                  maxLength={40}
                  disabled={saving}
                  dir="ltr"
                />
              </FormField>

              <FormField
                label={t("siteEditor.footerContact.location")}
                visible={locationVisible}
                onVisibleChange={(e) => setLocationVisible(e.target.checked)}
                disabled={saving}
                t={t}
              >
                <input
                  className="oh-site-page-form__input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                  maxLength={200}
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
