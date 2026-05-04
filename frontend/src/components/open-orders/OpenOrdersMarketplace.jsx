import { useCallback, useEffect, useRef, useState } from "react";
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
import { getFreelancerOrderEligibilityMessage } from "../../utils/freelancerEligibilityUi";
import BidAmountModal from "../../components/orders/BidAmountModal";
import TakePoolOrderConfirmModal from "../../components/orders/TakePoolOrderConfirmModal";
import Pagination from "../../components/common/Pagination";
import MarketplaceOrderListRow from "./MarketplaceOrderListRow";

function PoolSection({ title, children }) {
  const hasHead = Boolean(title);
  return (
    <section className="dash-section">
      {hasHead ? (
        <div className="dash-section__head">
          {title ? <h2 className="dash-section__title">{title}</h2> : <span />}
        </div>
      ) : null}
      <div className="dash-section__body">{children}</div>
    </section>
  );
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

const POOL_LOAD_ERROR = "تعذر تحميل الطلبات، حاول مرة أخرى";

/**
 * Shared «معرض الطلبات» / open pool UI for public `/orders` and dashboard `/dashboard/freelancer/orders`.
 * @param {{ layout: 'public' | 'dashboard' }} props
 */
export default function OpenOrdersMarketplace({ layout = "dashboard" }) {
  const { user, loading } = useAuth();
  const { push } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const role = user?.primaryRole || user?.role;
  const isFreelancer = role === "freelancer";
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
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 1 });
  const [reloadTick, setReloadTick] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [eligibility, setEligibility] = useState(null);
  const [eligibilityFetched, setEligibilityFetched] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const listWrapperRef = useRef(null);

  const showIneligibleNotice = isFreelancer && eligibilityFetched && eligibility && eligibility.eligible === false;
  const ineligibleMessage = showIneligibleNotice ? getFreelancerOrderEligibilityMessage(eligibility, subscription) : "";
  const canTake = Boolean(isFreelancer && eligibility?.eligible);
  const loginRequiredMessage = "يجب تسجيل الدخول كمستقل وتفعيل الاشتراك لاستلام الطلبات.";
  const clientViewOnlyMessage = "يمكن للمستقلين المؤهلين فقط استلام الطلبات.";

  const reloadPool = async () => {
    const res = await listPoolOrdersRequest({
      page,
      limit: 12,
      sort: sortBy,
      ...(selectedSubSubIds.length ? { subSubCategoryIds: selectedSubSubIds.join(",") } : {}),
    });
    setOrders(res?.data?.orders || []);
    setPagination(res?.data?.pagination || { page, limit: 12, total: 0, totalPages: 1 });
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true);
      setLoadError("");
      try {
        const res = await listPoolOrdersRequest({
          page,
          limit: 12,
          sort: sortBy,
          ...(selectedSubSubIds.length ? { subSubCategoryIds: selectedSubSubIds.join(",") } : {}),
        });
        if (!cancelled) {
          setOrders(res?.data?.orders || []);
          setPagination(res?.data?.pagination || { page, limit: 12, total: 0, totalPages: 1 });
        }
      } catch {
        if (!cancelled) {
          setLoadError(POOL_LOAD_ERROR);
          push({ type: "error", title: "تعذر تحميل الطلبات", message: POOL_LOAD_ERROR });
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [push, page, reloadTick, sortBy, selectedSubSubIds]);

  useEffect(() => {
    setPage(1);
  }, [sortBy, selectedSubSubIds]);

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
    let cancelled = false;
    async function loadCategoryFilters() {
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
              subSubs: list
                .map((item) => ({ id: String(item.id), name: String(item.name || "") }))
                .sort((a, b) => a.name.localeCompare(b.name, "ar")),
            };
          }),
        );

        const grouped = settled.filter((x) => x.status === "fulfilled").map((x) => x.value);

        const normalized = grouped
          .filter((g) => g.subSubs.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name, "ar"));
        if (!cancelled) setCategoryFilters(normalized);
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

  const take = async (orderId, orderSource) => {
    setTakingId(orderId);
    try {
      await takePoolOrderRequest(orderId, { orderSource });
      push({ type: "success", title: "تم تقديم الطلب", message: "تم تسجيل طلب الاستلام بنجاح." });
      await reloadPool();
    } catch (e) {
      push({ type: "error", title: "تعذر استلام الطلب", message: e?.response?.data?.message || e?.message });
    } finally {
      setTakingId(null);
    }
  };

  const submitBid = async (amount) => {
    if (!bidModalOrder?.id) return;
    setBidBusyId(bidModalOrder.id);
    try {
      await submitPoolOrderBidRequest(bidModalOrder.id, { amount }, { orderSource: bidModalOrder.orderSource });
      push({ type: "success", title: "تم إرسال العرض", message: "تم إرسال عرض السعر بنجاح." });
      setBidModalOrder(null);
      await reloadPool();
    } catch (e) {
      push({ type: "error", title: "تعذر إرسال العرض", message: e?.response?.data?.message || e?.message });
    } finally {
      setBidBusyId(null);
    }
  };

  const toggleSubSub = (id, isChecked) => {
    setFiltersView("categories");
    setSelectedSubSubIds((prev) => (isChecked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  };

  const handlePageChange = useCallback((nextPage) => {
    setPage(nextPage);
    window.requestAnimationFrame(() => {
      listWrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const listFromPath = layout === "dashboard" ? "/dashboard/freelancer/orders" : "/orders";

  const openPoolOrderDetails = useCallback(
    (order) => {
      const id = order?.id;
      if (!id) return;
      const src = order?.orderSource === "fake" ? "fake" : "real";
      if (!user) {
        navigate("/login", {
          state: {
            from: { pathname: `/dashboard/freelancer/orders/${id}` },
            message: "سجّل دخولك لعرض التفاصيل والمشاركة في الطلبات.",
          },
        });
        return;
      }
      const r = user?.primaryRole || user?.role;
      if (r === "freelancer" || r === "client") {
        navigate(`/dashboard/freelancer/orders/${id}`, {
          state: { from: { pathname: listFromPath }, orderSource: src },
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
    [user, navigate, listFromPath],
  );

  const outerClass = layout === "dashboard" ? "dash" : "open-orders-marketplace open-orders-marketplace--public";

  return (
    <div className={outerClass}>
      <div className="dash-grid">
        <div className="oh-orders-page-layout">
          <PoolSection title={null}>
            {isFreelancer ? (
              showIneligibleNotice ? (
                <p className="help" style={{ marginTop: 0 }}>
                  {ineligibleMessage}
                </p>
              ) : null
            ) : null}

            <div className="oh-market-center">
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div className="oh-orders-toolbar__actions" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  <label className="help" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>ترتيب</span>
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
                  </label>
                  <button type="button" className="btn btn-secondary oh-orders-filters-toggle" onClick={() => setFiltersOpen((v) => !v)}>
                    {filtersOpen ? "إخفاء التصنيفات" : "إظهار التصنيفات"}
                  </button>
                </div>
              </div>

              {filtersOpen ? (
                <>
                  <h2 className="oh-orders-sidebar-title oh-orders-sidebar-title--spaced">الطلبات المفتوحة</h2>
                  <div className="oh-orders-filters__head">
                    <strong>التصنيفات</strong>
                  </div>
                  <aside className="oh-orders-filters oh-orders-filters--mobile" aria-label="التصنيفات">
                    <div className="oh-orders-filters__switch" role="tablist" aria-label="التبديل بين الكل والتصنيفات">
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
                        الكل
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={filtersView === "categories"}
                        className={`oh-orders-filters__switch-btn ${filtersView === "categories" ? "is-active" : ""}`.trim()}
                        onClick={() => setFiltersView("categories")}
                      >
                        التصنيفات
                      </button>
                    </div>
                    <div className="oh-orders-filters__list">
                      {categoryFilters.map((category) => (
                        <div key={`m-${category.id}`} className="oh-orders-filters__group">
                          <div className="oh-orders-filters__category-title">{category.name}</div>
                          <div className="oh-orders-filters__sublist">
                            {category.subSubs.map((sub) => {
                              const checked = selectedSubSubIds.includes(sub.id);
                              return (
                                <label key={`m-${sub.id}`} className="oh-orders-filters__item">
                                  <span>{sub.name}</span>
                                  <input type="checkbox" checked={checked} onChange={(e) => toggleSubSub(sub.id, e.target.checked)} />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </aside>
                </>
              ) : null}

              <div className="oh-orders-list-wrapper" ref={listWrapperRef}>
                {busy ? (
                  <PoolOrderListSkeleton count={5} />
                ) : loadError ? (
                  <div className="card" style={{ display: "grid", gap: 8 }}>
                    <div>{loadError}</div>
                    <button type="button" className="btn btn-secondary" onClick={() => setReloadTick((x) => x + 1)}>
                      إعادة المحاولة
                    </button>
                  </div>
                ) : orders.length === 0 ? (
                  <PoolEmptyState title="لا توجد طلبات متاحة حالياً" subtitle="عند نشر طلبات جديدة في المعرض ستظهر هنا." />
                ) : (
                  <ul className="oh-orders-list">
                    {orders.map((order) => (
                      <MarketplaceOrderListRow
                        key={order.id}
                        order={order}
                        showActions={showPoolRowActions}
                        onTake={() => setTakeConfirmOrder(order)}
                        onBid={() => setBidModalOrder(order)}
                        taking={takingId === order.id}
                        bidBusy={bidBusyId === order.id}
                        actionsDisabled={!canTake}
                        actionsDisabledReason={
                          !canTake
                            ? !user
                              ? loginRequiredMessage
                              : role === "client"
                                ? clientViewOnlyMessage
                                : getFreelancerOrderEligibilityMessage(eligibility, subscription)
                            : ""
                        }
                        onOpenDetails={() => openPoolOrderDetails(order)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {!loadError ? (
              <Pagination
                currentPage={pagination?.page || 1}
                totalPages={Math.max(1, pagination?.totalPages || 1)}
                onPageChange={handlePageChange}
                isLoading={busy}
                siblingCount={1}
                className="oh-orders-pagination"
              />
            ) : null}
          </PoolSection>
          <div>
            <h2 className="oh-orders-sidebar-title oh-orders-sidebar-title--spaced">الطلبات المفتوحة</h2>
            <div className="oh-orders-filters__head">
              <strong>التصنيفات</strong>
            </div>
            <aside className="oh-orders-filters oh-orders-filters--left" aria-label="التصنيفات">
              <div className="oh-orders-filters__switch" role="tablist" aria-label="التبديل بين الكل والتصنيفات">
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
                  الكل
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={filtersView === "categories"}
                  className={`oh-orders-filters__switch-btn ${filtersView === "categories" ? "is-active" : ""}`.trim()}
                  onClick={() => setFiltersView("categories")}
                >
                  التصنيفات
                </button>
              </div>
              <div className="oh-orders-filters__list">
                {categoryFilters.map((category) => (
                  <div key={category.id} className="oh-orders-filters__group">
                    <div className="oh-orders-filters__category-title">{category.name}</div>
                    <div className="oh-orders-filters__sublist">
                      {category.subSubs.map((sub) => {
                        const checked = selectedSubSubIds.includes(sub.id);
                        return (
                          <label key={sub.id} className="oh-orders-filters__item">
                            <span>{sub.name}</span>
                            <input type="checkbox" checked={checked} onChange={(e) => toggleSubSub(sub.id, e.target.checked)} />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </div>

      <BidAmountModal
        open={Boolean(bidModalOrder)}
        title={bidModalOrder ? `عرض سعر: ${bidModalOrder.title}` : ""}
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
          if (o?.id) await take(o.id, o?.orderSource);
        }}
      />
    </div>
  );
}
