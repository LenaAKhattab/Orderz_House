import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import OrderCard from "../components/orders/OrderCard";
import BidAmountModal from "../components/orders/BidAmountModal";
import { useAuth } from "../context/useAuth";
import { useToast } from "../components/ui/toastContext";
import { getMyEligibilityRequest, listPoolOrdersRequest, submitPoolOrderBidRequest, takePoolOrderRequest } from "../services/api";
import { OrderCardsGridSkeleton } from "../components/ui/Skeleton";

function isPricedBiddingPoolOrder(order) {
  return order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null;
}

const Orders = () => {
  const { user, loading } = useAuth();
  const { push } = useToast();
  const role = user?.primaryRole || user?.role;
  const isFreelancer = role === "freelancer";

  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(true);
  const [takingId, setTakingId] = useState(null);
  const [bidBusyId, setBidBusyId] = useState(null);
  const [bidModalOrder, setBidModalOrder] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [eligibilityFetched, setEligibilityFetched] = useState(false);

  const canTake = useMemo(() => {
    if (!isFreelancer) return false;
    return Boolean(eligibility?.eligible);
  }, [isFreelancer, eligibility]);

  const showIneligibleNotice =
    Boolean(user) && isFreelancer && eligibilityFetched && eligibility && eligibility.eligible === false;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true);
      try {
        const res = await listPoolOrdersRequest({ limit: 50, offset: 0 });
        if (!cancelled) setOrders(res?.data?.orders || []);
      } catch (e) {
        if (!cancelled) {
          push({ type: "error", title: "تعذر تحميل الطلبات", message: e?.response?.data?.message || e?.message });
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [push]);

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
      push({ type: "success", title: "تم تقديم الطلب", message: "تم تسجيل طلب الاستلام (قد يحتاج موافقة الإدارة)." });
      const res = await listPoolOrdersRequest({ limit: 50, offset: 0 });
      setOrders(res?.data?.orders || []);
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
      push({ type: "success", title: "تم إرسال العرض", message: "سيتمكن العميل لاحقاً من مراجعة العروض واختيار الأنسب." });
      setBidModalOrder(null);
      const res = await listPoolOrdersRequest({ limit: 50, offset: 0 });
      setOrders(res?.data?.orders || []);
    } catch (e) {
      push({ type: "error", title: "تعذر إرسال العرض", message: e?.response?.data?.message || e?.message });
    } finally {
      setBidBusyId(null);
    }
  };

  return (
    <main className="container page-content">
      <section className="card">
        <h1>الطلبات</h1>
        <p>
          طلبات منشورة في الحوض: من الإدارة أو من العملاء. طلبات <strong>سعر ثابت</strong> تُستلم بنفس تدفق الاستلام الحالي؛ طلبات{" "}
          <strong>المزايدة بنطاق سعر</strong> تُقدَّم لها عروض أسعار بدل الاستلام المباشر.
        </p>

        {!user ? (
          <p className="help">
            لتتمكن من استلام طلب، <Link className="auth-inline-link" to="/login">سجّل الدخول</Link> كفريلانسر.
          </p>
        ) : isFreelancer ? (
          showIneligibleNotice ? (
            <p className="help">
              حسابك غير مؤهل حالياً لاستلام طلبات من الحوض (تحقق من الاشتراك).
            </p>
          ) : null
        ) : (
          <p className="help">استلام الطلبات متاح للفريلانسر فقط.</p>
        )}
      </section>

      <section className="cards-grid" aria-busy={busy}>
        {busy ? (
          <OrderCardsGridSkeleton count={3} />
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
                order?.assignedFreelancerId ? null : (
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
                        onClick={() => take(order.id)}
                      >
                        {takingId === order.id ? "جارٍ الاستلام…" : "استلام الطلب"}
                      </button>
                    )}
                    {!user ? <span className="help">تسجيل الدخول مطلوب</span> : null}
                    {user && isFreelancer && !canTake ? <span className="help">غير مؤهل (اشتراك غير نشط)</span> : null}
                  </div>
                )
              }
            />
          ))
        )}
      </section>

      <BidAmountModal
        open={Boolean(bidModalOrder)}
        title={bidModalOrder ? `عرض سعر: ${bidModalOrder.title}` : ""}
        min={bidModalOrder?.bidBudgetMin}
        max={bidModalOrder?.bidBudgetMax}
        currency={bidModalOrder?.currencyCode}
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
