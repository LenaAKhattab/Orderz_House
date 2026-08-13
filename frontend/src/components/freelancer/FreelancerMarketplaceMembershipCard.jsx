import { useEffect, useState } from "react";
import { getFreelancerMarketplaceMembershipRequest } from "../../services/api";
import { formatJoDateMedium } from "../../utils/freelancerDashboardData";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getLocalizedField } from "../../lib/i18n/getLocalizedField";

/**
 * Read-only Marketplace Membership foundation (Phase 3).
 * Shows allowance accounting only — never a Priority Bid auction action.
 */
export default function FreelancerMarketplaceMembershipCard() {
  const { t, locale } = useTranslation();
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getFreelancerMarketplaceMembershipRequest();
        if (!cancelled) {
          setState({ loading: false, error: null, data: res?.data || null });
        }
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
  }, []);

  if (state.loading) {
    return (
      <section className="fp-surface" style={{ marginTop: 16 }} aria-busy="true">
        <p style={{ margin: 0 }}>{t("freelancerDashboard.marketplaceMembership.loading")}</p>
      </section>
    );
  }

  if (state.error) {
    return null;
  }

  const snap = state.data;
  if (!snap?.hasMembership) {
    return (
      <section className="fp-surface" style={{ marginTop: 16 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>
          {t("freelancerDashboard.marketplaceMembership.title")}
        </h2>
        <p style={{ margin: 0, opacity: 0.85 }}>
          {t("freelancerDashboard.marketplaceMembership.none")}
        </p>
      </section>
    );
  }

  const planName =
    getLocalizedField(snap.membership?.plan, "name", locale) ||
    (locale === "en" ? snap.membership?.plan?.nameEn : snap.membership?.plan?.nameAr) ||
    snap.membership?.plan?.nameAr ||
    snap.membership?.plan?.tierCode ||
    "—";

  const pb = snap.priorityBid || { allowed: 0, used: 0, remaining: 0, engineAvailable: false };
  const cycle = snap.currentCycle;
  const benefitsUsable = pb.membershipBenefitsUsable !== false && snap.membership?.status !== "suspended";

  return (
    <section className="fp-surface" style={{ marginTop: 16 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>
        {t("freelancerDashboard.marketplaceMembership.title")}
      </h2>
      <p style={{ margin: "0 0 12px", opacity: 0.85, fontSize: "0.92rem" }}>
        {t("freelancerDashboard.marketplaceMembership.subtitle")}
      </p>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          margin: 0,
        }}
      >
        <div>
          <dt style={{ opacity: 0.75, fontSize: "0.85rem" }}>
            {t("freelancerDashboard.marketplaceMembership.currentPlan")}
          </dt>
          <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>{planName}</dd>
        </div>
        <div>
          <dt style={{ opacity: 0.75, fontSize: "0.85rem" }}>
            {t("freelancerDashboard.marketplaceMembership.status")}
          </dt>
          <dd style={{ margin: "4px 0 0" }}>{snap.membership?.status || "—"}</dd>
        </div>
        {cycle ? (
          <>
            <div>
              <dt style={{ opacity: 0.75, fontSize: "0.85rem" }}>
                {t("freelancerDashboard.marketplaceMembership.cycleStart")}
              </dt>
              <dd style={{ margin: "4px 0 0" }}>{formatJoDateMedium(cycle.startsAt, locale)}</dd>
            </div>
            <div>
              <dt style={{ opacity: 0.75, fontSize: "0.85rem" }}>
                {t("freelancerDashboard.marketplaceMembership.cycleEnd")}
              </dt>
              <dd style={{ margin: "4px 0 0" }}>{formatJoDateMedium(cycle.endsAt, locale)}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt style={{ opacity: 0.75, fontSize: "0.85rem" }}>
            {t("freelancerDashboard.marketplaceMembership.priorityBidUsage")}
          </dt>
          <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>
            {benefitsUsable ? `${pb.used} / ${pb.allowed}` : `— / ${pb.allowed || 0}`}
          </dd>
        </div>
        <div>
          <dt style={{ opacity: 0.75, fontSize: "0.85rem" }}>
            {t("freelancerDashboard.marketplaceMembership.bidsPerMonth")}
          </dt>
          <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>
            {cycle?.monthlyBidAllowanceSnapshot ??
              snap.membership?.plan?.monthlyBidAllowance ??
              0}
          </dd>
        </div>
        <div>
          <dt style={{ opacity: 0.75, fontSize: "0.85rem" }}>
            {t("freelancerDashboard.marketplaceMembership.articleAccessLevel")}
          </dt>
          <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>
            {snap.membership?.plan?.articleAccessLevel ?? 1}
          </dd>
          <p style={{ margin: "4px 0 0", fontSize: "0.8rem", opacity: 0.75 }}>
            {t("freelancerDashboard.marketplaceMembership.articleAccessLevelHint")}
          </p>
        </div>
      </dl>
      <p style={{ margin: "12px 0 0", fontSize: "0.88rem", opacity: 0.8 }}>
        {t("freelancerDashboard.marketplaceMembership.engineComingSoon")}
      </p>
    </section>
  );
}
