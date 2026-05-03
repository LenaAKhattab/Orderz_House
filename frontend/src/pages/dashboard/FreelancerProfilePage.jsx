import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { getProfileMeRequest } from "../../services/api";
import { fmtDateMedium, fullNameAr } from "../../utils/accountDisplay";
import "./shared/account-pages.css";

function subscriptionLabel(sub) {
  if (!sub) return "لا يوجد اشتراك نشط حالياً";
  const title = sub.plan?.title || sub.plan?.name || "اشتراك";
  const status = sub.status ? String(sub.status) : "";
  return status ? `${title} — ${status}` : title;
}

export default function FreelancerProfilePage() {
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
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const user = payload?.user || authUser;
  const stats = payload?.stats || {};
  const subscription = payload?.subscription || null;

  const displayName = useMemo(() => fullNameAr(user) || user?.email || "", [user]);

  const skills = Array.isArray(user?.skills) ? user.skills.filter(Boolean) : [];

  const externalLinks = useMemo(() => {
    const pairs = [
      ["الموقع", user?.websiteUrl],
      ["LinkedIn", user?.linkedinUrl],
      ["GitHub", user?.githubUrl],
      ["Behance", user?.behanceUrl],
      ["معرض أعمال", user?.portfolioUrl],
    ].filter(([, url]) => url && String(url).trim());
    return pairs;
  }, [user]);

  if (loading) {
    return (
      <div className="oh-account-page" dir="rtl">
        <div className="oh-account-hero">
          <div className="oh-account-skel" style={{ height: 14, width: "40%" }} />
          <div className="oh-account-skel" style={{ height: 32, width: "55%" }} />
          <div className="oh-account-skel" style={{ height: 16, width: "85%" }} />
        </div>
        <div className="oh-account-card">
          <div className="oh-account-skel" style={{ height: 220 }} />
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
          <div className="oh-account-actions">
            <button type="button" className="oh-account-btn-primary" onClick={load}>
              إعادة المحاولة
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="oh-account-page" dir="rtl">
      <div className="oh-account-hero">
        <p className="oh-account-hero__kicker">حساب المستقل</p>
        <h1 className="oh-account-hero__title">الملف الشخصي</h1>
        <p className="oh-account-hero__lead">
          عرض موجز لبياناتك، اشتراكك، وأداء الطلبات. استخدم «تعديل» للانتقال إلى صفحة الإعدادات.
        </p>
      </div>

      <div className="oh-account-grid oh-account-grid--2">
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
                {user?.professionalTitle ? (
                  <p className="oh-account-value" style={{ margin: "0 0 8px", fontWeight: 800 }}>
                    {user.professionalTitle}
                  </p>
                ) : (
                  <p className="oh-account-empty" style={{ margin: "0 0 8px" }}>
                    لم يُذكر عنوان مهني بعد — يمكن إضافته من الإعدادات.
                  </p>
                )}
                <span className="oh-account-pill">مستقل</span>
              </div>
            </div>
            <Link className="oh-account-btn-primary" to="/dashboard/freelancer/settings">
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
          </div>
        </div>

        <div className="oh-account-card">
          <h3 className="oh-account-card__title">الاشتراك</h3>
          <p className="oh-account-value">{subscriptionLabel(subscription)}</p>
          {subscription?.expiryDate ? (
            <p className="oh-account-value" style={{ marginTop: 8, fontSize: "0.88rem", color: "#5a6378" }}>
              تاريخ الانتهاء: {fmtDateMedium(subscription.expiryDate)}
            </p>
          ) : (
            <p className="oh-account-empty" style={{ marginTop: 10 }}>
              لا يتوفر تاريخ انتهاء للعرض في الاستجابة الحالية أو لا يوجد اشتراك مسجّل.
            </p>
          )}
        </div>
      </div>

      <div className="oh-account-card" style={{ marginTop: 16 }}>
        <h3 className="oh-account-card__title">ملخص سريع</h3>
        <div className="oh-account-stats">
          <div className="oh-account-stat">
            <p className="oh-account-stat__label">طلبات مكتملة</p>
            <p className="oh-account-stat__value">{stats.completedOrders ?? 0}</p>
          </div>
          <div className="oh-account-stat">
            <p className="oh-account-stat__label">طلبات نشطة</p>
            <p className="oh-account-stat__value">{stats.activeOrders ?? 0}</p>
          </div>
          <div className="oh-account-stat">
            <p className="oh-account-stat__label">مطالبات مفتوحة</p>
            <p className="oh-account-stat__value">{stats.openClaims ?? 0}</p>
          </div>
        </div>
        <p className="oh-account-value" style={{ marginTop: 12, fontSize: "0.85rem", color: "#6b7280" }}>
          لا يتوفر نظام تقييم عام في المنصة حالياً؛ لا يُعرض تقييم هنا.
        </p>
      </div>

      <div className="oh-account-grid oh-account-grid--2" style={{ marginTop: 16 }}>
        <div className="oh-account-card">
          <h3 className="oh-account-card__title">نبذة</h3>
          {user?.bio ? (
            <p className="oh-account-value">{user.bio}</p>
          ) : (
            <p className="oh-account-empty">أضف نبذة تعريفية من صفحة الإعدادات لتظهر لعملائك وللفريق.</p>
          )}
        </div>
        <div className="oh-account-card">
          <h3 className="oh-account-card__title">المهارات</h3>
          {skills.length ? (
            <div className="oh-account-links">
              {skills.map((s) => (
                <span key={s} className="oh-account-pill">
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <p className="oh-account-empty">لم تُضف مهارات بعد.</p>
          )}
        </div>
      </div>

      <div className="oh-account-card" style={{ marginTop: 16 }}>
        <h3 className="oh-account-card__title">روابط</h3>
        {externalLinks.length ? (
          <div className="oh-account-links">
            {externalLinks.map(([label, url]) => (
              <a key={label} className="oh-account-link-pill" href={url} target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            ))}
          </div>
        ) : (
          <p className="oh-account-empty">لا توجد روابط مهنية محفوظة بعد.</p>
        )}
      </div>
    </div>
  );
}
