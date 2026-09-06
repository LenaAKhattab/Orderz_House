import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  confirmFreelancerSubscriptionCheckoutRequest,
  createFreelancerSubscriptionCheckoutRequest,
  getMySubscriptionRequest,
  notifyFreelancerSubscriptionCheckoutCancelledRequest,
  NOTIFICATIONS_REFRESH_EVENT,
} from "../services/api";
import {
  fetchFreelancerActivationFeeStatusCached,
  fetchFreelancerSubscriptionCached,
  fetchPublicPlansCached,
  getCachedFreelancerActivationFeeStatus,
  getCachedFreelancerSubscription,
  getCachedPublicActivationFee,
  getCachedPublicPlans,
  invalidateFreelancerSessionCache,
} from "../services/freelancerSessionCache";
import { useAuth } from "../context/useAuth";
import { useTranslation } from "../i18n/LanguageProvider";
import { useToast } from "../components/ui/toastContext";
import { trackEvent } from "../services/analytics";
import { isBlockingSubscription } from "../utils/planSubscriptionUtils";

function normalizePublicActivationFee(fee) {
  if (!fee || typeof fee !== "object") return null;
  return {
    enabled: fee.enabled === true,
    amountJod: fee.amountJod != null ? Number(fee.amountJod) : null,
    amountMinor: fee.amountMinor != null ? Number(fee.amountMinor) : null,
    validityDays: fee.validityDays != null ? Number(fee.validityDays) : 365,
  };
}

export function useFreelancerPlansCheckout({
  returnPath = "/dashboard/freelancer/plans",
  fetchPublicPlans = true,
} = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { push } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [plans, setPlans] = useState(() => getCachedPublicPlans() || []);
  const [activationFee, setActivationFee] = useState(() =>
    normalizePublicActivationFee(getCachedPublicActivationFee()),
  );
  const [plansFetching, setPlansFetching] = useState(() => !getCachedPublicPlans()?.length);
  const [error, setError] = useState("");
  const [mySubscription, setMySubscription] = useState(() =>
    user?.id ? getCachedFreelancerSubscription(user.id) ?? null : null,
  );
  const [activationFeeStatus, setActivationFeeStatus] = useState(() =>
    user?.id ? getCachedFreelancerActivationFeeStatus(user.id) ?? null : null,
  );
  const [checkoutBusyPlanId, setCheckoutBusyPlanId] = useState(null);
  const handledToastSearchesRef = useRef(new Set());

  const resolvedActivationFee = useMemo(() => {
    if (activationFeeStatus && typeof activationFeeStatus === "object") {
      const enabled =
        activationFeeStatus.enabled != null
          ? Boolean(activationFeeStatus.enabled)
          : activationFee?.enabled !== false;
      return normalizePublicActivationFee({
        enabled,
        amountJod: activationFeeStatus.amountJod ?? activationFee?.amountJod,
        amountMinor: activationFeeStatus.amountMinor ?? activationFee?.amountMinor,
        validityDays: activationFeeStatus.validityDays ?? activationFee?.validityDays,
      });
    }
    return activationFee;
  }, [activationFee, activationFeeStatus]);

  const activationFeeNeedsPayment = useMemo(
    () => Boolean(resolvedActivationFee?.enabled !== false && activationFeeStatus?.needsPayment),
    [activationFeeStatus, resolvedActivationFee],
  );

  useEffect(() => {
    if (!fetchPublicPlans) {
      setPlans([]);
      setPlansFetching(false);
      return undefined;
    }
    let cancelled = false;
    const cached = getCachedPublicPlans();
    if (cached?.length) {
      setPlans(cached);
      setActivationFee(normalizePublicActivationFee(getCachedPublicActivationFee()));
      setPlansFetching(false);
    } else {
      setPlansFetching(true);
    }
    void fetchPublicPlansCached({ force: !cached?.length })
      .then((merged) => {
        if (!cancelled) {
          setPlans(merged);
          setActivationFee(normalizePublicActivationFee(getCachedPublicActivationFee()));
        }
      })
      .finally(() => {
        if (!cancelled) setPlansFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPublicPlans]);

  useEffect(() => {
    let cancelled = false;
    const role = user?.primaryRole || user?.role;
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const isFreelancer = role === "freelancer" || roles.includes("freelancer");
    if (!user?.id || !isFreelancer) {
      setMySubscription(null);
      setActivationFeeStatus(null);
      return undefined;
    }
    const cachedSub = getCachedFreelancerSubscription(user.id);
    const cachedFee = getCachedFreelancerActivationFeeStatus(user.id);
    if (cachedSub !== undefined) setMySubscription(cachedSub);
    if (cachedFee !== undefined) setActivationFeeStatus(cachedFee);
    void fetchFreelancerSubscriptionCached(user.id).then((sub) => {
      if (!cancelled) {
        setMySubscription(sub);
        setActivationFeeStatus(getCachedFreelancerActivationFeeStatus(user.id) ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const hasBlockingSubscription = useMemo(() => isBlockingSubscription(mySubscription), [mySubscription]);

  useEffect(() => {
    const q = new URLSearchParams(location.search || "");
    const subPaid = q.get("freelancer_sub_paid") === "1";
    const subCancelled = q.get("freelancer_sub_cancelled") === "1";
    const feePaid = q.get("freelancer_activation_fee_paid") === "1";
    const feeCancelled = q.get("freelancer_activation_fee_cancelled") === "1";
    const paid = subPaid || feePaid;
    const cancelled = subCancelled || feeCancelled;
    const isActivationFeeFlow = feePaid || feeCancelled;
    const sessionId = (q.get("session_id") || "").trim();

    const stripCheckoutParams = () => {
      q.delete("freelancer_sub_paid");
      q.delete("freelancer_sub_cancelled");
      q.delete("freelancer_activation_fee_paid");
      q.delete("freelancer_activation_fee_cancelled");
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
        title: isActivationFeeFlow
          ? t("plans.activationFee.cancelledTitle")
          : t("plans.checkout.cancelledTitle"),
        message: isActivationFeeFlow
          ? t("plans.activationFee.cancelledMessage")
          : t("plans.checkout.cancelledMessage"),
      });
      stripCheckoutParams();
      if (cancelSessionId && typeof window !== "undefined" && !isActivationFeeFlow) {
        void notifyFreelancerSubscriptionCheckoutCancelledRequest(cancelSessionId)
          .then(() => {
            window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
          })
          .catch(() => {});
      }
      return undefined;
    }

    if (paid && !sessionId) {
      const key = `paid:missing_session:${isActivationFeeFlow ? "fee" : "sub"}`;
      if (handledToastSearchesRef.current.has(key)) return undefined;
      handledToastSearchesRef.current.add(key);
      push({
        type: "warning",
        title: t("plans.checkout.verifyFailedTitle"),
        message: t("plans.checkout.verifyFailedMessage"),
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
          invalidateFreelancerSessionCache();
          const sub = user?.id
            ? await fetchFreelancerSubscriptionCached(user.id, { force: true })
            : (await getMySubscriptionRequest())?.data?.subscription ?? null;
          const feeStatus = user?.id
            ? await fetchFreelancerActivationFeeStatusCached(user.id, { force: true })
            : (await getMySubscriptionRequest())?.data?.activationFeeStatus ?? null;
          if (!cancelledEffect) {
            setMySubscription(sub);
            setActivationFeeStatus(feeStatus);
          }
          trackEvent(isActivationFeeFlow ? "activation_fee_paid" : "subscription_purchased", {
            checkout_session_id: String(sessionId),
            source: "stripe_checkout_confirm",
          });
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(storageKey, "done");
          }
          if (!cancelledEffect) {
            if (isActivationFeeFlow) {
              push({
                type: "success",
                title: t("plans.activationFee.paidSuccessTitle"),
                message: t("plans.activationFee.paidSuccessMessage"),
              });
            } else {
              push({
                type: "success",
                title: t("plans.checkout.paidSuccessTitle"),
                message: t("plans.checkout.paidSuccessMessage"),
              });
            }
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
              title: t("plans.checkout.confirmPendingTitle"),
              message: msg || t("plans.checkout.confirmPendingMessage"),
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
  }, [location.pathname, location.search, navigate, push, t, user?.id]);

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
      setError(err?.response?.data?.message || t("plans.errors.loadFailed"));
    } finally {
      setCheckoutBusyPlanId(null);
    }
  };

  return {
    plans,
    loading: plansFetching && plans.length === 0,
    error,
    mySubscription,
    activationFeeStatus,
    activationFee: resolvedActivationFee,
    activationFeeNeedsPayment,
    hasBlockingSubscription,
    checkoutBusyPlanId,
    startCheckout,
    returnPath,
  };
}
