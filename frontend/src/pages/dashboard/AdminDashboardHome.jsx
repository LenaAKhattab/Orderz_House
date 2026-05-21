import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import DashboardWelcomeSkeleton from "../../components/dashboard/hub/DashboardWelcomeSkeleton";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import { adminListInternalOrdersRequest, getUnreadNotificationsCountRequest } from "../../services/api";
import "../../styles/dashboardHub.css";

const QUICK_LINKS = [
  {
    to: "/dashboard/admin/orders",
    title: "الطلبات الداخلية",
    description: "عرض ومتابعة الطلبات الداخلية والعروض.",
    cta: "فتح القائمة",
  },
  {
    to: "/dashboard/admin/orders/create",
    title: "إنشاء طلب داخلي",
    description: "إضافة طلب جديد للمستقلين المؤهلين.",
    cta: "إنشاء الآن",
  },
  {
    to: "/dashboard/admin/courses",
    title: "الدورات",
    description: "إدارة الدورات التدريبية والتسجيلات.",
    cta: "إدارة الدورات",
  },
  {
    to: "/dashboard/admin/ads",
    title: "الإعلانات",
    description: "نشر وترتيب الإعلانات الظاهرة في المنصة.",
    cta: "إدارة الإعلانات",
  },
  {
    to: "/dashboard/admin/subscriptions",
    title: "تفعيل الاشتراكات",
    description: "تفعيل اشتراكات المستقلين بعد مراجعة الشركة.",
    cta: "فتح التفعيل",
  },
  {
    to: "/dashboard/admin/notifications",
    title: "الإشعارات",
    description: "متابعة التنبيهات والرسائل الإدارية.",
    cta: "عرض الإشعارات",
  },
  {
    to: "/dashboard/admin/settings",
    title: "الإعدادات",
    description: "بيانات الحساب وتفضيلات الإشعارات.",
    cta: "الإعدادات",
  },
];

function fullNameAr(user) {
  const parts = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

export default function AdminDashboardHome({ user }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ordersCount, setOrdersCount] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [ordersRes, notifRes] = await Promise.all([
        adminListInternalOrdersRequest({ limit: 50, offset: 0 }),
        getUnreadNotificationsCountRequest().catch(() => null),
      ]);
      const list = ordersRes?.data?.orders ?? ordersRes?.orders;
      setOrdersCount(Array.isArray(list) ? list.length : 0);
      const unread = notifRes?.data?.unreadCount ?? notifRes?.unreadCount;
      setUnreadNotifications(Number.isFinite(Number(unread)) ? Number(unread) : 0);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "تعذر تحميل ملخص اللوحة.");
      setOrdersCount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const welcomeName = useMemo(() => fullNameAr(user) || null, [user]);
  const welcomeTitle = welcomeName ? `مرحباً، ${welcomeName}` : "مرحباً في لوحة الإدارة";

  if (loading) {
    return (
      <DashboardHubPage>
        <DashboardWelcomeSkeleton />
        <div className="admin-dash-quick admin-dash-quick--skeleton" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="fdash-skel" style={{ height: 120, borderRadius: 18 }} />
          ))}
        </div>
      </DashboardHubPage>
    );
  }

  return (
    <DashboardHubPage>
      <header className="fdash-welcome" style={{ marginBottom: 20 }}>
        <div className="fdash-welcome__copy">
          <h1 className="fdash-welcome__title">{welcomeTitle}</h1>
          <p className="fdash-welcome__subtitle">
            اختصارات سريعة لمهام الإدارة اليومية — الطلبات، الدورات، الإعلانات، وتفعيل الاشتراكات.
          </p>
        </div>
      </header>

      {error ? (
        <div className="fdash-alert" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0 }}>{error}</p>
          <button type="button" className="fdash-toolbar__btn" onClick={() => void load()}>
            إعادة المحاولة
          </button>
        </div>
      ) : null}

      {!error && ordersCount != null ? (
        <div className="admin-dash-summary" role="status">
          <div className="admin-dash-summary__item">
            <span className="admin-dash-summary__label">طلبات داخلية (آخر 50 كحد أقصى)</span>
            <strong className="admin-dash-summary__value">{ordersCount}</strong>
          </div>
          <div className="admin-dash-summary__item">
            <span className="admin-dash-summary__label">إشعارات غير مقروءة</span>
            <strong className="admin-dash-summary__value">{unreadNotifications}</strong>
          </div>
        </div>
      ) : null}

      <section className="admin-dash-section" aria-labelledby="admin-quick-heading">
        <h2 id="admin-quick-heading" className="fdash-insights__title">
          مهام سريعة
        </h2>
        <div className="admin-dash-quick">
          {QUICK_LINKS.map((item) => (
            <NavLink key={item.to} to={item.to} className="admin-dash-quick__card card">
              <h3 className="admin-dash-quick__title">{item.title}</h3>
              <p className="admin-dash-quick__desc">{item.description}</p>
              <span className="admin-dash-quick__cta">{item.cta} ←</span>
            </NavLink>
          ))}
        </div>
      </section>

      {!loading && !error && ordersCount === 0 ? (
        <DashboardEmptyState
          className="mt-4"
          title="لا توجد طلبات داخلية بعد"
          description="يمكنك إنشاء أول طلب داخلي من الزر أعلاه أو من قائمة الطلبات."
          actions={
            <NavLink to="/dashboard/admin/orders/create" className="btn btn-secondary">
              إنشاء طلب داخلي
            </NavLink>
          }
        />
      ) : null}
    </DashboardHubPage>
  );
}
