import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/ToastContext.jsx";
import {
  deleteProfileAvatarRequest,
  getProfileMeRequest,
  patchProfileAvatarRequest,
  patchProfileMeRequest,
  patchProfilePasswordRequest,
} from "../../services/api";
import { mergeNotificationPrefs } from "../../utils/accountDisplay";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import BrowserNotificationSettings from "../../components/notifications/BrowserNotificationSettings";
import { breadcrumbHomeCrumb } from "../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/opsAdminResources";
import "./shared/account-pages.css";

const PHONE_RE = /^\+[1-9]\d{7,14}$/;

export default function StaffAccountSettingsPage({ heroKicker, heroTitle, heroLead }) {
  const { refreshUser, user: authUser } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsApp, setWhatsApp] = useState("");
  const [notif, setNotif] = useState(() => mergeNotificationPrefs({}));

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getProfileMeRequest();
      const u = data?.data?.user;
      if (u) {
        setFirstName(u.firstName || "");
        setFatherName(u.fatherName || "");
        setFamilyName(u.familyName || "");
        setPhone(u.phone || "");
        setWhatsApp(u.whatsApp || "");
        setNotif(mergeNotificationPrefs(u.notificationPreferences));
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || t("opsAdmin.staffAccount.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const validate = () => {
    const full = [firstName, fatherName, familyName].join(" ").trim();
    if (full.length < 2) {
      toast.error(t("opsAdmin.staffAccount.errNameMin"));
      return false;
    }
    if (!PHONE_RE.test(String(phone || "").trim())) {
      toast.error(t("opsAdmin.staffAccount.errPhoneIntl"));
      return false;
    }
    if (!PHONE_RE.test(String(whatsApp || "").trim())) {
      toast.error(t("opsAdmin.staffAccount.errWhatsAppIntl"));
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await patchProfileMeRequest({
        firstName: firstName.trim(),
        fatherName: fatherName.trim(),
        familyName: familyName.trim(),
        phone: phone.trim(),
        whatsApp: whatsApp.trim(),
        notificationPreferences: notif,
      });
      await refreshUser();
      toast.success(t("opsAdmin.staffAccount.savedSettings"));
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t("opsAdmin.staffAccount.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error(t("opsAdmin.staffAccount.errPasswordMismatch"));
      return;
    }
    setPwSaving(true);
    try {
      await patchProfilePasswordRequest({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(t("opsAdmin.staffAccount.passwordUpdated"));
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t("opsAdmin.staffAccount.passwordChangeFailed"));
    } finally {
      setPwSaving(false);
    }
  };

  const onAvatarPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("opsAdmin.staffAccount.errImageLarge"));
      return;
    }
    setAvatarBusy(true);
    try {
      await patchProfileAvatarRequest(file);
      await refreshUser();
      await load();
      toast.success(t("opsAdmin.staffAccount.avatarUpdated"));
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || t("opsAdmin.staffAccount.uploadFailed"));
    } finally {
      setAvatarBusy(false);
    }
  };

  const onAvatarClear = async () => {
    setAvatarBusy(true);
    try {
      await deleteProfileAvatarRequest();
      await refreshUser();
      await load();
      toast.success(t("opsAdmin.staffAccount.avatarRemoved"));
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || t("opsAdmin.staffAccount.removeFailed"));
    } finally {
      setAvatarBusy(false);
    }
  };

  if (loading) {
    return (
      <DashboardShell className="oh-account-page oh-account-page--staff">
        <DashboardLoadingState label={t("opsAdmin.staffAccount.loadingLabel")} rows={5} />
      </DashboardShell>
    );
  }

  if (error) {
    return (
      <DashboardShell className="oh-account-page oh-account-page--staff">
        <DashboardEmptyState
          title={t("opsAdmin.staffAccount.loadErrorTitle")}
          description={error}
          actions={
            <button type="button" className="btn btn-primary" onClick={load}>
              {t("opsAdmin.common.retry")}
            </button>
          }
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="oh-account-page oh-account-page--staff">
      <DashboardPageHeader
        eyebrow={heroKicker}
        title={heroTitle}
        description={heroLead}
        breadcrumbs={[
          breadcrumbHomeCrumb(authUser),
          { label: t("opsAdmin.staffAccount.breadcrumb") },
        ]}
      />

      <DashboardSection title={t("opsAdmin.staffAccount.sectionPhoto")}>
        <div className="oh-account-avatar-row">
          <label className="btn btn-secondary" style={{ cursor: avatarBusy ? "wait" : "pointer" }}>
            {avatarBusy ? t("opsAdmin.staffAccount.uploading") : t("opsAdmin.staffAccount.uploadPhoto")}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={avatarBusy} onChange={onAvatarPick} />
          </label>
          <button type="button" className="btn btn-secondary" disabled={avatarBusy} onClick={onAvatarClear}>
            {t("opsAdmin.staffAccount.removePhoto")}
          </button>
        </div>
      </DashboardSection>

      <DashboardSection title={t("opsAdmin.staffAccount.sectionProfile")}>
        <div className="oh-account-form-grid oh-account-form-grid--2">
          <div>
            <label className="oh-account-label">{t("opsAdmin.staffAccount.firstName")}</label>
            <input className="oh-account-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label">{t("opsAdmin.staffAccount.fatherName")}</label>
            <input className="oh-account-input" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label">{t("opsAdmin.staffAccount.familyName")}</label>
            <input className="oh-account-input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label">{t("opsAdmin.staffAccount.email")}</label>
            <input className="oh-account-input" disabled readOnly value={authUser?.email || ""} />
          </div>
          <div>
            <label className="oh-account-label">{t("opsAdmin.staffAccount.phone")}</label>
            <input className="oh-account-input" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label">{t("opsAdmin.staffAccount.whatsapp")}</label>
            <input className="oh-account-input" dir="ltr" value={whatsApp} onChange={(e) => setWhatsApp(e.target.value)} />
          </div>
        </div>
        <p className="oh-account-value oh-account-page__hint">{t("opsAdmin.staffAccount.emailReadonlyHint")}</p>
        <div className="oh-account-actions">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? t("opsAdmin.staffAccount.savingProfile") : t("opsAdmin.common.save")}
          </button>
        </div>
      </DashboardSection>

      <DashboardSection title={t("opsAdmin.staffAccount.sectionSecurity")}>
        <div className="oh-account-form-grid">
          <div>
            <label className="oh-account-label">{t("opsAdmin.staffAccount.currentPassword")}</label>
            <input
              type="password"
              className="oh-account-input"
              dir="ltr"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="oh-account-form-grid oh-account-form-grid--2">
            <div>
              <label className="oh-account-label">{t("opsAdmin.staffAccount.newPassword")}</label>
              <input
                type="password"
                className="oh-account-input"
                dir="ltr"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="oh-account-label">{t("opsAdmin.staffAccount.confirmPassword")}</label>
              <input
                type="password"
                className="oh-account-input"
                dir="ltr"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="oh-account-actions">
          <button type="button" className="btn btn-primary" disabled={pwSaving} onClick={handleSavePassword}>
            {pwSaving ? t("opsAdmin.staffAccount.updatingPassword") : t("opsAdmin.staffAccount.updatePassword")}
          </button>
        </div>
      </DashboardSection>

      <BrowserNotificationSettings />

      <DashboardSection title={t("opsAdmin.staffAccount.sectionNotifPrefs")}>
        {[
          ["general", t("opsAdmin.staffAccount.notifGeneral")],
          ["orders", t("opsAdmin.staffAccount.notifOrders")],
        ].map(([key, label]) => (
          <div key={key} className="oh-account-toggle">
            <span className="oh-account-value oh-account-toggle__label">{label}</span>
            <input
              type="checkbox"
              className="oh-account-switch"
              checked={Boolean(notif[key])}
              onChange={(e) => setNotif((prev) => ({ ...prev, [key]: e.target.checked }))}
            />
          </div>
        ))}
        <p className="oh-account-empty oh-account-page__notif-note">{t("opsAdmin.staffAccount.notifDbHint")}</p>
        <div className="oh-account-actions">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? t("opsAdmin.staffAccount.savingProfile") : t("opsAdmin.staffAccount.savePrefs")}
          </button>
        </div>
      </DashboardSection>
    </DashboardShell>
  );
}
