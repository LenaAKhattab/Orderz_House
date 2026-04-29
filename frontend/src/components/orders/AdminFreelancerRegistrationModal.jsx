import { useEffect, useState } from "react";
import { adminGetFreelancerRegistrationRequest } from "../../services/api";
import { useToast } from "../ui/toastContext";

function formatJoDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function Row({ label, value, dir }) {
  return (
    <div className="oh-review__row" style={{ alignItems: "flex-start" }}>
      <div className="oh-review__k" style={{ minWidth: 140 }}>
        {label}
      </div>
      <div className="oh-review__v" dir={dir || "rtl"}>
        {value != null && value !== "" ? String(value) : "—"}
      </div>
    </div>
  );
}

export default function AdminFreelancerRegistrationModal({ open, freelancerUserId, onClose }) {
  const { push } = useToast();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!open || !freelancerUserId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await adminGetFreelancerRegistrationRequest(freelancerUserId);
        const p = res?.data?.profile;
        if (!cancelled) setProfile(p || null);
      } catch (e) {
        if (!cancelled) {
          setProfile(null);
          push({
            type: "error",
            title: "تعذر تحميل البيانات",
            message: e?.response?.data?.message || e?.message || "حدث خطأ.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, freelancerUserId, push]);

  if (!open) return null;

  const fullName = profile
    ? [profile.firstName, profile.fatherName, profile.familyName].filter(Boolean).join(" ").trim()
    : "";

  const categoriesText = Array.isArray(profile?.freelancerCategories)
    ? profile.freelancerCategories.filter(Boolean).join("، ")
    : "";

  return (
    <div
      role="presentation"
      className="client-order-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose?.();
      }}
    >
      <div className="client-order-modal" role="dialog" aria-modal="true" aria-labelledby="admin-fl-reg-title" dir="rtl" onMouseDown={(ev) => ev.stopPropagation()}>
        <header className="client-order-modal__head">
          <div>
            <h2 id="admin-fl-reg-title" className="client-order-modal__title">
              بيانات تسجيل المستقل
            </h2>
            <p className="client-order-modal__lead">كما أدخلها عند إنشاء الحساب (للاطلاع الإداري فقط).</p>
          </div>
          <button type="button" className="btn btn-secondary client-order-modal__close" onClick={() => !loading && onClose?.()} disabled={loading}>
            إغلاق
          </button>
        </header>

        <div className="client-order-modal__body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {loading ? (
            <p className="help">جاري التحميل…</p>
          ) : profile ? (
            <div className="oh-review" style={{ marginTop: 0 }}>
              <Row label="رقم الحساب" value={profile.accountId} dir="ltr" />
              <Row label="الاسم الكامل" value={fullName || "—"} />
              <Row label="البريد الإلكتروني" value={profile.email} dir="ltr" />
              <Row label="رمز الدولة" value={profile.country} dir="ltr" />
              <Row label="الجوال" value={profile.phone} dir="ltr" />
              <Row label="واتساب" value={profile.whatsapp} dir="ltr" />
              <Row label="الجنس" value={profile.gender} />
              <Row label="الموافقة على الشروط" value={profile.termsAccepted ? "نعم" : "لا"} />
              <Row label="تصنيفات اختارها عند التسجيل" value={categoriesText || "—"} />
              <Row label="الحساب نشط" value={profile.isActive ? "نعم" : "لا"} />
              <Row label="تاريخ التسجيل" value={formatJoDateTime(profile.createdAt)} />
            </div>
          ) : (
            <p className="help">لا توجد بيانات للعرض.</p>
          )}
        </div>
      </div>
    </div>
  );
}
