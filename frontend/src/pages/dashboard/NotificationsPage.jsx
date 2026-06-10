import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  FileText,
  GraduationCap,
  Inbox,
  MessageSquare,
  Search,
  Wallet,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import {
  getUnreadNotificationsCountRequest,
  listMyNotificationsRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
  NOTIFICATIONS_REFRESH_EVENT,
} from "../../services/api";
import Pagination from "../../components/common/Pagination";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import HubMetricSkeleton from "../../components/dashboard/hub/HubMetricSkeleton";
import NotificationListSkeleton from "../../components/dashboard/hub/NotificationListSkeleton";
import "../../styles/dashboardHub.css";
import "./notifications-page.css";

const PAGE_SIZE = 8;

function sortNewestFirst(list) {
  return [...list].sort((a, b) => {
    const ta = new Date(a?.createdAt).getTime();
    const tb = new Date(b?.createdAt).getTime();
    if (Number.isFinite(tb) && Number.isFinite(ta) && tb !== ta) return tb - ta;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });
}

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function fmtRelativeTime(value) {
  if (!value) return "";
  const d = new Date(value);
  const diff = Date.now() - d.getTime();
  if (!Number.isFinite(diff)) return "";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `منذ ${days} يوم`;
  return fmtDate(value);
}

function actorLabel(actor) {
  if (!actor) return "";
  const name = String(actor.fullName || "").trim();
  const acc = String(actor.accountId || "").trim();
  if (name && acc) return `${name} (${acc})`;
  return name || acc || "";
}

function notificationDetails(n, canShowOrderReference) {
  const type = String(n?.type || "").trim();
  const actor = actorLabel(n?.actor);
  const actorFallbackName = String(n?.metadata?.actorName || "").trim();
  const actorFallbackAcc = String(n?.metadata?.actorAccountId || "").trim();
  const actorFallback =
    actorFallbackName && actorFallbackAcc ? `${actorFallbackName} (${actorFallbackAcc})` : actorFallbackName || actorFallbackAcc || "";
  const actorPart = actor || actorFallback;
  const projectName = String(n?.metadata?.projectName || "").trim();
  const orderCode = String(n?.metadata?.orderCode || "").trim();
  const orderId = String(n?.metadata?.orderId || n?.entityId || "").trim();

  if (type === "order.created") {
    return projectName;
  }

  const orderPart =
    canShowOrderReference && (orderCode || orderId) ? (orderCode ? `${orderCode}` : `#${orderId}`) : "";
  const projectPart = projectName ? projectName : "";
  const parts = [actorPart, projectPart, orderPart].filter(Boolean);
  return parts.join(" - ");
}

function notificationCategory(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("message") || t.includes("chat")) return { label: "رسائل", tone: "emerald" };
  if (t.includes("claim") || t.includes("financial") || t.includes("payment") || t.includes("pay") || t.includes("stripe") || t.includes("invoice")) {
    return { label: "مطالبات", tone: "violet" };
  }
  if (t.includes("course") || t.includes("lesson")) return { label: "دورات", tone: "amber" };
  if (t.includes("order")) return { label: "طلبات", tone: "blue" };
  return { label: "تنبيه", tone: "teal" };
}

function NotifTypeIcon({ type }) {
  const t = String(type || "").toLowerCase();
  const props = { size: 21, strokeWidth: 1.5, "aria-hidden": true };

  if (t.includes("message") || t.includes("chat")) return <MessageSquare {...props} />;
  if (t.includes("claim") || t.includes("financial") || t.includes("payment") || t.includes("pay") || t.includes("stripe") || t.includes("invoice")) {
    return <Wallet {...props} />;
  }
  if (t.includes("course") || t.includes("lesson")) return <GraduationCap {...props} />;
  if (t.includes("order")) return <FileText {...props} />;
  return <Bell {...props} />;
}

function StatSegment({ tone, Icon, label, value, loading }) {
  return (
    <div className={`fn-stat-segment fn-stat-segment--${tone}`}>
      <span className="fn-stat-segment__icon" aria-hidden>
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <div className="fn-stat-segment__copy">
        <span className="fn-stat-segment__label">{label}</span>
        {loading ? <HubMetricSkeleton variant="stat" /> : <strong className="fn-stat-segment__value">{value}</strong>}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.primaryRole || user?.role;
  const isDashboardHubShell = role === "freelancer" || role === "client";
  const canShowOrderReference = role === "admin" || role === "super_admin";
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [allTotal, setAllTotal] = useState(0);
  const [listTotal, setListTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const [listRes, countRes, allListRes] = await Promise.all([
        listMyNotificationsRequest({
          limit: PAGE_SIZE,
          offset,
          ...(filter === "unread" ? { isRead: false } : {}),
        }),
        getUnreadNotificationsCountRequest(),
        filter === "unread"
          ? listMyNotificationsRequest({ limit: 1, offset: 0 })
          : Promise.resolve(null),
      ]);
      const list = sortNewestFirst(
        Array.isArray(listRes?.data?.notifications) ? listRes.data.notifications : [],
      );
      const total = Number(listRes?.data?.total || 0);
      setItems(list);
      setListTotal(total);
      if (filter === "all") {
        setAllTotal(total);
      } else if (allListRes) {
        setAllTotal(Number(allListRes?.data?.total || 0));
      }
      setUnreadCount(Number(countRes?.data?.unreadCount || 0));
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const onRefresh = (ev) => {
      const incoming = ev?.detail?.notification;
      if (incoming?.id) {
        setItems((prev) => {
          if (prev.some((x) => String(x.id) === String(incoming.id))) return prev;
          if (filter === "unread" && incoming.isRead) return prev;
          if (page !== 1) return prev;
          setListTotal((v) => v + 1);
          setAllTotal((v) => v + 1);
          if (!incoming.isRead) setUnreadCount((v) => v + 1);
          return sortNewestFirst([incoming, ...prev]).slice(0, PAGE_SIZE);
        });
      } else {
        void fetchData();
      }
    };
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
  }, [fetchData, filter, page]);

  const title = useMemo(() => {
    if (role === "super_admin") return "إشعارات المدير الأعلى";
    if (role === "admin") return "إشعارات الإدارة";
    return "إشعاراتك";
  }, [role]);

  const subtitle = useMemo(() => {
    if (isDashboardHubShell) return "تابع تحديثات الطلبات، الرسائل، والمدفوعات من مكان واحد.";
    return "تابع تحديثات الطلبات، المدفوعات، والمطالبات في مكان واحد.";
  }, [isDashboardHubShell]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((n) => {
      const details = notificationDetails(n, canShowOrderReference);
      const hay = [n.title, n.message, details, n.type].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [items, searchQuery, canShowOrderReference]);

  const handleRead = useCallback(async (n) => {
    if (!n || n.isRead) return;
    try {
      await markNotificationReadRequest(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnreadCount((v) => Math.max(0, v - 1));
    } catch {
      // no-op
    }
  }, []);

  const handleOpen = useCallback(
    async (n) => {
      await handleRead(n);
      navigate(n?.link || "/dashboard");
    },
    [handleRead, navigate],
  );

  const handleReadAll = useCallback(async () => {
    try {
      await markAllNotificationsReadRequest();
      setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
      setUnreadCount(0);
    } catch {
      // no-op
    }
  }, []);

  const pageBody = (
    <>
      <header className="fn-surface fn-header">
        <div className="fn-header__copy">
          <h1 className="fn-header__title">{title}</h1>
          <p className="fn-header__subtitle">{subtitle}</p>
        </div>
        <div className="fn-stats-bar" aria-label="ملخص الإشعارات">
          <StatSegment tone="slate" Icon={FileText} label="إجمالي الإشعارات" value={allTotal} loading={loading} />
          <StatSegment tone="blue" Icon={Bell} label="غير المقروء" value={unreadCount} loading={loading} />
        </div>
      </header>

      <div className="fn-surface fn-toolbar">
        <div className="fn-toolbar__zone fn-toolbar__zone--search">
          <div className="fn-toolbar__search">
            <Search size={17} strokeWidth={2} className="fn-toolbar__search-icon" aria-hidden />
            <input
              type="search"
              className="fn-toolbar__search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث في الإشعارات..."
              aria-label="ابحث في الإشعارات"
            />
          </div>
        </div>
        <div className="fn-toolbar__zone fn-toolbar__zone--filters">
          <div className="fn-toolbar__segmented" role="tablist" aria-label="تصفية الإشعارات">
            <button
              type="button"
              role="tab"
              aria-selected={filter === "all"}
              className={`fn-toolbar__segment${filter === "all" ? " is-active" : ""}`}
              onClick={() => {
                setFilter("all");
                setPage(1);
              }}
            >
              الكل
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "unread"}
              className={`fn-toolbar__segment${filter === "unread" ? " is-active" : ""}`}
              onClick={() => {
                setFilter("unread");
                setPage(1);
              }}
            >
              غير المقروء
            </button>
          </div>
        </div>
        <div className="fn-toolbar__zone fn-toolbar__zone--action">
          <button type="button" className="fn-toolbar__mark-all" onClick={handleReadAll} disabled={!unreadCount || loading}>
            <CheckCheck size={16} strokeWidth={1.75} aria-hidden />
            <span>تعليم الكل كمقروء</span>
          </button>
        </div>
      </div>

      {loading ? (
        <NotificationListSkeleton count={PAGE_SIZE} />
      ) : filteredItems.length === 0 ? (
        <section className="fn-surface fn-empty">
          <span className="fn-empty__icon" aria-hidden>
            <Inbox size={30} strokeWidth={1.5} />
          </span>
          <h2 className="fn-empty__title">
            {searchQuery.trim()
              ? "لا توجد نتائج للبحث"
              : filter === "unread"
                ? "لا توجد إشعارات غير مقروءة"
                : "لا توجد إشعارات حالياً"}
          </h2>
          <p className="fn-empty__sub">
            {searchQuery.trim()
              ? "جرّب كلمات بحث مختلفة أو امسح حقل البحث."
              : "ستظهر التحديثات الجديدة هنا عند توفرها."}
          </p>
        </section>
      ) : (
        <>
        <section className="fn-surface fn-inbox" aria-label="قائمة الإشعارات">
          <div className="fn-notif-list">
            {filteredItems.map((n) => {
              const unread = !n.isRead;
              const details = notificationDetails(n, canShowOrderReference);
              const message = String(n.message || "").trim();
              const description = message || details || "";
              const category = notificationCategory(n.type);
              const relativeTime = fmtRelativeTime(n.createdAt);

              return (
                <article
                  key={n.id}
                  className={`fn-notif-card${unread ? " fn-notif-card--unread" : " fn-notif-card--read"}`.trim()}
                >
                  <button
                    type="button"
                    className="fn-notif-card__surface"
                    onClick={() => handleOpen(n)}
                    aria-label={`${n.title || "إشعار جديد"}${unread ? " — غير مقروء" : ""}`}
                  >
                    <div className="fn-notif-card__start">
                      <div className="fn-notif-card__rail">
                        <div className="fn-notif-card__icon-wrap">
                          <span className={`fn-notif-card__icon fn-notif-card__icon--${category.tone}`} aria-hidden>
                            <NotifTypeIcon type={n.type} />
                          </span>
                          {unread ? <span className="fn-notif-card__dot" title="غير مقروء" /> : null}
                        </div>
                        <span className={`fn-notif-card__pill fn-notif-card__pill--${category.tone}`}>{category.label}</span>
                      </div>
                      <span className="fn-notif-card__rail-sep" aria-hidden />

                      <div className="fn-notif-card__body">
                        <h2 className="fn-notif-card__title">{n.title || "إشعار جديد"}</h2>
                        <p className="fn-notif-card__details">
                          {unread ? <span className="fn-notif-card__details-dot" aria-hidden /> : null}
                          <span className="fn-notif-card__details-category">{category.label}</span>
                        </p>
                        {description ? <p className="fn-notif-card__desc">{description}</p> : null}
                      </div>
                    </div>

                    <div className="fn-notif-card__aside">
                      <time className="fn-notif-card__aside-time" dateTime={n.createdAt}>
                        {relativeTime}
                      </time>
                    </div>
                  </button>
                </article>
              );
            })}
          </div>
        </section>
        {totalPages > 1 ? (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            isLoading={loading}
            className="fn-pagination app-pagination"
          />
        ) : null}
        </>
      )}
    </>
  );

  return <DashboardHubPage className="fdash-page--notifications">{pageBody}</DashboardHubPage>;
}
