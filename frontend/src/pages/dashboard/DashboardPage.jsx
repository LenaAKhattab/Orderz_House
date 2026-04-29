import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { DASHBOARD_TITLE } from "../../constants/authRoutes";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/toastContext";
import {
  getCategoriesRequest,
  getCategorySubSubcategoriesRequest,
  getMyEligibilityRequest,
  getMySubscriptionRequest,
  listMyAssignedOrdersRequest,
  listPoolOrdersRequest,
  submitPoolOrderBidRequest,
  takePoolOrderRequest,
} from "../../services/api";
import { AssignedOrderListSkeleton, PoolOrderListSkeleton, SubscriptionCardSkeleton } from "../../components/ui/Skeleton";
import { getFreelancerOrderEligibilityMessage } from "../../utils/freelancerEligibilityUi";
import BidAmountModal from "../../components/orders/BidAmountModal";
import Pagination from "../../components/common/Pagination";

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

function fullNameAr(user) {
  const parts = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

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

function StatCard({ label, value, hint }) {
  return (
    <div className="dash-stat">
      <div className="dash-stat__top">
        <span className="dash-stat__label">{label}</span>
      </div>
      <div className="dash-stat__value">{value}</div>
      {hint ? <div className="dash-stat__hint">{hint}</div> : null}
    </div>
  );
}

function formatJoDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function subscriptionStatusLabel(status) {
  if (status === "active") return "نشط";
  if (status === "assigned_not_started") return "تم الإسناد (لم يبدأ بعد)";
  if (status === "expired") return "منتهي";
  if (status === "inactive") return "غير نشط";
  if (status === "cancelled") return "ملغي";
  return status || "—";
}

function subscriptionDisplayStatus(subscription) {
  if (!subscription) return "غير مشترك";
  const payment = String(subscription.paymentStatus || "");
  const activation = String(subscription.activationStatus || "");
  const status = String(subscription.status || "");

  if ((payment === "paid" || payment === "pending") && activation === "company_pending") {
    return "مدفوع - بانتظار تفعيل الشركة";
  }
  if (status === "assigned_not_started" && activation === "company_approved") {
    return "مفعّل - بانتظار أول طلب مقبول";
  }
  if (status === "active") return "نشط";
  if (status === "expired") return "منتهي";
  if (payment === "pending") return "الدفع قيد المعالجة";
  if (status === "inactive" || status === "cancelled") return "غير مشترك";
  return subscriptionStatusLabel(status);
}

function hasSubscriptionDurationStarted(subscription) {
  if (!subscription) return false;
  if (!subscription.actualStartDate || !subscription.expiryDate) return false;
  const status = String(subscription.status || "");
  return status === "active" || status === "expired";
}

function subscriptionStateHint(subscription) {
  if (!subscription) return "";
  const payment = String(subscription.paymentStatus || "");
  const activation = String(subscription.activationStatus || "");
  if (payment === "pending") return "الدفع قيد المعالجة.";
  if (payment === "failed") return "فشل الدفع. يرجى إعادة الاشتراك.";
  if (payment === "paid" && activation === "company_pending") return "تم استلام الدفع وبانتظار تفعيل الشركة.";
  if (payment === "paid" && activation === "company_approved" && subscription.status === "assigned_not_started") {
    return "تم التفعيل، وسيبدأ احتساب المدة عند أول طلب مقبول.";
  }
  return "";
}

function daysRemaining(expiryDate) {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (!Number.isFinite(exp.getTime())) return null;
  const now = Date.now();
  const diffMs = exp.getTime() - now;
  const d = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return Number.isFinite(d) ? d : null;
}

function formatTimeRemainingAr(expiryDate, nowMs) {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (!Number.isFinite(exp.getTime())) return null;

  const diffMs = exp.getTime() - nowMs;
  if (diffMs < 0) return "الاشتراك منتهي.";

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const nf = new Intl.NumberFormat("en-US");
  const parts = [];
  if (days > 0) parts.push(`${nf.format(days)} يوم`);
  if (hours > 0 || days > 0) parts.push(`${nf.format(hours)} ساعة`);
  parts.push(`${nf.format(minutes)} دقيقة`);
  return `متبقي ${parts.join(" و ")}.`;
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

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function typeLabelAr(projectType) {
  if (projectType === "fixed") return "سعر ثابت";
  if (projectType === "bidding") return "مزايدة";
  return "—";
}

function relativeTimeAr(value) {
  if (!value) return "الآن";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "الآن";
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.max(1, Math.floor(diffMs / (60 * 1000)));
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  const diffDays = Math.floor(diffHours / 24);
  return `منذ ${diffDays} يوم`;
}

function orderPriceText(order) {
  if (order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null) {
    return `${formatMoney(order.bidBudgetMin)} JOD - ${formatMoney(order.bidBudgetMax)} JOD`;
  }
  if (order?.projectType === "bidding") return "—";
  return `${formatMoney(order?.budget)} JOD`;
}

function shortDescription(text, max = 180) {
  const s = String(text || "").trim();
  if (!s) return "لا يوجد وصف.";
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

function categoryLine(order) {
  const c = String(order?.category?.name || "").trim();
  const ss = String(order?.subSubcategory?.name || "").trim();
  if (c && ss) return `${c} / ${ss}`;
  return c || ss || "بدون تصنيف";
}

function isBiddingOrder(order) {
  return order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null;
}

function MarketplaceOrderListRow({
  order,
  onOpenDetails,
  showActions = false,
  onTake,
  onBid,
  taking = false,
  bidBusy = false,
  actionsDisabled = false,
  actionsDisabledReason = "",
}) {
  const bidding = isBiddingOrder(order);
  return (
    <li className="oh-order-row-item">
      <button
        type="button"
        className="oh-order-row"
        onClick={onOpenDetails}
        aria-label={`فتح تفاصيل الطلب ${order?.title || ""}`}
      >
        <div className="oh-order-row__side">
          <div className="oh-order-row__applicants">
            <span className="oh-order-row__applicants-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16.5 20v-1.25a4.25 4.25 0 0 0-4.25-4.25h-0.5a4.25 4.25 0 0 0-4.25 4.25V20" />
                <circle cx="12" cy="8.5" r="3.25" />
                <path d="M22 19.5v-0.75a3.5 3.5 0 0 0-3.5-3.5h-0.25" />
                <path d="M18.25 5.75a3 3 0 0 1 0 5.5" />
                <path d="M2 19.5v-0.75a3.5 3.5 0 0 1 3.5-3.5h0.25" />
                <path d="M5.75 11.25a3 3 0 0 0 0-5.5" />
              </svg>
            </span>
            <span>
              {Number(order?.applicantsCount || 0)} {Number(order?.applicantsCount || 0) === 1 ? "متقدم" : "متقدمون"}
            </span>
          </div>
          {showActions ? (
            bidding ? (
              <button
                type="button"
                className="oh-order-row__action-btn"
                disabled={actionsDisabled || bidBusy || order?.myBid?.status === "pending"}
                onClick={(e) => {
                  e.stopPropagation();
                  onBid?.();
                }}
                title={actionsDisabledReason || (order?.myBid?.status === "pending" ? "لقد قدمت عرضاً لهذا الطلب." : "")}
              >
                {bidBusy ? "جارٍ الإرسال…" : order?.myBid?.status === "pending" ? "عرضك مُرسل" : "تقديم عرض"}
              </button>
            ) : (
              <button
                type="button"
                className="oh-order-row__action-btn"
                disabled={actionsDisabled || taking || order?.myClaim?.status === "pending"}
                onClick={(e) => {
                  e.stopPropagation();
                  onTake?.();
                }}
                title={actionsDisabledReason || ""}
              >
                {taking ? "جارٍ الاستلام…" : "استلام الطلب"}
              </button>
            )
          ) : null}
        </div>
        <div className="oh-order-row__main">
          <h3 className="oh-order-row__title">{categoryLine(order)}</h3>
          <div className="oh-order-row__meta">
            <span>{relativeTimeAr(order?.createdAt)}</span>
            <span>{typeLabelAr(order?.projectType)}</span>
            <span className="oh-order-row__price" dir="ltr">
              {orderPriceText(order)}
            </span>
          </div>
          <p className="oh-order-row__desc">{order?.title || "—"}</p>
          <p className="oh-order-row__summary">{shortDescription(order?.description)}</p>
          <p className="oh-order-row__hint">اضغط للتفاصيل</p>
        </div>
      </button>
    </li>
  );
}

function FreelancerHome({ user }) {
  const name = fullNameAr(user) || "مرحباً بك";
  const subtitle = "تابع طلباتك، استعرض الفرص المتاحة، وراقب مطالباتك المالية بسهولة.";

  const { push } = useToast();
  const [subscription, setSubscription] = useState(null);
  const [subBusy, setSubBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const role = user?.primaryRole || user?.role;
      if (role !== "freelancer") return;
      setSubBusy(true);
      try {
        const res = await getMySubscriptionRequest();
        if (!cancelled) setSubscription(res?.data?.subscription || null);
      } catch (e) {
        if (!cancelled) {
          setSubscription(null);
          push({ type: "error", title: "تعذر تحميل الاشتراك", message: e?.response?.data?.message || e?.message });
        }
      } finally {
        if (!cancelled) setSubBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, push]);

  // Structured mock state (hidden behind empty states for now)
  const myRecentOrders = [];
  const availableOrders = [];
  const claims = [];

  return (
    <div className="dash">
      <header className="dash-hero">
        <div className="dash-hero__copy">
          <p className="dash-hero__kicker">لوحة المستقل</p>
          <h1 className="dash-hero__title oh-orders-sidebar-title">مرحباً، {name}</h1>
          <p className="dash-hero__subtitle">{subtitle}</p>
        </div>
        <div className="dash-hero__badges" aria-label="ملخص سريع">
          <span className="dash-badge">حساب نشط</span>
          <span className="dash-badge dash-badge--soft">مستقل</span>
        </div>
      </header>

      <div className="dash-stats" role="list" aria-label="إحصاءات سريعة">
        <div role="listitem">
          <StatCard label="عدد طلباتي" value="0" hint="طلبات مسندة أو قيد التنفيذ" />
        </div>
        <div role="listitem">
          <StatCard label="الطلبات المتاحة" value="0" hint="فرص جديدة يمكنك قبولها" />
        </div>
        <div role="listitem">
          <StatCard label="المطالبات المالية" value="0" hint="قيد المراجعة أو بانتظار الصرف" />
        </div>
        <div role="listitem">
          <StatCard label="المستحقات القادمة" value="—" hint="سيظهر عند توفر بيانات مالية" />
        </div>
      </div>

      <div className="dash-grid">
        <Section title="تفاصيل الاشتراك">
          {subBusy ? (
            <SubscriptionCardSkeleton />
          ) : subscription ? (
            <div className="card" style={{ display: "grid", gap: 10 }}>
              {(() => {
                const payment = String(subscription.paymentStatus || "");
                const activation = String(subscription.activationStatus || "");
                const shouldShowActivationNotice =
                  (payment === "paid" || payment === "pending") && activation === "company_pending";
                return shouldShowActivationNotice ? (
                  <div className="dash-subscription-info-box">
                    <p className="dash-subscription-info-box__text">
                      أنت مشترك حاليًا، وتم استلام طلب اشتراكك بنجاح.
                      <br />
                      لتفعيل حسابك والبدء باستخدام المنصة، يجب زيارة الشركة وإكمال إجراءات التفعيل.
                      <br />
                      يرجى حجز موعد من خلال الرابط التالي:
                      {" "}
                      <a
                        href="https://appointments.battechno.com/survey"
                        target="_blank"
                        rel="noreferrer"
                        className="dash-subscription-info-box__inline-link"
                      >
                        https://appointments.battechno.com/survey
                      </a>
                    </p>
                    <a
                      href="https://appointments.battechno.com/survey"
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary dash-subscription-info-box__btn"
                    >
                      حجز موعد التفعيل
                    </a>
                  </div>
                ) : null;
              })()}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                <div>
                  <div className="help" style={{ marginBottom: 4 }}>الباقة</div>
                  <div style={{ fontWeight: 900 }}>
                    {subscription?.plan?.title || subscription?.plan?.name || `#${subscription?.planId || "—"}`}
                  </div>
                </div>
                <div>
                  <div className="help" style={{ marginBottom: 4 }}>الحالة</div>
                  <div style={{ fontWeight: 900 }}>{subscriptionDisplayStatus(subscription)}</div>
                </div>
                <div>
                  <div className="help" style={{ marginBottom: 4 }}>تاريخ البداية</div>
                  <div style={{ fontWeight: 800 }}>
                    {hasSubscriptionDurationStarted(subscription) ? formatJoDateTime(subscription?.actualStartDate) : "لم تبدأ بعد"}
                  </div>
                </div>
                <div>
                  <div className="help" style={{ marginBottom: 4 }}>تاريخ الانتهاء</div>
                  <div style={{ fontWeight: 800 }}>
                    {hasSubscriptionDurationStarted(subscription) ? formatJoDateTime(subscription?.expiryDate) : "لم تبدأ بعد"}
                  </div>
                </div>
              </div>
              <div className="help" style={{ margin: 0 }}>
                مدة الاشتراك لا تبدأ إلا بعد قبولك رسميًا في أول طلب من قبل الإدارة أو العميل.
              </div>
              {subscription?.status === "assigned_not_started" ? (
                <div className="help" style={{ margin: 0 }}>
                  سيبدأ الاشتراك عند استلام أو إسناد أول طلب فعلي
                </div>
              ) : subscription?.expiryDate ? (
                <div className="help" style={{ margin: 0 }}>
                  {(() => {
                    const label = formatTimeRemainingAr(subscription.expiryDate, nowMs);
                    if (label) return label;
                    const d = daysRemaining(subscription.expiryDate);
                    if (d === null) return null;
                    if (d < 0) return "الاشتراك منتهي.";
                    return `متبقي ${new Intl.NumberFormat("en-US").format(d)} يوم.`;
                  })()}
                </div>
              ) : null}
              {subscriptionStateHint(subscription) ? (
                <div className="help" style={{ margin: 0 }}>{subscriptionStateHint(subscription)}</div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="لا يوجد اشتراك حالياً"
              subtitle="عند إسناد باقة لك، ستظهر تفاصيلها هنا."
              actionLabel="عرض الباقات"
              actionTo="/plans"
            />
          )}
        </Section>

        <Section title="طلباتي الأخيرة" actionLabel="عرض الكل" actionTo="/dashboard/freelancer/my-orders">
          {myRecentOrders.length === 0 ? (
            <EmptyState
              title="لا توجد طلبات بعد"
              subtitle="عند إسناد طلب لك أو قبولك لطلب، ستظهر التفاصيل هنا."
              actionLabel="استعرض الطلبات المتاحة"
              actionTo="/dashboard/freelancer/orders"
            />
          ) : null}
        </Section>

        <Section title="الطلبات المتاحة" actionLabel="استعراض" actionTo="/dashboard/freelancer/orders">
          {availableOrders.length === 0 ? (
            <EmptyState
              title="لا توجد طلبات متاحة حالياً"
              subtitle="تابع هذه الصفحة لاحقاً، أو فعّل تنبيهاتك عندما تتوفر."
            />
          ) : null}
        </Section>

        <Section title="المطالبات المالية" actionLabel="عرض التفاصيل" actionTo="/dashboard/freelancer/financial-claims">
          {claims.length === 0 ? (
            <EmptyState
              title="لا توجد مطالبات مالية"
              subtitle="عند إنشاء مطالبة أو تحديث حالتها، ستجد ملخصاً واضحاً هنا."
            />
          ) : null}
        </Section>
      </div>
    </div>
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
      } catch (e) {
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
      <header className="oh-my-orders-header-plain">
        <div>
          <h1 className="oh-orders-sidebar-title oh-orders-sidebar-title--spaced">طلباتي</h1>
        </div>
      </header>

      <div className="dash-grid">
        <Section title={null}>
          {busy ? (
            <AssignedOrderListSkeleton count={4} />
          ) : orders.length === 0 ? (
            <EmptyState
              title="لا توجد طلبات حالياً"
              subtitle="بعد أن تتقدم لطلب من الحوض سيظهر هنا حتى تتم الموافقة أو الرفض. بعد الموافقة يبقى ضمن «طلباتي» للتنفيذ."
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

function FreelancerPoolOrders() {
  const { user, loading } = useAuth();
  const { push } = useToast();
  const location = useLocation();
  const role = user?.primaryRole || user?.role;
  const isFreelancer = role === "freelancer";
  const navigate = useNavigate();

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

  const showIneligibleNotice =
    isFreelancer && eligibilityFetched && eligibility && eligibility.eligible === false;
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
      } catch (e) {
        if (!cancelled) {
          const msg = "تعذر تحميل الطلبات حاليًا. يرجى المحاولة مرة أخرى.";
          setLoadError(msg);
          push({ type: "error", title: "تعذر تحميل الطلبات", message: msg });
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

        const grouped = settled
          .filter((x) => x.status === "fulfilled")
          .map((x) => x.value);

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

  const take = async (orderId) => {
    setTakingId(orderId);
    try {
      await takePoolOrderRequest(orderId);
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
      await submitPoolOrderBidRequest(bidModalOrder.id, { amount });
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

  return (
    <div className="dash">
      <div className="dash-grid">
        <div className="oh-orders-page-layout">
        <Section title={null}>
          {isFreelancer ? (
            showIneligibleNotice ? (
              <p className="help" style={{ marginTop: 0 }}>
                {ineligibleMessage}
              </p>
            ) : null
          ) : null}

          <div className="oh-market-center">
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, marginBottom: 10 }}>
                <div className="oh-orders-toolbar__actions">
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
                  <EmptyState
                    title="لا توجد طلبات متاحة"
                    subtitle="عند توفر طلبات جديدة ستظهر هنا مع إمكانية العرض والقبول."
                  />
                ) : (
                  <ul className="oh-orders-list">
                    {orders.map((order) => (
                      <MarketplaceOrderListRow
                        key={order.id}
                        order={order}
                        showActions
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
                        onOpenDetails={() =>
                          navigate(`/dashboard/freelancer/orders/${order.id}`, {
                            state: { from: { pathname: "/dashboard/freelancer/orders" } },
                          })
                        }
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
        </Section>
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

      {takeConfirmOrder ? (
        <div
          role="presentation"
          onMouseDown={() => {
            if (!takingId) setTakeConfirmOrder(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(15, 23, 42, 0.45)",
          }}
        >
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="take-confirm-title"
            onMouseDown={(ev) => ev.stopPropagation()}
            style={{ maxWidth: 480, width: "100%" }}
          >
            <h3 id="take-confirm-title" style={{ marginTop: 0, marginBottom: 8 }}>
              تأكيد الإجراء
            </h3>
            <p className="help" style={{ marginTop: 0 }}>
              يرجى قراءة تفاصيل الطلب بعناية قبل استلامه أو تقديم عرض سعر عليه.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={Boolean(takingId)}
                onClick={async () => {
                  const orderId = takeConfirmOrder?.id;
                  setTakeConfirmOrder(null);
                  if (orderId) await take(orderId);
                }}
              >
                {takingId ? "جارٍ التنفيذ…" : "متأكد"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setTakeConfirmOrder(null)} disabled={Boolean(takingId)}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
        <FreelancerPoolOrders />
      </section>
    );
  }
  if (role === "freelancer" && isFreelancerRoute) {
    if (pathname === "/dashboard/freelancer") {
      return (
        <section className="container page-content dash-shell">
          <FreelancerHome user={user} />
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
