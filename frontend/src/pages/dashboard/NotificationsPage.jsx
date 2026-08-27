import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  FileText,
  GraduationCap,
  Inbox,
  MessageSquare,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import {
  deleteNotificationRequest,
  deleteNotificationsBulkRequest,
  getUnreadNotificationsCountRequest,
  listMyNotificationsRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
  NOTIFICATIONS_REFRESH_EVENT,
} from "../../services/api";
import Pagination from "../../components/common/Pagination";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import HubMetricSkeleton from "../../components/dashboard/hub/HubMetricSkeleton";
import NotificationListSkeleton from "../../components/dashboard/hub/NotificationListSkeleton";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getNotificationDetails, getNotificationTypeIconKind } from "../../utils/notificationDisplay";
import { resolveSafeInternalNavPath } from "../../utils/safeInternalNavPath";
import { createAdminListRequestGate } from "../../lib/staff/adminListLoad";
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

function fmtDate(value, locale) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const tag = locale === "en" ? "en-JO-u-nu-latn" : "ar-JO-u-nu-latn";
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function fmtRelativeTime(value, t, locale) {
  if (!value) return "";
  const d = new Date(value);
  const diff = Date.now() - d.getTime();
  if (!Number.isFinite(diff)) return "";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("freelancerDashboard.notificationsPage.relativeNow");
  if (mins < 60) return t("freelancerDashboard.notificationsPage.relativeMinutes", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("freelancerDashboard.notificationsPage.relativeHours", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("freelancerDashboard.notificationsPage.relativeDays", { count: days });
  return fmtDate(value, locale);
}

function notificationCategory(type, t) {
  const raw = String(type || "").toLowerCase();
  if (raw.includes("feedback") || raw.includes("message") || raw.includes("chat")) {
    return { label: t("freelancerDashboard.notificationsPage.categoryMessages"), tone: "emerald" };
  }
  if (raw.includes("claim") || raw.includes("financial") || raw.includes("payment") || raw.includes("pay") || raw.includes("stripe") || raw.includes("invoice")) {
    return { label: t("freelancerDashboard.notificationsPage.categoryClaims"), tone: "violet" };
  }
  if (raw.includes("course") || raw.includes("lesson")) {
    return { label: t("freelancerDashboard.notificationsPage.categoryCourses"), tone: "amber" };
  }
  if (raw.includes("order")) {
    return { label: t("freelancerDashboard.notificationsPage.categoryOrders"), tone: "blue" };
  }
  return { label: t("freelancerDashboard.notificationsPage.categoryAlert"), tone: "teal" };
}

function NotifTypeIcon({ type }) {
  const props = { size: 21, strokeWidth: 1.5, "aria-hidden": true };
  const kind = getNotificationTypeIconKind(type);
  if (kind === "message") return <MessageSquare {...props} />;
  if (kind === "wallet") return <Wallet {...props} />;
  if (kind === "course") return <GraduationCap {...props} />;
  if (kind === "order") return <FileText {...props} />;
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
  const { t, locale, isLanguageSwitching } = useTranslation();
  const role = user?.primaryRole || user?.role;
  const isDashboardHubShell = role === "freelancer" || role === "client";
  const canSelectDelete = role === "admin" || role === "super_admin";
  const canShowOrderReference = role === "admin" || role === "super_admin";
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [allTotal, setAllTotal] = useState(0);
  const [listTotal, setListTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const listGateRef = useRef(null);
  if (!listGateRef.current) listGateRef.current = createAdminListRequestGate();

  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));

  const fetchData = useCallback(async () => {
    const ticket = listGateRef.current.begin();
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
      if (!ticket.isCurrent()) return;
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
      setSelectedIds(new Set());
    } catch {
      if (!ticket.isCurrent()) return;
      /* Keep previous rows — do not clear on refresh/list failure. */
    } finally {
      if (ticket.isCurrent()) setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    void fetchData();
    return () => listGateRef.current?.abortInFlight();
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
    if (role === "super_admin") return t("freelancerDashboard.notificationsPage.titleSuperAdmin");
    if (role === "admin") return t("freelancerDashboard.notificationsPage.titleAdmin");
    return t("freelancerDashboard.notificationsPage.titleFreelancer");
  }, [role, t]);

  const subtitle = useMemo(() => {
    if (isDashboardHubShell) return t("freelancerDashboard.notificationsPage.subtitleHub");
    return t("freelancerDashboard.notificationsPage.subtitleStaff");
  }, [isDashboardHubShell, t]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((n) => {
      const details = getNotificationDetails(n, canShowOrderReference, {
        locale,
        categoryPrefix: t("freelancerDashboard.notificationsPage.feedbackCategoryPrefix"),
        topicPrefix: t("freelancerDashboard.notificationsPage.feedbackTopicPrefix"),
      });
      const hay = [n.title, n.message, details, n.type].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [items, searchQuery, canShowOrderReference, locale, t]);

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
      navigate(resolveSafeInternalNavPath(n?.link, "/dashboard"));
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

  const toggleSelected = useCallback((id, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(String(id));
      else next.delete(String(id));
      return next;
    });
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    const ids = [...selectedIds];
    if (!ids.length || deleting) return;
    setDeleting(true);
    try {
      if (ids.length === 1) {
        await deleteNotificationRequest(ids[0]);
      } else {
        await deleteNotificationsBulkRequest(ids);
      }
      setSelectedIds(new Set());
      setConfirmDeleteOpen(false);
      void fetchData();
    } catch {
      // no-op
    } finally {
      setDeleting(false);
    }
  }, [selectedIds, deleting, fetchData]);

  const showLoading = loading || isLanguageSwitching;
  const selectedCount = selectedIds.size;

  const pageBody = (
    <>
      <header className="fn-surface fn-header">
        <div className="fn-header__copy">
          <h1 className="fn-header__title">{title}</h1>
          <p className="fn-header__subtitle">{subtitle}</p>
        </div>
        <div className="fn-stats-bar" aria-label={t("freelancerDashboard.notificationsPage.summaryAria")}>
          <StatSegment tone="slate" Icon={FileText} label={t("freelancerDashboard.notificationsPage.total")} value={allTotal} loading={showLoading} />
          <StatSegment tone="blue" Icon={Bell} label={t("freelancerDashboard.notificationsPage.unread")} value={unreadCount} loading={showLoading} />
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
              placeholder={t("freelancerDashboard.notificationsPage.searchPlaceholder")}
              aria-label={t("freelancerDashboard.notificationsPage.searchAria")}
            />
          </div>
        </div>
        <div className="fn-toolbar__zone fn-toolbar__zone--filters">
          <div className="fn-toolbar__segmented" role="tablist" aria-label={t("freelancerDashboard.notificationsPage.filterAria")}>
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
              {t("freelancerDashboard.notificationsPage.filterAll")}
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
              {t("freelancerDashboard.notificationsPage.filterUnread")}
            </button>
          </div>
        </div>
        <div className="fn-toolbar__zone fn-toolbar__zone--action">
          {canSelectDelete && selectedCount > 0 ? (
            <button
              type="button"
              className="fn-toolbar__mark-all fn-toolbar__delete-selected"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleting || showLoading}
              data-testid="notifications-bulk-delete"
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden />
              <span>حذف المحدد ({selectedCount})</span>
            </button>
          ) : null}
          <button type="button" className="fn-toolbar__mark-all" onClick={handleReadAll} disabled={!unreadCount || showLoading}>
            <CheckCheck size={16} strokeWidth={1.75} aria-hidden />
            <span>{t("freelancerDashboard.notificationsPage.markAllRead")}</span>
          </button>
        </div>
      </div>

      {showLoading ? (
        <NotificationListSkeleton count={PAGE_SIZE} />
      ) : filteredItems.length === 0 ? (
        <section className="fn-surface fn-empty">
          <span className="fn-empty__icon" aria-hidden>
            <Inbox size={30} strokeWidth={1.5} />
          </span>
          <h2 className="fn-empty__title">
            {searchQuery.trim()
              ? t("freelancerDashboard.notificationsPage.emptySearch")
              : filter === "unread"
                ? t("freelancerDashboard.notificationsPage.emptyUnread")
                : t("freelancerDashboard.notificationsPage.emptyAll")}
          </h2>
          <p className="fn-empty__sub">
            {searchQuery.trim()
              ? t("freelancerDashboard.notificationsPage.emptySearchSub")
              : t("freelancerDashboard.notificationsPage.emptyDefaultSub")}
          </p>
        </section>
      ) : (
        <>
        <section className="fn-surface fn-inbox" aria-label={t("freelancerDashboard.notificationsPage.listAria")}>
          <div className="fn-notif-list">
            {filteredItems.map((n) => {
              const unread = !n.isRead;
              const details = getNotificationDetails(n, canShowOrderReference, {
                locale,
                categoryPrefix: t("freelancerDashboard.notificationsPage.feedbackCategoryPrefix"),
                topicPrefix: t("freelancerDashboard.notificationsPage.feedbackTopicPrefix"),
              });
              const message = String(n.message || "").trim();
              const category = notificationCategory(n.type, t);
              const relativeTime = fmtRelativeTime(n.createdAt, t, locale);
              const cardTitle = n.title || t("freelancerDashboard.notificationsPage.newNotification");
              const isFeedbackNotif = String(n?.type || "").startsWith("feedback.");
              // Feedback: show labeled category/topic details first; keep message as secondary body.
              const description = isFeedbackNotif
                ? [details, message].filter(Boolean).join("\n")
                : message || details || "";
              const isSelected = selectedIds.has(String(n.id));

              return (
                <article
                  key={n.id}
                  className={`fn-notif-card${unread ? " fn-notif-card--unread" : " fn-notif-card--read"}${isSelected ? " fn-notif-card--selected" : ""}`.trim()}
                >
                  {canSelectDelete ? (
                    <label
                      className="fn-notif-card__select"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleSelected(n.id, e.target.checked)}
                        aria-label={`تحديد: ${cardTitle}`}
                        data-testid="notification-select"
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="fn-notif-card__surface"
                    onClick={() => handleOpen(n)}
                    aria-label={`${cardTitle}${unread ? t("freelancerDashboard.notificationsPage.unreadSuffix") : ""}`}
                  >
                    <div className="fn-notif-card__start">
                      <div className="fn-notif-card__rail">
                        <div className="fn-notif-card__icon-wrap">
                          <span className={`fn-notif-card__icon fn-notif-card__icon--${category.tone}`} aria-hidden>
                            <NotifTypeIcon type={n.type} />
                          </span>
                          {unread ? <span className="fn-notif-card__dot" title={t("freelancerDashboard.notificationsPage.unreadTitle")} /> : null}
                        </div>
                        <span className={`fn-notif-card__pill fn-notif-card__pill--${category.tone}`}>{category.label}</span>
                      </div>
                      <span className="fn-notif-card__rail-sep" aria-hidden />

                      <div className="fn-notif-card__body">
                        <h2 className="fn-notif-card__title">{cardTitle}</h2>
                        <p className="fn-notif-card__details">
                          {unread ? <span className="fn-notif-card__details-dot" aria-hidden /> : null}
                          <span className="fn-notif-card__details-category">{category.label}</span>
                        </p>
                        {description ? (
                          <p className={`fn-notif-card__desc${isFeedbackNotif && details ? " fn-notif-card__desc--stacked" : ""}`}>
                            {description}
                          </p>
                        ) : null}
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
            isLoading={showLoading}
            className="fn-pagination app-pagination"
          />
        ) : null}
        </>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="حذف الإشعارات المحددة؟"
        body={`سيتم حذف ${selectedCount} إشعار بشكل نهائي. لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        confirmVariant="danger"
        confirmBusy={deleting}
        onCancel={() => {
          if (!deleting) setConfirmDeleteOpen(false);
        }}
        onConfirm={() => void handleDeleteSelected()}
      />
    </>
  );

  return <DashboardHubPage className="fdash-page--notifications">{pageBody}</DashboardHubPage>;
}
