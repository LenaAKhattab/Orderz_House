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
import {
  getSuperAdminFooterSettingsRequest,
  updateSuperAdminFooterContactRequest,
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

export default function SuperAdminEditWebsiteFooterContactPage() {
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
      setError(errorMessage(err));
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [applyContact]);

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
      showToast({ type: "success", message: "تم حفظ بيانات التواصل بنجاح." });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="تواصل معنا"
        description="عدّل بيانات التواصل الظاهرة في تذييل الموقع."
        breadcrumbs={editWebsiteFooterBreadcrumbs("dashboard.breadcrumbs.footerContact")}
      />

      <DashboardSection title="بيانات التواصل">
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
                  <span className="oh-site-page-form__label">إظهار القسم في تذييل الموقع</span>
                  <VisibilityToggle
                    label='إظهار قسم "تواصل معنا" في تذييل الموقع'
                    checked={visible}
                    onChange={(e) => setVisible(e.target.checked)}
                    disabled={saving}
                  />
                </div>
              </div>

              <FormField
                label="رقم الهاتف"
                visible={phoneVisible}
                onVisibleChange={(e) => setPhoneVisible(e.target.checked)}
                disabled={saving}
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
                label="البريد الإلكتروني"
                visible={emailVisible}
                onVisibleChange={(e) => setEmailVisible(e.target.checked)}
                disabled={saving}
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
                label="رقم واتساب"
                visible={whatsappVisible}
                onVisibleChange={(e) => setWhatsappVisible(e.target.checked)}
                disabled={saving}
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
                label="الموقع"
                visible={locationVisible}
                onVisibleChange={(e) => setLocationVisible(e.target.checked)}
                disabled={saving}
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
