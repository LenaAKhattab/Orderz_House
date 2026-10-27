/**
 * Marketplace-M5 — paid package checkout + Stripe return banners (UI only).
 * Does NOT grant membership; webhook M3 remains the grant source of truth.
 * STARTER trial starts from the membership panel (start-trial), not the plan card CTA.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  createMarketplaceMembershipCheckoutRequest,
  createSpecialOfferCheckoutRequest,
  getMarketplaceMembershipCheckoutAttemptsRequest,
  startMarketplaceStarterTrialRequest,
} from "../services/api";
import {
  fetchFreelancerMarketplaceMembershipCached,
  invalidateFreelancerSessionCache,
} from "../services/freelancerSessionCache";
import { useAuth } from "../context/useAuth";
import { useTranslation } from "../i18n/LanguageProvider";
import { useToast } from "../components/ui/toastContext";
import {
  isPaidMarketplaceMembershipTierCode,
  isStarterMarketplaceMembershipTierCode,
  resolveMarketplaceCheckoutPlanCode,
} from "../lib/marketplaceMembership/marketplaceMembershipCheckoutUi";
import { isCurrentMarketplacePlanCard } from "../lib/marketplaceMembership/marketplaceMembershipCurrentPlanUi";
import { usePageRestore } from "./usePageRestore";
import { membershipCheckoutStatesFromAttempts } from "../lib/marketplaceMembership/membershipCheckoutState";

/** Server error codes with localized copy (server messages are Arabic-only). */
const CHECKOUT_ERROR_KEYS = {
  MARKETPLACE_MEMBERSHIP_PAYMENT_PROCESSING: "plans.checkoutErrors.processing",
  MARKETPLACE_MEMBERSHIP_PAYMENT_STATUS_UNAVAILABLE: "plans.checkoutErrors.statusUnavailable",
  PAYMENT_PROVIDER_ERROR: "plans.checkoutErrors.providerError",
};

export function useMarketplaceMembershipCheckout({
  enabled = true,
  onMembershipUpdated = null,
  membershipSnapshot = null,
} = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { push } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [checkoutBusyPlanId, setCheckoutBusyPlanId] = useState(null);
  const [specialOfferCheckoutBusy, setSpecialOfferCheckoutBusy] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [returnBanner, setReturnBanner] = useState(null);
  const handledReturnRef = useRef(new Set());

  const refreshMembership = useCallback(async () => {
    if (!user?.id) return null;
    invalidateFreelancerSessionCache();
    const snap = await fetchFreelancerMarketplaceMembershipCached(user.id, { force: true });
    if (typeof onMembershipUpdated === "function") {
      onMembershipUpdated(snap);
    }
    return snap;
  }, [onMembershipUpdated, user?.id]);

  // Server-reconciled unresolved checkouts drive Continue payment / Confirming payment on the cards.
  const [attemptsSnapshot, setAttemptsSnapshot] = useState(null);
  const refreshCheckoutAttempts = useCallback(async () => {
    if (!user?.id) return null;
    const res = await getMarketplaceMembershipCheckoutAttemptsRequest();
    const data = res?.data || null;
    setAttemptsSnapshot(data);
    if (data?.membershipChanged) await refreshMembership().catch(() => {});
    return data;
  }, [refreshMembership, user?.id]);

  useEffect(() => {
    if (!enabled) return;
    void refreshCheckoutAttempts().catch(() => {});
  }, [enabled, refreshCheckoutAttempts]);

  // Browser Back from Stripe Checkout restores this page from BFCache with the card still
  // "redirecting" (disabled). Re-enable purchase and refetch the canonical state.
  usePageRestore(
    (reason) => {
      if (reason === "pageshow") {
        setCheckoutBusyPlanId(null);
        setSpecialOfferCheckoutBusy(false);
        void refreshMembership().catch(() => {});
      }
      void refreshCheckoutAttempts().catch(() => {});
    },
    { enabled, onVisible: true },
  );

  const checkoutStates = useMemo(() => membershipCheckoutStatesFromAttempts(attemptsSnapshot), [attemptsSnapshot]);
  const hasProcessing =
    checkoutStates.specialOffer === "processing" || Object.values(checkoutStates.byPlanCode).includes("processing");

  // Genuine provider confirmation in progress: recheck periodically (non-destructive).
  useEffect(() => {
    if (!enabled || !hasProcessing) return undefined;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void refreshCheckoutAttempts().catch(() => {});
      if (attempts >= 20) window.clearInterval(timer);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [enabled, hasProcessing, refreshCheckoutAttempts]);

  const checkoutErrorMessage = useCallback(
    (err) => {
      const key = CHECKOUT_ERROR_KEYS[err?.response?.data?.code];
      return key
        ? t(key)
        : err?.response?.data?.message || err?.message || t("freelancerDashboard.marketplaceMembership.checkoutFailed");
    },
    [t],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const q = new URLSearchParams(location.search || "");
    const membershipCheckout = String(q.get("membershipCheckout") || "").trim().toLowerCase();
    if (membershipCheckout !== "success" && membershipCheckout !== "cancelled") {
      return undefined;
    }

    const key = `m5:${location.search || ""}`;
    if (handledReturnRef.current.has(key)) return undefined;
    handledReturnRef.current.add(key);

    const sessionId = (q.get("session_id") || "").trim();

    const stripParams = () => {
      q.delete("membershipCheckout");
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

    if (membershipCheckout === "cancelled") {
      setReturnBanner({
        kind: "cancelled",
        title: t("freelancerDashboard.marketplaceMembership.checkoutCancelledTitle"),
        message: t("freelancerDashboard.marketplaceMembership.checkoutCancelledMessage"),
      });
      void refreshCheckoutAttempts().catch(() => {});
      stripParams();
      return undefined;
    }

    // success — informational only; do not grant membership locally
    setReturnBanner({
      kind: "success",
      title: t("freelancerDashboard.marketplaceMembership.checkoutSuccessTitle"),
      message: t("freelancerDashboard.marketplaceMembership.checkoutSuccessMessage"),
      webhookHint: t("freelancerDashboard.marketplaceMembership.checkoutWebhookHint"),
      sessionId: sessionId || null,
    });
    void refreshMembership().catch(() => {
      /* snapshot may lag until webhook; banner already explains */
    });
    void refreshCheckoutAttempts().catch(() => {});
    stripParams();
    return undefined;
  }, [enabled, location.pathname, location.search, navigate, refreshCheckoutAttempts, refreshMembership, t]);

  const startMarketplaceCheckout = useCallback(
    async (plan) => {
      if (!enabled || !plan || checkoutBusyPlanId) return;
      const planId = String(plan.id || plan.marketplacePlanId || "");
      const tier = resolveMarketplaceCheckoutPlanCode(plan);

      if (isStarterMarketplaceMembershipTierCode(tier) || Number(plan.priceJod) === 0) {
        // STARTER is current-plan / trial panel only — never activate from card CTA.
        return;
      }

      if (isCurrentMarketplacePlanCard(plan, membershipSnapshot)) {
        return;
      }

      if (!isPaidMarketplaceMembershipTierCode(tier)) {
        setCheckoutError(t("freelancerDashboard.marketplaceMembership.checkoutUnsupportedPlan"));
        return;
      }

      setCheckoutBusyPlanId(planId || tier);
      setCheckoutError("");
      try {
        const res = await createMarketplaceMembershipCheckoutRequest(tier);
        const url = res?.data?.checkoutUrl;
        if (!url) {
          throw new Error(t("freelancerDashboard.marketplaceMembership.checkoutMissingUrl"));
        }
        window.location.href = url;
      } catch (err) {
        if (import.meta.env?.DEV) {
          console.error("[marketplace membership checkout]", err?.response?.data ?? err);
        }
        const msg = checkoutErrorMessage(err);
        setCheckoutError(msg);
        push({
          type: "warning",
          title: t("freelancerDashboard.marketplaceMembership.checkoutFailedTitle"),
          message: msg,
        });
        setCheckoutBusyPlanId(null);
        void refreshCheckoutAttempts().catch(() => {});
      }
    },
    [checkoutBusyPlanId, checkoutErrorMessage, enabled, membershipSnapshot, push, refreshCheckoutAttempts, t],
  );

  const startSpecialOfferCheckout = useCallback(async () => {
    if (!enabled || specialOfferCheckoutBusy || checkoutBusyPlanId) return;
    setSpecialOfferCheckoutBusy(true);
    setCheckoutError("");
    try {
      const res = await createSpecialOfferCheckoutRequest();
      const url = res?.data?.checkoutUrl;
      if (!url) {
        throw new Error(t("freelancerDashboard.marketplaceMembership.checkoutMissingUrl"));
      }
      window.location.href = url;
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.error("[special offer checkout]", err?.response?.data ?? err);
      }
      const msg = checkoutErrorMessage(err);
      setCheckoutError(msg);
      push({
        type: "warning",
        title: t("freelancerDashboard.marketplaceMembership.checkoutFailedTitle"),
        message: msg,
      });
      setSpecialOfferCheckoutBusy(false);
      void refreshCheckoutAttempts().catch(() => {});
    }
  }, [checkoutBusyPlanId, checkoutErrorMessage, enabled, push, refreshCheckoutAttempts, specialOfferCheckoutBusy, t]);

  const startStarterTrial = useCallback(async () => {
    if (!enabled || trialBusy) return;
    setTrialBusy(true);
    setCheckoutError("");
    try {
      await startMarketplaceStarterTrialRequest();
      await refreshMembership();
      push({
        type: "success",
        title: t("freelancerDashboard.marketplaceMembership.starterTrialStartedTitle"),
        message: t("freelancerDashboard.marketplaceMembership.starterTrialStartedMessage"),
      });
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        t("freelancerDashboard.marketplaceMembership.starterTrialFailed");
      setCheckoutError(msg);
      push({
        type: "warning",
        title: t("freelancerDashboard.marketplaceMembership.starterTrialFailedTitle"),
        message: msg,
      });
    } finally {
      setTrialBusy(false);
    }
  }, [enabled, push, refreshMembership, t, trialBusy]);

  const dismissReturnBanner = useCallback(() => setReturnBanner(null), []);

  return {
    checkoutBusyPlanId,
    specialOfferCheckoutBusy,
    checkoutStates,
    trialBusy,
    checkoutError,
    returnBanner,
    dismissReturnBanner,
    startMarketplaceCheckout,
    startSpecialOfferCheckout,
    startStarterTrial,
    refreshMembership,
    refreshCheckoutAttempts,
  };
}
