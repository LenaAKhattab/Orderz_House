import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  return new Intl.DateTimeFormat("ar", { dateStyle: "short", timeStyle: "short" }).format(d);
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

export default function NotificationsBell({ notificationsPagePath, variant = "navbar" }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const wrapRef = useRef(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await getUnreadNotificationsCountRequest();
      setUnreadCount(Number(res?.data?.unreadCount || 0));
    } catch {
      // keep existing count on transient API failure
    }
  }, []);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMyNotificationsRequest({ limit: 8, offset: 0 });
      const list = Array.isArray(res?.data?.notifications) ? res.data.notifications : [];
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const t = window.setInterval(fetchCount, 30000);
    return () => window.clearInterval(t);
  }, [fetchCount]);

  useEffect(() => {
    if (!open) return;
    fetchLatest();
  }, [open, fetchLatest]);

  useEffect(() => {
    const onDown = (e) => {
      const el = wrapRef.current;
      if (!el || el.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, []);

  const unreadInDropdown = useMemo(() => items.filter((x) => !x.isRead).length, [items]);

  const handleGo = useCallback(
    async (n) => {
      try {
        if (!n?.isRead) await markNotificationReadRequest(n.id);
      } catch {
        // ignore read error and continue navigation
      }
      setOpen(false);
      setUnreadCount((v) => Math.max(0, v - (n?.isRead ? 0 : 1)));
      navigate(n?.link || notificationsPagePath);
    },
    [navigate, notificationsPagePath],
  );

  const handleMarkAll = useCallback(async () => {
    try {
      await markAllNotificationsReadRequest();
      setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
      setUnreadCount(0);
    } catch {
      // no-op
    }
  }, []);

  return (
    <div className={`notif-bell notif-bell--${variant}`} ref={wrapRef}>
      <button
        type="button"
        className={`notif-bell__btn ${variant === "superadmin" ? "oh-sa-icon-btn" : ""}`.trim()}
        aria-label="الإشعارات"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="notif-bell__icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" role="presentation" focusable="false">
            <path
              d="M12 3a5 5 0 0 0-5 5v2.3c0 .95-.3 1.87-.85 2.65L4.6 15.1a1 1 0 0 0 .82 1.57h13.16a1 1 0 0 0 .82-1.57l-1.55-2.15A4.6 4.6 0 0 1 17 10.3V8a5 5 0 0 0-5-5Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9.8 18.4a2.2 2.2 0 0 0 4.4 0"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {unreadCount > 0 ? <span className="notif-bell__badge">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>

      {open ? (
        <div className={`notif-bell__menu ${variant === "superadmin" ? "notif-bell__menu--superadmin" : ""}`.trim()}>
          <div className="notif-bell__head">
            <strong>الإشعارات</strong>
            <button type="button" onClick={handleMarkAll} disabled={!unreadInDropdown}>
              تعليم الكل كمقروء
            </button>
          </div>

          <div className="notif-bell__body">
            {loading ? (
              <div className="notif-bell__empty">جاري التحميل…</div>
            ) : items.length ? (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`notif-bell__item ${n.isRead ? "" : "notif-bell__item--unread"}`.trim()}
                  onClick={() => handleGo(n)}
                >
                  <div className="notif-bell__item-title">{n.title || "إشعار جديد"}</div>
                  {notificationDetails(n) ? <div className="notif-bell__item-actor">{notificationDetails(n)}</div> : null}
                  <div className="notif-bell__item-msg">{n.message || ""}</div>
                  <div className="notif-bell__item-time">{fmtDate(n.createdAt)}</div>
                </button>
              ))
            ) : (
              <div className="notif-bell__empty">لا توجد إشعارات حالياً.</div>
            )}
          </div>

          <button
            type="button"
            className="notif-bell__all"
            onClick={() => {
              setOpen(false);
              navigate(notificationsPagePath);
            }}
          >
            عرض كل الإشعارات
          </button>
        </div>
      ) : null}
    </div>
  );
}
