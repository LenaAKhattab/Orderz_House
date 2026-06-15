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
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  formatOrderDuration,
  formatOrderProjectType,
  categoryLine,
} from "../../lib/orders/orderDisplayFormatters";
import {
  getLocalizedOrderDescription,
  getLocalizedOrderTitle,
  resolveUserContentDir,
} from "../../lib/i18n/getLocalizedMarketplaceOrderText";
import { getLocalizedField } from "../../lib/i18n/getLocalizedField";
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
import { isPoolOrderLockedByPlan } from "../../utils/poolOrderPlanEligibility";
import { isPoolOrderAvailable, poolFixedParticipationPending } from "../../utils/poolOrderParticipation";
import { isPoolOrderTakenAsAssignment } from "../../utils/poolOrderTakeOutcome";
import { Lock } from "lucide-react";

function typeLabel(projectType, t) {
  return formatOrderProjectType(projectType, t);
}

export default function FreelancerOrderDetailsPage() {
  const { t, locale, dir } = useTranslation();
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
  const planLockLabel = t("orders.marketplace.planLocked");
  const canTake = useMemo(() => isFreelancer && Boolean(eligibility?.eligible), [isFreelancer, eligibility]);
  const canActOnOrder = canTake && !planLocked;
  const ineligibleMessage = useMemo(() => {
    if (!isFreelancer || eligibility?.eligible !== false) return "";
    return getFreelancerOrderEligibilityMessage(eligibility, subscription, t);
  }, [isFreelancer, eligibility, subscription, t]);
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
          push({ type: "error", title: t("orders.details.loadError"), message: e?.response?.data?.message || e?.message });
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
          title: t("orders.marketplace.orderAssigned.title"),
          message: t("orders.marketplace.orderAssigned.message"),
        });
        navigate("/dashboard/freelancer/my-orders");
        return;
      }
      push({
        type: "success",
        title: t("orders.marketplace.participationRegistered.title"),
        message: t("orders.marketplace.participationRegistered.message"),
      });
      const resPool = await getPoolOrderByIdRequest(id);
      setOrder(resPool?.data?.order || null);
    } catch (e) {
      push({
        type: "error",
        title: t("orders.marketplace.takeOrderError"),
        message: e?.response?.data?.message || e?.message,
      });
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
        title: t("orders.marketplace.bidSubmitted.title"),
        message: t("orders.marketplace.bidSubmitted.message"),
      });
      setBidOpen(false);
      const resPool = await getPoolOrderByIdRequest(id);
      setOrder(resPool?.data?.order || null);
    } catch (e) {
      push({
        type: "error",
        title: t("orders.marketplace.submitBidError"),
        message: e?.response?.data?.message || e?.message,
      });
    } finally {
      setBidBusy(false);
    }
  };

  const categoryText = useMemo(
    () => categoryLine(order, locale) || t("freelancerDashboard.common.emDash"),
    [order, locale, t],
  );

  const localizedTitle = useMemo(() => getLocalizedOrderTitle(order, locale), [order, locale]);
  const localizedDescription = useMemo(() => getLocalizedOrderDescription(order, locale), [order, locale]);
  const titleDir = resolveUserContentDir(localizedTitle, dir);
  const descriptionDir = resolveUserContentDir(localizedDescription, dir);

  const typeAndBudgetText = useMemo(() => {
    if (!order) return t("freelancerDashboard.common.emDash");
    const bt =
      order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null
        ? formatMoneyJodRange(order.bidBudgetMin, order.bidBudgetMax)
        : order?.projectType === "bidding"
          ? t("freelancerDashboard.common.emDash")
          : formatMoneyJod(order?.budget);
    if (order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null) {
      return `${typeLabel(order?.projectType, t)} — ${bt}`;
    }
    if (order?.projectType === "bidding") return `${typeLabel(order?.projectType, t)}`;
    return `${typeLabel(order?.projectType, t)} — ${bt}`;
  }, [order, t]);

  const summaryRows = useMemo(() => {
    if (!order) return [];
    const rows = [
      { label: t("orders.details.deliveryTime"), value: formatOrderDuration(order, locale, t), icon: "clock" },
      { label: t("orders.details.category"), value: categoryText, icon: "category" },
    ];
    if (Array.isArray(order?.extraCategories) && order.extraCategories.length) {
        rows.push({
        label: t("orders.details.extraCategories"),
        value: order.extraCategories
          .map((x) => {
            const c = getLocalizedField(x?.category, "name", locale);
            const ss = getLocalizedField(x?.subSubcategory, "name", locale);
            return `${c || t("freelancerDashboard.common.emDash")}${ss ? ` • ${ss}` : ""}`;
          })
          .join(" | "),
        icon: "category",
      });
    }
    return rows;
  }, [order, categoryText, locale, t]);

  const skillsLine = useMemo(() => {
    if (!order) return t("orders.details.noPreferredSkills");
    const names = Array.isArray(order.preferredSkills) ? order.preferredSkills.map((s) => s.name).filter(Boolean) : [];
    return names.length ? names.join(locale === "en" ? ", " : "، ") : t("orders.details.noPreferredSkills");
  }, [order, locale, t]);

  const poolFooterButtons = (
    <>
      {isPoolAvailable && isFreelancer && isPricedBidding ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canActOnOrder || bidBusy || order?.myBid?.status === "pending"}
          title={order?.myBid?.status === "pending" ? t("freelancerDashboard.orders.alreadyBid") : planLocked ? planLockLabel : ""}
          onClick={() => setBidOpen(true)}
        >
          {planLocked ? (
            <>
              <Lock size={18} strokeWidth={2.2} aria-hidden />
              {planLockLabel}
            </>
          ) : bidBusy
              ? t("freelancerDashboard.orders.submitting")
              : order?.myBid?.status === "pending"
                ? t("freelancerDashboard.orders.bidSubmitted")
                : t("freelancerDashboard.orders.submitBid")}
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
                ? t("freelancerDashboard.orders.alreadyParticipated")
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
              ? t("freelancerDashboard.orders.taking")
              : participationPending
                ? t("freelancerDashboard.orders.registered")
                : t("freelancerDashboard.orders.takeOrder")}
        </button>
      ) : null}
    </>
  );

  const renderFooter = isFreelancer && isPoolAvailable;

  return (
    <main className="container page-content dash-shell od-page od-page--pool oh-order-details--dashboard" dir={dir}>
      <div className="od-pool-toolbar od-pool-toolbar--bare oh-order-details__toolbar">
        <Link className="btn btn-secondary oh-order-details__back" to={backTo}>
          {t("orders.marketplace.backToList")}
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
                    title={t("orders.details.summaryTitle")}
                    primaryBlock={{
                      label: t("orders.details.projectTypeBudget"),
                      value: typeAndBudgetText,
                      dir: "ltr",
                      icon: "price",
                    }}
                    rows={summaryRows}
                  />
                </div>
                <div className="oh-order-details-neu oh-order-details-neu--files">
                  <OrderFilesCard
                    orderId={String(id)}
                    fileAccess={!planLocked && isFreelancer ? "freelancer" : null}
                    files={order.files || []}
                    emptyText={t("freelancerDashboard.orders.noFiles")}
                  />
                </div>
              </div>
            </aside>

            <div className="od-pool-title oh-order-details__main">
              <div className="oh-order-details-neu oh-order-details-neu--main">
                <div className="od-title-desc-group">
                  <OrderTitleCard title={localizedTitle} />
                  <div dir={descriptionDir}>
                    <OrderDescriptionCard text={localizedDescription} />
                  </div>
                  <OrderDescriptionCard label={t("orders.details.skillsLabel")} text={skillsLine} icon="skills" />
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
        <p className="od-empty">{t("orders.marketplace.orderNotFound")}</p>
      )}
    </main>
  );
}
