import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
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
import OrderSummaryCard from "../../components/orders/order-details/OrderSummaryCard";
import OrderTitleCard from "../../components/orders/order-details/OrderTitleCard";
import OrderDescriptionCard from "../../components/orders/order-details/OrderDescriptionCard";
import OrderFilesCard from "../../components/orders/order-details/OrderFilesCard";
import { formatJoDate, formatMoneyJod, formatMoneyJodRange } from "../../components/orders/order-details/orderDetailsUtils";
import { orderHasAssignment } from "../../utils/orderPrivacyUi";

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
  const location = useLocation();
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

  const canTake = useMemo(() => isFreelancer && Boolean(eligibility?.eligible), [isFreelancer, eligibility]);
  const ineligibleMessage = useMemo(() => {
    if (!isFreelancer || eligibility?.eligible !== false) return "";
    return getFreelancerOrderEligibilityMessage(eligibility, subscription);
  }, [isFreelancer, eligibility, subscription]);
  const isPricedBidding = useMemo(
    () => order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null,
    [order],
  );
  const fakeClaimOrBidPending = useMemo(
    () =>
      order?.orderSource === "fake" &&
      !isPricedBidding &&
      (order?.myBid?.status === "pending" || order?.myBid?.status === "accepted"),
    [order, isPricedBidding],
  );
  const isPoolAvailable = useMemo(() => {
    if (!order) return false;
    if (order.orderSource === "fake") {
      return Boolean(
        order?.isPublished &&
          order?.isOpenForPool &&
          !orderHasAssignment(order) &&
          ["published", "open_for_freelancers", "open_for_bids"].includes(String(order?.orderStatus || "")),
      );
    }
    const sourceOk = ["admin_created", "super_admin_created", "client_created"].includes(order?.sourceType);
    return Boolean(
      sourceOk && order?.isPublished && order?.isOpenForPool && !orderHasAssignment(order) && order?.orderStatus === "published",
    );
  }, [order]);

  const orderSourceForApi =
    searchParams.get("source") === "fake" || location.state?.orderSource === "fake" ? "fake" : null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true);
      try {
        const resPool = await getPoolOrderByIdRequest(id, { orderSource: orderSourceForApi });
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
  }, [id, push, navigate, orderSourceForApi]);

  useEffect(() => {
    if (order?.orderSource === "fake" && searchParams.get("source") !== "fake") {
      setSearchParams({ source: "fake" }, { replace: true });
    }
  }, [order?.orderSource, searchParams, setSearchParams]);

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
      await takePoolOrderRequest(id, { orderSource: order?.orderSource === "fake" ? "fake" : undefined });
      push({
        type: "success",
        title: "تم تقديم الطلب",
        message: "تم تسجيل طلبك. سيراجع العميل الطلبات ثم يختار مستقلاً؛ راقب صفحة «طلباتي» بعد اعتماده.",
      });
      navigate("/dashboard/freelancer/my-orders");
    } catch (e) {
      push({ type: "error", title: "تعذر استلام الطلب", message: e?.response?.data?.message || e?.message });
      navigate(backTo, { replace: true });
    } finally {
      setTaking(false);
    }
  };

  const submitBid = async (amount) => {
    setBidBusy(true);
    try {
      await submitPoolOrderBidRequest(id, { amount }, { orderSource: order?.orderSource === "fake" ? "fake" : undefined });
      push({ type: "success", title: "تم إرسال العرض", message: "سيتمكن العميل لاحقاً من مراجعة العروض." });
      setBidOpen(false);
      const resPool = await getPoolOrderByIdRequest(id, { orderSource: order?.orderSource === "fake" ? "fake" : orderSourceForApi });
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
      { label: "مدة التسليم", value: durationLabel(order) },
      { label: "التصنيف", value: categoryText },
      { label: "تاريخ الإنشاء", value: formatJoDate(order?.createdAt) },
    ];
    if (Array.isArray(order?.extraCategories) && order.extraCategories.length) {
      rows.push({
        label: "تصنيفات إضافية",
        value: order.extraCategories
          .map((x) => `${x?.category?.name || "—"}${x?.subSubcategory?.name ? ` • ${x.subSubcategory.name}` : ""}`)
          .join(" | "),
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
          disabled={!canTake || bidBusy || order?.myBid?.status === "pending"}
          title={order?.myBid?.status === "pending" ? "لقد قدمت عرضاً لهذا الطلب." : ""}
          onClick={() => setBidOpen(true)}
        >
          {bidBusy ? "جارٍ الإرسال…" : order?.myBid?.status === "pending" ? "عرضك مُرسل" : "تقديم عرض سعر"}
        </button>
      ) : null}
      {isPoolAvailable && isFreelancer && !isPricedBidding ? (
        <button
          type="button"
          className="btn btn-primary od-take-order-btn"
          disabled={!canTake || taking || order?.myClaim?.status === "pending" || fakeClaimOrBidPending}
          title={
            fakeClaimOrBidPending
              ? "سبق أن سجّلت مشاركتك في هذا الطلب التجريبي."
              : order?.myClaim?.status
                ? order.myClaim.status === "pending"
                  ? "سبق أن تقدمت لهذا الطلب وهو قيد المراجعة."
                  : order.myClaim.status === "withdrawn"
                    ? "سبق أن تقدمت لهذا الطلب ثم قمت بسحبه."
                    : order.myClaim.status === "rejected"
                      ? "سبق أن تقدمت لهذا الطلب وتم رفض الطلب."
                      : `سبق أن تقدمت لهذا الطلب (الحالة: ${order.myClaim.status}).`
                : !canTake
                  ? ineligibleMessage
                  : ""
          }
          onClick={() => setTakeConfirmOpen(true)}
        >
          {taking ? "جارٍ الاستلام…" : fakeClaimOrBidPending ? "تم التسجيل" : "استلام الطلب"}
        </button>
      ) : null}
    </>
  );

  const renderFooter = isFreelancer && isPoolAvailable;

  return (
    <main className="container page-content dash-shell od-page od-page--pool" dir="rtl">
      <div className="od-pool-toolbar od-pool-toolbar--bare">
        <Link className="btn btn-secondary" to={backTo}>
          العودة للقائمة
        </Link>
      </div>

      {!busy && order?.trainingLabel ? <p className="od-pool-hint">{order.trainingLabel}</p> : null}

      {isFreelancer && eligibility?.eligible === false ? (
        <div className="od-notice" role="status">
          <p>{ineligibleMessage}</p>
        </div>
      ) : null}

      {busy ? (
        <OrderDetailsPageSkeleton />
      ) : order ? (
        <>
          <div className="od-pool-shell">
            <div className="od-pool-title">
              <div className="od-title-desc-group">
                <OrderTitleCard title={order.title} />
                <OrderDescriptionCard text={order.description} />
                <OrderDescriptionCard label="المهارات المطلوبة" text={skillsLine} />
                {renderFooter ? <div className="od-pool-primary-actions">{poolFooterButtons}</div> : null}
              </div>
            </div>

            <div className="od-pool-summary">
              <div className="od-aside-col">
                <OrderSummaryCard
                  title="ملخص الطلب"
                  primaryBlock={{ label: "نوع المشروع / السعر", value: typeAndBudgetText, dir: "ltr" }}
                  rows={summaryRows}
                />
                <OrderFilesCard
                  orderId={String(id)}
                  fileAccess={isFreelancer ? "freelancer" : null}
                  files={order.files || []}
                  emptyText="لا توجد ملفات مضافة"
                />
              </div>
            </div>
          </div>

          <TakePoolOrderConfirmModal
            open={takeConfirmOpen}
            busy={taking}
            onClose={() => {
              if (!taking) setTakeConfirmOpen(false);
            }}
            onConfirm={async () => {
              setTakeConfirmOpen(false);
              await take();
            }}
          />
        </>
      ) : null}

      {isFreelancer ? (
        <BidAmountModal
          open={bidOpen}
          title={order ? `عرض سعر: ${order.title}` : ""}
          min={order?.bidBudgetMin}
          max={order?.bidBudgetMax}
          currency="JOD"
          busy={bidBusy}
          onClose={() => {
            if (!bidBusy) setBidOpen(false);
          }}
          onSubmit={submitBid}
        />
      ) : null}
    </main>
  );
}
