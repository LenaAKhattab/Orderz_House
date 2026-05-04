import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { DASHBOARD_TITLE } from "../../constants/authRoutes";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/toastContext";
import { getMyEligibilityRequest, getMySubscriptionRequest, listMyAssignedOrdersRequest } from "../../services/api";
import { AssignedOrderListSkeleton } from "../../components/ui/Skeleton";
import { getFreelancerOrderEligibilityMessage } from "../../utils/freelancerEligibilityUi";
import Pagination from "../../components/common/Pagination";
import OpenOrdersMarketplace from "../../components/open-orders/OpenOrdersMarketplace";
import MarketplaceOrderListRow from "../../components/open-orders/MarketplaceOrderListRow";
import ClientDashboardHome from "./ClientDashboardHome";
import FreelancerDashboardHome from "./FreelancerDashboardHome";

const ROLE_LABEL_AR = {
  super_admin: "مدير أعلى",
  admin: "إداري",
  freelancer: "مستقل",
  client: "عميل",
};

/** Freelancer «طلباتي» list — filter by orderStatus (API values). */
const FREELANCER_MY_ORDERS_STATUS_FILTERS = [
  { key: "all", label: "الكل" },
  { key: "pending_claim", label: "بانتظار الموافقة" },
  { key: "revision_required", label: "تعديلات مطلوبة" },
  { key: "assigned", label: "مُسند" },
  { key: "in_progress", label: "قيد التنفيذ" },
  { key: "pending_client_review", label: "بانتظار اعتماد العميل" },
  { key: "completed", label: "مكتمل" },
  { key: "cancelled", label: "ملغي" },
];

function EmptyState({ title, subtitle, actionLabel, actionTo }) {
  return (
    <div className="dash-empty">
      <div className="dash-empty__icon" aria-hidden="true">
        ◌
      </div>
      <div className="dash-empty__copy">
        <h3 className="dash-empty__title">{title}</h3>
        <p className="dash-empty__subtitle">{subtitle}</p>
      </div>
      {actionLabel && actionTo ? (
        <NavLink to={actionTo} className="btn btn-secondary dash-empty__action">
          {actionLabel}
        </NavLink>
      ) : null}
    </div>
  );
}

function Section({ title, actionLabel, actionTo, children }) {
  const hasHead = Boolean(title || (actionLabel && actionTo));
  return (
    <section className="dash-section">
      {hasHead ? (
        <div className="dash-section__head">
          {title ? <h2 className="dash-section__title">{title}</h2> : <span />}
          {actionLabel && actionTo ? (
            <NavLink to={actionTo} className="dash-section__link">
              {actionLabel}
            </NavLink>
          ) : null}
        </div>
      ) : null}
      <div className="dash-section__body">{children}</div>
    </section>
  );
}

function FreelancerSubPage({ title, description, emptyTitle, emptySubtitle, actionLabel, actionTo }) {
  return (
    <div className="dash">
      <header className="dash-hero dash-hero--compact">
        <div className="dash-hero__copy">
          <p className="dash-hero__kicker">لوحة المستقل</p>
          <h1 className="dash-hero__title oh-orders-sidebar-title">{title}</h1>
          <p className="dash-hero__subtitle">{description}</p>
        </div>
      </header>
      <div className="dash-grid">
        <Section title={title}>
          <EmptyState title={emptyTitle} subtitle={emptySubtitle} actionLabel={actionLabel} actionTo={actionTo} />
        </Section>
      </div>
    </div>
  );
}

function FreelancerMyOrders() {
  const { user, loading } = useAuth();
  const { push } = useToast();
  const role = user?.primaryRole || user?.role;
  const isFreelancer = role === "freelancer";
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 1 });
  const [counts, setCounts] = useState({
    all: 0,
    waitingApproval: 0,
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
  const listWrapperRef = useRef(null);

  const activePage = pagination?.page || page || 1;
  const totalPages = Math.max(1, Number(pagination?.totalPages || 1));
  const cacheKey = `${statusFilter}:${sortBy}:${activePage}`;

  const statusCounts = useMemo(
    () => ({
      all: counts.all || 0,
      pending_claim: counts.waitingApproval || 0,
      revision_required: counts.revisionRequired || 0,
      assigned: counts.assigned || 0,
      in_progress: counts.inProgress || 0,
      pending_client_review: counts.waitingClientApproval || 0,
      completed: counts.completed || 0,
      cancelled: counts.canceled || 0,
    }),
    [counts],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user || loading || !isFreelancer) return;
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
        const res = await listMyAssignedOrdersRequest({
          page,
          limit: 12,
          status: statusFilter,
          sort: sortBy,
        });
        if (cancelled) return;
        const nextOrders = res?.data?.orders || [];
        const nextPagination = res?.data?.pagination || { page, limit: 12, total: nextOrders.length, totalPages: 1 };
        const nextCounts = res?.data?.counts || counts;
        setOrders(nextOrders);
        setPagination(nextPagination);
        setCounts(nextCounts);
        setCache((prev) => ({ ...prev, [cacheKey]: { orders: nextOrders, pagination: nextPagination, counts: nextCounts } }));
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
  }, [user, loading, isFreelancer, page, statusFilter, sortBy, push, reloadTick, cacheKey, cache]);

  useEffect(() => {
    if (!user || loading || !isFreelancer || busy) return undefined;
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
  }, [busy, user, loading, isFreelancer]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, sortBy]);

  const retryLoad = () => {
    setCache({});
    setReloadTick((x) => x + 1);
  };

  const handlePageChange = useCallback((nextPage) => {
    setPage(nextPage);
    window.requestAnimationFrame(() => {
      listWrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <div className="dash oh-my-orders-page">
      <header className="dash-hero dash-hero--elevated oh-my-orders-page__hero">
        <div className="dash-hero__copy">
          <p className="dash-hero__kicker">لوحة المستقل</p>
          <h1 className="dash-hero__title oh-orders-sidebar-title oh-orders-sidebar-title--spaced">طلباتي</h1>
          <p className="dash-hero__subtitle">
            طلباتك المسندة بعد الموافقة عليها: راقب الحالة، التسليم، ومتطلبات التعديل من مكان واحد.
          </p>
        </div>
      </header>

      <div className="dash-grid oh-my-orders-page__grid">
        <Section title={null}>
          {busy ? (
            <AssignedOrderListSkeleton count={4} />
          ) : orders.length === 0 ? (
            <EmptyState
              title="لا توجد طلبات حالياً"
              subtitle="بعد أن تتقدم لطلب من المعرض سيظهر هنا حتى تتم الموافقة أو الرفض. بعد الموافقة يبقى ضمن «طلباتي» للتنفيذ."
              actionLabel="استعرض الطلبات المتاحة"
              actionTo="/dashboard/freelancer/orders"
            />
          ) : (
            <>
              <div className="oh-orders-filters__switch" role="tablist" aria-label="تصفية الطلبات حسب الحالة">
                {FREELANCER_MY_ORDERS_STATUS_FILTERS.map((f) => {
                  const n = f.key === "all" ? statusCounts.all : statusCounts[f.key] || 0;
                  const active = statusFilter === f.key;
                  const label = `${f.label} (${n})`;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`oh-orders-filters__switch-btn ${active ? "is-active" : ""}`.trim()}
                      onClick={() => setStatusFilter(f.key)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="oh-my-orders-toolbar">
                <div className="oh-orders-toolbar__actions">
                  <select
                    className="oh-orders-sort"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    aria-label="ترتيب الطلبات"
                  >
                    <option value="newest">الأحدث</option>
                    <option value="oldest">الأقدم</option>
                    <option value="price_high">السعر الأعلى</option>
                    <option value="price_low">السعر الأقل</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary oh-orders-refresh-btn"
                    disabled={refreshing || busy}
                    onClick={() => {
                      setRefreshing(true);
                      setCache({});
                      setReloadTick((x) => x + 1);
                    }}
                  >
                    {refreshing ? "جارٍ التحديث…" : "تحديث القائمة"}
                  </button>
                </div>
              </div>
              {loadError ? (
                <div className="card" style={{ display: "grid", gap: 8 }}>
                  <div>{loadError}</div>
                  <button type="button" className="btn btn-secondary" onClick={retryLoad}>إعادة المحاولة</button>
                </div>
              ) : orders.length === 0 ? (
                <EmptyState
                  title="لا توجد طلبات بهذه الحالة"
                  subtitle="اختر تصفية أخرى أو عرض «الكل» لرؤية كامل القائمة."
                />
              ) : (
                <ul className="oh-orders-list oh-my-orders-list" style={{ marginTop: 0 }} ref={listWrapperRef}>
                  {orders.map((order) => (
                    <MarketplaceOrderListRow
                      key={order.id}
                      order={order}
                      onOpenDetails={() =>
                        navigate(`/dashboard/freelancer/my-orders/${order.id}`)
                      }
                    />
                  ))}
                </ul>
              )}
              <Pagination
                currentPage={activePage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                isLoading={busy || refreshing}
                siblingCount={1}
                className="oh-my-orders-pagination"
              />
            </>
          )}
        </Section>
      </div>
    </div>
  );
}


const DashboardPage = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const title = DASHBOARD_TITLE[pathname] || "لوحة التحكم";
  const role = user?.primaryRole || user?.role;
  const roleLabel = role ? ROLE_LABEL_AR[role] || role : "";

  const isFreelancerRoute = pathname.startsWith("/dashboard/freelancer");
  if (pathname === "/dashboard/freelancer/orders") {
    return (
      <section className="container page-content dash-shell">
        <OpenOrdersMarketplace layout="dashboard" />
      </section>
    );
  }
  if (role === "client" && pathname === "/dashboard/client") {
    return (
      <section className="container page-content dash-shell">
        <ClientDashboardHome user={user} />
      </section>
    );
  }
  if (role === "freelancer" && isFreelancerRoute) {
    if (pathname === "/dashboard/freelancer") {
      return (
        <section className="container page-content dash-shell">
          <FreelancerDashboardHome user={user} />
        </section>
      );
    }
    if (pathname === "/dashboard/freelancer/my-orders") {
      return (
        <section className="container page-content dash-shell">
          <FreelancerMyOrders />
        </section>
      );
    }
    if (pathname === "/dashboard/freelancer/financial-claims") {
      return (
        <section className="container page-content dash-shell">
          <FreelancerSubPage
            title="المطالبات المالية"
            description="تابع المطالبات المالية وحالاتها ومجموع المستحقات."
            emptyTitle="لا توجد مطالبات"
            emptySubtitle="عند إنشاء مطالبة أو تحديث حالتها ستظهر هنا."
          />
        </section>
      );
    }
  }

  // Other roles: keep a clean, non-placeholder shell for now (scalable).
  return (
    <section className="container page-content dash-shell">
      <div className="dash">
        <header className="dash-hero dash-hero--compact">
          <div className="dash-hero__copy">
            <p className="dash-hero__kicker">لوحة التحكم</p>
            <h1 className="dash-hero__title oh-orders-sidebar-title">{title}</h1>
            {user ? <p className="dash-hero__subtitle">الدور: {roleLabel}</p> : null}
          </div>
        </header>
        <div className="dash-grid">
          <Section title="قريباً">
            <EmptyState
              title="هذه الصفحة قيد الإعداد"
              subtitle="سيتم إضافة محتوى لوحة التحكم حسب الدور قريباً."
            />
          </Section>
        </div>
      </div>
    </section>
  );
};

export default DashboardPage;
