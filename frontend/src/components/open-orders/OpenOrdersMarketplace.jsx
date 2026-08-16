import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Filter, Loader2, Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/toastContext";
import {
  getCategoriesTreeRequest,
  getPoolOrderNormalApplicationBidQuoteRequest,
  listFreelancerPantryRequestsRequest,
  listPoolOrdersRequest,
  submitFreelancerPantryBidRequest,
  submitPoolOrderBidRequest,
  takePoolOrderRequest,
} from "../../services/api";
import {
  OpenOrdersFiltersPanelSkeleton,
  OpenOrdersToolbarSkeleton,
  PoolOrderListSkeleton,
} from "../../components/ui/Skeleton";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getLocalizedField } from "../../lib/i18n/getLocalizedField";
import { getLocalizedMarketplaceOrderTitle } from "../../lib/i18n/getLocalizedMarketplaceOrderText";
import { getFreelancerOrderEligibilityMessage } from "../../utils/freelancerEligibilityUi";
import { useFreelancerMarketplaceContext } from "../../hooks/useFreelancerMarketplaceContext";
import BidAmountModal from "../../components/orders/BidAmountModal";
import TakePoolOrderConfirmModal from "../../components/orders/TakePoolOrderConfirmModal";
import Pagination from "../../components/common/Pagination";
import OpportunityHelpTrigger from "../onboarding/OpportunityHelpTrigger";
import {
  isPantryPoolOrder,
  mapPantryRequestToPoolOrder,
  pantryRequestIdFromPoolOrder,
} from "./mapPantryRequestToPoolOrder";
import { categoryLine, durationLabel } from "./openOrdersFormatters";
import { trackEvent } from "../../services/analytics";
import {
  filterPoolOrdersAccessibleForPlan,
  isPoolOrderLockedByPlan,
} from "../../utils/poolOrderPlanEligibility";
import { isPoolOrderTakenAsAssignment } from "../../utils/poolOrderTakeOutcome";
import { isBidCollectionClosedForApply } from "../../admin/marketplaceArticles/marketplaceArticleFormUtils";
import {
  clearGuestPoolLoginToastFlag,
  isGuestPoolLoginToast,
  pushGuestPoolLoginToast,
} from "../../utils/guestPoolLoginToast";
import "../../styles/dashboardHub.css";
import "../../styles/freelancerOpenOrders.css";

function isOpportunityCollectionClosed(order) {
  return Boolean(order?.collectionClosed) || isBidCollectionClosedForApply(order?.bidCollection);
}

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

function CategoryFilterEmptyState({ onClearFilters }) {
  const { t } = useTranslation();
  return (
    <div className="dash-empty">
      <div className="dash-empty__icon" aria-hidden="true">
        ◌
      </div>
      <div className="dash-empty__copy">
        <h3 className="dash-empty__title">{t("orders.empty.filtersTitle")}</h3>
        <p className="dash-empty__subtitle">{t("orders.empty.filtersSubtitle")}</p>
      </div>
      <button type="button" className="btn btn-secondary dash-empty__action" onClick={onClearFilters}>
        {t("orders.empty.filtersClearCta")}
      </button>
    </div>
  );
}

function OpenOrdersUpdatingBadge() {
  const { t } = useTranslation();
  return (
    <span className="oh-orders-updating-badge fdash-surface-3d fdash-surface-3d--soft" role="status" aria-live="polite">
      <Loader2 className="oh-orders-updating-badge__icon" size={14} strokeWidth={2.4} aria-hidden />
      <span className="oh-orders-updating-badge__label">{t("orders.marketplace.updating")}</span>
    </span>
  );
}

function parseIdListFromSearch(params, ...keys) {
  for (const key of keys) {
    const raw = String(params.get(key) || "").trim();
    if (!raw) continue;
    return [...new Set(raw.split(",").map((x) => x.trim()).filter(Boolean))];
  }
  return [];
}

function CategoryFiltersPanel({
  className = "",
  filtersView,
  setFiltersView,
  setSelectedCategoryIds,
  setSelectedSubSubIds,
  categoryFilters,
  selectedCategoryIds,
  selectedSubSubIds,
  toggleCategory,
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
            setSelectedCategoryIds([]);
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
        {categoryFilters.map((category) => {
          const parentChecked = selectedCategoryIds.includes(category.id);
          return (
            <div key={category.id} className="oh-orders-filters__group">
              <label className="oh-orders-filters__item oh-orders-filters__item--parent">
                <span className="oh-orders-filters__category-title">{getLocalizedField(category, "name", locale)}</span>
                <input
                  type="checkbox"
                  checked={parentChecked}
                  onChange={(e) => toggleCategory(category.id, e.target.checked)}
                />
              </label>
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
          );
        })}
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
  const { subscription, eligibility } = useFreelancerMarketplaceContext();

  const [orders, setOrders] = useState([]);
  const [pantryPoolOrders, setPantryPoolOrders] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [takingId, setTakingId] = useState(null);
  const [bidBusyId, setBidBusyId] = useState(null);
  const [bidModalOrder, setBidModalOrder] = useState(null);
  const [bidQuoteLoading, setBidQuoteLoading] = useState(false);
  const [bidQuote, setBidQuote] = useState(null);
  const [takeConfirmOrder, setTakeConfirmOrder] = useState(null);
  const [categoryFilters, setCategoryFilters] = useState([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(() =>
    parseIdListFromSearch(new URLSearchParams(window.location.search), "categoryIds"),
  );
  const [selectedSubSubIds, setSelectedSubSubIds] = useState(() =>
    parseIdListFromSearch(new URLSearchParams(window.location.search), "filters", "subSubCategoryIds"),
  );
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
  const listWrapperRef = useRef(null);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const poolFetchGenRef = useRef(0);
  const poolListVersionRef = useRef(0);
  const lastBgRefreshErrorToastRef = useRef(0);
  const categoryFiltersCacheRef = useRef(null);
  const guestLoginNavLockRef = useRef(false);
  const hasCategoryFilters = selectedCategoryIds.length > 0 || selectedSubSubIds.length > 0;

  const canTake = Boolean(isFreelancer && eligibility?.eligible);
  const loginRequiredMessage = t("orders.marketplace.loginRequiredFreelancer");
  const clientViewOnlyMessage = t("orders.marketplace.clientViewOnly");

  const mergePantryIntoPool = Boolean(isFreelancer && layout === "dashboard");

  const pantryOrdersMatchingFilters = useMemo(() => {
    if (!mergePantryIntoPool || pantryPoolOrders.length === 0) return [];
    if (!hasCategoryFilters) return pantryPoolOrders;
    return pantryPoolOrders.filter((order) => {
      const catId = order?.category?.id != null ? String(order.category.id) : "";
      const subId = order?.subSubcategory?.id != null ? String(order.subSubcategory.id) : "";
      if (selectedSubSubIds.length > 0) {
        return Boolean(subId && selectedSubSubIds.includes(subId));
      }
      if (selectedCategoryIds.length > 0) {
        return Boolean(catId && selectedCategoryIds.includes(catId));
      }
      return true;
    });
  }, [mergePantryIntoPool, pantryPoolOrders, hasCategoryFilters, selectedCategoryIds, selectedSubSubIds]);

  const mergedOrders = useMemo(() => {
    if (!mergePantryIntoPool || pantryOrdersMatchingFilters.length === 0) return orders;
    // Show pantry open requests on page 1 only (same card UI as pool orders).
    if (page !== 1) return orders;
    const existing = new Set(orders.map((o) => String(o.id)));
    const extras = pantryOrdersMatchingFilters.filter((o) => !existing.has(String(o.id)));
    return [...extras, ...orders];
  }, [mergePantryIntoPool, pantryOrdersMatchingFilters, orders, page]);

  const displayedOrders = useMemo(() => {
    if (!planAvailableOnly || !isFreelancer) return mergedOrders;
    return filterPoolOrdersAccessibleForPlan(mergedOrders);
  }, [mergedOrders, planAvailableOnly, isFreelancer]);

  const poolListParams = useCallback(
    (pageNum) => ({
      page: pageNum,
      limit: POOL_PAGE_LIMIT,
      sort: sortBy,
      ...(selectedCategoryIds.length ? { categoryIds: selectedCategoryIds.join(",") } : {}),
      ...(selectedSubSubIds.length ? { subSubCategoryIds: selectedSubSubIds.join(",") } : {}),
    }),
    [sortBy, selectedCategoryIds, selectedSubSubIds],
  );

  const reloadPool = async () => {
    const res = await listPoolOrdersRequest(poolListParams(page));
    setOrders(res?.data?.orders || []);
    setPagination(res?.data?.pagination || { page, limit: POOL_PAGE_LIMIT, total: 0, totalPages: 1 });
    if (mergePantryIntoPool) {
      try {
        const pantryRes = await listFreelancerPantryRequestsRequest();
        const mapped = (pantryRes?.data?.requests || [])
          .map(mapPantryRequestToPoolOrder)
          .filter(Boolean);
        setPantryPoolOrders(mapped);
      } catch {
        /* keep last pantry rows */
      }
    }
  };

  useEffect(() => {
    if (!mergePantryIntoPool) {
      setPantryPoolOrders([]);
      return undefined;
    }
    if (loading) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const pantryRes = await listFreelancerPantryRequestsRequest();
        if (cancelled) return;
        const mapped = (pantryRes?.data?.requests || [])
          .map(mapPantryRequestToPoolOrder)
          .filter(Boolean);
        setPantryPoolOrders(mapped);
      } catch {
        if (!cancelled) setPantryPoolOrders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mergePantryIntoPool, loading, user?.id, reloadTick]);

  useEffect(() => {
    if (layout === "dashboard" && loading) return undefined;
    const fetchGen = ++poolFetchGenRef.current;
    const listVersion = ++poolListVersionRef.current;
    const abortController = new AbortController();
    async function load() {
      const isInitialEmpty = ordersRef.current.length === 0;
      if (isInitialEmpty) {
        setInitialLoading(true);
      } else {
        setIsRefetching(true);
      }
      setLoadError("");
      try {
        const res = await listPoolOrdersRequest(poolListParams(page), { signal: abortController.signal });
        if (fetchGen !== poolFetchGenRef.current) return;
        if (listVersion !== poolListVersionRef.current) return;
        setOrders(res?.data?.orders || []);
        setPagination(res?.data?.pagination || { page, limit: POOL_PAGE_LIMIT, total: 0, totalPages: 1 });
      } catch (err) {
        if (abortController.signal.aborted || err?.code === "ERR_CANCELED") return;
        if (fetchGen !== poolFetchGenRef.current) return;
        if (listVersion !== poolListVersionRef.current) return;
        setLoadError(POOL_LOAD_ERROR);
        push({ type: "error", title: t("orders.marketplace.loadErrorTitle"), message: POOL_LOAD_ERROR });
      } finally {
        if (fetchGen === poolFetchGenRef.current && listVersion === poolListVersionRef.current) {
          setInitialLoading(false);
          setIsRefetching(false);
        }
      }
    }
    void load();
    return () => {
      abortController.abort();
    };
  }, [push, page, reloadTick, poolListParams, layout, loading, user?.id, POOL_LOAD_ERROR, t]);

  useEffect(() => {
    const onPoolList =
      location.pathname === "/orders" ||
      location.pathname === "/dashboard/freelancer/orders" ||
      location.pathname === "/dashboard/client/orders";
    if (!onPoolList) return undefined;
    if (layout === "dashboard" && loading) return undefined;

    const pollMs = Math.min(
      Math.max(Number(import.meta.env.VITE_PUBLIC_POOL_PREVIEW_POLL_MS) || 30_000, 20_000),
      60_000,
    );

    let cancelled = false;
    let intervalId = null;
    let abortController = null;

    const loadSilent = async () => {
      if (cancelled || document.visibilityState === "hidden") return;

      abortController?.abort();
      abortController = new AbortController();
      const listVersionAtStart = poolListVersionRef.current;
      setIsRefetching(true);

      try {
        const res = await listPoolOrdersRequest(poolListParams(page), { signal: abortController.signal });
        if (cancelled || listVersionAtStart !== poolListVersionRef.current) return;
        setOrders(res?.data?.orders || []);
        setPagination(res?.data?.pagination || { page, limit: POOL_PAGE_LIMIT, total: 0, totalPages: 1 });
        setLoadError("");
        if (mergePantryIntoPool) {
          try {
            const pantryRes = await listFreelancerPantryRequestsRequest();
            if (cancelled || listVersionAtStart !== poolListVersionRef.current) return;
            const mapped = (pantryRes?.data?.requests || [])
              .map(mapPantryRequestToPoolOrder)
              .filter(Boolean);
            setPantryPoolOrders(mapped);
          } catch {
            /* keep last pantry rows on silent refresh */
          }
        }
      } catch (err) {
        if (cancelled || abortController?.signal.aborted || err?.code === "ERR_CANCELED") return;
        if (listVersionAtStart !== poolListVersionRef.current) return;
        // Keep existing orders visible; non-blocking notice only (throttled).
        const now = Date.now();
        if (now - lastBgRefreshErrorToastRef.current > 120_000) {
          lastBgRefreshErrorToastRef.current = now;
          push({
            type: "warning",
            title: t("orders.marketplace.backgroundRefreshTitle"),
            message: t("orders.marketplace.backgroundRefreshFailed"),
          });
        }
      } finally {
        if (!cancelled && listVersionAtStart === poolListVersionRef.current) {
          setIsRefetching(false);
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void loadSilent();
    };

    intervalId = window.setInterval(() => {
      void loadSilent();
    }, pollMs);

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      abortController?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      setIsRefetching(false);
    };
  }, [location.pathname, page, poolListParams, layout, loading, user?.id, push, t, mergePantryIntoPool]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.set("page", String(page));
    params.set("sort", String(sortBy || "newest"));
    if (selectedCategoryIds.length) params.set("categoryIds", selectedCategoryIds.join(","));
    else params.delete("categoryIds");
    if (selectedSubSubIds.length) params.set("filters", selectedSubSubIds.join(","));
    else params.delete("filters");
    const nextSearch = `?${params.toString()}`;
    if (nextSearch !== location.search) {
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: true });
    }
  }, [location.pathname, location.search, navigate, page, selectedCategoryIds, selectedSubSubIds, sortBy]);

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
        const treeRes = await getCategoriesTreeRequest();
        const grouped = Array.isArray(treeRes?.data?.categories)
          ? treeRes.data.categories
          : Array.isArray(treeRes?.categories)
            ? treeRes.categories
            : [];

        const normalized = grouped
          .map((category) => ({
            id: String(category.id),
            name: String(category.name || ""),
            name_en: category.name_en || null,
            subSubs: (Array.isArray(category.subSubs) ? category.subSubs : Array.isArray(category.subSubcategories) ? category.subSubcategories : [])
              .map((item) => ({
                id: String(item.id),
                name: String(item.name || ""),
                name_en: item.name_en || null,
              }))
              .sort((a, b) => a.name.localeCompare(b.name, "ar")),
          }))
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

  const take = async (order) => {
    if (takingId) return;
    if (isOpportunityCollectionClosed(order)) return;
    const orderId = typeof order === "object" && order != null ? order.id : order;
    const pantryId = typeof order === "object" && order != null ? pantryRequestIdFromPoolOrder(order) : null;
    setTakingId(orderId);
    try {
      if (pantryId) {
        const amount =
          typeof order === "object" && order?.budget != null ? Number(order.budget) : null;
        if (amount == null || !Number.isFinite(amount) || amount <= 0) {
          throw new Error(t("orders.marketplace.takeOrderError"));
        }
        await submitFreelancerPantryBidRequest(pantryId, {
          amount,
          durationDays:
            typeof order === "object" && order?.durationValue != null
              ? Number(order.durationValue)
              : null,
          message: null,
        });
        trackEvent("fixed_order_taken", {
          order_id: String(pantryId),
          source: "pantry",
        });
        push({
          type: "success",
          title: t("orders.marketplace.participationRegistered.title"),
          message: t("orders.marketplace.participationRegistered.message"),
        });
        await reloadPool();
        return;
      }

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

  const bidDurationLabels = useMemo(
    () => ({
      day: t("orders.marketplace.card.day"),
      days: t("orders.marketplace.card.days"),
      hour: t("orders.marketplace.card.hour"),
      hours: t("orders.marketplace.card.hours"),
      minute: t("orders.marketplace.card.minute"),
      minutes: t("orders.marketplace.card.minutes"),
    }),
    [t],
  );

  useEffect(() => {
    if (!bidModalOrder?.id || !isFreelancer) {
      setBidQuote(null);
      return undefined;
    }
    if (isPantryPoolOrder(bidModalOrder)) {
      setBidQuote(
        bidModalOrder.applicationBidCost != null
          ? {
              bidCreditCost: Number(bidModalOrder.applicationBidCost) || 1,
              availableBids: null,
              engineAvailable: false,
              priorityBoost: { engineAvailable: false, canBoost: false },
            }
          : null,
      );
      setBidQuoteLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setBidQuoteLoading(true);
      try {
        const res = await getPoolOrderNormalApplicationBidQuoteRequest(bidModalOrder.id);
        if (!cancelled) setBidQuote(res?.data || null);
      } catch {
        if (!cancelled) setBidQuote(null);
      } finally {
        if (!cancelled) setBidQuoteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bidModalOrder, isFreelancer]);

  const submitBid = async (amount, options = {}) => {
    if (!bidModalOrder?.id || bidBusyId) return;
    if (isOpportunityCollectionClosed(bidModalOrder)) return;
    setBidBusyId(bidModalOrder.id);
    try {
      if (isPantryPoolOrder(bidModalOrder)) {
        const pantryId = pantryRequestIdFromPoolOrder(bidModalOrder);
        await submitFreelancerPantryBidRequest(pantryId, {
          amount,
          durationDays:
            bidModalOrder.durationValue != null ? Number(bidModalOrder.durationValue) : null,
          message: null,
        });
        trackEvent("bid_submitted", {
          order_id: String(pantryId),
          amount: Number(amount),
          is_priority: false,
          source: "pantry",
        });
      } else {
        await submitPoolOrderBidRequest(bidModalOrder.id, {
          amount,
          usePriority: Boolean(options.usePriority),
        });
        trackEvent("bid_submitted", {
          order_id: String(bidModalOrder.id),
          amount: Number(amount),
          is_priority: Boolean(options.usePriority),
        });
      }
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

  const toggleCategory = (id, isChecked) => {
    setFiltersView("categories");
    setPage(1);
    const sid = String(id);
    setSelectedCategoryIds((prev) => (isChecked ? [...new Set([...prev, sid])] : prev.filter((x) => x !== sid)));
  };

  const toggleSubSub = (id, isChecked) => {
    setFiltersView("categories");
    setPage(1);
    setSelectedSubSubIds((prev) => (isChecked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  };

  const clearCategoryFilters = useCallback(() => {
    setFiltersView("all");
    setPage(1);
    setSelectedCategoryIds([]);
    setSelectedSubSubIds([]);
  }, []);

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
      if (layout !== "dashboard") return `/dashboard/freelancer/orders/${orderId}`;
      if (isClient) return `/dashboard/client/orders/${orderId}`;
      return `/dashboard/freelancer/orders/${orderId}`;
    },
    [layout, isClient],
  );

  const openPoolOrderDetails = useCallback(
    (order) => {
      if (isPantryPoolOrder(order)) {
        if (isPoolOrderLockedByPlan(order) || isOpportunityCollectionClosed(order)) return;
        if (order.projectType === "bidding") {
          setBidModalOrder(order);
        } else {
          setTakeConfirmOrder(order);
        }
        return;
      }
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
    [user, navigate, listFromPath, poolDetailsPath, push, t],
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
    setSelectedCategoryIds,
    setSelectedSubSubIds,
    categoryFilters,
    selectedCategoryIds,
    selectedSubSubIds,
    toggleCategory,
    toggleSubSub,
  };

  const showHardError = Boolean(loadError) && orders.length === 0 && pantryPoolOrders.length === 0 && !initialLoading;
  const showInitialSkeleton = initialLoading && orders.length === 0 && pantryPoolOrders.length === 0;
  const showUpdatingBadge = isRefetching && (orders.length > 0 || pantryPoolOrders.length > 0);
  const listIsEmpty = mergedOrders.length === 0;

  const ordersList = (
    <div className="oh-orders-list-wrapper" ref={listWrapperRef}>
      {showInitialSkeleton ? (
        <PoolOrderListSkeleton count={5} />
      ) : showHardError ? (
        <div className="oh-orders-load-error fdash-surface-3d fdash-surface-3d--soft">
          <p className="oh-orders-load-error__text">{loadError}</p>
          <button type="button" className="oh-orders-retry-btn" onClick={() => setReloadTick((x) => x + 1)}>
            {t("common.actions.retry")}
          </button>
        </div>
      ) : listIsEmpty ? (
        hasCategoryFilters ? (
          <CategoryFilterEmptyState onClearFilters={clearCategoryFilters} />
        ) : (
          <PoolEmptyState title={t("common.empty.orders")} subtitle={t("common.empty.ordersHint")} />
        )
      ) : planAvailableOnly && isFreelancer && displayedOrders.length === 0 ? (
        <PlanFilterEmptyState />
      ) : (
        <ul
          className={`oh-orders-list${showUpdatingBadge ? " oh-orders-list--refetching" : ""}`.trim()}
          aria-busy={showUpdatingBadge || undefined}
        >
          {displayedOrders.map((order) => (
            <MarketplaceOrderListRow
              key={order.id}
              order={order}
              showActions={showPoolRowActions}
              onTake={() => {
                if (!isPoolOrderLockedByPlan(order) && !isOpportunityCollectionClosed(order)) {
                  setTakeConfirmOrder(order);
                }
              }}
              onBid={() => {
                if (!isPoolOrderLockedByPlan(order) && !isOpportunityCollectionClosed(order)) {
                  setBidModalOrder(order);
                }
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
      className={`oh-orders-sort${showUpdatingBadge ? " oh-orders-sort--refetching" : ""}`.trim()}
      value={sortBy}
      disabled={showUpdatingBadge}
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
      <div className={`oh-orders-plan-filter-wrap${planAvailableOnly ? " is-active" : ""}`}>
        <button
          type="button"
          className={`oh-orders-plan-filter-btn${planAvailableOnly ? " is-active" : ""}`}
          aria-pressed={planAvailableOnly}
          aria-label={t("orders.planFilter.title")}
          onClick={(e) => {
            setPlanAvailableOnly((v) => !v);
            e.currentTarget.blur();
          }}
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
        {!planAvailableOnly ? (
          <span className="oh-orders-plan-filter-tooltip" role="tooltip">
            {t("orders.planFilter.title")}
          </span>
        ) : null}
      </div>
    ) : null;

  const sortControl = (
    <div
      className={`oh-orders-sort-card fdash-surface-3d fdash-surface-3d--soft${showUpdatingBadge ? " oh-orders-sort-card--refetching" : ""}`.trim()}
    >
      <span className="oh-orders-sort-card__label">{t("orders.sort.label")}</span>
      {sortSelect}
    </div>
  );

  const toolbarControls = (
    <div className="oh-orders-toolbar-neu__controls">
      {sortControl}
      {planFilterButton}
      {isFreelancer ? <OpportunityHelpTrigger conditionKey="mini_bid_intro" label="كيف تعمل هذه الفرصة؟" /> : null}
      {showUpdatingBadge ? <OpenOrdersUpdatingBadge /> : null}
    </div>
  );

  const paginationBlock = !showHardError ? (
    <>
      {hasNextPage ? (
        <div className="oh-orders-more-wrap">
          <button
            type="button"
            className="oh-orders-more-btn fdash-surface-3d fdash-surface-3d--soft"
            disabled={initialLoading || isRefetching}
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
          isLoading={initialLoading}
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
            <div className="oh-orders-toolbar-neu">
              {showInitialSkeleton ? <OpenOrdersToolbarSkeleton /> : toolbarControls}
              <button
                type="button"
                className="oh-orders-mobile-filters-btn"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                {filtersOpen ? t("orders.filters.hide") : t("orders.filters.show")}
              </button>
            </div>

            <div className={`oh-orders-filters--mobile${filtersOpen ? " is-open" : ""}`}>
              {showInitialSkeleton ? (
                <OpenOrdersFiltersPanelSkeleton className="oh-orders-filters oh-orders-filters--sticky fdash-surface-3d fdash-surface-3d--soft" />
              ) : (
                <CategoryFiltersPanel
                  className="oh-orders-filters oh-orders-filters--sticky fdash-surface-3d fdash-surface-3d--soft"
                  {...filtersPanelProps}
                />
              )}
            </div>

            {ordersList}
            {paginationBlock}
          </div>

          <div className="oh-orders-filters-col">
            {showInitialSkeleton ? (
              <OpenOrdersFiltersPanelSkeleton className="oh-orders-filters oh-orders-filters--sticky fdash-surface-3d fdash-surface-3d--soft" />
            ) : (
              <CategoryFiltersPanel
                className="oh-orders-filters oh-orders-filters--sticky fdash-surface-3d fdash-surface-3d--soft"
                {...filtersPanelProps}
              />
            )}
          </div>
        </div>
      </div>

      <BidAmountModal
        open={Boolean(bidModalOrder)}
        projectTitle={bidModalOrder ? getLocalizedMarketplaceOrderTitle(bidModalOrder, locale) : ""}
        categoryName={bidModalOrder ? categoryLine(bidModalOrder, locale) : ""}
        durationText={bidModalOrder ? durationLabel(bidModalOrder, locale, bidDurationLabels) : ""}
        min={bidModalOrder?.bidBudgetMin}
        max={bidModalOrder?.bidBudgetMax}
        currency="JOD"
        busy={Boolean(bidModalOrder && bidBusyId === bidModalOrder.id)}
        onClose={() => {
          if (!bidBusyId) setBidModalOrder(null);
        }}
        onSubmit={submitBid}
        bidCreditCost={bidQuote?.bidCreditCost ?? 1}
        availableBids={bidQuote?.availableBids ?? null}
        engineAvailable={Boolean(bidQuote?.engineAvailable)}
        bidQuoteLoading={bidQuoteLoading}
        priorityBoostAvailable={Boolean(
          bidQuote?.priorityBoost?.engineAvailable && bidQuote?.priorityBoost?.canBoost,
        )}
        remainingPriorityUses={bidQuote?.priorityBoost?.remainingPriorityUses ?? null}
        priorityUseCost={bidQuote?.priorityBoost?.priorityUseCost ?? 1}
        priorityAdditionalBidCost={bidQuote?.priorityBoost?.additionalBidCreditCost ?? 0}
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
          if (o?.id) await take(o);
        }}
      />
    </div>
  );
}
