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
import { breadcrumbHomeFromUser } from "../../components/dashboard/dashboardBreadcrumbs";
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
      setError(e?.response?.data?.message || e?.message || "تعذّر التحميل.");
    } finally {
      setLoading(false);
    }
  }, []);

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
      toast.error("الاسم الكامل يجب أن يكون حرفين على الأقل.");
      return false;
    }
    if (!PHONE_RE.test(String(phone || "").trim())) {
      toast.error("رقم الجوال يجب أن يكون بالصيغة الدولية +966…");
      return false;
    }
    if (!PHONE_RE.test(String(whatsApp || "").trim())) {
      toast.error("رقم واتساب يجب أن يكون بالصيغة الدولية.");
      return false;
    }
    const urls = [
      ["الموقع", websiteUrl],
      ["LinkedIn", linkedinUrl],
      ["GitHub", githubUrl],
      ["Behance", behanceUrl],
      ["المعرض", portfolioUrl],
    ];
    for (const [label, raw] of urls) {
      const t = String(raw || "").trim();
      if (t && !URL_OPTIONAL(t)) {
        toast.error(`${label}: رابط غير صالح (استخدم http أو https).`);
        return false;
      }
    }
    if (bio.length > 2000) {
      toast.error("النبذة أطول من الحد المسموح.");
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
      toast.success("تم حفظ الإعدادات.");
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("كلمتا المرور غير متطابقتين.");
      return;
    }
    if (String(newPassword || "").length < 8) {
      toast.error("كلمة المرور الجديدة قصيرة جداً.");
      return;
    }
    setPwSaving(true);
    try {
      await patchProfilePasswordRequest({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("تم تحديث كلمة المرور.");
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "تعذّر تغيير كلمة المرور.");
    } finally {
      setPwSaving(false);
    }
  };

  const onAvatarPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("حجم الصورة يجب ألا يتجاوز 2 ميغابايت.");
      return;
    }
    setAvatarBusy(true);
    try {
      await patchProfileAvatarRequest(file);
      await refreshUser();
      await load();
      toast.success("تم تحديث الصورة.");
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "فشل رفع الصورة.");
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
      toast.success("تمت إزالة الصورة.");
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "تعذّر الإزالة.");
    } finally {
      setAvatarBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="oh-account-page" dir="rtl">
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
      <div className="oh-account-page" dir="rtl">
        <div className="oh-account-card">
          <p className="oh-account-error" style={{ margin: 0 }}>
            {error}
          </p>
          <button type="button" className="oh-account-btn-primary" style={{ marginTop: 12 }} onClick={load}>
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="oh-account-page" dir="rtl">
      <DashboardPageHeader
        eyebrow="إعدادات المستقل"
        title="إعدادات الحساب"
        description="حدّث معلوماتك العامة، أمان الحساب، والإشعارات. جميع الحقول تُحفظ عبر واجهة برمجة التطبيقات."
        breadcrumbs={[
          { label: "الرئيسية", href: breadcrumbHomeFromUser(user) },
          { label: "إعدادات الحساب" },
        ]}
      />

      <div className="oh-account-card" style={{ marginBottom: 16 }}>
        <h2 className="oh-account-card__title">الصورة الشخصية</h2>
        <div className="oh-account-avatar-row">
          <label className="oh-account-btn-ghost" style={{ cursor: avatarBusy ? "wait" : "pointer" }}>
            {avatarBusy ? "جاري…" : "رفع صورة"}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={avatarBusy} onChange={onAvatarPick} />
          </label>
          <button type="button" className="oh-account-btn-ghost" disabled={avatarBusy} onClick={onAvatarClear}>
            إزالة الصورة
          </button>
        </div>
        <p className="oh-account-value" style={{ marginTop: 10, fontSize: "0.85rem", color: "#6b7280" }}>
          JPEG أو PNG أو WebP، بحد أقصى 2 ميغابايت.
        </p>
      </div>

      <div className="oh-account-card" style={{ marginBottom: 16 }}>
        <h2 className="oh-account-card__title">المعلومات الأساسية</h2>
        <div className="oh-account-form-grid oh-account-form-grid--2">
          <div>
            <label className="oh-account-label" htmlFor="fn">
              الاسم الأول
            </label>
            <input id="fn" className="oh-account-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label" htmlFor="fan">
              اسم الأب
            </label>
            <input id="fan" className="oh-account-input" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label" htmlFor="fam">
              العائلة
            </label>
            <input id="fam" className="oh-account-input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label" htmlFor="pt">
              العنوان المهني
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
              رقم الجوال (E.164)
            </label>
            <input id="ph" className="oh-account-input" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label" htmlFor="wa">
              واتساب (E.164)
            </label>
            <input id="wa" className="oh-account-input" dir="ltr" value={whatsApp} onChange={(e) => setWhatsApp(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label className="oh-account-label" htmlFor="bio">
            نبذة (حد أقصى 2000 حرف)
          </label>
          <textarea id="bio" className="oh-account-textarea" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} />
        </div>
        <div style={{ marginTop: 14 }}>
          <label className="oh-account-label" htmlFor="sk">
            المهارات (مفصولة بفواصل)
          </label>
          <textarea id="sk" className="oh-account-textarea" style={{ minHeight: 72 }} value={skillsText} onChange={(e) => setSkillsText(e.target.value)} />
        </div>
        <div className="oh-account-form-grid" style={{ marginTop: 14 }}>
          <div>
            <label className="oh-account-label">موقع</label>
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
            <label className="oh-account-label">معرض أعمال / Portfolio</label>
            <input className="oh-account-input" dir="ltr" value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} />
          </div>
        </div>
        <div className="oh-account-actions">
          <button type="button" className="oh-account-btn-primary" disabled={saving} onClick={handleSaveProfile}>
            {saving ? "جاري الحفظ…" : "حفظ المعلومات"}
          </button>
        </div>
      </div>

      <div className="oh-account-card" style={{ marginBottom: 16 }}>
        <h2 className="oh-account-card__title">السحب والمطالبات</h2>
        <p className="oh-account-value" style={{ marginBottom: 12, fontSize: "0.88rem", color: "#5a6378" }}>
          يعرض هذا القسم تفضيلات آمنة فقط — لا تُخزَّن أرقام حسابات كاملة أو بيانات حساسة هنا.
        </p>
        <div className="oh-account-form-grid oh-account-form-grid--2">
          <div>
            <label className="oh-account-label" htmlFor="wm">
              طريقة السحب المفضلة
            </label>
            <select
              id="wm"
              className="oh-account-select"
              value={preferredWithdrawalMethod}
              onChange={(e) => setPreferredWithdrawalMethod(e.target.value)}
            >
              <option value="">— اختر —</option>
              <option value="bank_transfer">تحويل بنكي</option>
              <option value="wallet">محفظة إلكترونية</option>
              <option value="cash">استلام نقدي</option>
              <option value="other">أخرى</option>
            </select>
          </div>
          <div>
            <label className="oh-account-label" htmlFor="pn">
              ملاحظات مختصرة آمنة
            </label>
            <input
              id="pn"
              className="oh-account-input"
              value={payoutNotesHint}
              onChange={(e) => setPayoutNotesHint(e.target.value)}
              placeholder="مثال: اسم البنك فقط، دون رقم الحساب الكامل"
            />
          </div>
        </div>
        <div className="oh-account-actions">
          <button type="button" className="oh-account-btn-primary" disabled={saving} onClick={handleSaveProfile}>
            {saving ? "جاري الحفظ…" : "حفظ قسم السحب"}
          </button>
        </div>
      </div>

      <div className="oh-account-card" style={{ marginBottom: 16 }}>
        <h2 className="oh-account-card__title">الأمان</h2>
        <div className="oh-account-form-grid">
          <div>
            <label className="oh-account-label">كلمة المرور الحالية</label>
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
              <label className="oh-account-label">كلمة المرور الجديدة</label>
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
              <label className="oh-account-label">تأكيد كلمة المرور</label>
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
          يجب أن تحتوي كلمة المرور الجديدة على حرف ورقم على الأقل (8 أحرف كحد أدنى).
        </p>
        <div className="oh-account-actions">
          <button type="button" className="oh-account-btn-primary" disabled={pwSaving} onClick={handleSavePassword}>
            {pwSaving ? "جاري التحديث…" : "تحديث كلمة المرور"}
          </button>
        </div>
      </div>

      <div className="oh-account-card">
        <h2 className="oh-account-card__title">إعدادات الإشعارات</h2>
        {[
          ["orders", "إشعارات الطلبات"],
          ["claims", "إشعارات المطالبات المالية"],
          ["courses", "إشعارات الدورات"],
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
            {saving ? "جاري الحفظ…" : "حفظ تفضيلات الإشعارات"}
          </button>
        </div>
      </div>
    </div>
  );
}
