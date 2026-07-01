import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  CreditCard,
  FilePlus2,
  Info,
  LayoutGrid,
  Megaphone,
  RefreshCw,
} from "lucide-react";
import { useClientCreateOrderModal } from "../../context/ClientCreateOrderModalContext";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { ADMIN_PAGE_PERMISSIONS, userHasPermission } from "../../constants/dashboardPermissions";
import {
  adminListAdsRequest,
  adminListCoursesRequest,
  adminListInternalOrdersRequest,
  listMyNotificationsRequest,
  listAllSubscriptionsRequest,
} from "../../services/api";
import { ADMIN_DASHBOARD_ROUTES, resolveAdminAttentionLink, resolveAdminDashboardHomeLink } from "../../components/analytics/super-admin/superAdminHomeDataUtils";
import "../../styles/adminControlCenter.css";

const ADMIN_PERMISSION_LABELS = {
  [ADMIN_PAGE_PERMISSIONS.orders]: "إدارة الطلبات",
  [ADMIN_PAGE_PERMISSIONS.createOrder]: "إنشاء طلب داخلي",
  [ADMIN_PAGE_PERMISSIONS.courses]: "إدارة الدورات",
  [ADMIN_PAGE_PERMISSIONS.ads]: "إدارة الإعلانات",
  [ADMIN_PAGE_PERMISSIONS.subscriptionActivation]: "تفعيل الاشتراكات",
};

const QUICK_ACTIONS = [
  {
    permission: ADMIN_PAGE_PERMISSIONS.createOrder,
    type: "button",
    key: "create",
    label: "إنشاء طلب",
    description: "طلب داخلي جديد",
    icon: FilePlus2,
  },
  {
    permission: ADMIN_PAGE_PERMISSIONS.orders,
    type: "link",
    key: "orders",
    to: ADMIN_DASHBOARD_ROUTES.internalOrders,
    label: "الطلبات الداخلية",
    description: "متابعة الطلبات الداخلية",
    icon: LayoutGrid,
  },
  {
    permission: ADMIN_PAGE_PERMISSIONS.subscriptionActivation,
    type: "link",
    key: "subscriptions",
    to: ADMIN_DASHBOARD_ROUTES.subscriptions,
    label: "تفعيل الاشتراكات",
    description: "مراجعة طلبات التفعيل",
    icon: CreditCard,
  },
  {
    permission: ADMIN_PAGE_PERMISSIONS.ads,
    type: "link",
    key: "ads",
    to: ADMIN_DASHBOARD_ROUTES.ads,
    label: "إدارة الإعلانات",
    description: "مراجعة ونشر الإعلانات",
    icon: Megaphone,
  },
  {
    permission: ADMIN_PAGE_PERMISSIONS.courses,
    type: "link",
    key: "courses",
    to: ADMIN_DASHBOARD_ROUTES.courses,
    label: "إدارة الدورات",
    description: "عرض الدورات والدروس",
    icon: BookOpen,
  },
];

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

const ADMIN_KPI_DEFS = [
  {
    id: "orders",
    statKey: "orders",
    permission: ADMIN_PAGE_PERMISSIONS.orders,
    label: "الطلبات الداخلية النشطة",
    to: ADMIN_DASHBOARD_ROUTES.internalOrders,
    icon: LayoutGrid,
  },
  {
    id: "subs",
    statKey: "subscriptionsPending",
    permission: ADMIN_PAGE_PERMISSIONS.subscriptionActivation,
    label: "بانتظار التفعيل",
    to: ADMIN_DASHBOARD_ROUTES.subscriptions,
    icon: CreditCard,
  },
  {
    id: "courses",
    statKey: "courses",
    permission: ADMIN_PAGE_PERMISSIONS.courses,
    label: "إجمالي الدورات",
    to: ADMIN_DASHBOARD_ROUTES.courses,
    icon: BookOpen,
  },
  {
    id: "ads",
    statKey: "ads",
    permission: ADMIN_PAGE_PERMISSIONS.ads,
    label: "إجمالي الإعلانات",
    to: ADMIN_DASHBOARD_ROUTES.ads,
    icon: Megaphone,
  },
];

function KpiCard({ label, value, to, loading, failed, refreshing, icon: Icon }) {
  const safeTo = resolveAdminDashboardHomeLink(to, null);
  const showValueSkeleton = Boolean(loading);
  const display = failed ? "غير متاح" : value;
  const cardClass = `acc-kpi-card${refreshing ? " acc-kpi-card--refreshing" : ""}`;

  const inner = (
    <>
      <div className="acc-kpi-card__body">
        <span className="acc-kpi-card__label">{label}</span>
        {showValueSkeleton ? (
          <span className="acc-kpi-card__value-skeleton" aria-hidden />
        ) : (
          <strong className={`acc-kpi-card__value${display === "غير متاح" ? " acc-kpi-card__value--muted" : ""}`}>
            {display}
          </strong>
        )}
      </div>
      {Icon ? (
        <span className="acc-kpi-card__icon" aria-hidden>
          <Icon size={15} strokeWidth={2} />
        </span>
      ) : null}
    </>
  );

  if (safeTo && !showValueSkeleton && display !== "غير متاح") {
    return (
      <NavLink to={safeTo} className={cardClass}>
        {inner}
      </NavLink>
    );
  }

  return <div className={cardClass}>{inner}</div>;
}

function AttentionSkeletonItem() {
  return (
    <div className="acc-attention-skel">
      <div className="acc-attention-skel__lines">
        <span className="acc-attention-skel__line" />
        <span className="acc-attention-skel__line acc-attention-skel__line--short" />
      </div>
      <span className="acc-attention-skel__badge" aria-hidden />
    </div>
  );
}

function QuickActionCard({ action, onCreateOrder }) {
  const Icon = action.icon;
  const content = (
    <>
      <span className="acc-action-card__icon" aria-hidden>
        <Icon size={16} strokeWidth={2} />
      </span>
      <span className="acc-action-card__label">{action.label}</span>
      <span className="acc-action-card__desc">{action.description}</span>
      <span className="acc-action-card__chevron" aria-hidden>
        <ChevronLeft size={14} strokeWidth={2.25} />
      </span>
    </>
  );

  if (action.type === "button") {
    return (
      <button type="button" className="acc-action-card" onClick={onCreateOrder}>
        {content}
      </button>
    );
  }

  const safeTo = resolveAdminDashboardHomeLink(action.to, null);
  if (!safeTo) {
    return <div className="acc-action-card">{content}</div>;
  }

  return (
    <NavLink to={safeTo} className="acc-action-card">
      {content}
    </NavLink>
  );
}

export default function AdminDashboardHome({ user }) {
  const { openModal: openCreateOrderModal } = useClientCreateOrderModal();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const hasLoadedOnceRef = useRef(false);
  const [miniStats, setMiniStats] = useState({
    courses: null,
    ads: null,
    orders: null,
    subscriptionsPending: null,
  });
  const [notifications, setNotifications] = useState([]);

  const can = useCallback((perm) => userHasPermission(user, perm), [user]);

  const load = useCallback(async ({ isRefresh = false } = {}) => {
    setError("");
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

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
            nextMiniStats.courses = safeArray(res, "courses").length;
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
            nextMiniStats.ads = safeArray(res, "ads").length;
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
        listAllSubscriptionsRequest({})
          .then((res) => {
            nextMiniStats.subscriptionsPending = countPendingSubscriptions(safeArray(res, "subscriptions"));
          })
          .catch(() => {
            hadFailure = true;
          }),
      );
    }

    tasks.push(
      listMyNotificationsRequest({ limit: 5, isRead: false })
        .then((res) => {
          nextNotifications = safeArray(res, "notifications");
        })
        .catch(() => {
          hadFailure = true;
        }),
    );

    try {
      await Promise.all(tasks);
      setMiniStats((prev) => {
        if (!isRefresh) return nextMiniStats;
        return {
          courses: nextMiniStats.courses ?? prev.courses,
          ads: nextMiniStats.ads ?? prev.ads,
          orders: nextMiniStats.orders ?? prev.orders,
          subscriptionsPending: nextMiniStats.subscriptionsPending ?? prev.subscriptionsPending,
        };
      });
      setNotifications((prev) => (nextNotifications.length > 0 || !isRefresh ? nextNotifications : prev));
      if (hadFailure) {
        setError("تعذر تحميل بعض بيانات اللوحة. البيانات المعروضة قد تكون غير مكتملة.");
      } else {
        setError("");
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "تعذر تحميل ملخص اللوحة.");
    } finally {
      hasLoadedOnceRef.current = true;
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [can]);

  useEffect(() => {
    void load();
  }, [load]);

  const quickActions = useMemo(() => QUICK_ACTIONS.filter((a) => can(a.permission)), [can]);

  const kpiDefs = useMemo(() => ADMIN_KPI_DEFS.filter((def) => can(def.permission)), [can]);

  const kpiMetricLoading = useCallback(
    (statKey) => loading && !refreshing && miniStats[statKey] == null,
    [loading, refreshing, miniStats],
  );

  const kpiMetricFailed = useCallback(
    (statKey) => Boolean(error) && !loading && !refreshing && miniStats[statKey] == null,
    [error, loading, refreshing, miniStats],
  );

  const attentionItems = useMemo(() => {
    const items = [];
    if (can(ADMIN_PAGE_PERMISSIONS.subscriptionActivation) && miniStats.subscriptionsPending > 0) {
      items.push({
        id: "pending-subs",
        text: "اشتراكات بانتظار التفعيل",
        description: "مراجعة طلبات التفعيل من الإدارة",
        count: miniStats.subscriptionsPending,
        to: resolveAdminDashboardHomeLink(ADMIN_DASHBOARD_ROUTES.subscriptions, null),
        severity: "urgent",
      });
    }
    for (const n of notifications) {
      items.push({
        id: `notif-${n.id}`,
        text: n.title || "إشعار جديد",
        description: n.message || "",
        to: resolveAdminAttentionLink(n.link),
        severity: "info",
      });
    }
    return items;
  }, [can, miniStats.subscriptionsPending, notifications]);

  const attentionTotal = attentionItems.reduce((sum, item) => sum + (Number(item.count) || 1), 0);

  const allowedTools = useMemo(() => {
    const keys = Array.isArray(user?.permissions) ? user.permissions : [];
    const fromKeys = keys.map((k) => ADMIN_PERMISSION_LABELS[k]).filter(Boolean);
    if (fromKeys.length) return [...new Set(fromKeys)];
    return [...new Set(quickActions.map((a) => ADMIN_PERMISSION_LABELS[a.permission]).filter(Boolean))];
  }, [user, quickActions]);

  return (
    <DashboardShell className="admin-ops-home">
      <DashboardPageHeader
        eyebrow="لوحة المدير"
        title="مركز التحكم"
        description="مركز العمليات الرئيسي — المؤشرات والمهام المسموح بها لحسابك."
        actions={
          <>
            {can(ADMIN_PAGE_PERMISSIONS.createOrder) ? (
              <button type="button" className="btn btn-primary" onClick={() => openCreateOrderModal()}>
                إنشاء طلب
              </button>
            ) : null}
            <button
              type="button"
              className={`btn btn-secondary${refreshing ? " acc-btn--refreshing" : ""}`}
              onClick={() => void load({ isRefresh: true })}
              disabled={loading && !hasLoadedOnceRef.current}
            >
              <RefreshCw
                size={16}
                strokeWidth={2}
                className={refreshing ? "acc-spin" : undefined}
                style={{ verticalAlign: "middle", marginInlineEnd: 4 }}
                aria-hidden
              />
              {refreshing ? "جارٍ التحديث…" : "تحديث"}
            </button>
          </>
        }
      />

      <div className="acc-page">

        {error ? (
          <p className="acc-notice" role="status">
            {error}{" "}
            <button
              type="button"
              className="acc-notice__btn"
              onClick={() => void load({ isRefresh: hasLoadedOnceRef.current })}
            >
              إعادة المحاولة
            </button>
          </p>
        ) : null}

        {kpiDefs.length ? (
          <section className="acc-section" aria-labelledby="admin-kpi-heading">
            <div className="acc-section__head">
              <h2 id="admin-kpi-heading" className="acc-section__title">
                المؤشرات الرئيسية
              </h2>
            </div>
            <div className="acc-kpi-grid">
              {kpiDefs.map((def) => (
                <KpiCard
                  key={def.id}
                  label={def.label}
                  value={miniStats[def.statKey]}
                  to={def.to}
                  loading={kpiMetricLoading(def.statKey)}
                  failed={kpiMetricFailed(def.statKey)}
                  refreshing={refreshing}
                  icon={def.icon}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="acc-section" aria-labelledby="admin-attention-heading">
          <div className="acc-section__head">
            <h2 id="admin-attention-heading" className="acc-section__title">
              ما يحتاج انتباهك؟
            </h2>
            {!loading && !refreshing && attentionTotal > 0 ? (
              <p className="acc-section__hint">{attentionTotal} مهمة</p>
            ) : null}
          </div>
          {loading && !refreshing ? (
            <ul className="acc-attention-list" aria-busy="true" aria-label="جارٍ تحميل التنبيهات">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i}>
                  <AttentionSkeletonItem />
                </li>
              ))}
            </ul>
          ) : attentionItems.length === 0 ? (
            <p className="acc-empty acc-empty--inline">لا توجد مهام تحتاج انتباهك حالياً.</p>
          ) : (
            <ul className="acc-attention-list">
              {attentionItems.map((item) => {
                const severityKey = item.severity === "urgent" ? "urgent" : item.severity === "medium" ? "medium" : "info";
                const SeverityIcon =
                  severityKey === "urgent" ? AlertCircle : severityKey === "medium" ? AlertTriangle : Info;
                const safeTo = resolveAdminDashboardHomeLink(item.to, null);
                return (
                  <li key={item.id}>
                    {safeTo ? (
                      <NavLink to={safeTo} className={`acc-attention-item acc-attention-item--${severityKey}`}>
                        <span className="acc-attention-item__severity" aria-hidden>
                          <SeverityIcon size={14} strokeWidth={2.25} />
                        </span>
                        <span className="acc-attention-item__copy">
                          <span className="acc-attention-item__title">{item.text}</span>
                          {item.description ? <span className="acc-attention-item__desc">{item.description}</span> : null}
                        </span>
                        {item.count != null ? <span className="acc-attention-item__badge">{item.count}</span> : null}
                      </NavLink>
                    ) : (
                      <div className={`acc-attention-item acc-attention-item--${severityKey}`}>
                        <span className="acc-attention-item__severity" aria-hidden>
                          <SeverityIcon size={14} strokeWidth={2.25} />
                        </span>
                        <span className="acc-attention-item__copy">
                          <span className="acc-attention-item__title">{item.text}</span>
                          {item.description ? <span className="acc-attention-item__desc">{item.description}</span> : null}
                        </span>
                        {item.count != null ? <span className="acc-attention-item__badge">{item.count}</span> : null}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {quickActions.length ? (
          <section className="acc-section" aria-labelledby="admin-actions-heading">
            <div className="acc-section__head">
              <h2 id="admin-actions-heading" className="acc-section__title">
                إجراءات سريعة
              </h2>
            </div>
            <div className="acc-actions-grid">
              {quickActions.map((action) => (
                <QuickActionCard key={action.key} action={action} onCreateOrder={() => openCreateOrderModal()} />
              ))}
            </div>
          </section>
        ) : null}

        {allowedTools.length ? (
          <section className="acc-section" aria-labelledby="admin-tools-heading">
            <div className="acc-section__head">
              <h2 id="admin-tools-heading" className="acc-section__title">
                صلاحياتك
              </h2>
              <Link to={ADMIN_DASHBOARD_ROUTES.notifications} className="acc-section__hint acc-section__link">
                الإشعارات
              </Link>
            </div>
            <div className="acc-actions-grid acc-actions-grid--perms">
              {allowedTools.map((label) => (
                <div key={label} className="acc-summary-card">
                  <span className="acc-summary-card__label">{label}</span>
                  <strong className="acc-summary-card__value acc-summary-card__value--sm">✓</strong>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <p className="acc-empty">ليس لديك صلاحيات مفعلة حالياً. يرجى التواصل مع المدير الأعلى.</p>
        )}
      </div>
    </DashboardShell>
  );
}
