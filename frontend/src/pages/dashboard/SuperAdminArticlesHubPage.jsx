import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useArticlesT } from "../../admin/marketplaceArticles/useArticlesT";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import MarketplaceArticleApplicationsPanel from "../../admin/marketplaceArticles/MarketplaceArticleApplicationsPanel";
import MarketplaceArticlesAdminPanel from "../../components/admin/MarketplaceArticlesAdminPanel";
import { useToast } from "../../components/ui/toastContext";
import { sharesSumToTotal } from "../../constants/freelancerActivationCampaign";
import {
  ARTICLE_CANONICAL_PLAN_TIER_OPTIONS,
  defaultSplitForTier,
} from "../../constants/freelancerActivationArticleOps";
import {
  ensureSuperAdminArticleOperationsSetupRequest,
  getSuperAdminActivationArticleFundRequest,
  depositSuperAdminActivationArticleFundRequest,
  withdrawSuperAdminActivationArticleFundRequest,
  listSuperAdminActivationPlanAllocationsRequest,
  createSuperAdminActivationPlanAllocationRequest,
  listSuperAdminActivationArticleInventoryRequest,
  createSuperAdminActivationArticleInventoryRequest,
  patchSuperAdminActivationArticleInventoryRequest,
  releaseSuperAdminActivationArticleInventoryRequest,
  releaseMarketplaceArticleDraftBatchRequest,
  listAdminMarketplaceArticlesRequest,
  previewSuperAdminActivationArticleReleaseRequest,
  runSuperAdminActivationArticleReleaseRequest,
  listSuperAdminActivationLiveArticlesRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import "./super-admin-articles-hub.css";

/** Legacy activation inventory UI (title + plan only). Compatibility only — not the OZ03 source of truth. */
const SHOW_LEGACY_ACTIVATION_INVENTORY_UI = false;

function inventoryStatusLabel(status, t) {
  const key = String(status || "").toLowerCase();
  if (["draft", "ready", "released", "archived"].includes(key)) {
    return t(`inventoryStatus.${key}`);
  }
  return status || "—";
}

function intervalLabel(days, t) {
  const n = Number(days) || 1;
  if (n === 1) return t("releaseInterval.daily");
  if (n === 2) return t("releaseInterval.everyOtherDay");
  if (n === 3) return t("releaseInterval.every3Days");
  return t("releaseInterval.everyNDays", { n });
}

function liveStatusChips(item, t) {
  const chips = [];
  if (item.autoAssignStatus === "waiting_for_bidders") {
    chips.push({ t: t("liveStatus.waitingForBidders"), c: "amber" });
  } else if (item.autoAssignStatus === "ready") {
    chips.push({ t: t("liveStatus.readyForAssignment"), c: "blue" });
  } else if (item.autoAssignStatus === "completed" || item.selectedBySystem) {
    chips.push({ t: t("liveStatus.assigned"), c: "teal" });
  }
  if (item.reviewStatus === "under_review" || item.reviewStatus === "pending_review") {
    chips.push({ t: t("liveStatus.underReview"), c: "rose" });
  }
  if (item.reviewStatus === "revision_requested") {
    chips.push({ t: t("liveStatus.revisionRequested"), c: "amber" });
  }
  if (item.reviewStatus === "approved" || item.bildazoPublishStatus === "published") {
    chips.push({ t: t("liveStatus.completedPublished"), c: "green" });
  }
  if (item.selectedFreelancerDisplayName) {
    chips.push({
      t: t("liveStatus.winner", { name: item.selectedFreelancerDisplayName }),
      c: "violet",
    });
  }
  return chips;
}

function ManualPublishModal({
  open,
  inventory,
  busy,
  onClose,
  onPublish,
}) {
  const { t } = useArticlesT();
  const [selected, setSelected] = useState(() => new Set());
  const [planTierCode, setPlanTierCode] = useState("starter");
  const [form, setForm] = useState(() => defaultSplitForTier("starter"));

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setPlanTierCode("starter");
    setForm(defaultSplitForTier("starter"));
  }, [open]);

  if (!open) return null;

  // OZ03: marketplace_articles drafts (status=draft)
  const readyItems = inventory.filter((i) => String(i.status).toLowerCase() === "draft");
  const count = selected.size;
  const unit = Number(form.totalArticleValueJod) || 0;
  const total = (count * unit).toFixed(3);
  const sharesOk = sharesSumToTotal(
    form.totalArticleValueJod,
    form.freelancerShareJod,
    form.companyShareJod,
    form.reviewerShareJod,
  );

  return (
    <div className="oh-articles-hub__modal-backdrop" data-testid="articles-manual-publish-modal">
      <div className="oh-articles-hub__modal" role="dialog" aria-modal="true">
        <h3>{t("hub.manualModal.title")}</h3>
        <p className="oh-articles-hub__helper">{t("hub.manualModal.helper")}</p>
        <label>
          {t("hub.manualModal.targetPlanDisplay")}
          <select
            value={planTierCode}
            onChange={(e) => {
              const tier = e.target.value;
              setPlanTierCode(tier);
              setForm(defaultSplitForTier(tier));
            }}
          >
            {ARTICLE_CANONICAL_PLAN_TIER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.labelAr}
              </option>
            ))}
          </select>
        </label>
        <div className="oh-articles-hub__grid" style={{ marginTop: 10 }}>
          {readyItems.length === 0 ? (
            <div className="oh-articles-hub__empty" data-testid="articles-release-empty-inventory">
              {t("hub.emptyInventory")}
            </div>
          ) : (
            readyItems.map((item) => (
              <label key={item.id} className="oh-articles-hub__card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    });
                  }}
                />
                <span>
                  <strong>{item.title}</strong>
                  <br />
                  <small>
                    {item.activationPlanTierCode || item.planTierCode || "—"} · {t("hub.manualModal.draftStatus")} ·{" "}
                    {item.articleValueJod != null ? `${item.articleValueJod} JOD` : ""}
                  </small>
                </span>
              </label>
            ))
          )}
        </div>
        <div className="oh-articles-hub__grid" style={{ marginTop: 12 }}>
          <label>
            {t("hub.manualModal.articleValue")}
            <input
              value={form.totalArticleValueJod}
              onChange={(e) => setForm({ ...form, totalArticleValueJod: e.target.value })}
            />
          </label>
          <label>
            {t("hub.manualModal.freelancerShare")}
            <input
              value={form.freelancerShareJod}
              onChange={(e) => setForm({ ...form, freelancerShareJod: e.target.value })}
            />
          </label>
          <label>
            {t("hub.manualModal.reviewerShare")}
            <input
              value={form.reviewerShareJod}
              onChange={(e) => setForm({ ...form, reviewerShareJod: e.target.value })}
            />
          </label>
          <label>
            {t("hub.manualModal.platformShare")}
            <input
              value={form.companyShareJod}
              onChange={(e) => setForm({ ...form, companyShareJod: e.target.value })}
            />
          </label>
        </div>
        <div className="oh-articles-hub__card" style={{ marginTop: 12 }}>
          <div>{t("hub.manualModal.selectedCount", { count })}</div>
          <div>{t("hub.manualModal.totalValue", { total })}</div>
          <div>{t("hub.manualModal.expectedDeduction", { total })}</div>
          {!sharesOk ? (
            <div style={{ color: "#be123c" }}>{t("hub.manualModal.sharesMustEqual")}</div>
          ) : null}
        </div>
        <div className="oh-articles-hub__actions" style={{ marginTop: 12 }}>
          <button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || !count || !sharesOk}
            onClick={() =>
              onPublish({
                ids: [...selected],
                planTierCode,
                ...form,
              })
            }
          >
            {t("hub.manualModal.confirmPublish")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FundAmountModal({ mode, open, busy, onClose, onSubmit }) {
  const { t } = useArticlesT();
  const [amount, setAmount] = useState(mode === "deposit" ? "10.000" : "1.000");
  useEffect(() => {
    if (open) setAmount(mode === "deposit" ? "10.000" : "1.000");
  }, [open, mode]);
  if (!open) return null;
  return (
    <div className="oh-articles-hub__modal-backdrop" data-testid={`articles-fund-${mode}-modal`}>
      <div className="oh-articles-hub__modal">
        <h3>{mode === "deposit" ? t("hub.fundModal.depositTitle") : t("hub.fundModal.withdrawTitle")}</h3>
        <label>
          {t("hub.fundModal.amountLabel")}
          <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <div className="oh-articles-hub__actions" style={{ marginTop: 12 }}>
          <button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => onSubmit(amount)}>
            {t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminArticlesHubPage() {
  const { t, locale } = useArticlesT();
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") || "overview";
  const TABS = useMemo(
    () => [
      { id: "overview", label: t("hub.tabs.overview") },
      { id: "released", label: t("hub.tabs.released") },
      { id: "inventory", label: t("hub.tabs.inventory") },
      { id: "funding", label: t("hub.tabs.funding") },
    ],
    [t],
  );
  const RELEASE_INTERVAL_PRESETS = useMemo(
    () => [
      { value: 1, label: t("releaseInterval.daily") },
      { value: 2, label: t("releaseInterval.everyOtherDay") },
      { value: 3, label: t("releaseInterval.every3Days") },
    ],
    [t],
  );
  const activeTab = TABS.some((tab) => tab.id === tabFromUrl) ? tabFromUrl : "overview";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [setupReady, setSetupReady] = useState(false);
  const [needsInit, setNeedsInit] = useState(false);
  const [fund, setFund] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [inventory, setInventory] = useState([]); // legacy activation inventory (flag-only)
  const [draftMarketplaceInventory, setDraftMarketplaceInventory] = useState([]);
  const [publishedMarketplaceCount, setPublishedMarketplaceCount] = useState(0);
  const [liveItems, setLiveItems] = useState([]);
  const [liveSummary, setLiveSummary] = useState(null);
  const [expandedArticleId, setExpandedArticleId] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [fundModal, setFundModal] = useState(null);
  const [publishMode, setPublishMode] = useState("manual");
  const [recycleMode, setRecycleMode] = useState(false);
  const [distBasis, setDistBasis] = useState("amount");
  const [allocForm, setAllocForm] = useState(() => ({
    planTierCode: "starter",
    ...defaultSplitForTier("starter"),
    dailyBudgetJod: "10.000",
    maxDailyArticles: 5,
    minimumBiddersPerArticle: 10,
    releaseMode: "manual",
    recycleWhenInventoryEmpty: false,
    autoAssignEnabled: true,
  }));
  const [invForm, setInvForm] = useState({ title: "", planTierCode: "starter", status: "ready" });
  const [invSearch, setInvSearch] = useState("");
  const [releaseIntervalDays, setReleaseIntervalDays] = useState(1);
  const [customInterval, setCustomInterval] = useState("");
  const [releasePreview, setReleasePreview] = useState(null);

  const setTab = (id) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    setSearchParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const setupRes = await ensureSuperAdminArticleOperationsSetupRequest().catch(() => null);
      const setup = setupRes?.data?.setup;
      if (!setup?.id) {
        setSetupReady(false);
        setNeedsInit(true);
        setFund(null);
        setAllocations([]);
        setInventory([]);
        setDraftMarketplaceInventory([]);
        setPublishedMarketplaceCount(0);
        setLiveItems([]);
        setLiveSummary(null);
        return;
      }
      setSetupReady(true);
      setNeedsInit(false);

      const [fundRes, allocRes, invRes, liveRes, draftRes, publishedRes] = await Promise.all([
        getSuperAdminActivationArticleFundRequest({}).catch(() => null),
        listSuperAdminActivationPlanAllocationsRequest(null).catch(() => null),
        SHOW_LEGACY_ACTIVATION_INVENTORY_UI
          ? listSuperAdminActivationArticleInventoryRequest({}).catch(() => null)
          : Promise.resolve(null),
        listSuperAdminActivationLiveArticlesRequest({ limit: 50 }).catch(() => null),
        listAdminMarketplaceArticlesRequest({ status: "draft", includeFake: "false", limit: 200 }).catch(
          () => null,
        ),
        listAdminMarketplaceArticlesRequest({
          status: "published",
          includeFake: "false",
          limit: 1,
        }).catch(() => null),
      ]);
      setFund(fundRes?.data || null);
      const allocs = allocRes?.data?.allocations || [];
      setAllocations(allocs);
      setInventory(invRes?.data?.items || []);
      const drafts = draftRes?.data?.articles || [];
      setDraftMarketplaceInventory(drafts);
      // Prefer length of draft list for KPI; published count from live summary when available.
      setPublishedMarketplaceCount(
        Array.isArray(publishedRes?.data?.articles) ? publishedRes.data.articles.length : 0,
      );
      setLiveItems(liveRes?.data?.items || []);
      setLiveSummary(liveRes?.data?.summary || null);
      const first = allocs[0];
      if (first) {
        setPublishMode(first.releaseMode === "daily_auto" ? "auto" : "manual");
        setRecycleMode(Boolean(first.recycleWhenInventoryEmpty));
        const interval = Number(first.releaseIntervalDays) || 1;
        setReleaseIntervalDays(interval);
        if (![1, 2, 3].includes(interval)) setCustomInterval(String(interval));
        else setCustomInterval("");
      }
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("hub.loadError"));
      setSetupReady(false);
      setNeedsInit(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const inventoryReady = useMemo(
    () => draftMarketplaceInventory.filter((i) => String(i.status).toLowerCase() === "draft").length,
    [draftMarketplaceInventory],
  );

  const filteredInventory = useMemo(() => {
    const visible = inventory.filter((i) => String(i.status).toLowerCase() !== "archived");
    const q = invSearch.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((i) => String(i.title || "").toLowerCase().includes(q));
  }, [inventory, invSearch]);

  const effectiveIntervalDays = useMemo(() => {
    if (customInterval !== "" && ![1, 2, 3].includes(releaseIntervalDays)) {
      const n = Number(customInterval);
      return Number.isInteger(n) && n >= 1 && n <= 30 ? n : releaseIntervalDays;
    }
    return releaseIntervalDays;
  }, [releaseIntervalDays, customInterval]);

  const kpis = [
    {
      key: "fund",
      label: t("hub.kpi.fundBalance"),
      value: fund?.currentBalanceJod != null ? `${fund.currentBalanceJod} JOD` : "—",
    },
    { key: "inv", label: t("hub.kpi.inventoryCount"), value: inventoryReady },
    {
      key: "live",
      label: t("hub.kpi.released"),
      value: liveSummary?.totalReleased ?? publishedMarketplaceCount ?? liveItems.length ?? "—",
    },
    { key: "wait", label: t("hub.kpi.waitingApplicants"), value: liveSummary?.waitingForBidders ?? "—" },
    { key: "review", label: t("hub.kpi.awaitingReview"), value: liveSummary?.underReview ?? "—" },
    { key: "done", label: t("hub.kpi.completed"), value: liveSummary?.accepted ?? liveSummary?.published ?? "—" },
  ];

  async function onEnsureSetup() {
    setBusy(true);
    try {
      await ensureSuperAdminArticleOperationsSetupRequest();
      push({ type: "success", message: t("hub.setup.initSuccess") });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || t("hub.setup.initError") });
    } finally {
      setBusy(false);
    }
  }

  async function onFundSubmit(amount) {
    if (!fundModal) return;
    setBusy(true);
    try {
      if (fundModal === "deposit") {
        await depositSuperAdminActivationArticleFundRequest({
          amountJod: amount,
          reason: "admin_deposit",
        });
      } else {
        await withdrawSuperAdminActivationArticleFundRequest({
          amountJod: amount,
          reason: "admin_withdrawal",
        });
      }
      setFundModal(null);
      push({
        type: "success",
        message: fundModal === "deposit" ? t("hub.fundModal.depositSuccess") : t("hub.fundModal.withdrawSuccess"),
      });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || t("hub.fundModal.updateError") });
    } finally {
      setBusy(false);
    }
  }

  async function onSaveAllocation(e) {
    e.preventDefault();
    if (
      !sharesSumToTotal(
        allocForm.totalArticleValueJod,
        allocForm.freelancerShareJod,
        allocForm.companyShareJod,
        allocForm.reviewerShareJod,
      )
    ) {
      push({ type: "error", message: t("hub.funding.sharesError") });
      return;
    }
    setBusy(true);
    try {
      await createSuperAdminActivationPlanAllocationRequest(null, {
        ...allocForm,
        releaseMode: publishMode === "auto" ? "daily_auto" : "manual",
        recycleWhenInventoryEmpty: recycleMode,
        releaseIntervalDays: effectiveIntervalDays,
      });
      push({ type: "success", message: t("hub.funding.saveAllocSuccess") });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || t("hub.funding.saveAllocError") });
    } finally {
      setBusy(false);
    }
  }

  async function onArchiveInventory(item) {
    if (!window.confirm(t("hub.inventory.archiveConfirm"))) {
      return;
    }
    setBusy(true);
    try {
      await patchSuperAdminActivationArticleInventoryRequest(item.id, { status: "archived" });
      push({ type: "success", message: t("hub.inventory.archiveSuccess") });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || t("hub.inventory.archiveError") });
    } finally {
      setBusy(false);
    }
  }

  async function onPreviewRelease() {
    setBusy(true);
    try {
      const res = await previewSuperAdminActivationArticleReleaseRequest({
        planTierCode: allocForm.planTierCode || "starter",
      });
      const data = res?.data || null;
      setReleasePreview(data);
      if (data?.messageAr && !(data.plannedTotal > 0)) {
        push({ type: "error", message: data.messageAr });
      }
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || t("hub.funding.autoRunError") });
    } finally {
      setBusy(false);
    }
  }

  async function onCreateInventory(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const defaults = defaultSplitForTier(invForm.planTierCode);
      await createSuperAdminActivationArticleInventoryRequest({
        ...invForm,
        ...defaults,
        minimumBiddersPerArticle: 10,
      });
      setInvForm({ title: "", planTierCode: "starter", status: "ready" });
      push({ type: "success", message: t("hub.funding.addInventorySuccess") });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || t("hub.funding.addInventoryError") });
    } finally {
      setBusy(false);
    }
  }

  async function onManualPublish({ ids }) {
    setBusy(true);
    try {
      if (!ids?.length) {
        push({ type: "error", message: t("hub.emptyInventory") });
        return;
      }
      await releaseMarketplaceArticleDraftBatchRequest({ ids });
      setManualOpen(false);
      push({ type: "success", message: t("hub.funding.manualPublishSuccess") });
      setTab("released");
      await load();
    } catch (err) {
      const msg = getSafeApiErrorMessage(err) || t("hub.funding.manualPublishError");
      const insufficient =
        err?.response?.data?.code === "ACTIVATION_ARTICLE_FUND_INSUFFICIENT" ||
        /insufficient|غير كاف/i.test(msg);
      push({
        type: "error",
        message: insufficient ? t("hub.insufficientFund") : msg,
      });
    } finally {
      setBusy(false);
    }
  }

  async function onRunAutoRelease() {
    setBusy(true);
    try {
      const res = await runSuperAdminActivationArticleReleaseRequest({
        planTierCode: allocForm.planTierCode || "starter",
        runType: "manual",
      });
      setReleasePreview(null);
      const data = res?.data;
      if (data?.messageAr) {
        push({
          type: data.releasedCount > 0 || (data.articles || []).length > 0 ? "success" : "error",
          message: data.messageAr,
        });
      } else {
        push({ type: "success", message: t("hub.funding.autoRunSuccess") });
      }
      await load();
    } catch (err) {
      const msg = getSafeApiErrorMessage(err) || t("hub.funding.autoRunError");
      const insufficient =
        err?.response?.data?.code === "ACTIVATION_ARTICLE_FUND_INSUFFICIENT" ||
        /insufficient|غير كاف/i.test(msg);
      push({
        type: "error",
        message: insufficient ? t("hub.insufficientFund") : msg,
      });
    } finally {
      setBusy(false);
    }
  }

  const opsDisabled = !setupReady;
  const opsTitle = opsDisabled ? t("hub.setup.opsDisabledTitle") : undefined;


  return (
    <DashboardShell>
      <div className="oh-articles-hub" data-testid="super-admin-articles-hub">
        <p className="oh-articles-hub__subtitle" data-testid="articles-hub-subtitle">
          {t("hub.subtitle")}
        </p>

        <div className="oh-articles-hub__kpis" data-testid="articles-hub-kpis">
          {kpis.map((k) => (
            <div key={k.key} className="oh-articles-hub__kpi" data-testid={`articles-hub-kpi-${k.key}`}>
              <div className="oh-articles-hub__kpi-label">{k.label}</div>
              <div className="oh-articles-hub__kpi-value">{k.value}</div>
            </div>
          ))}
        </div>

        <div className="oh-articles-hub__tabs" data-testid="articles-hub-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              data-testid={`articles-hub-tab-${t.id}`}
              className={activeTab === t.id ? "oh-articles-hub__tab oh-articles-hub__tab--active" : "oh-articles-hub__tab"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <div className="oh-articles-hub__empty">{error}</div> : null}

        {!loading && !error && needsInit ? (
          <div className="oh-articles-hub__card" data-testid="articles-setup-init" style={{ marginBottom: 14 }}>
            <h3 className="oh-articles-hub__section-title">{t("hub.setup.title")}</h3>
            <p className="oh-articles-hub__helper">{t("hub.setup.helper")}</p>
            <div className="oh-articles-hub__actions">
              <button
                type="button"
                className="primary"
                disabled={busy}
                data-testid="articles-setup-init-btn"
                onClick={() => void onEnsureSetup()}
              >
                {t("hub.setup.init")}
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !error && activeTab === "overview" ? (
          <div data-testid="articles-hub-panel-overview">
            <h3 className="oh-articles-hub__section-title">{t("hub.quick.title")}</h3>
            <div className="oh-articles-hub__quick" data-testid="articles-hub-quick-actions">
              <button type="button" className="oh-articles-hub__quick-btn" disabled={opsDisabled} title={opsTitle} onClick={() => setTab("inventory")}>
                {t("hub.quick.addArticle")}
                <span>{t("hub.quick.addArticleHint")}</span>
              </button>
              <button type="button" className="oh-articles-hub__quick-btn" disabled={opsDisabled} title={opsTitle} onClick={() => setManualOpen(true)}>
                {t("hub.quick.manualPublish")}
                <span>{t("hub.quick.manualPublishHint")}</span>
              </button>
              <button type="button" className="oh-articles-hub__quick-btn" disabled={opsDisabled} title={opsTitle} onClick={() => setFundModal("deposit")}>
                {t("hub.quick.addBalance")}
                <span>{t("hub.quick.addBalanceHint")}</span>
              </button>
              <button type="button" className="oh-articles-hub__quick-btn" disabled={opsDisabled} title={opsTitle} onClick={() => setFundModal("withdraw")}>
                {t("hub.quick.withdrawBalance")}
                <span>{t("hub.quick.withdrawBalanceHint")}</span>
              </button>
              <button type="button" className="oh-articles-hub__quick-btn" disabled={opsDisabled} title={opsTitle} onClick={() => setTab("inventory")}>
                {t("hub.quick.openInventory")}
                <span>{t("hub.quick.openInventoryHint")}</span>
              </button>
              <button type="button" className="oh-articles-hub__quick-btn" disabled={opsDisabled} title={opsTitle} onClick={() => setTab("released")}>
                {t("hub.quick.trackArticles")}
                <span>{t("hub.quick.trackArticlesHint")}</span>
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !error && activeTab === "released" ? (
          <div data-testid="articles-hub-panel-released" className="oh-articles-hub__grid">
            <p className="oh-articles-hub__helper">{t("hub.released.helper")}</p>
            {liveItems.length === 0 ? (
              <div className="oh-articles-hub__empty">{t("hub.released.empty")}</div>
            ) : (
              liveItems.map((item) => (
                <div key={item.articleId} className="oh-articles-hub__card" data-testid={`articles-released-row-${item.articleId}`}>
                  <h4 className="oh-articles-hub__card-title">{item.title}</h4>
                  <div className="oh-articles-hub__meta">
                    <span className="oh-articles-hub__chip oh-articles-hub__chip--blue">{item.planTierCode || "—"}</span>
                    <span className="oh-articles-hub__chip">
                      {t("hub.released.value", { amount: item.totalArticleValueJod ?? "—" })}
                    </span>
                    <span className="oh-articles-hub__chip">
                      {t("hub.released.freelancerShare", { amount: item.freelancerShareJod ?? "—" })}
                    </span>
                    <span className="oh-articles-hub__chip oh-articles-hub__chip--teal">
                      {t("hub.released.applicantsCount", {
                        current: item.currentApplicationsCount ?? 0,
                        required: item.requiredBidders ?? "—",
                      })}
                    </span>
                    {liveStatusChips(item, t).map((c) => (
                      <span key={c.t} className={`oh-articles-hub__chip oh-articles-hub__chip--${c.c}`}>
                        {c.t}
                      </span>
                    ))}
                  </div>
                  <div className="oh-articles-hub__actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() =>
                        setExpandedArticleId((prev) => (prev === item.articleId ? null : item.articleId))
                      }
                    >
                      {expandedArticleId === item.articleId
                        ? t("hub.released.hideApplicants")
                        : t("hub.released.showApplicants")}
                    </button>
                    <a href={`#article-${item.articleId}`}>{t("common.details")}</a>
                  </div>
                  {expandedArticleId === item.articleId ? (
                    <div className="oh-articles-hub__applicants" data-testid="articles-released-applicants">
                      <MarketplaceArticleApplicationsPanel
                        articleId={item.articleId}
                        onToast={push}
                        onRelisted={load}
                      />
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : null}

        {!loading && !error && activeTab === "inventory" ? (
          <div data-testid="articles-hub-panel-inventory">
            <div className="oh-articles-hub__card" style={{ marginBottom: 16 }}>
              <h2 className="oh-articles-hub__section-title" style={{ marginTop: 0 }}>
                {t("hub.inventory.title")}
              </h2>
              <p style={{ marginTop: 0, opacity: 0.9, maxWidth: "42rem" }}>
                {t("hub.inventory.helper")}
              </p>
              <div data-testid="articles-marketplace-create-panel">
                <MarketplaceArticlesAdminPanel inventoryHub />
              </div>
            </div>

            {SHOW_LEGACY_ACTIVATION_INVENTORY_UI ? (
              <>
                <div className="oh-articles-hub__actions" style={{ marginBottom: 10 }}>
                  <input
                    placeholder={t("hub.inventory.legacySearchPlaceholder")}
                    value={invSearch}
                    onChange={(e) => setInvSearch(e.target.value)}
                    data-testid="articles-inventory-search"
                  />
                </div>
                <form
                  onSubmit={onCreateInventory}
                  className="oh-articles-hub__card"
                  data-testid="articles-inventory-add-form"
                  style={{ marginBottom: 12 }}
                >
                  <h3 className="oh-articles-hub__section-title">{t("hub.inventory.legacyTitle")}</h3>
                  <p style={{ marginTop: 0, opacity: 0.85 }}>{t("hub.inventory.legacyHelper")}</p>
                  <div className="oh-articles-hub__grid">
                    <label>
                      {t("hub.inventory.titleLabel")}
                      <input
                        required
                        value={invForm.title}
                        onChange={(e) => setInvForm({ ...invForm, title: e.target.value })}
                      />
                    </label>
                    <label>
                      {t("hub.inventory.targetPlan")}
                      <select
                        value={invForm.planTierCode}
                        onChange={(e) => setInvForm({ ...invForm, planTierCode: e.target.value })}
                      >
                        {ARTICLE_CANONICAL_PLAN_TIER_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.labelAr}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="oh-articles-hub__actions">
                    <button type="submit" className="primary" disabled={busy || opsDisabled} title={opsTitle}>
                      {t("hub.inventory.saveLegacy")}
                    </button>
                  </div>
                </form>
                <div className="oh-articles-hub__grid">
                  {filteredInventory.length === 0 ? (
                    <div className="oh-articles-hub__empty">{t("hub.inventory.legacyEmpty")}</div>
                  ) : (
                    filteredInventory.map((item) => (
                      <div
                        key={item.id}
                        className="oh-articles-hub__card"
                        data-testid={`articles-inventory-card-${item.id}`}
                      >
                        <h4 className="oh-articles-hub__card-title">{item.title}</h4>
                        <div className="oh-articles-hub__meta">
                          <span className="oh-articles-hub__chip">{inventoryStatusLabel(item.status, t)}</span>
                          <span className="oh-articles-hub__chip oh-articles-hub__chip--blue">
                            {item.planTierCode}
                          </span>
                          <span className="oh-articles-hub__chip">
                            {t("hub.inventory.releaseCount", { count: item.releasedCount ?? 0 })}
                          </span>
                          <span className="oh-articles-hub__chip">
                            {item.releaseStrategy === "reusable"
                              ? t("hub.inventory.reusable")
                              : t("hub.inventory.oneTime")}
                          </span>
                        </div>
                        <div className="oh-articles-hub__actions">
                          {item.status === "draft" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void patchSuperAdminActivationArticleInventoryRequest(item.id, {
                                  status: "ready",
                                }).then(load)
                              }
                            >
                              {t("hub.inventory.prepare")}
                            </button>
                          ) : null}
                          {item.status === "ready" || item.status === "released" ? (
                            <button
                              type="button"
                              className="primary"
                              disabled={busy}
                              onClick={() =>
                                void releaseSuperAdminActivationArticleInventoryRequest(item.id).then(load)
                              }
                            >
                              {t("hub.quick.manualPublish")}
                            </button>
                          ) : null}
                          {item.status !== "archived" ? (
                            <button
                              type="button"
                              disabled={busy}
                              data-testid={`articles-inventory-archive-${item.id}`}
                              onClick={() => void onArchiveInventory(item)}
                              title={t("hub.inventory.archiveTitle")}
                            >
                              {t("hub.inventory.archive")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {!loading && !error && activeTab === "funding" ? (
          <div data-testid="articles-hub-panel-funding">
            <div className="oh-articles-hub__fund-hero" data-testid="articles-fund-hero">
              <button
                type="button"
                className="oh-articles-hub__fund-btn oh-articles-hub__fund-btn--minus"
                aria-label={t("hub.funding.withdrawBalanceAria")}
                onClick={() => setFundModal("withdraw")}
              >
                −
              </button>
              <div className="oh-articles-hub__fund-amount">
                <span>{t("hub.funding.currentBalance")}</span>
                <strong>{fund?.currentBalanceJod ?? "0.000"} JOD</strong>
              </div>
              <button
                type="button"
                className="oh-articles-hub__fund-btn oh-articles-hub__fund-btn--plus"
                aria-label={t("hub.funding.addBalanceAria")}
                onClick={() => setFundModal("deposit")}
              >
                +
              </button>
            </div>

            {(fund?.recentEntries || []).length > 0 ? (
              <div className="oh-articles-hub__card" style={{ marginBottom: 12 }} data-testid="articles-fund-ledger">
                <h3 className="oh-articles-hub__section-title" style={{ marginTop: 0 }}>
                  {t("hub.funding.recentLedger")}
                </h3>
                <ul className="oh-articles-hub__fund-ledger" style={{ margin: 0, paddingInlineStart: "1.2rem" }}>
                  {(fund.recentEntries || []).slice(0, 12).map((e) => {
                    const metaReason = String(e?.metadata?.reason || "");
                    const reason = String(e?.reason || "");
                    const refundLabel =
                      metaReason === "minimum_not_met_refund" ||
                      reason.includes("عدم اكتمال") ||
                      reason.includes("minimum")
                        ? t("fundEntry.refundMinNotMet")
                        : reason || null;
                    const typeLabel =
                      e.entryType === "daily_allocation_released"
                        ? t("fundEntry.refundArticle")
                        : e.entryType === "daily_allocation"
                          ? t("fundEntry.deductRelease")
                          : e.entryType === "fund_deposit"
                            ? t("fundEntry.deposit")
                            : e.entryType === "fund_withdrawal"
                              ? t("fundEntry.withdraw")
                              : e.entryType || "—";
                    return (
                      <li key={e.id} data-testid={`articles-fund-entry-${e.id}`}>
                        {typeLabel}: {e.amountJod} JOD
                        {refundLabel ? (
                          <span data-testid="fund-entry-reason-ar"> — {refundLabel}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <h3 className="oh-articles-hub__section-title">{t("hub.funding.publishModeTitle")}</h3>
            <div className="oh-articles-hub__segment" data-testid="articles-publish-mode">
              <button
                type="button"
                className={publishMode === "auto" ? "active" : ""}
                onClick={() => setPublishMode("auto")}
              >
                {t("publishMode.auto")}
              </button>
              <button
                type="button"
                className={publishMode === "manual" ? "active" : ""}
                onClick={() => setPublishMode("manual")}
              >
                {t("publishMode.manual")}
              </button>
            </div>
            {publishMode === "auto" ? (
              <div className="oh-articles-hub__card" style={{ marginBottom: 12 }} data-testid="articles-auto-release-card">
                <p className="oh-articles-hub__helper" data-testid="articles-auto-release-supported">
                  {t("hub.funding.autoReleaseHelper")}
                </p>
                <label data-testid="articles-release-interval">
                  {t("hub.funding.releaseIntervalLabel")}
                  <select
                    value={[1, 2, 3].includes(releaseIntervalDays) ? String(releaseIntervalDays) : "custom"}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "custom") {
                        setReleaseIntervalDays(Number(customInterval) || 4);
                        if (!customInterval) setCustomInterval("4");
                      } else {
                        setReleaseIntervalDays(Number(v));
                        setCustomInterval("");
                      }
                    }}
                  >
                    {RELEASE_INTERVAL_PRESETS.map((p) => (
                      <option key={p.value} value={String(p.value)}>
                        {p.label}
                      </option>
                    ))}
                    <option value="custom">{t("releaseInterval.customEveryN")}</option>
                  </select>
                </label>
                {![1, 2, 3].includes(releaseIntervalDays) || customInterval !== "" ? (
                  <label>
                    {t("hub.funding.daysCount")}
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={customInterval || String(releaseIntervalDays)}
                      onChange={(e) => {
                        setCustomInterval(e.target.value);
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 1 && n <= 30) setReleaseIntervalDays(n);
                      }}
                      data-testid="articles-release-interval-custom"
                    />
                  </label>
                ) : null}
                <p className="oh-articles-hub__helper">
                  {t("hub.funding.currentSchedule", { label: intervalLabel(effectiveIntervalDays, t) })}
                </p>
                <label>
                  {t("hub.funding.whenInventoryEmpty")}
                  <select value={recycleMode ? "recycle" : "stop"} onChange={(e) => setRecycleMode(e.target.value === "recycle")}>
                    <option value="recycle">{t("hub.funding.recycle")}</option>
                    <option value="stop">{t("hub.funding.stop")}</option>
                  </select>
                </label>
                <div className="oh-articles-hub__actions">
                  <button type="button" disabled={busy || opsDisabled} title={opsTitle} onClick={() => void onPreviewRelease()} data-testid="articles-release-preview-btn">
                    {t("hub.funding.previewRelease")}
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || opsDisabled}
                    onClick={() => void onRunAutoRelease()}
                    title={opsDisabled ? opsTitle : t("hub.funding.runReleaseTitle")}
                    data-testid="articles-release-run-btn"
                  >
                    {t("hub.funding.runRelease")}
                  </button>
                </div>
                {releasePreview ? (
                  <div className="oh-articles-hub__helper" data-testid="articles-release-preview" style={{ marginTop: 8 }}>
                    {(releasePreview.plans || releasePreview.allocations || []).map((p) => (
                      <div key={p.allocationId || p.planTierCode}>
                        {p.planTierCode}:{" "}
                        {p.skipReason === "not_release_day"
                          ? (locale === "ar" ? p.messageAr : p.messageEn) || t("hub.funding.notReleaseDay")
                          : p.skipReason === "inventory_empty"
                            ? (locale === "ar" ? p.messageAr : p.messageEn) || t("hub.emptyInventory")
                            : p.skipReason === "insufficient_fund"
                              ? (locale === "ar" ? p.messageAr : p.messageEn) || t("hub.insufficientFund")
                              : p.skipped
                                ? t("hub.funding.skipped", { reason: p.skipReason || "—" })
                                : t("hub.funding.planned", { count: p.plannedCount || 0 })}
                      </div>
                    ))}
                    {releasePreview.messageAr ? (
                      <strong data-testid="articles-release-preview-msg">
                        {locale === "ar" ? releasePreview.messageAr : releasePreview.messageEn || releasePreview.messageAr}
                      </strong>
                    ) : null}
                    {(releasePreview.plans || releasePreview.allocations || []).some((p) => p.skipReason === "not_release_day") ? (
                      <strong data-testid="articles-not-release-day-msg">{t("hub.funding.notReleaseDay")}</strong>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="oh-articles-hub__actions" style={{ marginBottom: 12 }}>
                <button type="button" className="primary" disabled={opsDisabled} title={opsTitle} onClick={() => setManualOpen(true)}>
                  {t("hub.funding.manualRun")}
                </button>
              </div>
            )}

            <h3 className="oh-articles-hub__section-title">{t("hub.funding.distBasisTitle")}</h3>
            <div className="oh-articles-hub__segment" data-testid="articles-dist-basis">
              <button type="button" className={distBasis === "amount" ? "active" : ""} onClick={() => setDistBasis("amount")}>
                {t("hub.funding.byAmount")}
              </button>
              <button type="button" className={distBasis === "count" ? "active" : ""} onClick={() => setDistBasis("count")}>
                {t("hub.funding.byCount")}
              </button>
            </div>

            <h3 className="oh-articles-hub__section-title">{t("hub.funding.planAllocTitle")}</h3>
            <p className="oh-articles-hub__helper">{t("hub.funding.planAllocHelper")}</p>
            <form onSubmit={onSaveAllocation} className="oh-articles-hub__card" data-testid="articles-alloc-form">
              <div className="oh-articles-hub__grid">
                <label>
                  {t("hub.funding.plan")}
                  <select
                    value={allocForm.planTierCode}
                    onChange={(e) => {
                      const tier = e.target.value;
                      setAllocForm({ ...allocForm, planTierCode: tier, ...defaultSplitForTier(tier) });
                    }}
                  >
                    {ARTICLE_CANONICAL_PLAN_TIER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.labelAr}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("hub.manualModal.articleValue")}
                  <input
                    value={allocForm.totalArticleValueJod}
                    onChange={(e) => setAllocForm({ ...allocForm, totalArticleValueJod: e.target.value })}
                  />
                </label>
                <label>
                  {t("hub.manualModal.freelancerShare")}
                  <input
                    value={allocForm.freelancerShareJod}
                    onChange={(e) => setAllocForm({ ...allocForm, freelancerShareJod: e.target.value })}
                  />
                </label>
                <label>
                  {t("hub.manualModal.reviewerShare")}
                  <input
                    value={allocForm.reviewerShareJod}
                    onChange={(e) => setAllocForm({ ...allocForm, reviewerShareJod: e.target.value })}
                  />
                </label>
                <label>
                  {t("hub.manualModal.platformShare")}
                  <input
                    value={allocForm.companyShareJod}
                    onChange={(e) => setAllocForm({ ...allocForm, companyShareJod: e.target.value })}
                  />
                </label>
                {distBasis === "amount" ? (
                  <label>
                    {t("hub.funding.dailyLimitJod")}
                    <input
                      value={allocForm.dailyBudgetJod}
                      onChange={(e) => setAllocForm({ ...allocForm, dailyBudgetJod: e.target.value })}
                    />
                  </label>
                ) : (
                  <label>
                    {t("hub.funding.dailyLimitCount")}
                    <input
                      type="number"
                      value={allocForm.maxDailyArticles}
                      onChange={(e) => setAllocForm({ ...allocForm, maxDailyArticles: Number(e.target.value) })}
                    />
                  </label>
                )}
                <label>
                  {t("hub.funding.minApplicants")}
                  <input
                    type="number"
                    value={allocForm.minimumBiddersPerArticle}
                    onChange={(e) =>
                      setAllocForm({ ...allocForm, minimumBiddersPerArticle: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="oh-articles-hub__actions">
                <button type="submit" className="primary" disabled={busy || opsDisabled} title={opsTitle}>
                  {t("hub.funding.saveAlloc")}
                </button>
              </div>
            </form>

            <div className="oh-articles-hub__table-wrap" style={{ marginTop: 12 }} data-testid="articles-alloc-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("hub.funding.table.plan")}</th>
                    <th>{t("hub.funding.table.articleValue")}</th>
                    <th>{t("hub.funding.table.freelancer")}</th>
                    <th>{t("hub.funding.table.reviewer")}</th>
                    <th>{t("hub.funding.table.platform")}</th>
                    <th>{t("hub.funding.table.dailyJod")}</th>
                    <th>{t("hub.funding.table.dailyCount")}</th>
                    <th>{t("hub.funding.table.applicants")}</th>
                    <th>{t("hub.funding.table.publishMode")}</th>
                    <th>{t("hub.funding.table.releaseInterval")}</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a) => (
                    <tr key={a.id}>
                      <td>{a.planTierCode}</td>
                      <td>{a.totalArticleValueJod}</td>
                      <td>{a.freelancerShareJod}</td>
                      <td>{a.reviewerShareJod}</td>
                      <td>{a.companyShareJod}</td>
                      <td>{a.dailyBudgetJod ?? "—"}</td>
                      <td>{a.maxDailyArticles ?? "—"}</td>
                      <td>{a.minimumBiddersPerArticle ?? "—"}</td>
                      <td>{a.releaseMode === "daily_auto" ? t("publishMode.auto") : t("publishMode.manual")}</td>
                      <td>{intervalLabel(a.releaseIntervalDays || 1, t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="oh-articles-hub__helper" style={{ marginTop: 10 }}>
              {t("hub.funding.ledgerNote")}
            </p>
          </div>
        ) : null}
      </div>

      <ManualPublishModal
        open={manualOpen}
        inventory={draftMarketplaceInventory}
        busy={busy}
        onClose={() => setManualOpen(false)}
        onPublish={onManualPublish}
      />
      <FundAmountModal
        mode={fundModal || "deposit"}
        open={Boolean(fundModal)}
        busy={busy}
        onClose={() => setFundModal(null)}
        onSubmit={onFundSubmit}
      />
    </DashboardShell>
  );
}
