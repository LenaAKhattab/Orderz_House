import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { ADMIN_PAGE_PERMISSIONS, userHasPermission } from "../../constants/dashboardPermissions";
import {
  adminListAdsRequest,
  adminListCoursesRequest,
  adminListInternalOrdersRequest,
  listMyNotificationsRequest,
  listSubscriptionsRequest,
} from "../../services/api";
import "./adminDashboardHome.css";

const ADMIN_PERMISSION_LABELS = {
  [ADMIN_PAGE_PERMISSIONS.orders]: "إدارة الطلبات",
  [ADMIN_PAGE_PERMISSIONS.createOrder]: "إنشاء طلب داخلي",
  [ADMIN_PAGE_PERMISSIONS.courses]: "إدارة الدورات",
  [ADMIN_PAGE_PERMISSIONS.ads]: "إدارة الإعلانات",
  [ADMIN_PAGE_PERMISSIONS.subscriptionActivation]: "تفعيل الاشتراكات",
};

const QUICK_ACTIONS = [
  {
    permission: ADMIN_PAGE_PERMISSIONS.courses,
    to: "/dashboard/admin/courses",
    label: "إدارة الدورات",
    subtitle: "عرض الدورات والدروس والإسناد",
    icon: "▶",
  },
  {
    permission: ADMIN_PAGE_PERMISSIONS.ads,
    to: "/dashboard/admin/ads",
    label: "إدارة الإعلانات",
    subtitle: "مراجعة ونشر الإعلانات",
    icon: "✴",
  },
  {
    permission: ADMIN_PAGE_PERMISSIONS.ads,
    to: "/dashboard/admin/ads",
    label: "إنشاء إعلان",
    subtitle: "ابدأ من صفحة الإعلانات",
    icon: "+",
  },
  {
    permission: ADMIN_PAGE_PERMISSIONS.orders,
    to: "/dashboard/admin/orders",
    label: "إدارة الطلبات",
    subtitle: "متابعة الطلبات الداخلية",
    icon: "▣",
  },
  {
    permission: ADMIN_PAGE_PERMISSIONS.createOrder,
    to: "/dashboard/admin/orders/create",
    label: "إنشاء طلب",
    subtitle: "طلب داخلي جديد",
    icon: "+",
  },
  {
    permission: ADMIN_PAGE_PERMISSIONS.subscriptionActivation,
    to: "/dashboard/admin/subscriptions",
    label: "تفعيل الاشتراكات",
    subtitle: "مراجعة طلبات التفعيل",
    icon: "✓",
  },
];

function fullNameAr(user) {
  const parts = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

function formatJoDate(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", {
    timeZone: "Asia/Amman",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

function formatJoDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", {
    timeZone: "Asia/Amman",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function countPendingSubscriptions(subs) {
  return (subs || []).filter((s) => {
    const payment = String(s?.paymentStatus || "");
    const activation = String(s?.activationStatus || "");
    const eligiblePaymentState =
      payment === "paid" || payment === "pending" || payment === "not_required" || payment === "";
    return activation === "company_pending" && eligiblePaymentState;
  }).length;
}

function safeArray(res, key) {
  const fromData = res?.data?.[key];
  const direct = res?.[key];
  const list = fromData ?? direct;
  return Array.isArray(list) ? list : [];
}

export default function AdminDashboardHome({ user }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [miniStats, setMiniStats] = useState({
    courses: null,
    ads: null,
    orders: null,
    subscriptionsPending: null,
  });
  const [notifications, setNotifications] = useState([]);

  const can = useCallback((perm) => userHasPermission(user, perm), [user]);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);

    const nextMiniStats = {
      courses: null,
      ads: null,
      orders: null,
      subscriptionsPending: null,
    };
    let nextNotifications = [];
    let hadFailure = false;

    const tasks = [];

    if (can(ADMIN_PAGE_PERMISSIONS.courses)) {
      tasks.push(
        adminListCoursesRequest({})
          .then((res) => {
            const courses = safeArray(res, "courses");
            nextMiniStats.courses = courses.length;
          })
          .catch(() => {
            hadFailure = true;
          }),
      );
    }

    if (can(ADMIN_PAGE_PERMISSIONS.ads)) {
      tasks.push(
        adminListAdsRequest()
          .then((res) => {
            const ads = safeArray(res, "ads");
            nextMiniStats.ads = ads.length;
          })
          .catch(() => {
            hadFailure = true;
          }),
      );
    }

    if (can(ADMIN_PAGE_PERMISSIONS.orders)) {
      tasks.push(
        adminListInternalOrdersRequest({ limit: 50, offset: 0 })
          .then((res) => {
            const orders = safeArray(res, "orders");
            nextMiniStats.orders = orders.filter((o) => !o?.isArchived).length;
          })
          .catch(() => {
            hadFailure = true;
          }),
      );
    }

    if (can(ADMIN_PAGE_PERMISSIONS.subscriptionActivation)) {
      tasks.push(
        listSubscriptionsRequest({})
          .then((res) => {
            const subs = safeArray(res, "subscriptions");
            nextMiniStats.subscriptionsPending = countPendingSubscriptions(subs);
          })
          .catch(() => {
            hadFailure = true;
          }),
      );
    }

    tasks.push(
      listMyNotificationsRequest({ limit: 3 })
        .then((res) => {
          nextNotifications = safeArray(res, "notifications");
        })
        .catch(() => {
          hadFailure = true;
        }),
    );

    try {
      await Promise.all(tasks);
      setMiniStats(nextMiniStats);
      setNotifications(nextNotifications);
      if (hadFailure) {
        setError("تعذر تحميل بعض بيانات اللوحة. البيانات المعروضة قد تكون غير مكتملة.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "تعذر تحميل ملخص اللوحة.");
    } finally {
      setLoading(false);
    }
  }, [can]);

  useEffect(() => {
    void load();
  }, [load]);

  const welcomeName = useMemo(() => fullNameAr(user) || user?.email || "مدير", [user]);
  const todayLabel = useMemo(() => formatJoDate(), []);

  const quickActions = useMemo(() => QUICK_ACTIONS.filter((a) => can(a.permission)), [can]);

  const allowedTools = useMemo(() => {
    const keys = Array.isArray(user?.permissions) ? user.permissions : [];
    const fromKeys = keys.map((k) => ADMIN_PERMISSION_LABELS[k]).filter(Boolean);
    if (fromKeys.length) return [...new Set(fromKeys)];
    return [...new Set(quickActions.map((a) => ADMIN_PERMISSION_LABELS[a.permission]).filter(Boolean))];
  }, [user?.permissions, quickActions]);

  const miniStatItems = useMemo(() => {
    const items = [];
    if (can(ADMIN_PAGE_PERMISSIONS.courses) && miniStats.courses != null) {
      items.push({ id: "courses", label: "إجمالي الدورات", value: miniStats.courses });
    }
    if (can(ADMIN_PAGE_PERMISSIONS.ads) && miniStats.ads != null) {
      items.push({ id: "ads", label: "إجمالي الإعلانات", value: miniStats.ads });
    }
    if (can(ADMIN_PAGE_PERMISSIONS.orders) && miniStats.orders != null) {
      items.push({ id: "orders", label: "الطلبات النشطة", value: miniStats.orders });
    }
    if (can(ADMIN_PAGE_PERMISSIONS.subscriptionActivation) && miniStats.subscriptionsPending != null) {
      items.push({ id: "subs", label: "بانتظار التفعيل", value: miniStats.subscriptionsPending });
    }
    return items;
  }, [can, miniStats]);

  if (loading) {
    return (
      <DashboardShell className="admin-ops-home">
        <div className="admin-ops-skel-welcome fdash-skel" aria-hidden />
        <div className="admin-ops-skel-section fdash-skel" aria-hidden />
        <div className="admin-ops-grid-2">
          <div className="admin-ops-skel-panel fdash-skel" aria-hidden />
          <div className="admin-ops-skel-panel fdash-skel" aria-hidden />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="admin-ops-home">
      <header className="admin-ops-welcome" aria-label="ترحيب">
        <div className="admin-ops-welcome__body">
          <h1 className="admin-ops-welcome__title">مرحباً بعودتك، {welcomeName} 👋</h1>
          <p className="admin-ops-welcome__subtitle">اختر أداة من أدواتك المتاحة وابدأ العمل.</p>
        </div>
        <time className="admin-ops-welcome__date" dateTime={new Date().toISOString()}>
          {todayLabel}
        </time>
      </header>

      {error ? (
        <DashboardErrorState
          message={error}
          actions={
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              إعادة المحاولة
            </button>
          }
        />
      ) : null}

      {quickActions.length ? (
        <DashboardSection title="إجراءات سريعة" className="admin-ops-section--compact">
          <div className="admin-ops-actions" role="navigation" aria-label="إجراءات سريعة">
            {quickActions.map((action) => (
              <NavLink
                key={`${action.to}-${action.label}`}
                to={action.to}
                className="admin-ops-actions__card"
              >
                <span className="admin-ops-actions__icon" aria-hidden>
                  {action.icon}
                </span>
                <span className="admin-ops-actions__text">
                  <span className="admin-ops-actions__label">{action.label}</span>
                  <span className="admin-ops-actions__subtitle">{action.subtitle}</span>
                </span>
              </NavLink>
            ))}
          </div>
        </DashboardSection>
      ) : null}

      <div className="admin-ops-grid-2">
        <DashboardSection title="أدواتي المتاحة" className="admin-ops-section--compact">
          {allowedTools.length ? (
            <ul className="admin-ops-perms">
              {allowedTools.map((label) => (
                <li key={label} className="admin-ops-perms__item">
                  <span className="admin-ops-perms__check" aria-hidden>
                    ✓
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-ops-empty">ليس لديك صلاحيات مفعلة حالياً. يرجى التواصل مع المدير الأعلى.</p>
          )}
        </DashboardSection>

        <DashboardSection
          title="الإشعارات"
          className="admin-ops-section--compact"
          actions={
            <Link to="/dashboard/admin/notifications" className="admin-ops-link">
              عرض الكل
            </Link>
          }
        >
          {notifications.length === 0 ? (
            <p className="admin-ops-empty">لا توجد إشعارات جديدة.</p>
          ) : (
            <ul className="admin-ops-feed">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`admin-ops-feed__item${n.isRead ? "" : " admin-ops-feed__item--unread"}`}
                >
                  <Link to={n.link || "/dashboard/admin/notifications"} className="admin-ops-feed__link">
                    <span className="admin-ops-feed__title">{n.title || "إشعار"}</span>
                    {n.message ? <span className="admin-ops-feed__msg">{n.message}</span> : null}
                    <time className="admin-ops-feed__time" dateTime={n.createdAt}>
                      {formatJoDateTime(n.createdAt)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>
      </div>

      {miniStatItems.length ? (
        <div className="admin-ops-mini-stats" aria-label="لمحة سريعة">
          <span className="admin-ops-mini-stats__label">لمحة سريعة</span>
          <ul className="admin-ops-mini-stats__list">
            {miniStatItems.map((item) => (
              <li key={item.id} className="admin-ops-mini-stats__item">
                <span className="admin-ops-mini-stats__name">{item.label}</span>
                <span className="admin-ops-mini-stats__value">{item.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </DashboardShell>
  );
}
