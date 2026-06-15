import { Link } from "react-router-dom";
import { useTranslation } from "../../../../i18n/LanguageProvider";
import WidgetLoadError from "./WidgetLoadError";

function fmtShort(value, locale) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const intlLocale = locale === "en" ? "en-JO-u-nu-latn" : "ar-JO-u-nu-latn";
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: "short", timeStyle: "short" }).format(d);
}

export default function NotificationsPreview({
  notifications = [],
  unreadCount = 0,
  loadState = "ok",
  loadError = "",
  onRetry,
  loading,
}) {
  const { t, locale } = useTranslation();

  if (loading) {
    return (
      <article className="fdash-cc-card">
        <div className="fdash-cc-skel" style={{ height: 100 }} />
      </article>
    );
  }

  const failed = loadState === "error";

  return (
    <article className="fdash-cc-card fdash-cc-card--notif">
      <header className="fdash-cc-card__head">
        <h3 className="fdash-cc-card__title">
          {t("freelancerDashboard.controlCenter.notifications.title")}
          {unreadCount > 0 ? <span className="fdash-cc-notif-badge">{unreadCount}</span> : null}
        </h3>
        <Link to="/dashboard/freelancer/notifications" className="fdash-cc-card__link">
          {t("freelancerDashboard.controlCenter.notifications.viewAll")}
        </Link>
      </header>
      {failed ? (
        <WidgetLoadError
          message={loadError || t("freelancerDashboard.controlCenter.notifications.loadError")}
          onRetry={onRetry}
        />
      ) : notifications.length === 0 ? (
        <p className="fdash-cc-card__muted">{t("freelancerDashboard.controlCenter.notifications.empty")}</p>
      ) : (
        <ul className="fdash-cc-notif-list">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={n.isRead ? "fdash-cc-notif-item" : "fdash-cc-notif-item fdash-cc-notif-item--unread"}
            >
              <Link to={n.link || "/dashboard/freelancer/notifications"} className="fdash-cc-notif-item__link">
                <strong>{n.title || t("freelancerDashboard.controlCenter.notifications.defaultTitle")}</strong>
                <span>{n.message || ""}</span>
                <time dateTime={n.createdAt}>{fmtShort(n.createdAt, locale)}</time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
