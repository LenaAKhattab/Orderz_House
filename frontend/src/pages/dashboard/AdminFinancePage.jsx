import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardSection from "../../components/dashboard/DashboardSection";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/smartOrdersResources";
import "../../styles/smartOrders.css";
import { useFinanceCaps } from "../../components/orders/smart/useFinanceCaps";
import { financeTabFromQuery, financeTabsFor } from "../../components/orders/smart/financeUtils";
import FinanceReportTab from "./finance/FinanceReportTab";
import FinancePoliciesTab from "./finance/FinancePoliciesTab";
import FinanceFxTab from "./finance/FinanceFxTab";
import FinanceExceptionsTab from "./finance/FinanceExceptionsTab";
import FinanceRewardsTab from "./finance/FinanceRewardsTab";
import FinanceMyRewardsTab from "./finance/FinanceMyRewardsTab";

/**
 * Smart Orders S5/S6 — Admin finance: management report, versioned policies, FX snapshots, payment exceptions,
 * employee reward pool and the viewer's own rewards. Tabs/actions follow permissions (the backend enforces them).
 */
export default function AdminFinancePage() {
  const { t } = useTranslation();
  const caps = useFinanceCaps();
  const tabs = useMemo(() => financeTabsFor(caps), [caps]);
  const [searchParams, setSearchParams] = useSearchParams();
  // Deep links (e.g. the finance.reward.approved notification → ?tab=myRewards) pick the initial tab.
  const [picked, setPicked] = useState(() => financeTabFromQuery(searchParams.get("tab")));
  const tab = tabs.includes(picked) ? picked : tabs[0];
  const selectTab = (k) => {
    setPicked(k);
    const next = new URLSearchParams(searchParams);
    next.set("tab", k === "mine" ? "myRewards" : k);
    setSearchParams(next, { replace: true });
  };

  return (
    <DashboardShell className="fin-page">
      <DashboardPageHeader title={t("smartOrders.finance.title")} description={t("smartOrders.finance.description")} />
      <DashboardSection>
        <div className="fin-tabs" role="tablist" aria-label={t("smartOrders.finance.title")}>
          {tabs.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`fin-tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`fin-panel-${k}`}
              className={`fin-tabs__tab${tab === k ? " fin-tabs__tab--active" : ""}`}
              onClick={() => selectTab(k)}
              data-testid={`finance-tab-${k}`}
            >
              {t(`smartOrders.finance.tabs.${k}`)}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`fin-panel-${tab}`} aria-labelledby={`fin-tab-${tab}`}>
          {tab === "report" ? <FinanceReportTab /> : null}
          {tab === "policies" ? <FinancePoliciesTab canChange={caps.policy} /> : null}
          {tab === "fx" ? <FinanceFxTab canCreate={caps.manage} /> : null}
          {tab === "exceptions" ? <FinanceExceptionsTab canResolve={caps.manage} /> : null}
          {tab === "rewards" ? <FinanceRewardsTab canPayout={caps.payout} /> : null}
          {tab === "mine" ? <FinanceMyRewardsTab /> : null}
        </div>
      </DashboardSection>
    </DashboardShell>
  );
}
