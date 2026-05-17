import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import {
  getUnreadNotificationsCountRequest,
  listMyNotificationsRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
  NOTIFICATIONS_REFRESH_EVENT,
} from "../../services/api";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { breadcrumbHomeFromUser } from "../../components/dashboard/dashboardBreadcrumbs";
import "./notifications-page.css";

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
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

function NotifTypeIcon({ type }) {
  const t = String(type || "").toLowerCase();
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.85, strokeLinecap: "round", strokeLinejoin: "round" };

  if (t.includes("payment") || t.includes("pay") || t.includes("stripe") || t.includes("invoice")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden {...common}>
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
        <path d="M2.5 10h19" />
        <path d="M7 15h4" />
      </svg>
    );
  }
  if (t.includes("claim") || t.includes("financial")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden {...common}>
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
        <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
      </svg>
    );
  }
  if (t.includes("course") || t.includes("lesson")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden {...common}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <path d="M8 7h8M8 11h6" />
      </svg>
    );
  }
  if (t.includes("order")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden {...common}>
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...common}>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.primaryRole || user?.role;
  const canShowOrderReference = role === "admin" || role === "super_admin";
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, countRes] = await Promise.all([
        listMyNotificationsRequest({
          limit: 100,
          offset: 0,
          ...(filter === "unread" ? { isRead: false } : {}),
        }),
        getUnreadNotificationsCountRequest(),
      ]);
      setItems(Array.isArray(listRes?.data?.notifications) ? listRes.data.notifications : []);
      setUnreadCount(Number(countRes?.data?.unreadCount || 0));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const onRefresh = (ev) => {
      const incoming = ev?.detail?.notification;
      if (incoming?.id) {
        setItems((prev) => {
          if (prev.some((x) => String(x.id) === String(incoming.id))) return prev;
          if (filter === "unread" && incoming.isRead) return prev;
          return [incoming, ...prev];
        });
        if (!incoming.isRead) setUnreadCount((v) => v + 1);
      } else {
        void fetchData();
      }
    };
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
  }, [fetchData, filter]);

  const title = useMemo(() => {
    const role = user?.primaryRole || user?.role;
    if (role === "super_admin") return "إشعارات المدير الأعلى";
    if (role === "admin") return "إشعارات الإدارة";
    return "إشعاراتك";
  }, [user]);

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

  const handleReadAll = useCallback(async () => {
    try {
      await markAllNotificationsReadRequest();
      setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
      setUnreadCount(0);
    } catch {
      // no-op
    }
  }, []);

  return (
    <section className="oh-notif-page container page-content dash-shell">
      <DashboardPageHeader
        eyebrow="مركز الإشعارات"
        title={title}
        description="تابع تحديثات الطلبات، المدفوعات، والمطالبات في مكان واحد."
        breadcrumbs={[
          { label: "الرئيسية", href: breadcrumbHomeFromUser(user) },
          { label: "الإشعارات" },
        ]}
        actions={
          <div className="oh-notif-page__stat" aria-live="polite">
            <span className="oh-notif-page__stat-label">غير المقروء</span>
            <span className="oh-notif-page__stat-value">{unreadCount}</span>
          </div>
        }
      />

      <div className="oh-notif-page__toolbar">
        <div className="oh-notif-page__segmented" role="tablist" aria-label="تصفية الإشعارات">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={`oh-notif-page__segment ${filter === "all" ? "oh-notif-page__segment--active" : ""}`.trim()}
            onClick={() => setFilter("all")}
          >
            الكل
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "unread"}
            className={`oh-notif-page__segment ${filter === "unread" ? "oh-notif-page__segment--active" : ""}`.trim()}
            onClick={() => setFilter("unread")}
          >
            غير المقروء
          </button>
        </div>
        <button type="button" className="oh-notif-page__mark-all" onClick={handleReadAll} disabled={!unreadCount}>
          تعليم الكل كمقروء
        </button>
      </div>

      <div className="oh-notif-page__list">
        {loading ? (
          <div className="oh-notif-page__loading" aria-busy="true">
            <div className="oh-notif-page__loading-dots" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <p style={{ margin: 0 }}>جاري تحميل الإشعارات…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="oh-notif-page__empty">
            <div className="oh-notif-page__empty-visual" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
            </div>
            <p>{filter === "unread" ? "لا توجد إشعارات غير مقروءة." : "لا توجد إشعارات لعرضها."}</p>
          </div>
        ) : (
          items.map((n) => {
            const details = notificationDetails(n, canShowOrderReference);
            const unread = !n.isRead;
            return (
              <article
                key={n.id}
                className={`oh-notif-card ${unread ? "oh-notif-card--unread" : ""}`.trim()}
              >
                <div className="oh-notif-card__icon-wrap">
                  <div className="oh-notif-card__icon" aria-hidden>
                    <NotifTypeIcon type={n.type} />
                  </div>
                  {unread ? <span className="oh-notif-card__dot" title="غير مقروء" /> : null}
                </div>
                <div className="oh-notif-card__body">
                  <div className="oh-notif-card__head">
                    <h2 className="oh-notif-card__title">{n.title || "إشعار جديد"}</h2>
                    <time dateTime={n.createdAt}>{fmtDate(n.createdAt)}</time>
                  </div>
                  {details ? <div className="oh-notif-card__meta">{details}</div> : null}
                  {n.message ? <p className="oh-notif-card__message">{n.message}</p> : null}
                  <div className="oh-notif-card__actions">
                    {unread ? (
                      <button type="button" className="oh-notif-card__btn" onClick={() => handleRead(n)}>
                        تحديد كمقروء
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="oh-notif-card__btn oh-notif-card__btn--primary"
                      onClick={async () => {
                        await handleRead(n);
                        navigate(n.link || "/dashboard");
                      }}
                    >
                      فتح
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
