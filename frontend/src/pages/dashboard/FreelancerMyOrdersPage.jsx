import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDot,
  ClipboardList,
  Hourglass,
  Inbox,
  LayoutGrid,
  PencilLine,
  Play,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { computeActiveWorkloadCount } from "../../utils/freelancerDashboardData";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import { listMyAssignedOrdersRequest } from "../../services/api";
import Pagination from "../../components/common/Pagination";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import DashboardHubSkeletonCards from "../../components/dashboard/hub/DashboardHubSkeletonCards";
import HubMetricSkeleton from "../../components/dashboard/hub/HubMetricSkeleton";
import MyOrderCard from "../../components/dashboard/hub/MyOrderCard";
import "../../styles/dashboardHub.css";
import "./freelancerMyOrders.css";

const VALID_STATUS_IDS = new Set([
  "all",
  "revision_required",
  "assigned",
  "in_progress",
  "pending_client_review",
  "completed",
  "cancelled",
]);

function parseStatusFromSearch(searchParams) {
  const q = String(searchParams.get("status") || "").trim();
  return VALID_STATUS_IDS.has(q) ? q : "all";
}

function StatSegment({ tone, Icon, value, label, loading }) {
  return (
    <div className={`fmo-stat-segment fmo-stat-segment--${tone}`}>
      <span className="fmo-stat-segment__icon" aria-hidden>
        <Icon size={18} strokeWidth={2} />
      </span>
      <div className="fmo-stat-segment__copy">
        {loading ? (
          <HubMetricSkeleton variant="stat" />
        ) : (
          <strong className="fmo-stat-segment__value">{value}</strong>
        )}
        <span className="fmo-stat-segment__label">{label}</span>
      </div>
    </div>
  );
}

export default function FreelancerMyOrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { push } = useToast();
  const { t, dir } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = user?.primaryRole || user?.role;
  const isFreelancer = role === "freelancer";

  const statusFilters = useMemo(
    () => [
      { id: "all", label: t("freelancerDashboard.myOrders.filters.all"), Icon: LayoutGrid },
      { id: "revision_required", label: t("freelancerDashboard.myOrders.filters.revisionRequired"), Icon: PencilLine },
      { id: "assigned", label: t("freelancerDashboard.myOrders.filters.assigned"), Icon: CircleDot },
      { id: "in_progress", label: t("freelancerDashboard.myOrders.filters.inProgress"), Icon: Play },
      {
        id: "pending_client_review",
        label: t("freelancerDashboard.myOrders.filters.pendingReview"),
        Icon: Hourglass,
      },
      { id: "completed", label: t("freelancerDashboard.myOrders.filters.completed"), Icon: Check },
      { id: "cancelled", label: t("freelancerDashboard.myOrders.filters.cancelled"), Icon: X },
    ],
    [t],
  );

  const sortOptions = useMemo(
    () => [
      { value: "newest", label: t("freelancerDashboard.myOrders.sort.newest") },
      { value: "oldest", label: t("freelancerDashboard.myOrders.sort.oldest") },
      { value: "price_high", label: t("freelancerDashboard.myOrders.sort.priceHigh") },
      { value: "price_low", label: t("freelancerDashboard.myOrders.sort.priceLow") },
    ],
    [t],
  );

  const [orders, setOrders] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [statusFilter, setStatusFilter] = useState(() => parseStatusFromSearch(searchParams));
  const [sortBy, setSortBy] = useState("newest");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 1 });
  const [counts, setCounts] = useState({
    all: 0,
    revisionRequired: 0,
    assigned: 0,
    inProgress: 0,
    waitingClientApproval: 0,
    completed: 0,
    canceled: 0,
  });
  const [loadError, setLoadError] = useState("");
  const [reloadTick, setReloadTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef(null);
  const cacheRef = useRef({});
  const forceRefreshRef = useRef(false);
  const fetchGenRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const activePage = pagination?.page || page || 1;
  const totalPages = Math.max(1, Number(pagination?.totalPages || 1));
  const pageLimit = Number(pagination?.limit) || 12;
  const cacheKey = `${statusFilter}:${sortBy}:${page}:${searchQuery}`;
  const statsLoading = initialLoading && !hasLoadedOnce;
  const listSkeletonVisible = initialLoading && !orders.length;

  const statusCounts = useMemo(
    () => ({
      all: counts.all || 0,
      revision_required: counts.revisionRequired || 0,
      assigned: counts.assigned || 0,
      in_progress: counts.inProgress || 0,
      pending_client_review: counts.waitingClientApproval || 0,
      completed: counts.completed || 0,
      cancelled: counts.canceled || 0,
    }),
    [counts],
  );

  const activeCount = useMemo(() => computeActiveWorkloadCount(counts), [counts]);

  useEffect(() => {
    const fromUrl = parseStatusFromSearch(searchParams);
    if (fromUrl !== statusFilter) setStatusFilter(fromUrl);
  }, [searchParams, statusFilter]);

  const handleStatusFilterChange = useCallback(
    (nextId) => {
      setStatusFilter(nextId);
      if (nextId === "all") {
        setSearchParams({}, { replace: true });
      } else {
        setSearchParams({ status: nextId }, { replace: true });
      }
    },
    [setSearchParams],
  );

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, sortBy, searchQuery]);

  useEffect(() => {
    if (!user || authLoading || !isFreelancer) return undefined;

    let cancelled = false;
    const fetchGen = ++fetchGenRef.current;

    async function load() {
      setLoadError("");

      const skipCache = forceRefreshRef.current;
      if (skipCache) forceRefreshRef.current = false;

      const cached = !skipCache ? cacheRef.current[cacheKey] : null;
      if (cached) {
        if (cancelled || fetchGen !== fetchGenRef.current) return;
        setOrders(cached.orders);
        setPagination(cached.pagination);
        setCounts(cached.counts);
        setInitialLoading(false);
        setIsRefetching(false);
        setRefreshing(false);
        if (!hasLoadedOnceRef.current) {
          hasLoadedOnceRef.current = true;
          setHasLoadedOnce(true);
        }
        return;
      }

      const showInitialSkeleton = !hasLoadedOnceRef.current && ordersRef.current.length === 0;
      if (showInitialSkeleton) {
        setInitialLoading(true);
      } else {
        setIsRefetching(true);
      }

      try {
        const params = { page, limit: 12, status: statusFilter, sort: sortBy };
        if (searchQuery) params.q = searchQuery;
        const res = await listMyAssignedOrdersRequest(params);
        if (cancelled || fetchGen !== fetchGenRef.current) return;
        const nextOrders = res?.data?.orders || [];
        const nextPagination = res?.data?.pagination || {
          page,
          limit: 12,
          total: nextOrders.length,
          totalPages: 1,
        };
        const nextCounts = res?.data?.counts || {};
        setOrders(nextOrders);
        setPagination(nextPagination);
        setCounts(nextCounts);
        cacheRef.current = {
          ...cacheRef.current,
          [cacheKey]: { orders: nextOrders, pagination: nextPagination, counts: nextCounts },
        };
        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
      } catch {
        if (!cancelled && fetchGen === fetchGenRef.current) {
          const msg = t("freelancerDashboard.myOrders.loadError");
          setLoadError(msg);
          push({ type: "error", title: t("freelancerDashboard.myOrders.loadErrorTitle"), message: msg });
        }
      } finally {
        if (!cancelled && fetchGen === fetchGenRef.current) {
          setInitialLoading(false);
          setIsRefetching(false);
          setRefreshing(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, isFreelancer, page, statusFilter, sortBy, searchQuery, push, reloadTick, cacheKey, t]);

  useEffect(() => {
    if (!user || authLoading || !isFreelancer || !hasLoadedOnce) return undefined;

    const POLL_MS = 45_000;
    let intervalId = null;
    let visTimer = null;
    let lastBackgroundFetchAt = 0;

    const triggerBackgroundRefresh = () => {
      const now = Date.now();
      if (now - lastBackgroundFetchAt < 5_000) return;
      lastBackgroundFetchAt = now;
      forceRefreshRef.current = true;
      setReloadTick((x) => x + 1);
    };

    intervalId = setInterval(() => {
      if (document.visibilityState === "visible") {
        triggerBackgroundRefresh();
      }
    }, POLL_MS);

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(visTimer);
      visTimer = setTimeout(triggerBackgroundRefresh, 1_500);
    };

    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(intervalId);
      clearTimeout(visTimer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [hasLoadedOnce, user, authLoading, isFreelancer]);

  const retryLoad = () => {
    forceRefreshRef.current = true;
    setReloadTick((x) => x + 1);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    forceRefreshRef.current = true;
    setReloadTick((x) => x + 1);
  };

  const handlePageChange = useCallback((nextPage) => {
    setPage(nextPage);
    window.requestAnimationFrame(() => {
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const emptyCopy = useMemo(() => {
    if (counts.all === 0 && !searchQuery) {
      return {
        title: t("freelancerDashboard.emptyStates.myOrders.noneTitle"),
        sub: t("freelancerDashboard.emptyStates.myOrders.noneSub"),
        actionLabel: t("freelancerDashboard.emptyStates.myOrders.browseOrders"),
        actionTo: "/dashboard/freelancer/orders",
      };
    }
    if (searchQuery) {
      return {
        title: t("freelancerDashboard.emptyStates.myOrders.searchTitle"),
        sub: t("freelancerDashboard.emptyStates.myOrders.searchSub"),
        actionLabel: t("freelancerDashboard.emptyStates.myOrders.clearSearch"),
        onAction: () => setSearchInput(""),
      };
    }
    return {
      title: t("freelancerDashboard.emptyStates.myOrders.filterTitle"),
      sub: t("freelancerDashboard.emptyStates.myOrders.filterSub"),
      actionLabel: statusFilter !== "all" ? t("freelancerDashboard.emptyStates.myOrders.showAll") : null,
      onAction: statusFilter !== "all" ? () => handleStatusFilterChange("all") : null,
    };
  }, [counts.all, searchQuery, statusFilter, handleStatusFilterChange, t]);

  const shownCount = listSkeletonVisible ? 0 : orders.length;
  const totalCount = listSkeletonVisible ? 0 : Number(pagination.total || 0);
  const EmptyCtaArrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <DashboardHubPage className="fdash-page--my-orders">
      <header className="fmo-surface fmo-header">
        <div className="fmo-header__copy">
          <h1 className="fmo-header__title">{t("freelancerDashboard.myOrders.title")}</h1>
          <p className="fmo-header__subtitle">{t("freelancerDashboard.myOrders.subtitle")}</p>
        </div>
        <div className="fmo-header__art" aria-hidden>
          <span className="fmo-header__icon-chip">
            <ClipboardList size={32} strokeWidth={1.85} />
          </span>
        </div>
      </header>

      <div className="fmo-surface fmo-stats-bar" aria-label={t("freelancerDashboard.stats.myOrders.summaryAria")}>
        <StatSegment
          tone="slate"
          Icon={ClipboardList}
          value={counts.all || 0}
          label={t("freelancerDashboard.stats.myOrders.total")}
          loading={statsLoading}
        />
        <StatSegment
          tone="amber"
          Icon={Play}
          value={activeCount}
          label={t("freelancerDashboard.stats.myOrders.active")}
          loading={statsLoading}
        />
        <StatSegment
          tone="purple"
          Icon={Hourglass}
          value={counts.waitingClientApproval || 0}
          label={t("freelancerDashboard.stats.myOrders.pendingReview")}
          loading={statsLoading}
        />
        <StatSegment
          tone="green"
          Icon={Check}
          value={counts.completed || 0}
          label={t("freelancerDashboard.stats.myOrders.completed")}
          loading={statsLoading}
        />
        <StatSegment
          tone="rose"
          Icon={X}
          value={counts.canceled || 0}
          label={t("freelancerDashboard.stats.myOrders.cancelled")}
          loading={statsLoading}
        />
      </div>

      <nav className="fmo-surface fmo-tabs-bar" aria-label={t("freelancerDashboard.myOrders.filterAria")}>
        {statusFilters.map(({ id, label, Icon }) => {
          const active = statusFilter === id;
          const alert = id === "revision_required" && Number(statusCounts.revision_required) > 0;
          return (
            <button
              key={id}
              type="button"
              className={`fmo-tabs-bar__btn${active ? " is-active" : ""}${alert ? " is-alert" : ""}`}
              aria-pressed={active}
              onClick={() => handleStatusFilterChange(id)}
            >
              <Icon size={15} strokeWidth={2.1} aria-hidden />
              <span>{label}</span>
              {statsLoading ? (
                <HubMetricSkeleton variant="count" />
              ) : (
                <span className="fmo-tabs-bar__count">{statusCounts[id] ?? 0}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="fmo-surface fmo-toolbar">
        <div className="fmo-toolbar__search">
          <Search size={17} strokeWidth={2} className="fmo-toolbar__search-icon" aria-hidden />
          <input
            type="search"
            className="fmo-toolbar__search-input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("freelancerDashboard.myOrders.searchPlaceholder")}
            aria-label={t("freelancerDashboard.myOrders.searchAria")}
          />
        </div>
        <div className="fmo-toolbar__actions">
          <label className="fmo-toolbar__sort">
            <span className="fmo-toolbar__sort-prefix">{t("freelancerDashboard.myOrders.sortPrefix")}</span>
            <select
              className="fmo-toolbar__sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label={t("freelancerDashboard.myOrders.sortAria")}
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`fmo-toolbar__refresh${refreshing || isRefetching ? " is-spinning" : ""}`}
            onClick={handleRefresh}
            disabled={refreshing || initialLoading}
            aria-label={t("freelancerDashboard.myOrders.refreshAria")}
            title={t("freelancerDashboard.myOrders.refreshTitle")}
          >
            <RefreshCw size={17} strokeWidth={2.2} />
          </button>
        </div>
        {isRefetching ? (
          <p className="fmo-toolbar__hint help" role="status" aria-live="polite">
            {t("orders.marketplace.refreshing")}
          </p>
        ) : null}
      </div>

      <section
        className="fmo-surface fmo-content"
        ref={listRef}
        aria-label={t("freelancerDashboard.myOrders.listAria")}
        aria-busy={isRefetching || undefined}
      >
        {listSkeletonVisible ? (
          <DashboardHubSkeletonCards count={4} variant="order-row" />
        ) : loadError ? (
          <div className="fmo-alert">
            <p>{loadError}</p>
            <button type="button" className="fmo-toolbar__refresh fmo-toolbar__refresh--label" onClick={retryLoad}>
              {t("freelancerDashboard.common.retry")}
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="fmo-empty">
            <span className="fmo-empty__icon-chip" aria-hidden>
              <Inbox size={36} strokeWidth={1.6} />
            </span>
            <h3 className="fmo-empty__title">{emptyCopy.title}</h3>
            <p className="fmo-empty__sub">{emptyCopy.sub}</p>
            {emptyCopy.actionLabel && emptyCopy.actionTo ? (
              <Link className="fmo-empty__cta" to={emptyCopy.actionTo}>
                <span>{emptyCopy.actionLabel}</span>
                <EmptyCtaArrow size={16} strokeWidth={2.2} aria-hidden />
              </Link>
            ) : null}
            {emptyCopy.actionLabel && emptyCopy.onAction && !emptyCopy.actionTo ? (
              <button type="button" className="fmo-empty__cta" onClick={emptyCopy.onAction}>
                <span>{emptyCopy.actionLabel}</span>
                <EmptyCtaArrow size={16} strokeWidth={2.2} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : (
          <div className="fmo-orders-list">
            {orders.map((order) => (
              <MyOrderCard
                key={order.id}
                order={order}
                detailsPath={`/dashboard/freelancer/my-orders/${order.id}`}
              />
            ))}
          </div>
        )}

        <footer className="fmo-list-footer">
          <p className="fmo-list-footer__meta">
            {t("freelancerDashboard.stats.myOrders.showing", { shown: shownCount, total: totalCount })}
          </p>
          <div className="fmo-list-footer__end">
            <span className="fmo-list-footer__pagesize" aria-hidden={false}>
              {t("freelancerDashboard.stats.myOrders.perPage", { limit: pageLimit })}
            </span>
            {totalPages > 1 || totalCount > 0 ? (
              <Pagination
                currentPage={activePage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                isLoading={initialLoading || isRefetching || refreshing}
                siblingCount={1}
                className="fmo-pagination app-pagination"
              />
            ) : null}
          </div>
        </footer>
      </section>
    </DashboardHubPage>
  );
}
