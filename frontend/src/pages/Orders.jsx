import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import OrderCard from "../components/orders/OrderCard";
import BidAmountModal from "../components/orders/BidAmountModal";
import { useAuth } from "../context/useAuth";
import { useToast } from "../components/ui/toastContext";
import {
  getMyEligibilityRequest,
  getMySubscriptionRequest,
  listPoolOrdersRequest,
  submitPoolOrderBidRequest,
  takePoolOrderRequest,
} from "../services/api";
import * as tw from "../components/auth/authTw";
import { OrderCardsGridSkeleton } from "../components/ui/Skeleton";
import { getFreelancerOrderEligibilityMessage } from "../utils/freelancerEligibilityUi";

function isPricedBiddingPoolOrder(order) {
  return order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null;
}

const Orders = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();
  const role = user?.primaryRole || user?.role;
  const isFreelancer = role === "freelancer";
  const isClient = role === "client";

  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(true);
  const [takingId, setTakingId] = useState(null);
  const [bidBusyId, setBidBusyId] = useState(null);
  const [bidModalOrder, setBidModalOrder] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 1 });
  const [loadError, setLoadError] = useState("");
  const [reloadTick, setReloadTick] = useState(0);
  const [eligibility, setEligibility] = useState(null);
  const [eligibilityFetched, setEligibilityFetched] = useState(false);
  const [subscription, setSubscription] = useState(null);

  const canTake = useMemo(() => {
    if (!isFreelancer) return false;
    return Boolean(eligibility?.eligible);
  }, [isFreelancer, eligibility]);

  const showIneligibleNotice =
    Boolean(user) && isFreelancer && eligibilityFetched && eligibility && eligibility.eligible === false;
  const ineligibleMessage = showIneligibleNotice ? getFreelancerOrderEligibilityMessage(eligibility, subscription) : "";

  useEffect(() => {
    if (loading) return;
    const r = user?.primaryRole || user?.role;
    if (user && (r === "freelancer" || r === "client")) {
      navigate("/dashboard/freelancer/orders", { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true);
      setLoadError("");
      try {
        const res = await listPoolOrdersRequest({ page, limit: 12 });
        if (!cancelled) {
          setOrders(res?.data?.orders || []);
          setPagination(res?.data?.pagination || { page, limit: 12, total: 0, totalPages: 1 });
        }
      } catch {
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
  }, [push, page, reloadTick]);

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
      push({ type: "success", title: "تم تقديم الطلب", message: "تم تسجيل طلب الاستلام (قد يحتاج موافقة الإدارة)." });
      const res = await listPoolOrdersRequest({ page, limit: 12 });
      setOrders(res?.data?.orders || []);
      setPagination(res?.data?.pagination || { page, limit: 12, total: 0, totalPages: 1 });
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
      push({ type: "success", title: "تم إرسال العرض", message: "سيتمكن العميل لاحقاً من مراجعة العروض واختيار الأنسب." });
      setBidModalOrder(null);
      const res = await listPoolOrdersRequest({ page, limit: 12 });
      setOrders(res?.data?.orders || []);
      setPagination(res?.data?.pagination || { page, limit: 12, total: 0, totalPages: 1 });
    } catch (e) {
      push({ type: "error", title: "تعذر إرسال العرض", message: e?.response?.data?.message || e?.message });
    } finally {
      setBidBusyId(null);
    }
  };

  return (
    <main className="container page-content dashboard-orders-system">
      <section className="card dashboard-orders-system__header">
        <h1>الطلبات</h1>
        <p>
          طلبات منشورة في الحوض: من الإدارة أو من العملاء. طلبات <strong>سعر ثابت</strong> تُستلم بنفس تدفق الاستلام الحالي؛ طلبات{" "}
          <strong>المزايدة بنطاق سعر</strong> تُقدَّم لها عروض أسعار بدل الاستلام المباشر.
        </p>

        {!user ? (
          <p className="help">
            لتتمكن من استلام طلب، <Link className={tw.authInlineLink} to="/login">سجّل الدخول</Link> كفريلانسر.
          </p>
        ) : isFreelancer ? (
          showIneligibleNotice ? (
            <p className="help">
              {ineligibleMessage}
            </p>
          ) : null
        ) : isClient ? null : (
          <p className="help">استلام الطلبات متاح للفريلانسر فقط.</p>
        )}
      </section>

      <section className="cards-grid" aria-busy={busy}>
        {busy ? (
          <OrderCardsGridSkeleton count={3} />
        ) : loadError ? (
          <section className="card">
            <p>{loadError}</p>
            <button type="button" className="btn btn-secondary" onClick={() => setReloadTick((x) => x + 1)}>
              إعادة المحاولة
            </button>
          </section>
        ) : orders.length === 0 ? (
          <section className="card">
            <p>لا توجد طلبات متاحة في الحوض حالياً.</p>
          </section>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              showOrderCode={false}
              showAssignmentBadge={false}
              showAdminBadge={false}
              footerInline={
                order?.assignedFreelancerId
                  ? null
                  : !user || isFreelancer
                    ? (
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-start", alignItems: "center", flexWrap: "wrap" }}>
                    {isPricedBiddingPoolOrder(order) ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!user || !isFreelancer || !canTake || bidBusyId === order.id}
                        title={
                          order?.myBid?.status === "pending"
                            ? "لقد قدمت عرضاً لهذا الطلب."
                            : order?.myBid?.status === "accepted"
                              ? "تم قبول عرضك."
                              : ""
                        }
                        onClick={() => setBidModalOrder(order)}
                      >
                        {bidBusyId === order.id ? "جارٍ الإرسال…" : order?.myBid?.status === "pending" ? "عرضك مُرسل" : "تقديم عرض سعر"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!user || !isFreelancer || !canTake || takingId === order.id}
                        title={
                          order?.myClaim?.status
                            ? order.myClaim.status === "pending"
                              ? "سبق أن تقدمت لهذا الطلب وهو قيد المراجعة."
                              : order.myClaim.status === "withdrawn"
                                ? "سبق أن تقدمت لهذا الطلب ثم قمت بسحبه."
                                : order.myClaim.status === "rejected"
                                  ? "سبق أن تقدمت لهذا الطلب وتم رفض الطلب."
                                  : `سبق أن تقدمت لهذا الطلب (الحالة: ${order.myClaim.status}).`
                            : ""
                        }
                        onClick={() => take(order.id, order.orderSource)}
                      >
                        {takingId === order.id ? "جارٍ الاستلام…" : "استلام الطلب"}
                      </button>
                    )}
                    {!user ? <span className="help">تسجيل الدخول مطلوب</span> : null}
                    {user && isFreelancer && !canTake ? (
                      <span className="help">{getFreelancerOrderEligibilityMessage(eligibility, subscription)}</span>
                    ) : null}
                  </div>
                    )
                    : null
              }
            />
          ))
        )}
      </section>

      {!busy && !loadError ? (
        <section className="card dashboard-orders-system__pagination">
          <button type="button" className="btn btn-secondary" disabled={(pagination?.page || 1) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            السابق
          </button>
          <span className="help">
            الصفحة {pagination?.page || 1} من {Math.max(1, pagination?.totalPages || 1)}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={(pagination?.page || 1) >= Math.max(1, pagination?.totalPages || 1)}
            onClick={() => setPage((p) => Math.min(Math.max(1, pagination?.totalPages || 1), p + 1))}
          >
            التالي
          </button>
        </section>
      ) : null}

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
    </main>
  );
};

export default Orders;
