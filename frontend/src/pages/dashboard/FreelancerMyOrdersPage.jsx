import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
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
import { listMyAssignedOrdersRequest } from "../../services/api";
import Pagination from "../../components/common/Pagination";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import DashboardHubSkeletonCards from "../../components/dashboard/hub/DashboardHubSkeletonCards";
import HubMetricSkeleton from "../../components/dashboard/hub/HubMetricSkeleton";
import MyOrderCard from "../../components/dashboard/hub/MyOrderCard";
import "../../styles/dashboardHub.css";
import "./freelancerMyOrders.css";

const STATUS_FILTERS = [
  { id: "all", label: "الكل", Icon: LayoutGrid },
  { id: "revision_required", label: "تعديلات مطلوبة", Icon: PencilLine },
  { id: "assigned", label: "مُسند", Icon: CircleDot },
  { id: "in_progress", label: "قيد التنفيذ", Icon: Play },
  { id: "pending_client_review", label: "بانتظار المراجعة", Icon: Hourglass },
  { id: "completed", label: "مكتمل", Icon: Check },
  { id: "cancelled", label: "ملغي", Icon: X },
];

const SORT_OPTIONS = [
  { value: "newest", label: "الأحدث" },
  { value: "oldest", label: "الأقدم" },
  { value: "price_high", label: "السعر الأعلى" },
  { value: "price_low", label: "السعر الأقل" },
];

const VALID_STATUS_IDS = new Set(STATUS_FILTERS.map((f) => f.id));

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
  const [searchParams, setSearchParams] = useSearchParams();
  const role = user?.primaryRole || user?.role;
  const isFreelancer = role === "freelancer";

  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(true);
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
  const [cache, setCache] = useState({});
  const listRef = useRef(null);

  const activePage = pagination?.page || page || 1;
  const totalPages = Math.max(1, Number(pagination?.totalPages || 1));
  const pageLimit = Number(pagination?.limit) || 12;
  const cacheKey = `${statusFilter}:${sortBy}:${activePage}:${searchQuery}`;
  const statsLoading = busy && !cache[cacheKey];

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
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, sortBy, searchQuery]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user || authLoading || !isFreelancer) return;
      setLoadError("");
      const cached = cache[cacheKey];
      if (cached) {
        setOrders(cached.orders);
        setPagination(cached.pagination);
        setCounts(cached.counts);
        setBusy(false);
        return;
      }
      setBusy(true);
      try {
        const params = { page, limit: 12, status: statusFilter, sort: sortBy };
        if (searchQuery) params.q = searchQuery;
        const res = await listMyAssignedOrdersRequest(params);
        if (cancelled) return;
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
        setCache((prev) => ({
          ...prev,
          [cacheKey]: { orders: nextOrders, pagination: nextPagination, counts: nextCounts },
        }));
      } catch {
        if (!cancelled) {
          const msg = "تعذر تحميل الطلبات حاليًا. يرجى المحاولة مرة أخرى.";
          setLoadError(msg);
          push({ type: "error", title: "تعذر تحميل الطلبات", message: msg });
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
          setRefreshing(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, isFreelancer, page, statusFilter, sortBy, searchQuery, push, reloadTick, cacheKey, cache]);

  useEffect(() => {
    if (!user || authLoading || !isFreelancer || busy) return undefined;
    const t = setInterval(() => {
      setCache({});
      setReloadTick((x) => x + 1);
    }, 20_000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setCache({});
        setReloadTick((x) => x + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [busy, user, authLoading, isFreelancer]);

  const retryLoad = () => {
    setCache({});
    setReloadTick((x) => x + 1);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setCache({});
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
        title: "لا توجد طلبات حالياً",
        sub: "لم يتم إسناد أي طلب إليك بعد. تصفح الطلبات المتاحة وتقدّم على ما يناسب مهاراتك.",
        actionLabel: "استعرض الطلبات المتاحة",
        actionTo: "/dashboard/freelancer/orders",
      };
    }
    if (searchQuery) {
      return {
        title: "لا توجد نتائج للبحث",
        sub: "جرّب كلمات أخرى أو امسح البحث لعرض القائمة كاملة.",
        actionLabel: "مسح البحث",
        onAction: () => setSearchInput(""),
      };
    }
    return {
      title: "لا توجد طلبات بهذه الحالة",
      sub: "اختر تصفية أخرى أو عرض «الكل» لرؤية كامل القائمة.",
      actionLabel: statusFilter !== "all" ? "عرض الكل" : null,
      onAction: statusFilter !== "all" ? () => handleStatusFilterChange("all") : null,
    };
  }, [counts.all, searchQuery, statusFilter, handleStatusFilterChange]);

  const shownCount = busy && !orders.length ? 0 : orders.length;
  const totalCount = busy && !orders.length ? 0 : Number(pagination.total || 0);

  return (
    <DashboardHubPage className="fdash-page--my-orders">
      <header className="fmo-surface fmo-header">
        <div className="fmo-header__copy">
          <h1 className="fmo-header__title">طلباتي الحالية</h1>
          <p className="fmo-header__subtitle">
            تابع كل أعمالك المسندة، والمواعيد النهائية، وحالة التنفيذ بسهولة.
          </p>
        </div>
        <div className="fmo-header__art" aria-hidden>
          <span className="fmo-header__icon-chip">
            <ClipboardList size={32} strokeWidth={1.85} />
          </span>
        </div>
      </header>

      <div className="fmo-surface fmo-stats-bar" aria-label="ملخص الطلبات">
        <StatSegment
          tone="slate"
          Icon={ClipboardList}
          value={counts.all || 0}
          label="إجمالي الطلبات"
          loading={statsLoading}
        />
        <StatSegment tone="amber" Icon={Play} value={activeCount} label="نشطة" loading={statsLoading} />
        <StatSegment
          tone="purple"
          Icon={Hourglass}
          value={counts.waitingClientApproval || 0}
          label="بانتظار المراجعة"
          loading={statsLoading}
        />
        <StatSegment
          tone="green"
          Icon={Check}
          value={counts.completed || 0}
          label="مكتملة"
          loading={statsLoading}
        />
        <StatSegment tone="rose" Icon={X} value={counts.canceled || 0} label="ملغاة" loading={statsLoading} />
      </div>

      <nav className="fmo-surface fmo-tabs-bar" aria-label="تصفية الطلبات حسب الحالة">
        {STATUS_FILTERS.map(({ id, label, Icon }) => {
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
            placeholder="ابحث في الطلبات (العنوان أو رقم الطلب)"
            aria-label="ابحث في الطلبات (العنوان أو رقم الطلب)"
          />
        </div>
        <div className="fmo-toolbar__actions">
          <label className="fmo-toolbar__sort">
            <span className="fmo-toolbar__sort-prefix">ترتيب:</span>
            <select
              className="fmo-toolbar__sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="ترتيب الطلبات"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`fmo-toolbar__refresh${refreshing || busy ? " is-spinning" : ""}`}
            onClick={handleRefresh}
            disabled={refreshing || busy}
            aria-label="تحديث القائمة"
            title="تحديث القائمة"
          >
            <RefreshCw size={17} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <section className="fmo-surface fmo-content" ref={listRef} aria-label="قائمة الطلبات">
        {busy && !orders.length ? (
          <DashboardHubSkeletonCards count={4} variant="order-row" />
        ) : loadError ? (
          <div className="fmo-alert">
            <p>{loadError}</p>
            <button type="button" className="fmo-toolbar__refresh fmo-toolbar__refresh--label" onClick={retryLoad}>
              إعادة المحاولة
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
                <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
              </Link>
            ) : null}
            {emptyCopy.actionLabel && emptyCopy.onAction && !emptyCopy.actionTo ? (
              <button type="button" className="fmo-empty__cta" onClick={emptyCopy.onAction}>
                <span>{emptyCopy.actionLabel}</span>
                <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
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
            عرض {shownCount} من {totalCount} طلب
          </p>
          <div className="fmo-list-footer__end">
            <span className="fmo-list-footer__pagesize" aria-hidden={false}>
              {pageLimit} / صفحة
            </span>
            {totalPages > 1 || totalCount > 0 ? (
              <Pagination
                currentPage={activePage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                isLoading={busy || refreshing}
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
