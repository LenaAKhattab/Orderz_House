import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import MarketplaceArticleApplicationsPanel from "../../admin/marketplaceArticles/MarketplaceArticleApplicationsPanel";
import MarketplaceArticlesAdminPanel from "../../components/admin/MarketplaceArticlesAdminPanel";
import { useToast } from "../../components/ui/toastContext";
import { sharesSumToTotal } from "../../constants/freelancerActivationCampaign";
import {
  FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS,
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
  previewSuperAdminActivationArticleReleaseRequest,
  runSuperAdminActivationArticleReleaseRequest,
  listSuperAdminActivationLiveArticlesRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import "./super-admin-articles-hub.css";

const TABS = [
  { id: "overview", label: "نظرة عامة" },
  { id: "released", label: "المقالات المنزلة" },
  { id: "inventory", label: "مخزون المقالات" },
  { id: "funding", label: "صندوق التمويل" },
];

const RELEASE_INTERVAL_PRESETS = [
  { value: 1, label: "يوميًا" },
  { value: 2, label: "يوم بعد يوم" },
  { value: 3, label: "كل 3 أيام" },
];

function inventoryStatusAr(status) {
  switch (String(status || "").toLowerCase()) {
    case "draft":
      return "مسودة";
    case "ready":
      return "جاهز";
    case "released":
      return "منزّل";
    case "archived":
      return "مؤرشف";
    default:
      return status || "—";
  }
}

function intervalLabelAr(days) {
  const n = Number(days) || 1;
  if (n === 1) return "يوميًا";
  if (n === 2) return "يوم بعد يوم";
  if (n === 3) return "كل 3 أيام";
  return `كل ${n} أيام`;
}

function liveStatusChips(item) {
  const chips = [];
  if (item.autoAssignStatus === "waiting_for_bidders") chips.push({ t: "بانتظار المتقدمين", c: "amber" });
  else if (item.autoAssignStatus === "ready") chips.push({ t: "جاهزة للتوزيع", c: "blue" });
  else if (item.autoAssignStatus === "completed" || item.selectedBySystem) chips.push({ t: "تم الإسناد", c: "teal" });
  if (item.reviewStatus === "under_review" || item.reviewStatus === "pending_review") {
    chips.push({ t: "بانتظار المراجعة", c: "rose" });
  }
  if (item.reviewStatus === "revision_requested") chips.push({ t: "طُلب تعديل", c: "amber" });
  if (item.reviewStatus === "approved" || item.bildazoPublishStatus === "published") {
    chips.push({ t: "مكتمل / منشور", c: "green" });
  }
  if (item.selectedFreelancerDisplayName) chips.push({ t: `الفائز: ${item.selectedFreelancerDisplayName}`, c: "violet" });
  return chips;
}

function ManualPublishModal({
  open,
  inventory,
  busy,
  onClose,
  onPublish,
}) {
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

  const readyItems = inventory.filter((i) => i.status === "ready" || i.status === "released");
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
        <h3>نشر يدوي</h3>
        <p className="oh-articles-hub__helper">اختر مقالات من المخزون وحدّد الخطة والقيمة ثم أكّد النشر.</p>
        <label>
          الخطة المستهدفة
          <select
            value={planTierCode}
            onChange={(e) => {
              const tier = e.target.value;
              setPlanTierCode(tier);
              setForm(defaultSplitForTier(tier));
            }}
          >
            {FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.labelAr}
              </option>
            ))}
          </select>
        </label>
        <div className="oh-articles-hub__grid" style={{ marginTop: 10 }}>
          {readyItems.length === 0 ? (
            <div className="oh-articles-hub__empty">لا توجد مقالات جاهزة في المخزون.</div>
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
                    {item.planTierCode} · {inventoryStatusAr(item.status)}
                  </small>
                </span>
              </label>
            ))
          )}
        </div>
        <div className="oh-articles-hub__grid" style={{ marginTop: 12 }}>
          <label>
            قيمة المقال
            <input
              value={form.totalArticleValueJod}
              onChange={(e) => setForm({ ...form, totalArticleValueJod: e.target.value })}
            />
          </label>
          <label>
            حصة المستقل
            <input
              value={form.freelancerShareJod}
              onChange={(e) => setForm({ ...form, freelancerShareJod: e.target.value })}
            />
          </label>
          <label>
            حصة التدقيق
            <input
              value={form.reviewerShareJod}
              onChange={(e) => setForm({ ...form, reviewerShareJod: e.target.value })}
            />
          </label>
          <label>
            حصة المنصة
            <input
              value={form.companyShareJod}
              onChange={(e) => setForm({ ...form, companyShareJod: e.target.value })}
            />
          </label>
        </div>
        <div className="oh-articles-hub__card" style={{ marginTop: 12 }}>
          <div>عدد المقالات المختارة: {count}</div>
          <div>القيمة الإجمالية: {total} JOD</div>
          <div>الخصم المتوقع من الصندوق: {total} JOD</div>
          {!sharesOk ? <div style={{ color: "#be123c" }}>يجب أن يساوي مجموع الحصص قيمة المقال.</div> : null}
        </div>
        <div className="oh-articles-hub__actions" style={{ marginTop: 12 }}>
          <button type="button" onClick={onClose} disabled={busy}>
            إلغاء
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
            تأكيد النشر
          </button>
        </div>
      </div>
    </div>
  );
}

function FundAmountModal({ mode, open, busy, onClose, onSubmit }) {
  const [amount, setAmount] = useState(mode === "deposit" ? "10.000" : "1.000");
  useEffect(() => {
    if (open) setAmount(mode === "deposit" ? "10.000" : "1.000");
  }, [open, mode]);
  if (!open) return null;
  return (
    <div className="oh-articles-hub__modal-backdrop" data-testid={`articles-fund-${mode}-modal`}>
      <div className="oh-articles-hub__modal">
        <h3>{mode === "deposit" ? "إضافة رصيد" : "خصم رصيد"}</h3>
        <label>
          المبلغ (دينار)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <div className="oh-articles-hub__actions" style={{ marginTop: 12 }}>
          <button type="button" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => onSubmit(amount)}>
            تأكيد
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminArticlesHubPage() {
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") || "overview";
  const activeTab = TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : "overview";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [setupReady, setSetupReady] = useState(false);
  const [needsInit, setNeedsInit] = useState(false);
  const [fund, setFund] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [liveItems, setLiveItems] = useState([]);
  const [liveSummary, setLiveSummary] = useState(null);
  const [expandedArticleId, setExpandedArticleId] = useState(null);
  const [showCreateArticles, setShowCreateArticles] = useState(false);
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
        setLiveItems([]);
        setLiveSummary(null);
        return;
      }
      setSetupReady(true);
      setNeedsInit(false);

      const [fundRes, allocRes, invRes, liveRes] = await Promise.all([
        getSuperAdminActivationArticleFundRequest({}).catch(() => null),
        listSuperAdminActivationPlanAllocationsRequest(null).catch(() => null),
        listSuperAdminActivationArticleInventoryRequest({}).catch(() => null),
        listSuperAdminActivationLiveArticlesRequest({ limit: 50 }).catch(() => null),
      ]);
      setFund(fundRes?.data || null);
      const allocs = allocRes?.data?.allocations || [];
      setAllocations(allocs);
      setInventory(invRes?.data?.items || []);
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
      setError(getSafeApiErrorMessage(err) || "تعذر تحميل صفحة المقالات.");
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
    () => inventory.filter((i) => i.status === "ready").length,
    [inventory],
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
    { key: "fund", label: "رصيد الصندوق", value: fund?.currentBalanceJod != null ? `${fund.currentBalanceJod} JOD` : "—" },
    { key: "inv", label: "مقالات في المخزون", value: inventoryReady },
    { key: "live", label: "مقالات منزلة", value: liveSummary?.totalReleased ?? liveItems.length ?? "—" },
    { key: "wait", label: "بانتظار المتقدمين", value: liveSummary?.waitingForBidders ?? "—" },
    { key: "review", label: "بانتظار المراجعة", value: liveSummary?.underReview ?? "—" },
    { key: "done", label: "مكتملة", value: liveSummary?.accepted ?? liveSummary?.published ?? "—" },
  ];

  async function onEnsureSetup() {
    setBusy(true);
    try {
      await ensureSuperAdminArticleOperationsSetupRequest();
      push({ type: "success", message: "تم تهيئة إعداد المقالات." });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || "تعذر تهيئة إعداد المقالات." });
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
      push({ type: "success", message: fundModal === "deposit" ? "تمت إضافة الرصيد." : "تم خصم الرصيد." });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || "تعذر تحديث الصندوق." });
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
      push({ type: "error", message: "يجب أن يساوي مجموع الحصص قيمة المقال." });
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
      push({ type: "success", message: "تم حفظ توزيع الخطة." });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || "تعذر حفظ التوزيع." });
    } finally {
      setBusy(false);
    }
  }

  async function onArchiveInventory(item) {
    if (!window.confirm("لن يظهر هذا المقال في المخزون الجاهز، ويمكن الاحتفاظ بسجله.")) {
      return;
    }
    setBusy(true);
    try {
      await patchSuperAdminActivationArticleInventoryRequest(item.id, { status: "archived" });
      push({ type: "success", message: "تمت أرشفة المقال وإخفاؤه من المخزون الجاهز." });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || "تعذر أرشفة المقال." });
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
      setReleasePreview(res?.data || null);
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || "تعذر معاينة الإنزال." });
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
      push({ type: "success", message: "تمت إضافة المقال للمخزون." });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || "تعذر الإضافة للمخزون." });
    } finally {
      setBusy(false);
    }
  }

  async function onManualPublish({ ids, planTierCode }) {
    setBusy(true);
    try {
      for (const id of ids) {
        await releaseSuperAdminActivationArticleInventoryRequest(id);
      }
      setManualOpen(false);
      push({ type: "success", message: "تم النشر اليدوي." });
      setTab("released");
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || "تعذر النشر اليدوي." });
    } finally {
      setBusy(false);
    }
  }

  async function onRunAutoRelease() {
    setBusy(true);
    try {
      await runSuperAdminActivationArticleReleaseRequest({
        planTierCode: allocForm.planTierCode || "starter",
        runType: "manual",
      });
      setReleasePreview(null);
      push({ type: "success", message: "تم تشغيل الإنزال." });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || "تعذر تشغيل الإنزال." });
    } finally {
      setBusy(false);
    }
  }

  const opsDisabled = !setupReady;
  const opsTitle = opsDisabled ? "يلزم تهيئة إعداد المقالات أولًا" : undefined;


  return (
    <DashboardShell>
      <div className="oh-articles-hub" data-testid="super-admin-articles-hub">
        <DashboardPageHeader
          title="المقالات"
          breadcrumbs={superAdminBreadcrumbs(["dashboard.breadcrumbs.articles"])}
        />
        <p className="oh-articles-hub__subtitle" data-testid="articles-hub-subtitle">
          إدارة مقالات المستقلين، المخزون، التمويل، والتوزيع من مكان واحد.
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
            <h3 className="oh-articles-hub__section-title">إعداد المقالات</h3>
            <p className="oh-articles-hub__helper">
              سيتم استخدام إعداد واحد لإدارة الصندوق، المخزون، التوزيع، وإنزال المقالات.
            </p>
            <div className="oh-articles-hub__actions">
              <button
                type="button"
                className="primary"
                disabled={busy}
                data-testid="articles-setup-init-btn"
                onClick={() => void onEnsureSetup()}
              >
                تهيئة إعداد المقالات
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !error && activeTab === "overview" ? (
          <div data-testid="articles-hub-panel-overview">
            <h3 className="oh-articles-hub__section-title">إجراءات سريعة</h3>
            <div className="oh-articles-hub__quick" data-testid="articles-hub-quick-actions">
              <button type="button" className="oh-articles-hub__quick-btn" disabled={opsDisabled} title={opsTitle} onClick={() => { setShowCreateArticles(true); setTab("inventory"); }}>
                إضافة مقال
                <span>إلى المخزون أو القائمة</span>
              </button>
              <button type="button" className="oh-articles-hub__quick-btn" disabled={opsDisabled} title={opsTitle} onClick={() => setManualOpen(true)}>
                نشر يدوي
                <span>اختيار من المخزون</span>
              </button>
              <button type="button" className="oh-articles-hub__quick-btn" disabled={opsDisabled} title={opsTitle} onClick={() => setFundModal("deposit")}>
                إضافة رصيد
                <span>تمويل الصندوق</span>
              </button>
              <button type="button" className="oh-articles-hub__quick-btn" disabled={opsDisabled} title={opsTitle} onClick={() => setFundModal("withdraw")}>
                خصم رصيد
                <span>سحب من الصندوق</span>
              </button>
              <button type="button" className="oh-articles-hub__quick-btn" disabled={opsDisabled} title={opsTitle} onClick={() => setTab("inventory")}>
                فتح المخزون
                <span>إدارة الجاهز للنشر</span>
              </button>
              <button type="button" className="oh-articles-hub__quick-btn" disabled={opsDisabled} title={opsTitle} onClick={() => setTab("released")}>
                متابعة المقالات
                <span>منزلة ومتقدمون</span>
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !error && activeTab === "released" ? (
          <div data-testid="articles-hub-panel-released" className="oh-articles-hub__grid">
            <p className="oh-articles-hub__helper">المقالات الظاهرة للمستقلين حاليًا — مع المتقدمين والمراجعة.</p>
            {liveItems.length === 0 ? (
              <div className="oh-articles-hub__empty">لا توجد مقالات منزلة حاليًا.</div>
            ) : (
              liveItems.map((item) => (
                <div key={item.articleId} className="oh-articles-hub__card" data-testid={`articles-released-row-${item.articleId}`}>
                  <h4 className="oh-articles-hub__card-title">{item.title}</h4>
                  <div className="oh-articles-hub__meta">
                    <span className="oh-articles-hub__chip oh-articles-hub__chip--blue">{item.planTierCode || "—"}</span>
                    <span className="oh-articles-hub__chip">القيمة {item.totalArticleValueJod ?? "—"} JOD</span>
                    <span className="oh-articles-hub__chip">حصة المستقل {item.freelancerShareJod ?? "—"} JOD</span>
                    <span className="oh-articles-hub__chip oh-articles-hub__chip--teal">
                      متقدمون {item.currentApplicationsCount ?? 0} / {item.requiredBidders ?? "—"}
                    </span>
                    {liveStatusChips(item).map((c) => (
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
                      {expandedArticleId === item.articleId ? "إخفاء المتقدمين" : "عرض المتقدمين"}
                    </button>
                    <a href={`#article-${item.articleId}`}>التفاصيل</a>
                  </div>
                  {expandedArticleId === item.articleId ? (
                    <div className="oh-articles-hub__applicants" data-testid="articles-released-applicants">
                      <MarketplaceArticleApplicationsPanel
                        articleId={item.articleId}
                        isEn={false}
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
            <div className="oh-articles-hub__actions" style={{ marginBottom: 10 }}>
              <button type="button" className="primary" onClick={() => setShowCreateArticles((v) => !v)}>
                إضافة مقال
              </button>
              <input
                placeholder="بحث في المخزون"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                data-testid="articles-inventory-search"
              />
            </div>
            <form onSubmit={onCreateInventory} className="oh-articles-hub__card" data-testid="articles-inventory-add-form" style={{ marginBottom: 12 }}>
              <h3 className="oh-articles-hub__section-title">إضافة إلى المخزون</h3>
              <div className="oh-articles-hub__grid">
                <label>
                  العنوان
                  <input
                    required
                    value={invForm.title}
                    onChange={(e) => setInvForm({ ...invForm, title: e.target.value })}
                  />
                </label>
                <label>
                  الخطة المستهدفة
                  <select
                    value={invForm.planTierCode}
                    onChange={(e) => setInvForm({ ...invForm, planTierCode: e.target.value })}
                  >
                    {FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.labelAr}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="oh-articles-hub__actions">
                <button type="submit" className="primary" disabled={busy || opsDisabled} title={opsTitle}>
                  حفظ في المخزون
                </button>
              </div>
            </form>
            {showCreateArticles ? (
              <div data-testid="articles-marketplace-create-panel" style={{ marginBottom: 12 }}>
                <MarketplaceArticlesAdminPanel />
              </div>
            ) : null}
            <div className="oh-articles-hub__grid">
              {filteredInventory.length === 0 ? (
                <div className="oh-articles-hub__empty">لا توجد عناصر في المخزون.</div>
              ) : (
                filteredInventory.map((item) => (
                  <div key={item.id} className="oh-articles-hub__card" data-testid={`articles-inventory-card-${item.id}`}>
                    <h4 className="oh-articles-hub__card-title">{item.title}</h4>
                    <div className="oh-articles-hub__meta">
                      <span className="oh-articles-hub__chip">{inventoryStatusAr(item.status)}</span>
                      <span className="oh-articles-hub__chip oh-articles-hub__chip--blue">{item.planTierCode}</span>
                      <span className="oh-articles-hub__chip">مرات النشر: {item.releasedCount ?? 0}</span>
                      <span className="oh-articles-hub__chip">
                        {item.releaseStrategy === "reusable" ? "قابل لإعادة الاستخدام" : "مرة واحدة"}
                      </span>
                    </div>
                    <div className="oh-articles-hub__actions">
                      {item.status === "draft" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void patchSuperAdminActivationArticleInventoryRequest(item.id, { status: "ready" }).then(load)
                          }
                        >
                          تجهيز
                        </button>
                      ) : null}
                      {item.status === "ready" || item.status === "released" ? (
                        <button
                          type="button"
                          className="primary"
                          disabled={busy}
                          onClick={() => void releaseSuperAdminActivationArticleInventoryRequest(item.id).then(load)}
                        >
                          نشر يدوي
                        </button>
                      ) : null}
                      {item.status !== "archived" ? (
                        <button
                          type="button"
                          disabled={busy}
                          data-testid={`articles-inventory-archive-${item.id}`}
                          onClick={() => void onArchiveInventory(item)}
                          title="إخفاء من المخزون"
                        >
                          أرشفة
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {!loading && !error && activeTab === "funding" ? (
          <div data-testid="articles-hub-panel-funding">
            <div className="oh-articles-hub__fund-hero" data-testid="articles-fund-hero">
              <button
                type="button"
                className="oh-articles-hub__fund-btn oh-articles-hub__fund-btn--minus"
                aria-label="خصم رصيد"
                onClick={() => setFundModal("withdraw")}
              >
                −
              </button>
              <div className="oh-articles-hub__fund-amount">
                <span>الرصيد الحالي</span>
                <strong>{fund?.currentBalanceJod ?? "0.000"} JOD</strong>
              </div>
              <button
                type="button"
                className="oh-articles-hub__fund-btn oh-articles-hub__fund-btn--plus"
                aria-label="إضافة رصيد"
                onClick={() => setFundModal("deposit")}
              >
                +
              </button>
            </div>

            <h3 className="oh-articles-hub__section-title">وضع النشر</h3>
            <div className="oh-articles-hub__segment" data-testid="articles-publish-mode">
              <button
                type="button"
                className={publishMode === "auto" ? "active" : ""}
                onClick={() => setPublishMode("auto")}
              >
                تلقائي
              </button>
              <button
                type="button"
                className={publishMode === "manual" ? "active" : ""}
                onClick={() => setPublishMode("manual")}
              >
                يدوي
              </button>
            </div>
            {publishMode === "auto" ? (
              <div className="oh-articles-hub__card" style={{ marginBottom: 12 }} data-testid="articles-auto-release-card">
                <p className="oh-articles-hub__helper" data-testid="articles-auto-release-supported">
                  الإنزال التلقائي مدعوم فعلًا على الخادم: يوميًا، يوم بعد يوم، كل 3 أيام، أو كل N أيام (حتى 30).
                  التشغيل اليدوي من هنا يتجاوز جدول الأيام. لا يوجد تشغيل مجدول تلقائي في هذه المرحلة — المعاينة والتشغيل اليدوي فقط.
                </p>
                <label data-testid="articles-release-interval">
                  تكرار الإنزال التلقائي
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
                    <option value="custom">كل N أيام…</option>
                  </select>
                </label>
                {![1, 2, 3].includes(releaseIntervalDays) || customInterval !== "" ? (
                  <label>
                    عدد الأيام (1–30)
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
                <p className="oh-articles-hub__helper">الجدولة الحالية: {intervalLabelAr(effectiveIntervalDays)}. احفظ التوزيع لتطبيق الفترة.</p>
                <label>
                  عند نفاد المخزون
                  <select value={recycleMode ? "recycle" : "stop"} onChange={(e) => setRecycleMode(e.target.value === "recycle")}>
                    <option value="recycle">إعادة من البداية</option>
                    <option value="stop">التوقف</option>
                  </select>
                </label>
                <div className="oh-articles-hub__actions">
                  <button type="button" disabled={busy || opsDisabled} title={opsTitle} onClick={() => void onPreviewRelease()} data-testid="articles-release-preview-btn">
                    معاينة الإنزال
                  </button>
                  <button type="button" className="primary" disabled={busy || opsDisabled} onClick={() => void onRunAutoRelease()} title={opsDisabled ? opsTitle : "يعمل بغض النظر عن يوم الجدولة"}>
                    تشغيل إنزال الآن
                  </button>
                </div>
                {releasePreview ? (
                  <div className="oh-articles-hub__helper" data-testid="articles-release-preview" style={{ marginTop: 8 }}>
                    {(releasePreview.allocations || []).map((p) => (
                      <div key={p.allocationId || p.planTierCode}>
                        {p.planTierCode}:{" "}
                        {p.skipReason === "not_release_day"
                          ? p.messageAr || "ليس يوم إنزال حسب الجدولة الحالية."
                          : p.skipped
                            ? `متجاوَز (${p.skipReason || "—"})`
                            : `مخطط ${p.plannedCount || 0} مقال`}
                      </div>
                    ))}
                    {(releasePreview.allocations || []).some((p) => p.skipReason === "not_release_day") ? (
                      <strong data-testid="articles-not-release-day-msg">ليس يوم إنزال حسب الجدولة الحالية.</strong>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="oh-articles-hub__actions" style={{ marginBottom: 12 }}>
                <button type="button" className="primary" disabled={opsDisabled} title={opsTitle} onClick={() => setManualOpen(true)}>
                  نشر يدوي
                </button>
              </div>
            )}

            <h3 className="oh-articles-hub__section-title">أساس التوزيع</h3>
            <div className="oh-articles-hub__segment" data-testid="articles-dist-basis">
              <button type="button" className={distBasis === "amount" ? "active" : ""} onClick={() => setDistBasis("amount")}>
                بالمبلغ (دينار)
              </button>
              <button type="button" className={distBasis === "count" ? "active" : ""} onClick={() => setDistBasis("count")}>
                بعدد المقالات
              </button>
            </div>

            <h3 className="oh-articles-hub__section-title">توزيع الخطط</h3>
            <p className="oh-articles-hub__helper">حدّد قيمة المقال والحصص لكل خطة. يجب أن يساوي مجموع الحصص قيمة المقال.</p>
            <form onSubmit={onSaveAllocation} className="oh-articles-hub__card" data-testid="articles-alloc-form">
              <div className="oh-articles-hub__grid">
                <label>
                  الخطة
                  <select
                    value={allocForm.planTierCode}
                    onChange={(e) => {
                      const tier = e.target.value;
                      setAllocForm({ ...allocForm, planTierCode: tier, ...defaultSplitForTier(tier) });
                    }}
                  >
                    {FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.labelAr}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  قيمة المقال
                  <input
                    value={allocForm.totalArticleValueJod}
                    onChange={(e) => setAllocForm({ ...allocForm, totalArticleValueJod: e.target.value })}
                  />
                </label>
                <label>
                  حصة المستقل
                  <input
                    value={allocForm.freelancerShareJod}
                    onChange={(e) => setAllocForm({ ...allocForm, freelancerShareJod: e.target.value })}
                  />
                </label>
                <label>
                  حصة التدقيق
                  <input
                    value={allocForm.reviewerShareJod}
                    onChange={(e) => setAllocForm({ ...allocForm, reviewerShareJod: e.target.value })}
                  />
                </label>
                <label>
                  حصة المنصة
                  <input
                    value={allocForm.companyShareJod}
                    onChange={(e) => setAllocForm({ ...allocForm, companyShareJod: e.target.value })}
                  />
                </label>
                {distBasis === "amount" ? (
                  <label>
                    الحد اليومي بالدينار
                    <input
                      value={allocForm.dailyBudgetJod}
                      onChange={(e) => setAllocForm({ ...allocForm, dailyBudgetJod: e.target.value })}
                    />
                  </label>
                ) : (
                  <label>
                    الحد اليومي بعدد المقالات
                    <input
                      type="number"
                      value={allocForm.maxDailyArticles}
                      onChange={(e) => setAllocForm({ ...allocForm, maxDailyArticles: Number(e.target.value) })}
                    />
                  </label>
                )}
                <label>
                  عدد المتقدمين المطلوب
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
                  حفظ التوزيع
                </button>
              </div>
            </form>

            <div className="oh-articles-hub__table-wrap" style={{ marginTop: 12 }} data-testid="articles-alloc-table">
              <table>
                <thead>
                  <tr>
                    <th>الخطة</th>
                    <th>قيمة المقال</th>
                    <th>المستقل</th>
                    <th>التدقيق</th>
                    <th>المنصة</th>
                    <th>حد يومي دينار</th>
                    <th>حد يومي عدد</th>
                    <th>متقدمون</th>
                    <th>وضع النشر</th>
                    <th>تكرار الإنزال</th>
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
                      <td>{a.releaseMode === "daily_auto" ? "تلقائي" : "يدوي"}</td>
                      <td>{intervalLabelAr(a.releaseIntervalDays || 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="oh-articles-hub__helper" style={{ marginTop: 10 }}>
              ينخفض رصيد الصندوق تلقائيًا عند نشر/إنزال المقالات حسب قيمتها عبر منطق الخادم الحالي — لا تُحسب القيم محليًا.
            </p>
          </div>
        ) : null}
      </div>

      <ManualPublishModal
        open={manualOpen}
        inventory={inventory}
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
