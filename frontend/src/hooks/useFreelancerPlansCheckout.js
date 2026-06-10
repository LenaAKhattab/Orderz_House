import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  confirmFreelancerSubscriptionCheckoutRequest,
  createFreelancerSubscriptionCheckoutRequest,
  getMySubscriptionRequest,
  listPublicPlansRequest,
  notifyFreelancerSubscriptionCheckoutCancelledRequest,
  NOTIFICATIONS_REFRESH_EVENT,
} from "../services/api";
import {
  getOrderzhousePlansCatalog,
  mergeApiPlansWithCatalog,
} from "../constants/orderzhousePlansCatalog";
import { useAuth } from "../context/useAuth";
import { useToast } from "../components/ui/toastContext";
import { trackEvent } from "../services/analytics";
import { isBlockingSubscription } from "../utils/planSubscriptionUtils";

function checkoutErrorMessage(err) {
  return err?.response?.data?.message || "تعذر تحميل الباقات حالياً. حاول لاحقاً.";
}

export function useFreelancerPlansCheckout({ returnPath = "/dashboard/freelancer/plans" } = {}) {
  const { user } = useAuth();
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
        if (!cancelled) setPlans(mergeApiPlansWithCatalog(items));
      } catch {
        if (!cancelled) setPlans(getOrderzhousePlansCatalog());
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
    const sessionId = (q.get("session_id") || "").trim();

    const stripCheckoutParams = () => {
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
    };

    if (!paid && !cancelled) return undefined;

    if (cancelled) {
      const key = `cancel:${location.search || ""}`;
      if (handledToastSearchesRef.current.has(key)) return undefined;
      handledToastSearchesRef.current.add(key);
      const cancelSessionId = (q.get("session_id") || "").trim();
      push({
        type: "warning",
        title: "تم إلغاء الدفع",
        message: "لم تكتمل عملية الدفع.",
      });
      stripCheckoutParams();
      if (cancelSessionId && typeof window !== "undefined") {
        void notifyFreelancerSubscriptionCheckoutCancelledRequest(cancelSessionId)
          .then(() => {
            window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
          })
          .catch(() => {});
      }
      return undefined;
    }

    if (paid && !sessionId) {
      const key = "paid:missing_session";
      if (handledToastSearchesRef.current.has(key)) return undefined;
      handledToastSearchesRef.current.add(key);
      push({
        type: "warning",
        title: "تعذر التحقق من الدفع",
        message:
          "لم يُستلم رقم جلسة Stripe في الرابط. انتظر قليلاً ثم حدّث الصفحة، أو راجع صفحة الباقات بعد وصول ويب هوك الدفع.",
      });
      stripCheckoutParams();
      return undefined;
    }

    if (paid && sessionId) {
      const storageKey = `oh_fsub_confirm_${sessionId}`;
      let cancelledEffect = false;

      if (typeof sessionStorage !== "undefined") {
        if (sessionStorage.getItem(storageKey) === "done") {
          stripCheckoutParams();
          return undefined;
        }
        if (sessionStorage.getItem(storageKey) === "pending") {
          return undefined;
        }
        sessionStorage.setItem(storageKey, "pending");
      }

      (async () => {
        try {
          await confirmFreelancerSubscriptionCheckoutRequest(sessionId);
          const res = await getMySubscriptionRequest();
          if (!cancelledEffect) {
            setMySubscription(res?.data?.subscription ?? null);
          }
          trackEvent("subscription_purchased", {
            checkout_session_id: String(sessionId),
            source: "stripe_checkout_confirm",
          });
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(storageKey, "done");
          }
          if (!cancelledEffect) {
            push({
              type: "success",
              title: "تم استلام الدفع",
              message: "تم التحقق من الخادم. حسابك بانتظار تفعيل الشركة.",
            });
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
            }
          }
        } catch (err) {
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.removeItem(storageKey);
          }
          const msg = err?.response?.data?.message;
          if (!cancelledEffect) {
            push({
              type: "warning",
              title: "لم يُؤكَّد الدفع بعد",
              message:
                msg ||
                "انتظر قليلاً ثم حدّث الصفحة؛ أو تأكد أن ويب هوك Stripe يصل إلى الخادم. الدفع لا يُعتمد من المتصفح فقط.",
            });
          }
        } finally {
          if (!cancelledEffect) {
            stripCheckoutParams();
          }
        }
      })();

      return () => {
        cancelledEffect = true;
        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(storageKey) === "pending") {
          sessionStorage.removeItem(storageKey);
        }
      };
    }

    return undefined;
  }, [location.pathname, location.search, navigate, push]);

  const startCheckout = async (plan) => {
    if (!plan?.id || checkoutBusyPlanId) return;
    setCheckoutBusyPlanId(String(plan.id));
    setError("");
    try {
      const res = await createFreelancerSubscriptionCheckoutRequest(plan.id);
      const url = res?.data?.checkoutUrl;
      if (url) window.location.href = url;
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.error("[freelancer checkout]", err?.response?.data ?? err);
      }
      setError(checkoutErrorMessage(err));
    } finally {
      setCheckoutBusyPlanId(null);
    }
  };

  return {
    plans,
    loading,
    error,
    mySubscription,
    hasBlockingSubscription,
    checkoutBusyPlanId,
    startCheckout,
    returnPath,
  };
}
