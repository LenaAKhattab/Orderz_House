import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Filter, Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/toastContext";
import {
  getCategoriesRequest,
  getCategorySubSubcategoriesRequest,
  getMyEligibilityRequest,
  getMySubscriptionRequest,
  listPoolOrdersRequest,
  submitPoolOrderBidRequest,
  takePoolOrderRequest,
} from "../../services/api";
import { PoolOrderListSkeleton } from "../../components/ui/Skeleton";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getLocalizedField } from "../../lib/i18n/getLocalizedField";
import { getLocalizedMarketplaceOrderTitle } from "../../lib/i18n/getLocalizedMarketplaceOrderText";
import { getFreelancerOrderEligibilityMessage } from "../../utils/freelancerEligibilityUi";
import BidAmountModal from "../../components/orders/BidAmountModal";
import TakePoolOrderConfirmModal from "../../components/orders/TakePoolOrderConfirmModal";
import Pagination from "../../components/common/Pagination";
import MarketplaceOrderListRow from "./MarketplaceOrderListRow";
import { trackEvent } from "../../services/analytics";
import {
  filterPoolOrdersAccessibleForPlan,
  isPoolOrderLockedByPlan,
} from "../../utils/poolOrderPlanEligibility";
import { isPoolOrderTakenAsAssignment } from "../../utils/poolOrderTakeOutcome";
import {
  clearGuestPoolLoginToastFlag,
  isGuestPoolLoginToast,
  pushGuestPoolLoginToast,
} from "../../utils/guestPoolLoginToast";
import "../../styles/dashboardHub.css";
import "../../styles/freelancerOpenOrders.css";

function PoolEmptyState({ title, subtitle }) {
  return (
    <div className="dash-empty">
      <div className="dash-empty__icon" aria-hidden="true">
        ◌
      </div>
      <div className="dash-empty__copy">
        <h3 className="dash-empty__title">{title}</h3>
        <p className="dash-empty__subtitle">{subtitle}</p>
      </div>
    </div>
  );
}

function PlanFilterEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="oh-orders-plan-empty oh-orders-plan-empty--neu fdash-surface-3d fdash-surface-3d--soft">
      <div className="oh-orders-plan-empty__icon" aria-hidden>
        <Briefcase size={28} strokeWidth={1.9} />
      </div>
      <div className="oh-orders-plan-empty__copy">
        <h3 className="oh-orders-plan-empty__title">{t("orders.empty.planTitle")}</h3>
        <p className="oh-orders-plan-empty__subtitle">{t("orders.empty.planSubtitle")}</p>
      </div>
      <Link to="/dashboard/freelancer/plans" className="oh-orders-plan-empty__cta btn btn-primary">
        {t("orders.empty.upgradeCta")}
      </Link>
    </div>
  );
}

function CategoryFiltersPanel({
  className = "",
  filtersView,
  setFiltersView,
  setSelectedSubSubIds,
  categoryFilters,
  selectedSubSubIds,
  toggleSubSub,
}) {
  const { t, locale } = useTranslation();
  return (
    <aside className={className} aria-label={t("orders.filters.title")}>
      <h3 className="oh-orders-filters__title">{t("orders.filters.title")}</h3>
      <div className="oh-orders-filters__switch" role="tablist" aria-label={t("orders.filters.toggleAria")}>
        <button
          type="button"
          role="tab"
          aria-selected={filtersView === "all"}
          className={`oh-orders-filters__switch-btn ${filtersView === "all" ? "is-active" : ""}`.trim()}
          onClick={() => {
            setFiltersView("all");
            setSelectedSubSubIds([]);
          }}
        >
          {t("orders.filters.all")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filtersView === "categories"}
          className={`oh-orders-filters__switch-btn ${filtersView === "categories" ? "is-active" : ""}`.trim()}
          onClick={() => setFiltersView("categories")}
        >
          {t("orders.filters.categories")}
        </button>
      </div>
      <div className="oh-orders-filters__list">
        {categoryFilters.map((category) => (
          <div key={category.id} className="oh-orders-filters__group">
            <div className="oh-orders-filters__category-title">{getLocalizedField(category, "name", locale)}</div>
            <div className="oh-orders-filters__sublist">
              {category.subSubs.map((sub) => {
                const checked = selectedSubSubIds.includes(sub.id);
                return (
                  <label key={sub.id} className="oh-orders-filters__item">
                    <span>{getLocalizedField(sub, "name", locale)}</span>
                    <input type="checkbox" checked={checked} onChange={(e) => toggleSubSub(sub.id, e.target.checked)} />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

const POOL_LOAD_ERROR_KEY = "common.errors.loadOrders";
const POOL_PAGE_LIMIT = 8;

/**
 * Shared «معرض الطلبات» / open pool UI for public `/orders` and dashboard `/dashboard/freelancer/orders`.
 * @param {{ layout: 'public' | 'dashboard' }} props
 */
export default function OpenOrdersMarketplace({ layout = "dashboard" }) {
  const { user, loading } = useAuth();
  const { t, dir, locale } = useTranslation();
  const POOL_LOAD_ERROR = t(POOL_LOAD_ERROR_KEY);
  const { push, dismissMatching } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const role = user?.primaryRole || user?.role;
  const isFreelancer = role === "freelancer";
  const isClient = role === "client";
  const showPoolRowActions = Boolean(!user || isFreelancer);

  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(true);
  const [takingId, setTakingId] = useState(null);
  const [bidBusyId, setBidBusyId] = useState(null);
  const [bidModalOrder, setBidModalOrder] = useState(null);
  const [takeConfirmOrder, setTakeConfirmOrder] = useState(null);
  const [categoryFilters, setCategoryFilters] = useState([]);
  const [selectedSubSubIds, setSelectedSubSubIds] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = String(params.get("filters") || "").trim();
    if (!raw) return [];
    return [...new Set(raw.split(",").map((x) => x.trim()).filter(Boolean))];
  });
  const [filtersView, setFiltersView] = useState("categories");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const v = String(params.get("sort") || "").trim();
    return ["newest", "oldest", "price_high", "price_low"].includes(v) ? v : "newest";
  });
  const [page, setPage] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const n = Number(params.get("page"));
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
  const [pagination, setPagination] = useState({ page: 1, limit: POOL_PAGE_LIMIT, total: 0, totalPages: 1 });
  const [reloadTick, setReloadTick] = useState(0);
  const [planAvailableOnly, setPlanAvailableOnly] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [eligibility, setEligibility] = useState(null);
  const [eligibilityFetched, setEligibilityFetched] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const listWrapperRef = useRef(null);
  const poolFetchGenRef = useRef(0);
  const categoryFiltersCacheRef = useRef(null);
  const guestLoginNavLockRef = useRef(false);

  const showIneligibleNotice = isFreelancer && eligibilityFetched && eligibility && eligibility.eligible === false;
  const ineligibleMessage = showIneligibleNotice
    ? getFreelancerOrderEligibilityMessage(eligibility, subscription, t)
    : "";
  const canTake = Boolean(isFreelancer && eligibility?.eligible);
  const loginRequiredMessage = t("orders.marketplace.loginRequiredFreelancer");
  const clientViewOnlyMessage = t("orders.marketplace.clientViewOnly");

  const displayedOrders = useMemo(() => {
    if (!planAvailableOnly || !isFreelancer) return orders;
    return filterPoolOrdersAccessibleForPlan(orders);
  }, [orders, planAvailableOnly, isFreelancer]);

  const poolListParams = useCallback(
    (pageNum) => ({
      page: pageNum,
      limit: POOL_PAGE_LIMIT,
      sort: sortBy,
      ...(selectedSubSubIds.length ? { subSubCategoryIds: selectedSubSubIds.join(",") } : {}),
    }),
    [sortBy, selectedSubSubIds],
  );

  const reloadPool = async () => {
    const res = await listPoolOrdersRequest(poolListParams(page));
    setOrders(res?.data?.orders || []);
    setPagination(res?.data?.pagination || { page, limit: POOL_PAGE_LIMIT, total: 0, totalPages: 1 });
  };

  useEffect(() => {
    if (layout === "dashboard" && loading) return undefined;
    const fetchGen = ++poolFetchGenRef.current;
    const abortController = new AbortController();
    async function load() {
      setBusy(true);
      setLoadError("");
      try {
        const res = await listPoolOrdersRequest(poolListParams(page), { signal: abortController.signal });
        if (fetchGen !== poolFetchGenRef.current) return;
        setOrders(res?.data?.orders || []);
        setPagination(res?.data?.pagination || { page, limit: POOL_PAGE_LIMIT, total: 0, totalPages: 1 });
      } catch (err) {
        if (abortController.signal.aborted || err?.code === "ERR_CANCELED") return;
        if (fetchGen !== poolFetchGenRef.current) return;
        setLoadError(POOL_LOAD_ERROR);
        push({ type: "error", title: t("orders.marketplace.loadErrorTitle"), message: POOL_LOAD_ERROR });
      } finally {
        if (fetchGen === poolFetchGenRef.current) setBusy(false);
      }
    }
    void load();
    return () => {
      abortController.abort();
    };
  }, [push, page, reloadTick, poolListParams, layout, loading, user?.id]);

  useEffect(() => {
    const onPoolList =
      location.pathname === "/orders" ||
      location.pathname === "/dashboard/freelancer/orders" ||
      location.pathname === "/dashboard/client/orders";
    if (!onPoolList) return undefined;

    const pollMs = Math.min(
      Math.max(Number(import.meta.env.VITE_PUBLIC_POOL_PREVIEW_POLL_MS) || 30_000, 20_000),
      60_000,
    );

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setReloadTick((n) => n + 1);
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      setReloadTick((n) => n + 1);
    }, pollMs);

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.set("page", String(page));
    params.set("sort", String(sortBy || "newest"));
    if (selectedSubSubIds.length) params.set("filters", selectedSubSubIds.join(","));
    else params.delete("filters");
    const nextSearch = `?${params.toString()}`;
    if (nextSearch !== location.search) {
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: true });
    }
  }, [location.pathname, location.search, navigate, page, selectedSubSubIds, sortBy]);

  useEffect(() => {
    const onPoolList =
      location.pathname === "/orders" ||
      location.pathname === "/dashboard/freelancer/orders" ||
      location.pathname === "/dashboard/client/orders";
    if (!onPoolList) return;
    guestLoginNavLockRef.current = false;
    dismissMatching(isGuestPoolLoginToast);
    clearGuestPoolLoginToastFlag();
  }, [location.pathname, dismissMatching]);

  useEffect(() => {
    const onPoolList = (pathname) =>
      pathname === "/orders" ||
      pathname === "/dashboard/freelancer/orders" ||
      pathname === "/dashboard/client/orders";

    const onPageShow = (event) => {
      if (!event.persisted || !onPoolList(window.location.pathname)) return;
      dismissMatching(isGuestPoolLoginToast);
      clearGuestPoolLoginToastFlag();
      guestLoginNavLockRef.current = false;
    };

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [dismissMatching]);

  useEffect(() => {
    let cancelled = false;
    async function loadCategoryFilters() {
      if (categoryFiltersCacheRef.current) {
        setCategoryFilters(categoryFiltersCacheRef.current);
        return;
      }
      try {
        const categoriesRes = await getCategoriesRequest();
        const categories = Array.isArray(categoriesRes?.data?.categories)
          ? categoriesRes.data.categories
          : Array.isArray(categoriesRes?.data)
            ? categoriesRes.data
            : [];

        const settled = await Promise.allSettled(
          categories.map(async (category) => {
            const subSubsRes = await getCategorySubSubcategoriesRequest(category.id);
            const list = Array.isArray(subSubsRes?.data?.subSubcategories)
              ? subSubsRes.data.subSubcategories
              : Array.isArray(subSubsRes?.data)
                ? subSubsRes.data
                : [];
            return {
              id: String(category.id),
              name: String(category.name || ""),
              name_en: category.name_en || null,
              subSubs: list
                .map((item) => ({
                  id: String(item.id),
                  name: String(item.name || ""),
                  name_en: item.name_en || null,
                }))
                .sort((a, b) => a.name.localeCompare(b.name, "ar")),
            };
          }),
        );

        const grouped = settled.filter((x) => x.status === "fulfilled").map((x) => x.value);

        const normalized = grouped
          .filter((g) => g.subSubs.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name, "ar"));
        if (!cancelled) {
          categoryFiltersCacheRef.current = normalized;
          setCategoryFilters(normalized);
        }
      } catch {
        if (!cancelled) setCategoryFilters([]);
      }
    }
    void loadCategoryFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadEligibility() {
      if (!user || loading || !isFreelancer) {
        if (!cancelled) setEligibilityFetched(false);
        return;
      }
      if (!cancelled) setEligibilityFetched(false);
      try {
        const res = await getMyEligibilityRequest();
        if (!cancelled) setEligibility(res?.data || null);
      } catch {
        if (!cancelled) setEligibility(null);
      } finally {
        if (!cancelled) setEligibilityFetched(true);
      }
    }
    loadEligibility();
    return () => {
      cancelled = true;
    };
  }, [user, loading, isFreelancer]);

  useEffect(() => {
    let cancelled = false;
    async function loadSubscription() {
      if (!user || loading || !isFreelancer) {
        if (!cancelled) setSubscription(null);
        return;
      }
      try {
        const res = await getMySubscriptionRequest();
        if (!cancelled) setSubscription(res?.data?.subscription || null);
      } catch {
        if (!cancelled) setSubscription(null);
      }
    }
    loadSubscription();
    return () => {
      cancelled = true;
    };
  }, [user, loading, isFreelancer]);

  const take = async (orderId) => {
    setTakingId(orderId);
    try {
      const res = await takePoolOrderRequest(orderId);
      const updated = res?.data?.order;
      trackEvent("fixed_order_taken", {
        order_id: String(orderId),
      });
      if (isPoolOrderTakenAsAssignment(updated)) {
        push({
          type: "success",
          title: t("orders.marketplace.orderAssigned.title"),
          message: t("orders.marketplace.orderAssigned.message"),
        });
        navigate("/dashboard/freelancer/my-orders");
        return;
      } else {
        push({
          type: "success",
          title: t("orders.marketplace.participationRegistered.title"),
          message: t("orders.marketplace.participationRegistered.message"),
        });
      }
      await reloadPool();
    } catch (e) {
      push({
        type: "error",
        title: t("orders.marketplace.takeOrderError"),
        message: e?.response?.data?.message || e?.message,
      });
    } finally {
      setTakingId(null);
    }
  };

  const submitBid = async (amount) => {
    if (!bidModalOrder?.id) return;
    setBidBusyId(bidModalOrder.id);
    try {
      await submitPoolOrderBidRequest(bidModalOrder.id, { amount });
      trackEvent("bid_submitted", {
        order_id: String(bidModalOrder.id),
        amount: Number(amount),
      });
      push({
        type: "success",
        title: t("orders.marketplace.bidSubmitted.title"),
        message: t("orders.marketplace.bidSubmitted.message"),
      });
      setBidModalOrder(null);
      await reloadPool();
    } catch (e) {
      push({
        type: "error",
        title: t("orders.marketplace.submitBidError"),
        message: e?.response?.data?.message || e?.message,
      });
    } finally {
      setBidBusyId(null);
    }
  };

  const toggleSubSub = (id, isChecked) => {
    setFiltersView("categories");
    setPage(1);
    setSelectedSubSubIds((prev) => (isChecked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  };

  const handlePageChange = useCallback((nextPage) => {
    setPage(nextPage);
    window.requestAnimationFrame(() => {
      listWrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const listFromPath = useMemo(() => {
    if (layout !== "dashboard") return "/orders";
    if (isClient) return "/dashboard/client/orders";
    return "/dashboard/freelancer/orders";
  }, [layout, isClient]);

  const poolDetailsPath = useCallback(
    (orderId) => {
      if (layout !== "dashboard") return `/orders/${orderId}`;
      if (isClient) return `/dashboard/client/orders/${orderId}`;
      return `/dashboard/freelancer/orders/${orderId}`;
    },
    [layout, isClient],
  );

  const openPoolOrderDetails = useCallback(
    (order) => {
      const id = order?.id;
      if (!id) return;
      const detailsPath = poolDetailsPath(id);
      if (!user) {
        if (guestLoginNavLockRef.current) return;
        guestLoginNavLockRef.current = true;
        pushGuestPoolLoginToast(push, t);
        navigate("/login", {
          state: {
            from: { pathname: detailsPath },
          },
        });
        return;
      }
      const r = user?.primaryRole || user?.role;
      if (r === "freelancer" || r === "client") {
        navigate(detailsPath, {
          state: { from: { pathname: listFromPath } },
        });
        return;
      }
      if (r === "admin") {
        navigate("/dashboard/admin/orders");
        return;
      }
      if (r === "super_admin") {
        navigate("/dashboard/super-admin/orders");
        return;
      }
      navigate("/login");
    },
    [user, navigate, listFromPath, poolDetailsPath, push],
  );

  const isDashboard = layout === "dashboard";
  const outerClass = `dash oh-orders-market oh-orders-market--modern ${
    isDashboard ? "oh-orders-market--dashboard" : "oh-orders-market--public"
  }`.trim();
  const totalPages = Math.max(1, pagination?.totalPages || 1);
  const currentPage = pagination?.page || 1;
  const hasNextPage = currentPage < totalPages;

  const filtersPanelProps = {
    filtersView,
    setFiltersView,
    setSelectedSubSubIds,
    categoryFilters,
    selectedSubSubIds,
    toggleSubSub,
  };

  const ordersList = (
    <div className="oh-orders-list-wrapper" ref={listWrapperRef}>
      {busy ? (
        <PoolOrderListSkeleton count={5} />
      ) : loadError ? (
        <div className="oh-orders-load-error fdash-surface-3d fdash-surface-3d--soft">
          <p className="oh-orders-load-error__text">{loadError}</p>
          <button type="button" className="oh-orders-retry-btn" onClick={() => setReloadTick((x) => x + 1)}>
            {t("common.actions.retry")}
          </button>
        </div>
      ) : orders.length === 0 ? (
        <PoolEmptyState title={t("common.empty.orders")} subtitle={t("common.empty.ordersHint")} />
      ) : planAvailableOnly && isFreelancer && displayedOrders.length === 0 ? (
        <PlanFilterEmptyState />
      ) : (
        <ul className="oh-orders-list">
          {displayedOrders.map((order) => (
            <MarketplaceOrderListRow
              key={order.id}
              order={order}
              showActions={showPoolRowActions}
              onTake={() => {
                if (!isPoolOrderLockedByPlan(order)) setTakeConfirmOrder(order);
              }}
              onBid={() => {
                if (!isPoolOrderLockedByPlan(order)) setBidModalOrder(order);
              }}
              taking={takingId === order.id}
              bidBusy={bidBusyId === order.id}
              actionsDisabled={!canTake}
              actionsDisabledReason={
                !canTake
                  ? !user
                    ? loginRequiredMessage
                    : role === "client"
                      ? clientViewOnlyMessage
                      : getFreelancerOrderEligibilityMessage(eligibility, subscription, t)
                  : ""
              }
              onOpenDetails={() => openPoolOrderDetails(order)}
            />
          ))}
        </ul>
      )}
    </div>
  );

  const sortSelect = (
    <select
      className="oh-orders-sort"
      value={sortBy}
      onChange={(e) => {
        setPage(1);
        setSortBy(e.target.value);
      }}
      aria-label={t("orders.sort.aria")}
    >
      <option value="newest">{t("orders.sort.newest")}</option>
      <option value="oldest">{t("orders.sort.oldest")}</option>
      <option value="price_high">{t("orders.sort.priceHigh")}</option>
      <option value="price_low">{t("orders.sort.priceLow")}</option>
    </select>
  );

  const planFilterButton =
    isFreelancer ? (
      <div className="oh-orders-plan-filter-wrap">
        <button
          type="button"
          className={`oh-orders-plan-filter-btn${planAvailableOnly ? " is-active" : ""}`}
          aria-pressed={planAvailableOnly}
          aria-describedby="oh-plan-filter-tooltip"
          title={t("orders.planFilter.title")}
          onClick={() => setPlanAvailableOnly((v) => !v)}
        >
          <Filter
            size={16}
            strokeWidth={2.2}
            className="oh-orders-plan-filter-btn__icon oh-orders-plan-filter-btn__icon--filter"
            aria-hidden
          />
          <span className="oh-orders-plan-filter-btn__label">{t("orders.planFilter.label")}</span>
          <Sparkles
            size={15}
            strokeWidth={2.1}
            className="oh-orders-plan-filter-btn__icon oh-orders-plan-filter-btn__icon--spark"
            aria-hidden
          />
        </button>
        <span id="oh-plan-filter-tooltip" className="oh-orders-plan-filter-tooltip" role="tooltip">
          {t("orders.planFilter.title")}
        </span>
      </div>
    ) : null;

  const sortControl = (
    <div className="oh-orders-sort-card fdash-surface-3d fdash-surface-3d--soft">
      <span className="oh-orders-sort-card__label">{t("orders.sort.label")}</span>
      {sortSelect}
    </div>
  );

  const toolbarControls = (
    <div className="oh-orders-toolbar-neu__controls">
      {sortControl}
      {planFilterButton}
    </div>
  );

  const paginationBlock = !loadError ? (
    <>
      {hasNextPage ? (
        <div className="oh-orders-more-wrap">
          <button
            type="button"
            className="oh-orders-more-btn fdash-surface-3d fdash-surface-3d--soft"
            disabled={busy}
            onClick={() => handlePageChange(currentPage + 1)}
          >
            {t("common.actions.showMore")}
            <span aria-hidden>↓</span>
          </button>
        </div>
      ) : null}
      {currentPage > 1 ? (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          isLoading={busy}
          siblingCount={1}
          className="oh-orders-pagination"
        />
      ) : null}
    </>
  ) : null;

  return (
    <div className={outerClass} dir={dir}>
      <div className="dash-grid">
        <div className="oh-orders-page-layout oh-orders-page-layout--neu">
          <div className="oh-orders-main">
            {isFreelancer && showIneligibleNotice ? (
              <p className="help oh-orders-ineligible-note">{ineligibleMessage}</p>
            ) : null}

            <div className="oh-orders-toolbar-neu">
              {toolbarControls}
              <button
                type="button"
                className="oh-orders-mobile-filters-btn"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                {filtersOpen ? t("orders.filters.hide") : t("orders.filters.show")}
              </button>
            </div>

            <div className={`oh-orders-filters--mobile${filtersOpen ? " is-open" : ""}`}>
              <CategoryFiltersPanel
                className="oh-orders-filters oh-orders-filters--sticky fdash-surface-3d fdash-surface-3d--soft"
                {...filtersPanelProps}
              />
            </div>

            {ordersList}
            {paginationBlock}
          </div>

          <div className="oh-orders-filters-col">
            <CategoryFiltersPanel
              className="oh-orders-filters oh-orders-filters--sticky fdash-surface-3d fdash-surface-3d--soft"
              {...filtersPanelProps}
            />
          </div>
        </div>
      </div>

      <BidAmountModal
        open={Boolean(bidModalOrder)}
        title={
          bidModalOrder
            ? t("orders.bid.titleWithOrder", { title: getLocalizedMarketplaceOrderTitle(bidModalOrder, locale) })
            : ""
        }
        min={bidModalOrder?.bidBudgetMin}
        max={bidModalOrder?.bidBudgetMax}
        currency="JOD"
        busy={Boolean(bidModalOrder && bidBusyId === bidModalOrder.id)}
        onClose={() => {
          if (!bidBusyId) setBidModalOrder(null);
        }}
        onSubmit={submitBid}
      />

      <TakePoolOrderConfirmModal
        open={Boolean(takeConfirmOrder)}
        busy={Boolean(takingId)}
        onClose={() => {
          if (!takingId) setTakeConfirmOrder(null);
        }}
        onConfirm={async () => {
          const o = takeConfirmOrder;
          setTakeConfirmOrder(null);
          if (o?.id) await take(o.id);
        }}
      />
    </div>
  );
}
