import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  confirmFreelancerSubscriptionCheckoutRequest,
  createFreelancerSubscriptionCheckoutRequest,
  getMySubscriptionRequest,
  listPublicPlansRequest,
} from "../services/api";
import PricingSection from "../components/plans/PricingSection";
import { useAuth } from "../context/useAuth";
import { useToast } from "../components/ui/toastContext";

function errorMessage(err) {
  const apiMsg = err?.response?.data?.message;
  return apiMsg || "تعذر تحميل الباقات حالياً. حاول لاحقاً.";
}

function isBlockingSubscription(subscription) {
  if (!subscription) return false;
  const status = subscription?.status;
  if (status === "inactive" || status === "cancelled") return false;

  const expiry = subscription?.expiryDate ? new Date(subscription.expiryDate) : null;
  if (expiry && Number.isFinite(expiry.getTime())) {
    return expiry.getTime() > Date.now();
  }
  // If there's no valid expiry date but it's still not inactive/cancelled,
  // treat it as blocking to avoid re-subscribing.
  return status === "active" || status === "assigned_not_started";
}

const Plans = () => {
  const { user, loading: authLoading } = useAuth();
  const { push } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mySubscription, setMySubscription] = useState(null);
  const [checkoutBusyPlanId, setCheckoutBusyPlanId] = useState(null);
  const handledToastSearchesRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await listPublicPlansRequest();
        const items = data?.data?.plans || [];
        if (!cancelled) setPlans(items);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const role = user?.primaryRole || user?.role;
      const roles = Array.isArray(user?.roles) ? user.roles : [];
      const isFreelancer = role === "freelancer" || roles.includes("freelancer");
      if (!user || !isFreelancer) {
        setMySubscription(null);
        return;
      }
      try {
        const res = await getMySubscriptionRequest();
        if (!cancelled) setMySubscription(res?.data?.subscription || null);
      } catch {
        if (!cancelled) setMySubscription(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const hasBlockingSubscription = useMemo(() => isBlockingSubscription(mySubscription), [mySubscription]);
  useEffect(() => {
    const q = new URLSearchParams(location.search || "");
    const paid = q.get("freelancer_sub_paid") === "1";
    const cancelled = q.get("freelancer_sub_cancelled") === "1";
    const sessionId = q.get("session_id") || "";
    if (!paid && !cancelled) return;
    if (handledToastSearchesRef.current.has(location.search || "")) return;
    handledToastSearchesRef.current.add(location.search || "");

    let alive = true;
    (async () => {
      let showPaidSuccess = false;
      if (paid && sessionId) {
        try {
          await confirmFreelancerSubscriptionCheckoutRequest(sessionId);
          const res = await getMySubscriptionRequest();
          if (alive) {
            setMySubscription(res?.data?.subscription ?? null);
          }
          showPaidSuccess = true;
        } catch {
          if (alive) {
            push({
              type: "warning",
              title: "جاري التحقق من الدفع",
              message:
                "لم يُؤكَّد الدفع فوراً من الخادم. انتظر قليلاً ثم حدّث الصفحة؛ أو تأكد أن عنوان ويب هوك Stripe يصل إلى الخادم.",
            });
          }
        }
      } else if (paid && !sessionId) {
        showPaidSuccess = true;
      }

      if (!alive) return;

      if (paid && showPaidSuccess) {
        push({
          type: "success",
          title: "تم استلام الدفع",
          message: "حسابك الآن بانتظار تفعيل الشركة.",
        });
      } else if (cancelled) {
        push({
          type: "warning",
          title: "تم إلغاء الدفع",
          message: "لم تكتمل عملية الدفع.",
        });
      }

      q.delete("freelancer_sub_paid");
      q.delete("freelancer_sub_cancelled");
      q.delete("session_id");
      const nextSearch = q.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
        },
        { replace: true },
      );
    })();

    return () => {
      alive = false;
    };
  }, [location.pathname, location.search, navigate, push]);

  return (
    <main className="container page-content" lang="ar" dir="rtl">
      <PricingSection
        loading={loading}
        plans={plans.filter((p) => p?.isVisible !== false)}
        hasBlockingSubscription={hasBlockingSubscription}
        onCta={async (plan) => {
          if (authLoading || !plan?.id || checkoutBusyPlanId) return;
          const role = user?.primaryRole || user?.role;
          const roles = Array.isArray(user?.roles) ? user.roles : [];
          const isFreelancer = role === "freelancer" || roles.includes("freelancer");
          if (!user || !isFreelancer) return;
          setCheckoutBusyPlanId(String(plan.id));
          setError("");
          try {
            const res = await createFreelancerSubscriptionCheckoutRequest(plan.id);
            const url = res?.data?.checkoutUrl;
            if (url) window.location.href = url;
          } catch (err) {
            if (import.meta.env?.DEV) {
              // eslint-disable-next-line no-console
              console.error("[freelancer checkout]", err?.response?.data ?? err);
            }
            setError(errorMessage(err));
          } finally {
            setCheckoutBusyPlanId(null);
          }
        }}
      />
      {error ? (
        <section className="card" style={{ marginTop: 14 }}>
          <p className="auth-form-error">{error}</p>
        </section>
      ) : null}

      {!loading && plans.length === 0 ? (
        <section className="card" style={{ marginTop: 14 }}>
          <p>لا توجد باقات متاحة حالياً.</p>
        </section>
      ) : null}
    </main>
  );
};

export default Plans;

