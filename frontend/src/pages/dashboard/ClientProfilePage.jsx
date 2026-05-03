import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { getProfileMeRequest } from "../../services/api";
import { fullNameAr } from "../../utils/accountDisplay";
import "./shared/account-pages.css";

export default function ClientProfilePage() {
  const { user: authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getProfileMeRequest();
      setPayload(data?.data || null);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "تعذّر تحميل الملف الشخصي.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const user = payload?.user || authUser;
  const stats = payload?.stats || {};

  const displayName = useMemo(() => fullNameAr(user) || user?.email || "", [user]);

  if (loading) {
    return (
      <div className="oh-account-page" dir="rtl">
        <div className="oh-account-hero">
          <div className="oh-account-skel" style={{ height: 14, width: "40%" }} />
          <div className="oh-account-skel" style={{ height: 32, width: "55%" }} />
        </div>
        <div className="oh-account-skel" style={{ height: 200, borderRadius: 18 }} />
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
      <div className="oh-account-hero">
        <p className="oh-account-hero__kicker">حساب العميل</p>
        <h1 className="oh-account-hero__title">الملف الشخصي</h1>
        <p className="oh-account-hero__lead">نظرة على بياناتك وطلباتك. التعديل من صفحة الإعدادات.</p>
      </div>

      <div className="oh-account-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div className="oh-account-avatar-row">
            {user?.avatarUrl ? (
              <img className="oh-account-avatar-preview" src={user.avatarUrl} alt="" />
            ) : (
              <div className="oh-account-avatar-placeholder" aria-hidden>
                {(user?.firstName || user?.email || "U").trim().slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="oh-account-card__title" style={{ marginBottom: 4 }}>
                {displayName}
              </h2>
              <span className="oh-account-pill">عميل</span>
            </div>
          </div>
          <Link className="oh-account-btn-primary" to="/dashboard/client/settings">
            تعديل
          </Link>
        </div>
        <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
          <div>
            <span className="oh-account-label">البريد الإلكتروني</span>
            <p className="oh-account-value">{user?.email || "—"}</p>
          </div>
          <div>
            <span className="oh-account-label">رقم الجوال</span>
            <p className="oh-account-value">{user?.phone || "—"}</p>
          </div>
          <div>
            <span className="oh-account-label">اسم الشركة</span>
            {user?.companyName ? (
              <p className="oh-account-value">{user.companyName}</p>
            ) : (
              <p className="oh-account-empty">لم يُذكر اسم شركة — يمكن إضافته من الإعدادات.</p>
            )}
          </div>
        </div>
      </div>

      <div className="oh-account-card" style={{ marginTop: 16 }}>
        <h3 className="oh-account-card__title">ملخص الطلبات</h3>
        <div className="oh-account-stats">
          <div className="oh-account-stat">
            <p className="oh-account-stat__label">طلبات منشأة</p>
            <p className="oh-account-stat__value">{stats.ordersCreated ?? 0}</p>
          </div>
          <div className="oh-account-stat">
            <p className="oh-account-stat__label">نشطة</p>
            <p className="oh-account-stat__value">{stats.activeOrders ?? 0}</p>
          </div>
          <div className="oh-account-stat">
            <p className="oh-account-stat__label">مكتملة</p>
            <p className="oh-account-stat__value">{stats.completedOrders ?? 0}</p>
          </div>
        </div>
        <p className="oh-account-value" style={{ marginTop: 12, fontSize: "0.85rem", color: "#6b7280" }}>
          إجمالي المدفوعات أو مبالغ الطلبات غير معروض هنا لأن الخادم لا يبرزها في ملخص الملف الشخصي حالياً.
        </p>
      </div>
    </div>
  );
}
