import { useCallback, useEffect, useState } from "react";
import {
  confirmFreelancerBidCreditPurchaseRequest,
  createFreelancerBidCreditPurchaseCheckoutRequest,
  getFreelancerBidCreditsRequest,
  listFreelancerBidCreditPackagesRequest,
  listFreelancerBidCreditPurchasesRequest,
} from "../../services/api";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/economyResources";
import Button from "../ui/Button";

/**
 * Freelancer Bid Credits summary + package purchase (Phase B6).
 * Success redirect never claims Bids were added until backend confirm/fulfill.
 */
export default function FreelancerBidCreditsCard() {
  const { t, locale } = useTranslation();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [packages, setPackages] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [purchaseMsg, setPurchaseMsg] = useState(null);

  const refresh = useCallback(async () => {
    const [credits, pkgs, hist] = await Promise.allSettled([
      getFreelancerBidCreditsRequest(),
      listFreelancerBidCreditPackagesRequest(),
      listFreelancerBidCreditPurchasesRequest({ limit: 5 }),
    ]);
    if (credits.status === "fulfilled") {
      setState({ loading: false, error: null, data: credits.value?.data || null });
    } else {
      setState({
        loading: false,
        error: credits.reason?.response?.data?.message || credits.reason?.message || "error",
        data: null,
      });
    }
    if (pkgs.status === "fulfilled") {
      setPackages(pkgs.value?.data?.packages || []);
    }
    if (hist.status === "fulfilled") {
      setPurchases(hist.value?.data?.purchases || []);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setState({
            loading: false,
            error: err?.response?.data?.message || err?.message || "error",
            data: null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // After Stripe redirect: confirm server-side; never assume Bids granted from URL alone.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) return;
    if (params.get("bid_credits_paid") === "1") {
      setPurchaseMsg(
        t("economy.bidCreditsCard.paymentConfirming"),
      );
      (async () => {
        try {
          const res = await confirmFreelancerBidCreditPurchaseRequest({ sessionId });
          if (res?.data?.fulfilled) {
            setPurchaseMsg(
              t("economy.bidCreditsCard.bidsAdded"),
            );
          } else if (res?.data?.paid) {
            setPurchaseMsg(
              t("economy.bidCreditsCard.paymentProcessing"),
            );
          } else {
            setPurchaseMsg(
              t("economy.bidCreditsCard.paymentIncomplete"),
            );
          }
          await refresh();
        } catch (err) {
          setPurchaseMsg(err?.response?.data?.message || err?.message || "error");
        }
      })();
    } else if (params.get("bid_credits_cancelled") === "1") {
      setPurchaseMsg(t("economy.bidCreditsCard.checkoutCancelled"));
    }
  }, [t, refresh]);

  const buy = async (pkg) => {
    setBusyId(pkg.id);
    setPurchaseMsg(null);
    try {
      // Server ignores any client price/quantity — only packageId is authoritative.
      const res = await createFreelancerBidCreditPurchaseCheckoutRequest({
        packageId: Number(pkg.id),
      });
      const url = res?.data?.checkoutUrl;
      if (!url) throw new Error(t("economy.bidCreditsCard.checkoutUnavailable"));
      window.location.href = url;
    } catch (err) {
      setPurchaseMsg(err?.response?.data?.message || err?.message || "error");
      setBusyId(null);
    }
  };

  if (state.loading) {
    return (
      <section className="fp-surface" style={{ marginTop: 16 }} aria-busy="true">
        <p style={{ margin: 0 }}>
          {t("freelancerDashboard.bidCredits.loading", {
            defaultValue: t("economy.bidCreditsCard.loading"),
          })}
        </p>
      </section>
    );
  }

  if (state.error) {
    return null;
  }

  const data = state.data || {};
  const available = Number(data.availableBids) || 0;
  const month = data.currentMonth;

  return (
    <section className="fp-surface" style={{ marginTop: 16 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>
        {t("freelancerDashboard.bidCredits.title", {
          defaultValue: t("economy.bidCreditsCard.title"),
        })}
      </h2>
      <p style={{ margin: "0 0 12px", opacity: 0.85, fontSize: "0.92rem" }}>
        {t("freelancerDashboard.bidCredits.subtitle", {
          defaultValue: t("economy.bidCreditsCard.oneBidHint"),
        })}
      </p>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>
            {t("freelancerDashboard.bidCredits.available", {
              defaultValue: t("economy.bidCreditsCard.available"),
            })}
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{available}</div>
        </div>
        <div>
          <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>
            {t("freelancerDashboard.bidCredits.fromMembership", {
              defaultValue: t("economy.bidCreditsCard.fromMembership"),
            })}
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
            {Number(data.membershipDerivedAvailable) || 0}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>
            {t("freelancerDashboard.bidCredits.fromAdmin", {
              defaultValue: t("economy.bidCreditsCard.adminGrants"),
            })}
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
            {Number(data.manualAdminAvailable) || 0}
          </div>
        </div>
        {month ? (
          <>
            <div>
              <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>
                {t("freelancerDashboard.bidCredits.monthlyAllowance", {
                  defaultValue: t("economy.bidCreditsCard.monthlyAllowance"),
                })}
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>{month.monthlyAllowance}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>
                {t("freelancerDashboard.bidCredits.unlockedThisMonth", {
                  defaultValue: t("economy.bidCreditsCard.unlockedMonth"),
                })}
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>{month.unlockedThisMonth}</div>
            </div>
          </>
        ) : null}
      </div>
      {data.nextExpiringAt ? (
        <p style={{ margin: "12px 0 0", fontSize: "0.85rem", opacity: 0.8 }}>
          {t("freelancerDashboard.bidCredits.nextExpiry", {
            defaultValue: t("economy.bidCreditsCard.nextExpiry"),
          })}
          : {String(data.nextExpiringAt).slice(0, 10)}
        </p>
      ) : null}

      {purchaseMsg ? (
        <p style={{ margin: "12px 0 0", fontSize: "0.9rem" }} role="status">
          {purchaseMsg}
        </p>
      ) : null}

      {packages.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: "0.95rem" }}>
            {t("economy.bidCreditsCard.buyPackages")}
          </h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {packages.map((pkg) => (
              <li
                key={pkg.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span>
                  <strong>{locale === "en" ? pkg.nameEn || pkg.nameAr : pkg.nameAr}</strong>
                  {" — "}
                  {pkg.bidQuantity} {t("economy.bidCreditsCard.bidUnit")} / {pkg.priceJod} JOD
                  {pkg.validityDays
                    ? ` · ${pkg.validityDays} ${t("economy.bidCreditsCard.days")}`
                    : ""}
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    busyId === pkg.id || !data.engineEnabled || !data.purchasesEngineEnabled
                  }
                  onClick={() => buy(pkg)}
                >
                  {t("economy.bidCreditsCard.buy")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {purchases.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: "0.9rem" }}>
            {t("economy.bidCreditsCard.recentPurchases")}
          </h3>
          <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: "0.85rem", opacity: 0.9 }}>
            {purchases.map((p) => (
              <li key={p.id}>
                {p.bidQuantitySnapshot} {t("economy.bidCreditsCard.bidUnit")} · {p.priceJodSnapshot} JOD ·{" "}
                <strong>
                  {p.displayStatus === "completed"
                    ? t("economy.bidCreditsCard.statusCompleted")
                    : p.displayStatus === "payment_disputed"
                      ? t("economy.bidCreditsCard.statusDisputed")
                      : p.displayStatus === "under_payment_review"
                        ? t("economy.bidCreditsCard.statusReview")
                        : p.displayStatus === "refunded"
                          ? t("economy.bidCreditsCard.statusRefunded")
                          : p.status}
                </strong>
                {p.remainingBidsTemporarilyUnavailable ? t("economy.bidCreditsCard.frozenNote") : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p style={{ margin: "10px 0 0", fontSize: "0.85rem", opacity: 0.75 }}>
        {data.engineEnabled
          ? t("freelancerDashboard.bidCredits.engineOn", {
              defaultValue: t("economy.bidCreditsCard.engineOn"),
            })
          : t("freelancerDashboard.bidCredits.engineComingSoon", {
              defaultValue: t("economy.bidCreditsCard.engineOff"),
            })}
      </p>
    </section>
  );
}
