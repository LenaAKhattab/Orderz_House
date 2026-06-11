import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useToast } from "../../components/ui/toastContext";
import { useAuth } from "../../context/useAuth";
import BidAmountModal from "../../components/orders/BidAmountModal";
import TakePoolOrderConfirmModal from "../../components/orders/TakePoolOrderConfirmModal";
import {
  getMyEligibilityRequest,
  getMySubscriptionRequest,
  getPoolOrderByIdRequest,
  submitPoolOrderBidRequest,
  takePoolOrderRequest,
} from "../../services/api";
import { arabicDurationUnit } from "../../utils/arTime";
import { OrderDetailsPageSkeleton } from "../../components/ui/Skeleton";
import { getFreelancerOrderEligibilityMessage } from "../../utils/freelancerEligibilityUi";
import "../../components/orders/order-details/order-details-page.css";
import "../../styles/freelancerOrderDetails.css";
import OrderSummaryCard from "../../components/orders/order-details/OrderSummaryCard";
import OrderTitleCard from "../../components/orders/order-details/OrderTitleCard";
import OrderDescriptionCard from "../../components/orders/order-details/OrderDescriptionCard";
import OrderFilesCard from "../../components/orders/order-details/OrderFilesCard";
import { formatMoneyJod, formatMoneyJodRange } from "../../components/orders/order-details/orderDetailsUtils";
import { trackEvent } from "../../services/analytics";
import { isPoolOrderLockedByPlan, poolOrderPlanLockBadgeText } from "../../utils/poolOrderPlanEligibility";
import { isPoolOrderAvailable, poolFixedParticipationPending } from "../../utils/poolOrderParticipation";
import { isPoolOrderTakenAsAssignment } from "../../utils/poolOrderTakeOutcome";
import { Lock } from "lucide-react";

function typeLabel(projectType) {
  if (projectType === "fixed") return "سعر ثابت";
  if (projectType === "bidding") return "مزايدة";
  return "—";
}

function durationLabel(order) {
  if (!order?.durationValue || !order?.durationUnit) return "—";
  return `${order.durationValue} ${arabicDurationUnit(order.durationValue, order.durationUnit)}`;
}

export default function FreelancerOrderDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { push } = useToast();
  const { user, loading } = useAuth();
  const role = user?.primaryRole || user?.role;
  const isFreelancer = role === "freelancer";
  const backTo = "/dashboard/freelancer/orders";

  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(true);
  const [taking, setTaking] = useState(false);
  const [bidOpen, setBidOpen] = useState(false);
  const [bidBusy, setBidBusy] = useState(false);
  const [takeConfirmOpen, setTakeConfirmOpen] = useState(false);
  const [eligibility, setEligibility] = useState(null);
  const [subscription, setSubscription] = useState(null);

  const planLocked = useMemo(() => isPoolOrderLockedByPlan(order), [order]);
  const planLockLabel = poolOrderPlanLockBadgeText();
  const canTake = useMemo(() => isFreelancer && Boolean(eligibility?.eligible), [isFreelancer, eligibility]);
  const canActOnOrder = canTake && !planLocked;
  const ineligibleMessage = useMemo(() => {
    if (!isFreelancer || eligibility?.eligible !== false) return "";
    return getFreelancerOrderEligibilityMessage(eligibility, subscription);
  }, [isFreelancer, eligibility, subscription]);
  const isPricedBidding = useMemo(
    () => order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null,
    [order],
  );
  const participationPending = useMemo(
    () => !isPricedBidding && poolFixedParticipationPending(order),
    [order, isPricedBidding],
  );
  const isPoolAvailable = useMemo(() => isPoolOrderAvailable(order), [order]);

  useEffect(() => {
    if (searchParams.has("source")) {
      const next = new URLSearchParams(searchParams);
      next.delete("source");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true);
      try {
        const resPool = await getPoolOrderByIdRequest(id);
        if (!cancelled) setOrder(resPool?.data?.order || null);
      } catch (e) {
        if (!cancelled) {
          push({ type: "error", title: "تعذر تحميل تفاصيل الطلب", message: e?.response?.data?.message || e?.message });
          navigate("/dashboard/freelancer/orders", { replace: true });
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, push, navigate]);

  useEffect(() => {
    let cancelled = false;
    async function loadEligibility() {
      if (!user || loading || !isFreelancer) return;
      try {
        const res = await getMyEligibilityRequest();
        if (!cancelled) setEligibility(res?.data || null);
      } catch {
        if (!cancelled) setEligibility(null);
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

  const take = async () => {
    setTaking(true);
    try {
      const res = await takePoolOrderRequest(id);
      const updated = res?.data?.order;
      trackEvent("fixed_order_taken", {
        order_id: String(id),
      });
      if (isPoolOrderTakenAsAssignment(updated)) {
        push({
          type: "success",
          title: "تم إسناد الطلب",
          message: "أصبح الطلب في قائمة «طلباتي» ويمكنك البدء بالعمل.",
        });
        navigate("/dashboard/freelancer/my-orders");
        return;
      }
      push({
        type: "success",
        title: "تم تسجيل مشاركتك",
        message: "سنراجع طلبك ونبلغك عند أي تحديث.",
      });
      const resPool = await getPoolOrderByIdRequest(id);
      setOrder(resPool?.data?.order || null);
    } catch (e) {
      push({ type: "error", title: "تعذر استلام الطلب", message: e?.response?.data?.message || e?.message });
    } finally {
      setTaking(false);
      setTakeConfirmOpen(false);
    }
  };

  const submitBid = async (amount) => {
    setBidBusy(true);
    try {
      await submitPoolOrderBidRequest(id, { amount });
      trackEvent("bid_submitted", {
        order_id: String(id),
        amount: Number(amount),
      });
      push({
        type: "success",
        title: "تم إرسال عرضك",
        message: "سيتم مراجعة عرضك وإشعارك عند أي تحديث.",
      });
      setBidOpen(false);
      const resPool = await getPoolOrderByIdRequest(id);
      setOrder(resPool?.data?.order || null);
    } catch (e) {
      push({ type: "error", title: "تعذر إرسال العرض", message: e?.response?.data?.message || e?.message });
    } finally {
      setBidBusy(false);
    }
  };

  const categoryText = useMemo(() => {
    if (!order) return "—";
    return `${order?.category?.name || "—"} — ${order?.subSubcategory?.name || "—"}`;
  }, [order]);

  const typeAndBudgetText = useMemo(() => {
    if (!order) return "—";
    const bt =
      order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null
        ? formatMoneyJodRange(order.bidBudgetMin, order.bidBudgetMax)
        : order?.projectType === "bidding"
          ? "—"
          : formatMoneyJod(order?.budget);
    if (order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null) {
      return `${typeLabel(order?.projectType)} — ${bt}`;
    }
    if (order?.projectType === "bidding") return `${typeLabel(order?.projectType)}`;
    return `${typeLabel(order?.projectType)} — ${bt}`;
  }, [order]);

  const summaryRows = useMemo(() => {
    if (!order) return [];
    const rows = [
      { label: "مدة التسليم", value: durationLabel(order), icon: "clock" },
      { label: "التصنيف", value: categoryText, icon: "category" },
    ];
    if (Array.isArray(order?.extraCategories) && order.extraCategories.length) {
        rows.push({
        label: "تصنيفات إضافية",
        value: order.extraCategories
          .map((x) => `${x?.category?.name || "—"}${x?.subSubcategory?.name ? ` • ${x.subSubcategory.name}` : ""}`)
          .join(" | "),
        icon: "category",
      });
    }
    return rows;
  }, [order, categoryText]);

  const skillsLine = useMemo(() => {
    if (!order) return "لا توجد مهارات مفضلة لهذا المشروع.";
    const names = Array.isArray(order.preferredSkills) ? order.preferredSkills.map((s) => s.name).filter(Boolean) : [];
    return names.length ? names.join("، ") : "لا توجد مهارات مفضلة لهذا المشروع.";
  }, [order]);

  const poolFooterButtons = (
    <>
      {isPoolAvailable && isFreelancer && isPricedBidding ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canActOnOrder || bidBusy || order?.myBid?.status === "pending"}
          title={order?.myBid?.status === "pending" ? "لقد قدمت عرضاً لهذا الطلب." : planLocked ? planLockLabel : ""}
          onClick={() => setBidOpen(true)}
        >
          {planLocked ? (
            <>
              <Lock size={18} strokeWidth={2.2} aria-hidden />
              {planLockLabel}
            </>
          ) : bidBusy
              ? "جارٍ الإرسال…"
              : order?.myBid?.status === "pending"
                ? "عرضك مُرسل"
                : "تقديم عرض سعر"}
        </button>
      ) : null}
      {isPoolAvailable && isFreelancer && !isPricedBidding ? (
        <button
          type="button"
          className="btn btn-primary od-take-order-btn"
          disabled={!canActOnOrder || taking || participationPending}
          title={
            planLocked
              ? planLockLabel
              : participationPending
                ? "سبق أن سجّلت مشاركتك في هذا الطلب."
                : !canTake
                  ? ineligibleMessage
                  : ""
          }
          onClick={() => setTakeConfirmOpen(true)}
        >
          {planLocked ? (
            <>
              <Lock size={18} strokeWidth={2.2} aria-hidden />
              {planLockLabel}
            </>
          ) : taking
              ? "جارٍ الاستلام…"
              : participationPending
                ? "تم التسجيل"
                : "استلام الطلب"}
        </button>
      ) : null}
    </>
  );

  const renderFooter = isFreelancer && isPoolAvailable;

  return (
    <main className="container page-content dash-shell od-page od-page--pool oh-order-details--dashboard" dir="rtl">
      <div className="od-pool-toolbar od-pool-toolbar--bare oh-order-details__toolbar">
        <Link className="btn btn-secondary oh-order-details__back" to={backTo}>
          العودة للقائمة
        </Link>
      </div>

      {isFreelancer && eligibility?.eligible === false ? (
        <div className="od-notice oh-order-details__notice" role="status">
          <p>{ineligibleMessage}</p>
        </div>
      ) : null}

      {busy ? (
        <OrderDetailsPageSkeleton />
      ) : order ? (
        <>
          <div className="od-pool-shell oh-order-details__layout order-details-layout">
            <aside className="od-pool-summary oh-order-details__aside">
              <div className="od-aside-col">
                <div className="oh-order-details-neu oh-order-details-neu--summary">
                  <OrderSummaryCard
                    title="ملخص الطلب"
                    primaryBlock={{ label: "نوع المشروع / السعر", value: typeAndBudgetText, dir: "ltr", icon: "price" }}
                    rows={summaryRows}
                  />
                </div>
                <div className="oh-order-details-neu oh-order-details-neu--files">
                  <OrderFilesCard
                    orderId={String(id)}
                    fileAccess={!planLocked && isFreelancer ? "freelancer" : null}
                    files={order.files || []}
                    emptyText="لا توجد ملفات مضافة"
                  />
                </div>
              </div>
            </aside>

            <div className="od-pool-title oh-order-details__main">
              <div className="oh-order-details-neu oh-order-details-neu--main">
                <div className="od-title-desc-group">
                  <OrderTitleCard title={order.title} />
                  <OrderDescriptionCard text={order.description} />
                  <OrderDescriptionCard label="المهارات المطلوبة" text={skillsLine} icon="skills" />
                  {renderFooter ? <div className="od-pool-primary-actions">{poolFooterButtons}</div> : null}
                </div>
              </div>
            </div>
          </div>

          <BidAmountModal
            open={bidOpen}
            busy={bidBusy}
            min={order.bidBudgetMin}
            max={order.bidBudgetMax}
            onClose={() => setBidOpen(false)}
            onSubmit={submitBid}
          />
          <TakePoolOrderConfirmModal
            open={takeConfirmOpen}
            busy={taking}
            onClose={() => setTakeConfirmOpen(false)}
            onConfirm={take}
          />
        </>
      ) : (
        <p className="od-empty">لم يتم العثور على الطلب</p>
      )}
    </main>
  );
}
