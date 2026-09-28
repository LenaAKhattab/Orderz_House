import { useCallback, useEffect, useMemo, useState } from "react";
import { useArticlesT } from "../../admin/marketplaceArticles/useArticlesT";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { sharesSumToTotal } from "../../constants/freelancerActivationCampaign";
import {
  FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS,
  defaultSplitForTier,
} from "../../constants/freelancerActivationArticleOps";
import {
  getSuperAdminActivationArticleFundRequest,
  depositSuperAdminActivationArticleFundRequest,
  withdrawSuperAdminActivationArticleFundRequest,
  listSuperAdminActivationPlanAllocationsRequest,
  createSuperAdminActivationPlanAllocationRequest,
  listSuperAdminActivationArticleInventoryRequest,
  createSuperAdminActivationArticleInventoryRequest,
  patchSuperAdminActivationArticleInventoryRequest,
  releaseSuperAdminActivationArticleInventoryRequest,
  previewSuperAdminActivationArticleReleaseRequest,
  runSuperAdminActivationArticleReleaseRequest,
  listSuperAdminActivationArticleReleaseRunsRequest,
  listSuperAdminActivationLiveArticlesRequest,
  runSuperAdminActivationLiveArticleAutoAssignmentRequest,
  releaseAnotherSuperAdminActivationLiveArticleRequest,
} from "../../services/api";
import "../../pages/dashboard/super-admin-article-management.css";

const emptyInventory = {
  title: "",
  planTierCode: "starter",
  description: "",
  status: "ready",
  visibilityDurationHours: 24,
  minimumBiddersPerArticle: 10,
};

function fundEntryTypeLabel(type, t) {
  const key = String(type || "").toLowerCase();
  if (key.includes("deposit") || key === "credit") return t("fundEntry.deposit");
  if (key.includes("withdraw") || key === "debit") return t("fundEntry.withdraw");
  if (key === "daily_allocation") return t("fundEntry.deductRelease");
  if (key === "daily_allocation_released") return t("fundEntry.refundArticle");
  if (key === "manual_adjustment") return t("fundEntry.manualAdjustment");
  return type || "—";
}

function fundEntryReasonLabel(entry, t) {
  const reason = String(entry?.reason || "").trim();
  const metaReason = String(entry?.metadata?.reason || "").trim();
  if (metaReason === "minimum_not_met_refund" || reason.includes("عدم اكتمال") || reason.includes("minimum")) {
    return t("fundEntry.refundMinNotMet");
  }
  if (reason) return reason;
  return null;
}

function inventoryStatusLabel(status, t) {
  const key = String(status || "").toLowerCase();
  if (["draft", "ready", "released"].includes(key)) return t(`inventoryStatus.${key}`);
  return status || "—";
}

function releaseModeLabel(mode, t) {
  const key = String(mode || "").toLowerCase();
  if (key === "manual") return t("publishMode.manual");
  if (key === "auto" || key === "automatic") return t("publishMode.auto");
  return mode || "—";
}

function activationPlanTierLabel(t, value) {
  const key = String(value || "").toLowerCase();
  if (key === "trial") return t("planLabels.trial");
  const canonical = { starter: "STARTER", silver: "SILVER", pro: "PRO", elite: "ELITE" }[key];
  if (canonical) return t(`planLabels.${canonical}`);
  return value || "—";
}

function liveAutoAssignStatusLabel(item, t) {
  const status = item.autoAssignStatus;
  if (status === "waiting_for_bidders") return t("activationOps.monitor.waiting");
  if (status === "ready") return t("activationOps.monitor.readyAssign");
  if (status === "completed" || item.selectedBySystem) return t("activationOps.monitor.completed");
  if (status === "skipped") {
    return t("activationOps.monitor.skipped", {
      reason: item.lastAutoAssignmentSkipReason || "—",
    });
  }
  if (status === "failed") {
    return t("activationOps.monitor.failed", {
      code: item.lastAutoAssignmentErrorCode || "—",
    });
  }
  if (status === "disabled") return t("activationOps.monitor.disabled");
  return status || "—";
}

/**
 * A9 article ops (fund / allocation / inventory / release / monitor).
 * Used by إدارة المقالات hub (preferred) — keep campaign-scoped API calls unchanged.
 */
export default function FreelancerActivationArticleOpsPanel({
  campaignId,
  activeTab: controlledTab,
  hideTabBar = false,
  onSummaryChange,
}) {
  const { t } = useArticlesT();
  const [internalTab, setInternalTab] = useState("fund");
  const tab = controlledTab || internalTab;
  const setTab = (id) => {
    if (controlledTab == null) setInternalTab(id);
  };

  const [fund, setFund] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [depositAmount, setDepositAmount] = useState("10.000");
  const [withdrawAmount, setWithdrawAmount] = useState("1.000");
  const [allocForm, setAllocForm] = useState(() => ({
    planTierCode: "starter",
    ...defaultSplitForTier("starter"),
    dailyBudgetJod: "10.000",
    maxDailyArticles: 5,
    minimumBiddersPerArticle: 10,
    releaseMode: "manual",
    releaseIntervalDays: 1,
    recycleWhenInventoryEmpty: false,
    autoAssignEnabled: false,
  }));
  const [allocError, setAllocError] = useState("");
  const [invForm, setInvForm] = useState(emptyInventory);
  const [invError, setInvError] = useState("");
  const [releaseTier, setReleaseTier] = useState("starter");
  const [releasePreview, setReleasePreview] = useState(null);
  const [releaseRuns, setReleaseRuns] = useState([]);
  const [releaseError, setReleaseError] = useState("");
  const [liveItems, setLiveItems] = useState([]);
  const [liveSummary, setLiveSummary] = useState(null);
  const [liveError, setLiveError] = useState("");
  const [liveFilter, setLiveFilter] = useState({
    planTierCode: "",
    autoAssignStatus: "",
    search: "",
  });
  const [liveActionMsg, setLiveActionMsg] = useState("");

  const load = useCallback(async () => {
    if (!campaignId) return;
    setError("");
    try {
      const [fundRes, allocRes, invRes, runsRes, liveRes] = await Promise.all([
        getSuperAdminActivationArticleFundRequest({ campaignId }).catch(() => null),
        listSuperAdminActivationPlanAllocationsRequest(campaignId).catch(() => null),
        listSuperAdminActivationArticleInventoryRequest({ campaignId }).catch(() => null),
        listSuperAdminActivationArticleReleaseRunsRequest({ campaignId, limit: 10 }).catch(() => null),
        listSuperAdminActivationLiveArticlesRequest({
          campaignId,
          planTierCode: liveFilter.planTierCode || undefined,
          autoAssignStatus: liveFilter.autoAssignStatus || undefined,
          search: liveFilter.search || undefined,
          limit: 50,
        }).catch(() => null),
      ]);
      setFund(fundRes?.data || null);
      setAllocations(allocRes?.data?.allocations || []);
      setInventory(invRes?.data?.items || []);
      setReleaseRuns(runsRes?.data?.runs || []);
      setLiveItems(liveRes?.data?.items || []);
      setLiveSummary(liveRes?.data?.summary || null);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("activationOps.loadError"));
    }
  }, [campaignId, liveFilter.planTierCode, liveFilter.autoAssignStatus, liveFilter.search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof onSummaryChange !== "function") return;
    const readyCount = inventory.filter((i) => i.status === "ready").length;
    onSummaryChange({
      fundBalanceJod: fund?.currentBalanceJod ?? null,
      inventoryReady: campaignId ? readyCount : null,
      totalReleased: liveSummary?.totalReleased ?? null,
      waitingForBidders: liveSummary?.waitingForBidders ?? null,
      readyForAssignment: liveSummary?.readyForAssignment ?? null,
    });
  }, [fund, inventory, liveSummary, campaignId, onSummaryChange]);

  const releaseStats = useMemo(() => {
    const alloc = allocations.find((a) => a.planTierCode === releaseTier) || null;
    const ready = inventory.filter(
      (i) => i.planTierCode === releaseTier && i.status === "ready",
    ).length;
    const reusable = inventory.filter(
      (i) =>
        i.planTierCode === releaseTier &&
        i.releaseStrategy === "reusable" &&
        (i.status === "ready" || i.status === "released"),
    ).length;
    const previewAlloc = releasePreview?.allocations?.find((a) => a.planTierCode === releaseTier);
    return {
      alloc,
      ready,
      reusable,
      plannedCount: previewAlloc?.plannedCount ?? releasePreview?.plannedCount ?? null,
      capacity: previewAlloc?.capacity || null,
    };
  }, [allocations, inventory, releaseTier, releasePreview]);

  if (!campaignId) {
    return (
      <p data-testid="activation-ops-need-campaign">
        {t("activationOps.needCampaign")}
      </p>
    );
  }

  async function onDeposit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await depositSuperAdminActivationArticleFundRequest({
        campaignId,
        amountJod: depositAmount,
        reason: "admin_deposit",
      });
      await load();
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("activationOps.depositError"));
    } finally {
      setBusy(false);
    }
  }

  async function onWithdraw(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await withdrawSuperAdminActivationArticleFundRequest({
        campaignId,
        amountJod: withdrawAmount,
        reason: "admin_withdrawal",
      });
      await load();
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("activationOps.withdrawError"));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveAllocation(e) {
    e.preventDefault();
    setAllocError("");
    if (
      !sharesSumToTotal(
        allocForm.totalArticleValueJod,
        allocForm.freelancerShareJod,
        allocForm.companyShareJod,
        allocForm.reviewerShareJod,
      )
    ) {
      setAllocError(t("activationOps.allocSharesError"));
      return;
    }
    setBusy(true);
    try {
      await createSuperAdminActivationPlanAllocationRequest(campaignId, allocForm);
      await load();
    } catch (err) {
      setAllocError(getSafeApiErrorMessage(err) || t("activationOps.allocSaveError"));
    } finally {
      setBusy(false);
    }
  }

  async function onCreateInventory(e) {
    e.preventDefault();
    setInvError("");
    setBusy(true);
    try {
      const defaults = defaultSplitForTier(invForm.planTierCode);
      await createSuperAdminActivationArticleInventoryRequest({
        campaignId,
        ...invForm,
        ...defaults,
        minimumBiddersPerArticle: Number(invForm.minimumBiddersPerArticle) || 10,
        visibilityDurationHours: Number(invForm.visibilityDurationHours) || 24,
      });
      setInvForm(emptyInventory);
      await load();
    } catch (err) {
      setInvError(getSafeApiErrorMessage(err) || t("activationOps.inventoryAddError"));
    } finally {
      setBusy(false);
    }
  }

  async function onMarkReady(id) {
    setBusy(true);
    try {
      await patchSuperAdminActivationArticleInventoryRequest(id, { status: "ready" });
      await load();
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("activationOps.updateError"));
    } finally {
      setBusy(false);
    }
  }

  async function onRelease(id) {
    setBusy(true);
    try {
      await releaseSuperAdminActivationArticleInventoryRequest(id);
      await load();
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("activationOps.releaseError"));
    } finally {
      setBusy(false);
    }
  }

  async function onPreviewRelease() {
    setReleaseError("");
    setBusy(true);
    try {
      const res = await previewSuperAdminActivationArticleReleaseRequest({
        campaignId,
        planTierCode: releaseTier,
      });
      setReleasePreview(res?.data || null);
    } catch (err) {
      setReleaseError(getSafeApiErrorMessage(err) || t("activationOps.previewError"));
    } finally {
      setBusy(false);
    }
  }

  async function onRunRelease() {
    setReleaseError("");
    setBusy(true);
    try {
      await runSuperAdminActivationArticleReleaseRequest({
        campaignId,
        planTierCode: releaseTier,
        runType: "manual",
      });
      setReleasePreview(null);
      await load();
    } catch (err) {
      setReleaseError(getSafeApiErrorMessage(err) || t("activationOps.runError"));
    } finally {
      setBusy(false);
    }
  }

  async function onLiveRunAutoAssign(articleId) {
    setLiveActionMsg("");
    setLiveError("");
    setBusy(true);
    try {
      const res = await runSuperAdminActivationLiveArticleAutoAssignmentRequest(articleId);
      if (res?.data?.autoAssigned) {
        setLiveActionMsg(t("activationOps.autoAssignSuccess"));
      } else {
        setLiveActionMsg(
          t("activationOps.autoAssignSkip", {
            reason: res?.data?.run?.skipReason || res?.data?.run?.errorCode || "—",
          }),
        );
      }
      await load();
    } catch (err) {
      setLiveError(getSafeApiErrorMessage(err) || t("activationOps.autoAssignRunError"));
    } finally {
      setBusy(false);
    }
  }

  async function onLiveReleaseAnother(articleId) {
    setLiveActionMsg("");
    setLiveError("");
    setBusy(true);
    try {
      await releaseAnotherSuperAdminActivationLiveArticleRequest(articleId);
      setLiveActionMsg(t("activationOps.releaseAnotherSuccess"));
      await load();
    } catch (err) {
      setLiveError(getSafeApiErrorMessage(err) || t("activationOps.releaseAnotherError"));
    } finally {
      setBusy(false);
    }
  }

  const articleDetailHref = (articleId) =>
    `/dashboard/super-admin/article-management?tab=articles&edit=${articleId}`;

  return (
    <div data-testid="activation-article-ops-panel" className="grid gap-4">
      {!hideTabBar ? (
        <div className="flex flex-wrap gap-2" data-testid="activation-ops-tabs">
          {[
            { id: "fund", label: t("activationOps.tabs.fund") },
            { id: "alloc", label: t("activationOps.tabs.alloc") },
            { id: "inventory", label: t("activationOps.tabs.inventory") },
            { id: "release", label: t("activationOps.tabs.release") },
            { id: "monitor", label: t("activationOps.tabs.monitor") },
          ].map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              data-testid={`activation-ops-tab-${tabItem.id}`}
              className="oh-account-btn-primary"
              onClick={() => setTab(tabItem.id)}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p data-testid="activation-ops-error">{error}</p> : null}

      {tab === "fund" ? (
        <div data-testid="activation-fund-tab" className="grid gap-3 max-w-2xl">
          <p className="oh-am-helper">{t("activationOps.fund.helper")}</p>
          <p data-testid="activation-fund-balance">
            {t("activationOps.fund.currentBalance", {
              amount: fund?.currentBalanceJod ?? "0.000",
            })}
          </p>
          <p>
            {t("activationOps.fund.totals", {
              deposits: fund?.totalDepositsJod ?? "0.000",
              withdrawals: fund?.totalWithdrawalsJod ?? "0.000",
            })}
          </p>
          <form onSubmit={onDeposit} data-testid="activation-fund-deposit-form" className="grid gap-2">
            <label>
              {t("activationOps.fund.addBalance")}
              <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
            </label>
            <button type="submit" disabled={busy}>
              {t("activationOps.fund.addBalance")}
            </button>
          </form>
          <form onSubmit={onWithdraw} data-testid="activation-fund-withdraw-form" className="grid gap-2">
            <label>
              {t("activationOps.fund.withdraw")}
              <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
            </label>
            <button type="submit" disabled={busy}>
              {t("activationOps.fund.withdraw")}
            </button>
          </form>
          <div data-testid="activation-fund-ledger">
            <h3>{t("activationOps.fund.recentOps")}</h3>
            <ul>
              {(fund?.recentEntries || []).map((e) => {
                const reasonAr = fundEntryReasonLabel(e, t);
                return (
                  <li key={e.id} data-testid={`activation-fund-entry-${e.id}`}>
                    {fundEntryTypeLabel(e.entryType, t)}: {e.amountJod} JOD
                    {reasonAr ? (
                      <span data-testid="fund-entry-reason-ar"> — {reasonAr}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "alloc" ? (
        <div data-testid="activation-alloc-tab" className="grid gap-3 max-w-4xl">
          <p className="oh-am-helper">{t("activationOps.alloc.helper")}</p>
          <form onSubmit={onSaveAllocation} data-testid="activation-alloc-form" className="grid gap-2">
            <label>
              {t("common.plan")}
              <select
                value={allocForm.planTierCode}
                onChange={(e) => {
                  const tier = e.target.value;
                  setAllocForm({
                    ...allocForm,
                    planTierCode: tier,
                    ...defaultSplitForTier(tier),
                  });
                }}
              >
                {FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {activationPlanTierLabel(t, o.value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("activationOps.alloc.totalValue")}
              <input
                value={allocForm.totalArticleValueJod}
                onChange={(e) => setAllocForm({ ...allocForm, totalArticleValueJod: e.target.value })}
              />
            </label>
            <label>
              {t("activationOps.alloc.freelancerShare")}
              <input
                value={allocForm.freelancerShareJod}
                onChange={(e) => setAllocForm({ ...allocForm, freelancerShareJod: e.target.value })}
              />
            </label>
            <label>
              {t("activationOps.alloc.platformShare")}
              <input
                value={allocForm.companyShareJod}
                onChange={(e) => setAllocForm({ ...allocForm, companyShareJod: e.target.value })}
              />
            </label>
            <label>
              {t("activationOps.alloc.reviewerShare")}
              <input
                value={allocForm.reviewerShareJod}
                onChange={(e) => setAllocForm({ ...allocForm, reviewerShareJod: e.target.value })}
              />
            </label>
            <label>
              {t("activationOps.alloc.dailyJod")}
              <input
                value={allocForm.dailyBudgetJod}
                onChange={(e) => setAllocForm({ ...allocForm, dailyBudgetJod: e.target.value })}
              />
            </label>
            <label>
              {t("activationOps.alloc.dailyCount")}
              <input
                type="number"
                value={allocForm.maxDailyArticles}
                onChange={(e) =>
                  setAllocForm({ ...allocForm, maxDailyArticles: Number(e.target.value) })
                }
              />
            </label>
            <label>
              {t("activationOps.alloc.minApplicants")}
              <input
                type="number"
                value={allocForm.minimumBiddersPerArticle}
                onChange={(e) =>
                  setAllocForm({
                    ...allocForm,
                    minimumBiddersPerArticle: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              {t("activationOps.alloc.releaseInterval")}
              <input
                type="number"
                min={1}
                max={30}
                data-testid="activation-alloc-release-interval-days"
                value={allocForm.releaseIntervalDays}
                onChange={(e) =>
                  setAllocForm({
                    ...allocForm,
                    releaseIntervalDays: Number(e.target.value),
                  })
                }
              />
              <span className="oh-am-helper">{t("activationOps.alloc.releaseIntervalHint")}</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(allocForm.autoAssignEnabled)}
                onChange={(e) =>
                  setAllocForm({ ...allocForm, autoAssignEnabled: e.target.checked })
                }
              />{" "}
              {t("activationOps.alloc.enableAutoAssign")}
            </label>
            <details className="oh-am-advanced">
              <summary>{t("activationOps.alloc.advanced")}</summary>
              <div className="grid gap-2 mt-2">
                <label>
                  {t("activationOps.alloc.releaseMode")}
                  <select
                    value={allocForm.releaseMode}
                    onChange={(e) => setAllocForm({ ...allocForm, releaseMode: e.target.value })}
                  >
                    <option value="manual">{t("publishMode.manual")}</option>
                    <option value="auto">{t("publishMode.auto")}</option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(allocForm.recycleWhenInventoryEmpty)}
                    onChange={(e) =>
                      setAllocForm({
                        ...allocForm,
                        recycleWhenInventoryEmpty: e.target.checked,
                      })
                    }
                  />{" "}
                  {t("activationOps.alloc.recycleEmpty")}
                </label>
              </div>
            </details>
            {allocError ? <p data-testid="activation-alloc-error">{allocError}</p> : null}
            <button type="submit" disabled={busy}>
              {t("activationOps.alloc.save")}
            </button>
          </form>
          <table data-testid="activation-alloc-table">
            <thead>
              <tr>
                <th>{t("activationOps.alloc.table.plan")}</th>
                <th>{t("activationOps.alloc.table.dailyJod")}</th>
                <th>{t("activationOps.alloc.table.dailyCount")}</th>
                <th>{t("activationOps.alloc.table.totalValue")}</th>
                <th>{t("activationOps.alloc.table.freelancerShare")}</th>
                <th>{t("activationOps.alloc.table.reviewerShare")}</th>
                <th>{t("activationOps.alloc.table.platformShare")}</th>
                <th>{t("activationOps.alloc.table.minApplicants")}</th>
                <th>{t("activationOps.alloc.table.intervalDays")}</th>
                <th>{t("activationOps.alloc.table.autoAssign")}</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id}>
                  <td>{a.planTierCode}</td>
                  <td>{a.dailyBudgetJod ?? "—"}</td>
                  <td>{a.maxDailyArticles ?? "—"}</td>
                  <td>{a.totalArticleValueJod}</td>
                  <td>{a.freelancerShareJod}</td>
                  <td>{a.reviewerShareJod}</td>
                  <td>{a.companyShareJod}</td>
                  <td>{a.minimumBiddersPerArticle ?? "—"}</td>
                  <td>{a.releaseIntervalDays ?? 1}</td>
                  <td>{a.autoAssignEnabled ? t("common.yes") : t("common.no")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "inventory" ? (
        <div data-testid="activation-inventory-tab" className="grid gap-3 max-w-2xl">
          <p className="oh-am-helper">{t("activationOps.inventory.helper")}</p>
          <form onSubmit={onCreateInventory} data-testid="activation-inventory-form" className="grid gap-2">
            <label>
              {t("activationOps.inventory.addLabel")}
              <input
                required
                value={invForm.title}
                onChange={(e) => setInvForm({ ...invForm, title: e.target.value })}
              />
            </label>
            <label>
              {t("activationOps.inventory.targetPlan")}
              <select
                value={invForm.planTierCode}
                onChange={(e) => setInvForm({ ...invForm, planTierCode: e.target.value })}
              >
                {FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {activationPlanTierLabel(t, o.value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("activationOps.alloc.minApplicants")}
              <input
                type="number"
                min={1}
                data-testid="activation-inventory-min-bidders"
                value={invForm.minimumBiddersPerArticle}
                onChange={(e) =>
                  setInvForm({
                    ...invForm,
                    minimumBiddersPerArticle: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              {t("activationOps.inventory.visibility")}
              <input
                type="number"
                min={1}
                max={168}
                data-testid="activation-inventory-visibility-hours"
                value={invForm.visibilityDurationHours}
                onChange={(e) =>
                  setInvForm({
                    ...invForm,
                    visibilityDurationHours: Number(e.target.value),
                  })
                }
              />
              <span className="oh-am-helper">{t("activationOps.inventory.visibilityHint")}</span>
            </label>
            {invError ? <p data-testid="activation-inventory-error">{invError}</p> : null}
            <button type="submit" disabled={busy}>
              {t("activationOps.inventory.addBtn")}
            </button>
          </form>
          <ul data-testid="activation-inventory-list">
            {inventory.map((item) => (
              <li key={item.id}>
                {item.title} · {item.planTierCode} · {inventoryStatusLabel(item.status, t)} ·{" "}
                {t("activationOps.inventory.releaseCount", { count: item.releasedCount })}
                {item.visibilityDurationHours != null
                  ? t("activationOps.inventory.visibilityHours", {
                      hours: item.visibilityDurationHours,
                    })
                  : ""}
                {item.status === "draft" ? (
                  <button type="button" onClick={() => void onMarkReady(item.id)} disabled={busy}>
                    {t("activationOps.inventory.readyForRelease")}
                  </button>
                ) : null}
                {item.status === "ready" || item.status === "released" ? (
                  <button
                    type="button"
                    data-testid={`activation-inventory-release-${item.id}`}
                    onClick={() => void onRelease(item.id)}
                    disabled={busy}
                  >
                    {t("activationOps.inventory.releaseArticle")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <p data-testid="activation-no-auto-assign-note">
            {t("activationOps.inventory.noAutoAssignNote")}
          </p>
        </div>
      ) : null}

      {tab === "release" ? (
        <div data-testid="activation-release-tab" className="grid gap-3 max-w-3xl">
          <p className="oh-am-helper">{t("activationOps.release.helper")}</p>
          <label>
            {t("activationOps.release.plan")}
            <select
              data-testid="activation-release-tier"
              value={releaseTier}
              onChange={(e) => {
                setReleaseTier(e.target.value);
                setReleasePreview(null);
              }}
            >
              {FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {activationPlanTierLabel(t, o.value)}
                </option>
              ))}
            </select>
          </label>
          <div data-testid="activation-release-stats" className="grid gap-1">
            <p>
              {t("activationOps.release.dailyBudget", {
                amount: releaseStats.alloc?.dailyBudgetJod ?? "—",
              })}
            </p>
            <p>
              {t("activationOps.release.dailyCount", {
                count: releaseStats.alloc?.maxDailyArticles ?? "—",
              })}
            </p>
            <p data-testid="activation-release-fund">
              {t("activationOps.release.fundAvailable", {
                amount: fund?.currentBalanceJod ?? "0.000",
              })}
            </p>
            <p data-testid="activation-release-ready-count">
              {t("activationOps.release.readyStock", { count: releaseStats.ready })}
            </p>
            <p data-testid="activation-release-reusable-count">
              {t("activationOps.release.reusableStock", { count: releaseStats.reusable })}
            </p>
            <p>
              {t("activationOps.release.recycleEnabled", {
                value: releaseStats.alloc?.recycleWhenInventoryEmpty
                  ? t("common.yes")
                  : t("common.no"),
              })}
            </p>
            <p data-testid="activation-release-planned-count">
              {t("activationOps.release.plannedRelease", {
                count:
                  releaseStats.plannedCount != null ? releaseStats.plannedCount : "—",
              })}
            </p>
            {releaseStats.capacity ? (
              <p data-testid="activation-release-already-today">
                {t("activationOps.release.releasedToday", {
                  count: releaseStats.capacity.alreadyReleasedToday ?? 0,
                })}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="activation-release-preview-btn"
              onClick={() => void onPreviewRelease()}
              disabled={busy}
            >
              {t("activationOps.release.preview")}
            </button>
            <button
              type="button"
              data-testid="activation-release-run-btn"
              onClick={() => void onRunRelease()}
              disabled={busy}
            >
              {t("activationOps.release.runNow")}
            </button>
          </div>
          {releaseError ? <p data-testid="activation-release-error">{releaseError}</p> : null}
          {releasePreview ? (
            <div data-testid="activation-release-preview-json" className="oh-am-advanced">
              <p>
                {t("activationOps.release.expected", {
                  count: releasePreview.plannedCount ?? "—",
                  value: releasePreview.plannedValueJod ?? "—",
                  balance: releasePreview.fundBalanceJod ?? "—",
                })}
              </p>
            </div>
          ) : null}
          <div data-testid="activation-release-runs">
            <h3>{t("activationOps.release.recentRuns")}</h3>
            <ul>
              {releaseRuns.map((r) => (
                <li key={r.id} data-testid={`activation-release-run-${r.id}`}>
                  {r.runDate} · {releaseModeLabel(r.runType, t)} · {r.status} ·{" "}
                  {t("activationOps.release.articleCount", { count: r.releasedCount })} ·{" "}
                  {r.totalReservedValueJod} JOD
                </li>
              ))}
            </ul>
          </div>
          <p data-testid="activation-release-no-auto-assign">
            {t("activationOps.release.noAutoAssign")}
          </p>
        </div>
      ) : null}

      {tab === "monitor" ? (
        <div data-testid="activation-monitor-tab" className="grid gap-3">
          <p className="oh-am-helper">{t("activationOps.monitor.helper")}</p>
          <div data-testid="activation-monitor-summary" className="flex flex-wrap gap-3 text-sm">
            <span>
              {t("activationOps.monitor.summary.released")}: {liveSummary?.totalReleased ?? 0}
            </span>
            <span>
              {t("activationOps.monitor.summary.waiting")}: {liveSummary?.waitingForBidders ?? 0}
            </span>
            <span>
              {t("activationOps.monitor.summary.ready")}: {liveSummary?.readyForAssignment ?? 0}
            </span>
            <span>
              {t("activationOps.monitor.summary.autoAssigned")}: {liveSummary?.autoAssigned ?? 0}
            </span>
            <span>
              {t("activationOps.monitor.summary.inProgress")}: {liveSummary?.submitted ?? 0}
            </span>
            <span>
              {t("activationOps.monitor.summary.underReview")}: {liveSummary?.underReview ?? 0}
            </span>
            <span>
              {t("activationOps.monitor.summary.accepted")}: {liveSummary?.accepted ?? 0}
            </span>
            <span>
              {t("activationOps.monitor.summary.publishedBildazo")}: {liveSummary?.published ?? 0}
            </span>
          </div>

          <div data-testid="activation-monitor-filters" className="flex flex-wrap gap-2 items-end">
            <label>
              {t("common.plan")}
              <select
                value={liveFilter.planTierCode}
                onChange={(e) => setLiveFilter({ ...liveFilter, planTierCode: e.target.value })}
              >
                <option value="">{t("common.all")}</option>
                {FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {activationPlanTierLabel(t, o.value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("activationOps.monitor.assignFilter")}
              <select
                value={liveFilter.autoAssignStatus}
                onChange={(e) => setLiveFilter({ ...liveFilter, autoAssignStatus: e.target.value })}
              >
                <option value="">{t("common.all")}</option>
                <option value="disabled">{t("activationOps.monitor.disabled")}</option>
                <option value="waiting_for_bidders">{t("activationOps.monitor.waiting")}</option>
                <option value="ready">{t("activationOps.monitor.readyAssign")}</option>
                <option value="completed">{t("activationOps.monitor.completed")}</option>
                <option value="skipped">{t("activationOps.monitor.filterSkipped")}</option>
                <option value="failed">{t("activationOps.monitor.filterFailed")}</option>
              </select>
            </label>
            <label>
              {t("common.search")}
              <input
                value={liveFilter.search}
                onChange={(e) => setLiveFilter({ ...liveFilter, search: e.target.value })}
                placeholder={t("activationOps.monitor.searchPlaceholder")}
              />
            </label>
            <button type="button" disabled={busy} onClick={() => void load()}>
              {t("activationOps.monitor.refresh")}
            </button>
          </div>

          {liveError ? <p data-testid="activation-monitor-error">{liveError}</p> : null}
          {liveActionMsg ? <p data-testid="activation-monitor-action-msg">{liveActionMsg}</p> : null}

          <ul data-testid="activation-monitor-list" className="grid gap-3">
            {liveItems.map((item) => (
              <li
                key={item.articleId}
                data-testid={`activation-monitor-row-${item.articleId}`}
                className="border border-black/10 p-3 grid gap-2"
              >
                <div className="font-bold">{item.title}</div>
                <div className="text-sm opacity-80">
                  {item.campaignName || item.campaignId} · {item.waveName || "—"} ·{" "}
                  {item.planTierCode || "—"} ·{" "}
                  {t("activationOps.monitor.value", {
                    amount: item.totalArticleValueJod ?? "—",
                  })}
                </div>
                <div data-testid="activation-monitor-applicants" className="text-sm">
                  {t("activationOps.monitor.applicants", {
                    current: item.currentApplicationsCount,
                    required: item.requiredBidders,
                  })}
                </div>
                <div data-testid="activation-monitor-auto-status" className="text-sm">
                  {t("activationOps.monitor.assignStatus")}: {liveAutoAssignStatusLabel(item, t)}
                </div>
                <div className="text-sm">
                  {t("activationOps.monitor.selected")}: {item.selectedFreelancerDisplayName || "—"} ·{" "}
                  {t("activationOps.monitor.review")}: {item.reviewStatus || "—"} ·{" "}
                  {t("activationOps.monitor.bildazoPublish")}: {item.bildazoPublishStatus || "—"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    data-testid="activation-monitor-open-article"
                    href={articleDetailHref(item.articleId)}
                  >
                    {t("activationOps.monitor.openDetails")}
                  </a>
                  <a
                    data-testid="activation-monitor-view-apps"
                    href={articleDetailHref(item.articleId)}
                  >
                    {t("activationOps.monitor.viewApplicants")}
                  </a>
                  {item.actions?.canRunAutoAssignment ? (
                    <button
                      type="button"
                      data-testid={`activation-monitor-run-auto-${item.articleId}`}
                      disabled={busy}
                      onClick={() => void onLiveRunAutoAssign(item.articleId)}
                    >
                      {t("activationOps.monitor.runAssign")}
                    </button>
                  ) : null}
                  {item.actions?.canReleaseAnotherFromInventory ? (
                    <button
                      type="button"
                      data-testid={`activation-monitor-release-another-${item.articleId}`}
                      disabled={busy}
                      onClick={() => void onLiveReleaseAnother(item.articleId)}
                    >
                      {t("activationOps.monitor.releaseAnother")}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {!liveItems.length ? (
            <p data-testid="activation-monitor-empty">{t("activationOps.monitor.empty")}</p>
          ) : null}
          <p data-testid="activation-monitor-privacy-note" className="text-xs opacity-70">
            {t("activationOps.monitor.privacy")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
