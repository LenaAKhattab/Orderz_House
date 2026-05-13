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
import { breadcrumbHomeFromUser } from "../../components/dashboard/dashboardBreadcrumbs";
import "./shared/account-pages.css";

const PHONE_RE = /^\+[1-9]\d{7,14}$/;

export default function StaffAccountSettingsPage({ heroKicker, heroTitle, heroLead }) {
  const { refreshUser, user: authUser } = useAuth();
  const { toast } = useToast();
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
      setError(e?.response?.data?.message || e?.message || "تعذّر التحميل.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const validate = () => {
    const full = [firstName, fatherName, familyName].join(" ").trim();
    if (full.length < 2) {
      toast.error("الاسم الكامل يجب أن يكون حرفين على الأقل.");
      return false;
    }
    if (!PHONE_RE.test(String(phone || "").trim())) {
      toast.error("رقم الجوال يجب أن يكون بالصيغة الدولية.");
      return false;
    }
    if (!PHONE_RE.test(String(whatsApp || "").trim())) {
      toast.error("رقم واتساب يجب أن يكون بالصيغة الدولية.");
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
      toast.error("حجم الصورة كبير جداً.");
      return;
    }
    setAvatarBusy(true);
    try {
      await patchProfileAvatarRequest(file);
      await refreshUser();
      await load();
      toast.success("تم تحديث الصورة.");
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "فشل الرفع.");
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
        <div className="oh-account-skel" style={{ height: 100, borderRadius: 18 }} />
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
        eyebrow={heroKicker}
        title={heroTitle}
        description={heroLead}
        breadcrumbs={[
          { label: "الرئيسية", href: breadcrumbHomeFromUser(authUser) },
          { label: "إعدادات الحساب" },
        ]}
      />

      <div className="oh-account-card" style={{ marginBottom: 16 }}>
        <h2 className="oh-account-card__title">الصورة</h2>
        <div className="oh-account-avatar-row">
          <label className="oh-account-btn-ghost" style={{ cursor: avatarBusy ? "wait" : "pointer" }}>
            {avatarBusy ? "جاري…" : "رفع صورة"}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={avatarBusy} onChange={onAvatarPick} />
          </label>
          <button type="button" className="oh-account-btn-ghost" disabled={avatarBusy} onClick={onAvatarClear}>
            إزالة الصورة
          </button>
        </div>
      </div>

      <div className="oh-account-card" style={{ marginBottom: 16 }}>
        <h2 className="oh-account-card__title">البيانات الأساسية</h2>
        <div className="oh-account-form-grid oh-account-form-grid--2">
          <div>
            <label className="oh-account-label">الاسم الأول</label>
            <input className="oh-account-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label">اسم الأب</label>
            <input className="oh-account-input" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label">العائلة</label>
            <input className="oh-account-input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label">البريد</label>
            <input className="oh-account-input" disabled readOnly value={authUser?.email || ""} />
          </div>
          <div>
            <label className="oh-account-label">الجوال</label>
            <input className="oh-account-input" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="oh-account-label">واتساب</label>
            <input className="oh-account-input" dir="ltr" value={whatsApp} onChange={(e) => setWhatsApp(e.target.value)} />
          </div>
        </div>
        <p className="oh-account-value" style={{ marginTop: 10, fontSize: "0.82rem", color: "#6b7280" }}>
          البريد للعرض فقط؛ لتغييره يجب توفر آلية منفصلة من الدعم أو النظام لاحقاً.
        </p>
        <div className="oh-account-actions">
          <button type="button" className="oh-account-btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? "جاري الحفظ…" : "حفظ"}
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
              <label className="oh-account-label">تأكيد</label>
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
          <button type="button" className="oh-account-btn-primary" disabled={pwSaving} onClick={handleSavePassword}>
            {pwSaving ? "جاري التحديث…" : "تحديث كلمة المرور"}
          </button>
        </div>
      </div>

      <div className="oh-account-card">
        <h2 className="oh-account-card__title">تفضيلات الإشعارات</h2>
        {[
          ["general", "إشعارات عامة"],
          ["orders", "إشعارات الطلبات والأنشطة"],
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
        <p className="oh-account-empty" style={{ marginTop: 12 }}>
          تخزين التفضيلات في قاعدة البيانات؛ التطبيق الفعلي على قنوات الإشعار يعتمد على إعدادات الخادم.
        </p>
        <div className="oh-account-actions">
          <button type="button" className="oh-account-btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? "جاري الحفظ…" : "حفظ التفضيلات"}
          </button>
        </div>
      </div>
    </div>
  );
}
