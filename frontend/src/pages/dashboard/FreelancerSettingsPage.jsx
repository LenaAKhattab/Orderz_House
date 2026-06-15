import { useCallback, useEffect, useMemo, useState } from "react";
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
import BrowserNotificationSettings from "../../components/notifications/BrowserNotificationSettings";
import { breadcrumbHomeCrumb } from "../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../i18n/LanguageProvider";
import "./shared/account-pages.css";

const PHONE_RE = /^\+[1-9]\d{7,14}$/;
const URL_OPTIONAL = (s) => {
  const t = String(s || "").trim();
  if (!t) return "";
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
};

export default function FreelancerSettingsPage() {
  const { refreshUser, user } = useAuth();
  const { t, dir } = useTranslation();
  const s = "freelancerDashboard.settings";
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsApp, setWhatsApp] = useState("");
  const [professionalTitle, setProfessionalTitle] = useState("");
  const [bio, setBio] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [behanceUrl, setBehanceUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [preferredWithdrawalMethod, setPreferredWithdrawalMethod] = useState("");
  const [payoutNotesHint, setPayoutNotesHint] = useState("");
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
        setProfessionalTitle(u.professionalTitle || "");
        setBio(u.bio || "");
        setSkillsText(Array.isArray(u.skills) ? u.skills.join("، ") : "");
        setWebsiteUrl(u.websiteUrl || "");
        setLinkedinUrl(u.linkedinUrl || "");
        setGithubUrl(u.githubUrl || "");
        setBehanceUrl(u.behanceUrl || "");
        setPortfolioUrl(u.portfolioUrl || "");
        setPreferredWithdrawalMethod(u.preferredWithdrawalMethod || "");
        setPayoutNotesHint(u.payoutNotesHint || "");
        setNotif(mergeNotificationPrefs(u.notificationPreferences));
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || t(`${s}.loadError`));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const skillsArray = useMemo(() => {
    const parts = String(skillsText || "")
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const p of parts) {
      const k = p.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p.slice(0, 80));
      if (out.length >= 50) break;
    }
    return out;
  }, [skillsText]);

  const validateBasic = () => {
    const full = [firstName, fatherName, familyName].join(" ").trim();
    if (full.length < 2) {
      toast.error(t(`${s}.basic.nameTooShort`));
      return false;
    }
    if (!PHONE_RE.test(String(phone || "").trim())) {
      toast.error(t(`${s}.basic.phoneInvalid`));
      return false;
    }
    if (!PHONE_RE.test(String(whatsApp || "").trim())) {
      toast.error(t(`${s}.basic.whatsappInvalid`));
      return false;
    }
    const urls = [
      [t(`${s}.basic.website`), websiteUrl],
      ["LinkedIn", linkedinUrl],
      ["GitHub", githubUrl],
      ["Behance", behanceUrl],
      [t(`${s}.basic.portfolio`), portfolioUrl],
    ];
    for (const [label, raw] of urls) {
      const val = String(raw || "").trim();
      if (val && !URL_OPTIONAL(val)) {
        toast.error(t(`${s}.basic.urlInvalid`, { label }));
        return false;
      }
    }
    if (bio.length > 2000) {
      toast.error(t(`${s}.basic.bioTooLong`));
      return false;
    }
    return true;
  };

  const handleSaveProfile = async () => {
    if (!validateBasic()) return;
    setSaving(true);
    try {
      await patchProfileMeRequest({
        firstName: firstName.trim(),
        fatherName: fatherName.trim(),
        familyName: familyName.trim(),
        phone: phone.trim(),
        whatsApp: whatsApp.trim(),
        professionalTitle: professionalTitle.trim() || null,
        bio: bio.trim() || null,
        skills: skillsArray,
        websiteUrl: websiteUrl.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
        githubUrl: githubUrl.trim() || null,
        behanceUrl: behanceUrl.trim() || null,
        portfolioUrl: portfolioUrl.trim() || null,
        preferredWithdrawalMethod: preferredWithdrawalMethod.trim() || null,
        payoutNotesHint: payoutNotesHint.trim() || null,
        notificationPreferences: notif,
      });
      await refreshUser();
      toast.success(t(`${s}.basic.saveSuccess`));
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t(`${s}.basic.saveError`));
    } finally {
      setSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error(t(`${s}.security.mismatch`));
      return;
    }
    if (String(newPassword || "").length < 8) {
      toast.error(t(`${s}.security.tooShort`));
      return;
    }
    setPwSaving(true);
    try {
      await patchProfilePasswordRequest({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(t(`${s}.security.success`));
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t(`${s}.security.error`));
    } finally {
      setPwSaving(false);
    }
  };

  const onAvatarPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t(`${s}.avatar.sizeError`));
      return;
    }
    setAvatarBusy(true);
    try {
      await patchProfileAvatarRequest(file);
      await refreshUser();
      await load();
      toast.success(t(`${s}.avatar.success`));
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || t(`${s}.avatar.uploadError`));
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
      toast.success(t(`${s}.avatar.removeSuccess`));
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || t(`${s}.avatar.removeError`));
    } finally {
      setAvatarBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="oh-account-page" dir={dir}>
        <div className="oh-account-hero">
          <div className="oh-account-skel" style={{ height: 28, width: "50%" }} />
        </div>
        <div className="oh-account-card">
          <div className="oh-account-skel" style={{ height: 320 }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="oh-account-page" dir={dir}>
        <div className="oh-account-card">
          <p className="oh-account-error" style={{ margin: 0 }}>
            {error}
          </p>
          <button type="button" className="oh-account-btn-primary" style={{ marginTop: 12 }} onClick={load}>
            {t("freelancerDashboard.common.retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="oh-account-page" dir={dir}>
      <DashboardPageHeader
        eyebrow={t(`${s}.eyebrow`)}
        title={t(`${s}.title`)}
        description={t(`${s}.description`)}
        breadcrumbs={[
          breadcrumbHomeCrumb(user),
          { label: t(`${s}.breadcrumb`) },
        ]}
      />

      <div className="oh-account-card" style={{ marginBottom: 16 }}>
        <h2 className="oh-account-card__title">{t(`${s}.avatar.title`)}</h2>
        <div className="oh-account-avatar-row">
          <label className="oh-account-btn-ghost" style={{ cursor: avatarBusy ? "wait" : "pointer" }}>
            {avatarBusy ? t(`${s}.avatar.uploading`) : t(`${s}.avatar.upload`)}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={avatarBusy} onChange={onAvatarPick} />
          </label>
          <button type="button" className="oh-account-btn-ghost" disabled={avatarBusy} onClick={onAvatarClear}>
            {t(`${s}.avatar.remove`)}
          </button>
        </div>
        <p className="oh-account-value" style={{ marginTop: 10, fontSize: "0.85rem", color: "#6b7280" }}>
          {t(`${s}.avatar.hint`)}
        </p>
      </div>

      <div className="oh-account-card" style={{ marginBottom: 16 }}>
        <h2 className="oh-account-card__title">{t(`${s}.basic.title`)}</h2>
        <div className="oh-account-form-grid oh-account-form-grid--2">
          <div>
            <label className="oh-account-label" htmlFor="fn">
              {t(`${s}.basic.firstName`)}
            </label>
            <input id="fn" className="oh-account-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label" htmlFor="fan">
              {t(`${s}.basic.fatherName`)}
            </label>
            <input id="fan" className="oh-account-input" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label" htmlFor="fam">
              {t(`${s}.basic.familyName`)}
            </label>
            <input id="fam" className="oh-account-input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label" htmlFor="pt">
              {t(`${s}.basic.professionalTitle`)}
            </label>
            <input
              id="pt"
              className="oh-account-input"
              value={professionalTitle}
              onChange={(e) => setProfessionalTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="oh-account-label" htmlFor="ph">
              {t(`${s}.basic.phone`)}
            </label>
            <input id="ph" className="oh-account-input" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label" htmlFor="wa">
              {t(`${s}.basic.whatsapp`)}
            </label>
            <input id="wa" className="oh-account-input" dir="ltr" value={whatsApp} onChange={(e) => setWhatsApp(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label className="oh-account-label" htmlFor="bio">
            {t(`${s}.basic.bio`)}
          </label>
          <textarea id="bio" className="oh-account-textarea" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} />
        </div>
        <div style={{ marginTop: 14 }}>
          <label className="oh-account-label" htmlFor="sk">
            {t(`${s}.basic.skills`)}
          </label>
          <textarea id="sk" className="oh-account-textarea" style={{ minHeight: 72 }} value={skillsText} onChange={(e) => setSkillsText(e.target.value)} />
        </div>
        <div className="oh-account-form-grid" style={{ marginTop: 14 }}>
          <div>
            <label className="oh-account-label">{t(`${s}.basic.website`)}</label>
            <input className="oh-account-input" dir="ltr" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://" />
          </div>
          <div>
            <label className="oh-account-label">LinkedIn</label>
            <input className="oh-account-input" dir="ltr" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label">GitHub</label>
            <input className="oh-account-input" dir="ltr" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label">Behance</label>
            <input className="oh-account-input" dir="ltr" value={behanceUrl} onChange={(e) => setBehanceUrl(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label">{t(`${s}.basic.portfolio`)}</label>
            <input className="oh-account-input" dir="ltr" value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} />
          </div>
        </div>
        <div className="oh-account-actions">
          <button type="button" className="oh-account-btn-primary" disabled={saving} onClick={handleSaveProfile}>
            {saving ? t(`${s}.basic.saving`) : t(`${s}.basic.save`)}
          </button>
        </div>
      </div>

      <div className="oh-account-card" style={{ marginBottom: 16 }}>
        <h2 className="oh-account-card__title">{t(`${s}.payout.title`)}</h2>
        <p className="oh-account-value" style={{ marginBottom: 12, fontSize: "0.88rem", color: "#5a6378" }}>
          {t(`${s}.payout.hint`)}
        </p>
        <div className="oh-account-form-grid oh-account-form-grid--2">
          <div>
            <label className="oh-account-label" htmlFor="wm">
              {t(`${s}.payout.method`)}
            </label>
            <select
              id="wm"
              className="oh-account-select"
              value={preferredWithdrawalMethod}
              onChange={(e) => setPreferredWithdrawalMethod(e.target.value)}
            >
              <option value="">{t(`${s}.payout.methodPlaceholder`)}</option>
              <option value="bank_transfer">{t(`${s}.payout.bankTransfer`)}</option>
              <option value="wallet">{t(`${s}.payout.wallet`)}</option>
              <option value="cash">{t(`${s}.payout.cash`)}</option>
              <option value="other">{t(`${s}.payout.other`)}</option>
            </select>
          </div>
          <div>
            <label className="oh-account-label" htmlFor="pn">
              {t(`${s}.payout.notes`)}
            </label>
            <input
              id="pn"
              className="oh-account-input"
              value={payoutNotesHint}
              onChange={(e) => setPayoutNotesHint(e.target.value)}
              placeholder={t(`${s}.payout.notesPlaceholder`)}
            />
          </div>
        </div>
        <div className="oh-account-actions">
          <button type="button" className="oh-account-btn-primary" disabled={saving} onClick={handleSaveProfile}>
            {saving ? t(`${s}.basic.saving`) : t(`${s}.payout.save`)}
          </button>
        </div>
      </div>

      <div className="oh-account-card" style={{ marginBottom: 16 }}>
        <h2 className="oh-account-card__title">{t(`${s}.security.title`)}</h2>
        <div className="oh-account-form-grid">
          <div>
            <label className="oh-account-label">{t(`${s}.security.currentPassword`)}</label>
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
              <label className="oh-account-label">{t(`${s}.security.newPassword`)}</label>
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
              <label className="oh-account-label">{t(`${s}.security.confirmPassword`)}</label>
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
        <p className="oh-account-value" style={{ fontSize: "0.82rem", color: "#6b7280" }}>
          {t(`${s}.security.hint`)}
        </p>
        <div className="oh-account-actions">
          <button type="button" className="oh-account-btn-primary" disabled={pwSaving} onClick={handleSavePassword}>
            {pwSaving ? t(`${s}.security.updating`) : t(`${s}.security.update`)}
          </button>
        </div>
      </div>

      <BrowserNotificationSettings />

      <div className="oh-account-card">
        <h2 className="oh-account-card__title">{t(`${s}.notifications.title`)}</h2>
        {[
          ["orders", t(`${s}.notifications.orders`)],
          ["claims", t(`${s}.notifications.claims`)],
          ["courses", t(`${s}.notifications.courses`)],
        ].map(([key, label]) => (
          <div key={key} className="oh-account-toggle">
            <span className="oh-account-value" style={{ fontWeight: 800 }}>
              {label}
            </span>
            <input
              type="checkbox"
              className="oh-account-switch"
              checked={Boolean(notif[key])}
              onChange={(e) => setNotif((prev) => ({ ...prev, [key]: e.target.checked }))}
            />
          </div>
        ))}
        <div className="oh-account-actions">
          <button type="button" className="oh-account-btn-primary" disabled={saving} onClick={handleSaveProfile}>
            {saving ? t(`${s}.basic.saving`) : t(`${s}.notifications.save`)}
          </button>
        </div>
      </div>
    </div>
  );
}
