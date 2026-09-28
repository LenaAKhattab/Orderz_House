import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getUnreadNotificationsCountRequest,
  listMyNotificationsRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
  NOTIFICATIONS_REFRESH_EVENT,
} from "../../services/notificationsApi";
import { useAuth } from "../../context/useAuth";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/notificationsUiResources";
import { getNotificationDetails } from "../../utils/notificationDisplay";
import { resolveSafeInternalNavPath } from "../../utils/safeInternalNavPath";

function fmtDate(value, locale) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const tag = locale === "en" ? "en-JO-u-nu-latn" : "ar-JO-u-nu-latn";
  return new Intl.DateTimeFormat(tag, { dateStyle: "short", timeStyle: "short" }).format(d);
}

export default function NotificationsBell({ notificationsPagePath, variant = "navbar" }) {
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const role = user?.primaryRole || user?.role;
  const canShowOrderReference = role === "admin" || role === "super_admin";
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
    const onRefresh = (ev) => {
      const incoming = ev?.detail?.notification;
      const delta = Number(ev?.detail?.unreadDelta);
      if (incoming?.id) {
        setItems((prev) => {
          if (prev.some((x) => String(x.id) === String(incoming.id))) return prev;
          return [incoming, ...prev].slice(0, 8);
        });
        if (!incoming.isRead && Number.isFinite(delta) && delta > 0) {
          setUnreadCount((v) => v + delta);
        } else if (!incoming.isRead) {
          setUnreadCount((v) => v + 1);
        }
      }
      void fetchCount();
      if (open) void fetchLatest();
    };
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
  }, [fetchCount, fetchLatest, open]);

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
      navigate(resolveSafeInternalNavPath(n?.link, notificationsPagePath));
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
        aria-label={t("notificationsUi.bell.ariaLabel")}
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
            <strong>{t("notificationsUi.bell.title")}</strong>
            <button type="button" onClick={handleMarkAll} disabled={!unreadInDropdown}>
              {t("notificationsUi.bell.markAllRead")}
            </button>
          </div>

          <div className="notif-bell__body">
            {loading ? (
              <div className="notif-bell__empty">{t("notificationsUi.bell.loading")}</div>
            ) : items.length ? (
              items.map((n) => {
                const details = getNotificationDetails(n, canShowOrderReference, {
                  locale,
                  categoryPrefix: t("freelancerDashboard.notificationsPage.feedbackCategoryPrefix"),
                  topicPrefix: t("freelancerDashboard.notificationsPage.feedbackTopicPrefix"),
                });
                const unread = !n.isRead;
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`notif-bell__item ${unread ? "notif-bell__item--unread" : ""}`.trim()}
                    onClick={() => handleGo(n)}
                  >
                    <div className="notif-bell__item-top">
                      <span className="notif-bell__item-dot" aria-hidden />
                      <div className="notif-bell__item-title">{n.title || t("notificationsUi.bell.newNotification")}</div>
                    </div>
                    {details ? <div className="notif-bell__item-actor">{details}</div> : null}
                    {n.message ? <div className="notif-bell__item-msg">{n.message}</div> : null}
                    <div className="notif-bell__item-time">{fmtDate(n.createdAt, locale)}</div>
                  </button>
                );
              })
            ) : (
              <div className="notif-bell__empty">{t("notificationsUi.bell.empty")}</div>
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
            {t("notificationsUi.bell.viewAll")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
