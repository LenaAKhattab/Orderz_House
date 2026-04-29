import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import {
  getUnreadNotificationsCountRequest,
  listMyNotificationsRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
} from "../../services/api";

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function actorLabel(actor) {
  if (!actor) return "";
  const name = String(actor.fullName || "").trim();
  const acc = String(actor.accountId || "").trim();
  if (name && acc) return `${name} (${acc})`;
  return name || acc || "";
}

function notificationDetails(n) {
  const type = String(n?.type || "").trim();
  const actor = actorLabel(n?.actor);
  const actorFallbackName = String(n?.metadata?.actorName || "").trim();
  const actorFallbackAcc = String(n?.metadata?.actorAccountId || "").trim();
  const actorFallback = actorFallbackName && actorFallbackAcc ? `${actorFallbackName} (${actorFallbackAcc})` : actorFallbackName || actorFallbackAcc || "";
  const actorPart = actor || actorFallback;
  const projectName = String(n?.metadata?.projectName || "").trim();
  const orderCode = String(n?.metadata?.orderCode || "").trim();
  const orderId = String(n?.metadata?.orderId || n?.entityId || "").trim();

  if (type === "order.created") {
    return projectName;
  }

  const orderPart = orderCode ? `${orderCode}` : orderId ? `#${orderId}` : "";
  const projectPart = projectName ? projectName : "";
  const parts = [actorPart, projectPart, orderPart].filter(Boolean);
  return parts.join(" - ");
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
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

  const title = useMemo(() => {
    const role = user?.primaryRole || user?.role;
    if (role === "super_admin") return "إشعارات المدير الأعلى";
    if (role === "admin") return "إشعارات الإدارة";
    if (role === "freelancer") return "إشعاراتك";
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
    <section className="dash-shell">
      <div className="container dash">
        <div className="dash-hero dash-hero--compact">
          <div>
            <p className="dash-hero__kicker">Notifications</p>
            <h1 className="dash-hero__title">{title}</h1>
            <p className="dash-hero__subtitle">تابع كل التحديثات المهمة على طلباتك ومدفوعاتك.</p>
          </div>
          <div className="dash-hero__badges">
            <span className="dash-badge">غير المقروء: {unreadCount}</span>
          </div>
        </div>

        <div className="notifications-page__toolbar">
          <div className="notifications-page__filters">
            <button
              type="button"
              className={filter === "all" ? "is-active" : ""}
              onClick={() => setFilter("all")}
            >
              الكل
            </button>
            <button
              type="button"
              className={filter === "unread" ? "is-active" : ""}
              onClick={() => setFilter("unread")}
            >
              غير المقروء
            </button>
          </div>
          <button type="button" className="notifications-page__read-all" onClick={handleReadAll} disabled={!unreadCount}>
            تعليم الكل كمقروء
          </button>
        </div>

        <div className="notifications-page__list">
          {loading ? (
            <div className="notifications-page__empty">جاري تحميل الإشعارات…</div>
          ) : items.length === 0 ? (
            <div className="notifications-page__empty">لا توجد إشعارات لعرضها.</div>
          ) : (
            items.map((n) => (
              <article key={n.id} className={`notifications-page__item ${n.isRead ? "" : "is-unread"}`.trim()}>
                <div className="notifications-page__item-head">
                  <h3>{n.title || "إشعار جديد"}</h3>
                  <time>{fmtDate(n.createdAt)}</time>
                </div>
                {notificationDetails(n) ? <div className="notifications-page__item-actor">{notificationDetails(n)}</div> : null}
                <p>{n.message || ""}</p>
                <div className="notifications-page__item-actions">
                  {!n.isRead ? (
                    <button type="button" onClick={() => handleRead(n)}>
                      تحديد كمقروء
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={async () => {
                      await handleRead(n);
                      navigate(n.link || "/dashboard");
                    }}
                  >
                    فتح
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
