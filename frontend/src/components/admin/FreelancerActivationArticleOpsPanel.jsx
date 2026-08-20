import { useCallback, useEffect, useMemo, useState } from "react";
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

const emptyInventory = {
  title: "",
  planTierCode: "starter",
  description: "",
  status: "ready",
};

export default function FreelancerActivationArticleOpsPanel({ campaignId }) {
  const [tab, setTab] = useState("fund");
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
      setError(getSafeApiErrorMessage(err) || "تعذر تحميل تشغيل المقالات.");
    }
  }, [campaignId, liveFilter.planTierCode, liveFilter.autoAssignStatus, liveFilter.search]);

  useEffect(() => {
    void load();
  }, [load]);

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
        اختر حملة لعرض صندوق المقالات والتوزيع والمخزن.
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
      setError(getSafeApiErrorMessage(err) || "تعذر الإيداع.");
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
      setError(getSafeApiErrorMessage(err) || "تعذر السحب.");
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
      setAllocError("يجب أن يساوي مجموع الحصص إجمالي قيمة المقال.");
      return;
    }
    setBusy(true);
    try {
      await createSuperAdminActivationPlanAllocationRequest(campaignId, allocForm);
      await load();
    } catch (err) {
      setAllocError(getSafeApiErrorMessage(err) || "تعذر حفظ التوزيع.");
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
        minimumBiddersPerArticle: 10,
      });
      setInvForm(emptyInventory);
      await load();
    } catch (err) {
      setInvError(getSafeApiErrorMessage(err) || "تعذر إضافة المقال للمخزن.");
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
      setError(getSafeApiErrorMessage(err) || "تعذر التحديث.");
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
      setError(getSafeApiErrorMessage(err) || "تعذر إنزال المقال.");
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
      setReleaseError(getSafeApiErrorMessage(err) || "تعذر معاينة الإنزال.");
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
      setReleaseError(getSafeApiErrorMessage(err) || "تعذر تشغيل الإنزال.");
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
        setLiveActionMsg("تم الإسناد تلقائيًا بنجاح.");
      } else {
        setLiveActionMsg(
          `تخطي/فشل: ${res?.data?.run?.skipReason || res?.data?.run?.errorCode || "غير معروف"}`,
        );
      }
      await load();
    } catch (err) {
      setLiveError(getSafeApiErrorMessage(err) || "تعذر تشغيل التوزيع التلقائي.");
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
      setLiveActionMsg("تم إنزال مقال آخر من نفس عنصر المخزن (بدون إسناد تلقائي إضافي من هذه الواجهة).");
      await load();
    } catch (err) {
      setLiveError(getSafeApiErrorMessage(err) || "تعذر إنزال مقال آخر من المخزن.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="activation-article-ops-panel" className="grid gap-4">
      <div className="flex flex-wrap gap-2" data-testid="activation-ops-tabs">
        {[
          { id: "fund", label: "صندوق المقالات" },
          { id: "alloc", label: "توزيع الخطط اليومي" },
          { id: "inventory", label: "مخزن المقالات" },
          { id: "release", label: "إنزال المقالات" },
          { id: "monitor", label: "متابعة المقالات" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`activation-ops-tab-${t.id}`}
            className="oh-account-btn-primary"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error ? <p data-testid="activation-ops-error">{error}</p> : null}

      {tab === "fund" ? (
        <div data-testid="activation-fund-tab" className="grid gap-3 max-w-2xl">
          <p data-testid="activation-fund-balance">
            الرصيد الحالي: {fund?.currentBalanceJod ?? "0.000"} JOD
          </p>
          <p>
            إيداعات {fund?.totalDepositsJod ?? "0.000"} · سحوبات {fund?.totalWithdrawalsJod ?? "0.000"}
          </p>
          <form onSubmit={onDeposit} data-testid="activation-fund-deposit-form" className="grid gap-2">
            <label>
              إضافة رصيد
              <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
            </label>
            <button type="submit" disabled={busy}>
              إضافة رصيد
            </button>
          </form>
          <form onSubmit={onWithdraw} data-testid="activation-fund-withdraw-form" className="grid gap-2">
            <label>
              سحب من الصندوق
              <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
            </label>
            <button type="submit" disabled={busy}>
              سحب من الصندوق
            </button>
          </form>
          <div data-testid="activation-fund-ledger">
            <h3>سجل العمليات</h3>
            <ul>
              {(fund?.recentEntries || []).map((e) => (
                <li key={e.id}>
                  {e.entryType}: {e.amountJod} JOD
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "alloc" ? (
        <div data-testid="activation-alloc-tab" className="grid gap-3 max-w-3xl">
          <form onSubmit={onSaveAllocation} data-testid="activation-alloc-form" className="grid gap-2">
            <label>
              الباقة
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
                    {o.labelAr}
                  </option>
                ))}
              </select>
            </label>
            <label>
              إجمالي قيمة المقال
              <input
                value={allocForm.totalArticleValueJod}
                onChange={(e) => setAllocForm({ ...allocForm, totalArticleValueJod: e.target.value })}
              />
            </label>
            <label>
              حصة الفريلانسر
              <input
                value={allocForm.freelancerShareJod}
                onChange={(e) => setAllocForm({ ...allocForm, freelancerShareJod: e.target.value })}
              />
            </label>
            <label>
              حصة الشركة
              <input
                value={allocForm.companyShareJod}
                onChange={(e) => setAllocForm({ ...allocForm, companyShareJod: e.target.value })}
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
              الحد اليومي بالدينار
              <input
                value={allocForm.dailyBudgetJod}
                onChange={(e) => setAllocForm({ ...allocForm, dailyBudgetJod: e.target.value })}
              />
            </label>
            <label>
              الحد اليومي بعدد المقالات
              <input
                type="number"
                value={allocForm.maxDailyArticles}
                onChange={(e) =>
                  setAllocForm({ ...allocForm, maxDailyArticles: Number(e.target.value) })
                }
              />
            </label>
            {allocError ? <p data-testid="activation-alloc-error">{allocError}</p> : null}
            <button type="submit" disabled={busy}>
              حفظ توزيع الخطة
            </button>
          </form>
          <table data-testid="activation-alloc-table">
            <thead>
              <tr>
                <th>الباقة</th>
                <th>إجمالي قيمة المقال</th>
                <th>حصة الفريلانسر</th>
                <th>حصة الشركة</th>
                <th>حصة التدقيق</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id}>
                  <td>{a.planTierCode}</td>
                  <td>{a.totalArticleValueJod}</td>
                  <td>{a.freelancerShareJod}</td>
                  <td>{a.companyShareJod}</td>
                  <td>{a.reviewerShareJod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "inventory" ? (
        <div data-testid="activation-inventory-tab" className="grid gap-3 max-w-2xl">
          <form onSubmit={onCreateInventory} data-testid="activation-inventory-form" className="grid gap-2">
            <label>
              إضافة مقال للمخزن
              <input
                required
                value={invForm.title}
                onChange={(e) => setInvForm({ ...invForm, title: e.target.value })}
              />
            </label>
            <label>
              الباقة المستهدفة
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
            {invError ? <p data-testid="activation-inventory-error">{invError}</p> : null}
            <button type="submit" disabled={busy}>
              إضافة مقال للمخزن
            </button>
          </form>
          <ul data-testid="activation-inventory-list">
            {inventory.map((item) => (
              <li key={item.id}>
                {item.title} · {item.planTierCode} · {item.status} · إنزال {item.releasedCount}
                {item.status === "draft" ? (
                  <button type="button" onClick={() => void onMarkReady(item.id)} disabled={busy}>
                    جاهز للنشر
                  </button>
                ) : null}
                {item.status === "ready" || item.status === "released" ? (
                  <button
                    type="button"
                    data-testid={`activation-inventory-release-${item.id}`}
                    onClick={() => void onRelease(item.id)}
                    disabled={busy}
                  >
                    إنزال مقال
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <p data-testid="activation-no-auto-assign-note">
            لا يوجد تعيين فائز تلقائي في هذه المرحلة (A9.1 / A9.2).
          </p>
        </div>
      ) : null}

      {tab === "release" ? (
        <div data-testid="activation-release-tab" className="grid gap-3 max-w-3xl">
          <label>
            الباقة
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
                  {o.labelAr}
                </option>
              ))}
            </select>
          </label>
          <div data-testid="activation-release-stats" className="grid gap-1">
            <p>الميزانية اليومية: {releaseStats.alloc?.dailyBudgetJod ?? "—"} JOD</p>
            <p>الحد اليومي بعدد المقالات: {releaseStats.alloc?.maxDailyArticles ?? "—"}</p>
            <p data-testid="activation-release-fund">
              الرصيد المتاح في الصندوق: {fund?.currentBalanceJod ?? "0.000"} JOD
            </p>
            <p data-testid="activation-release-ready-count">المخزون الجاهز: {releaseStats.ready}</p>
            <p data-testid="activation-release-reusable-count">
              المخزون القابل لإعادة التدوير: {releaseStats.reusable}
            </p>
            <p>إعادة التدوير مفعّلة: {releaseStats.alloc?.recycleWhenInventoryEmpty ? "نعم" : "لا"}</p>
            <p data-testid="activation-release-planned-count">
              عدد المقالات المتوقع إنزالها:{" "}
              {releaseStats.plannedCount != null ? releaseStats.plannedCount : "—"}
            </p>
            {releaseStats.capacity ? (
              <p data-testid="activation-release-already-today">
                تم إنزال اليوم: {releaseStats.capacity.alreadyReleasedToday ?? 0}
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
              معاينة الإنزال
            </button>
            <button
              type="button"
              data-testid="activation-release-run-btn"
              onClick={() => void onRunRelease()}
              disabled={busy}
            >
              تشغيل الإنزال الآن
            </button>
          </div>
          {releaseError ? <p data-testid="activation-release-error">{releaseError}</p> : null}
          {releasePreview ? (
            <pre data-testid="activation-release-preview-json" className="overflow-auto text-xs">
              {JSON.stringify(
                {
                  plannedCount: releasePreview.plannedCount,
                  plannedValueJod: releasePreview.plannedValueJod,
                  fundBalanceJod: releasePreview.fundBalanceJod,
                  allocations: releasePreview.allocations,
                },
                null,
                2,
              )}
            </pre>
          ) : null}
          <div data-testid="activation-release-runs">
            <h3>سجل عمليات الإنزال</h3>
            <ul>
              {releaseRuns.map((r) => (
                <li key={r.id} data-testid={`activation-release-run-${r.id}`}>
                  {r.runDate} · {r.runType} · {r.status} · {r.releasedCount} مقال ·{" "}
                  {r.totalReservedValueJod} JOD
                </li>
              ))}
            </ul>
          </div>
          <p data-testid="activation-release-no-auto-assign">
            لا يوجد تعيين فائز تلقائي في A9.2 — الإنزال فقط.
          </p>
        </div>
      ) : null}

      {tab === "monitor" ? (
        <div data-testid="activation-monitor-tab" className="grid gap-3">
          <div data-testid="activation-monitor-summary" className="flex flex-wrap gap-3 text-sm">
            <span>المقالات المنزلة: {liveSummary?.totalReleased ?? 0}</span>
            <span>بانتظار المتقدمين: {liveSummary?.waitingForBidders ?? 0}</span>
            <span>جاهزة للتوزيع: {liveSummary?.readyForAssignment ?? 0}</span>
            <span>تم إسنادها تلقائيًا: {liveSummary?.autoAssigned ?? 0}</span>
            <span>قيد التنفيذ: {liveSummary?.submitted ?? 0}</span>
            <span>تحت المراجعة: {liveSummary?.underReview ?? 0}</span>
            <span>مقبولة: {liveSummary?.accepted ?? 0}</span>
            <span>منشورة على Bildazo: {liveSummary?.published ?? 0}</span>
          </div>

          <div data-testid="activation-monitor-filters" className="flex flex-wrap gap-2 items-end">
            <label>
              الباقة
              <select
                value={liveFilter.planTierCode}
                onChange={(e) => setLiveFilter({ ...liveFilter, planTierCode: e.target.value })}
              >
                <option value="">الكل</option>
                {FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.labelAr}
                  </option>
                ))}
              </select>
            </label>
            <label>
              حالة الإسناد
              <select
                value={liveFilter.autoAssignStatus}
                onChange={(e) => setLiveFilter({ ...liveFilter, autoAssignStatus: e.target.value })}
              >
                <option value="">الكل</option>
                <option value="disabled">معطّل</option>
                <option value="waiting_for_bidders">بانتظار المتقدمين</option>
                <option value="ready">جاهز للتوزيع</option>
                <option value="completed">تم الإسناد تلقائيًا</option>
                <option value="skipped">متخطى</option>
                <option value="failed">فشل</option>
              </select>
            </label>
            <label>
              بحث
              <input
                value={liveFilter.search}
                onChange={(e) => setLiveFilter({ ...liveFilter, search: e.target.value })}
                placeholder="عنوان المقال"
              />
            </label>
            <button type="button" disabled={busy} onClick={() => void load()}>
              تحديث
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
                  {item.planTierCode || "—"} · قيمة {item.totalArticleValueJod ?? "—"} JOD
                </div>
                <div data-testid="activation-monitor-applicants" className="text-sm">
                  عدد المتقدمين: {item.currentApplicationsCount} / العدد المطلوب: {item.requiredBidders}
                </div>
                <div data-testid="activation-monitor-auto-status" className="text-sm">
                  الإسناد:{" "}
                  {item.autoAssignStatus === "waiting_for_bidders"
                    ? "بانتظار المتقدمين"
                    : item.autoAssignStatus === "ready"
                      ? "جاهز للتوزيع"
                      : item.autoAssignStatus === "completed" || item.selectedBySystem
                        ? "تم الإسناد تلقائيًا"
                        : item.autoAssignStatus === "skipped"
                          ? `متخطى (${item.lastAutoAssignmentSkipReason || "—"})`
                          : item.autoAssignStatus === "failed"
                            ? `فشل (${item.lastAutoAssignmentErrorCode || "—"})`
                            : item.autoAssignStatus || "—"}
                </div>
                <div className="text-sm">
                  المختار: {item.selectedFreelancerDisplayName || "—"} · مراجعة:{" "}
                  {item.reviewStatus || "—"} · Bildazo: {item.bildazoPublishStatus || "—"} · ميزانية:{" "}
                  {item.budgetState || "—"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    data-testid="activation-monitor-open-article"
                    href={`/dashboard/super-admin/marketplace-articles?edit=${item.articleId}`}
                  >
                    فتح التفاصيل
                  </a>
                  <a
                    data-testid="activation-monitor-view-apps"
                    href={`/dashboard/super-admin/marketplace-articles?edit=${item.articleId}`}
                  >
                    عرض المتقدمين
                  </a>
                  {item.actions?.canRunAutoAssignment ? (
                    <button
                      type="button"
                      data-testid={`activation-monitor-run-auto-${item.articleId}`}
                      disabled={busy}
                      onClick={() => void onLiveRunAutoAssign(item.articleId)}
                    >
                      تشغيل التوزيع الآن
                    </button>
                  ) : null}
                  {item.actions?.canReleaseAnotherFromInventory ? (
                    <button
                      type="button"
                      data-testid={`activation-monitor-release-another-${item.articleId}`}
                      disabled={busy}
                      onClick={() => void onLiveReleaseAnother(item.articleId)}
                    >
                      إنزال آخر من المخزن
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {!liveItems.length ? (
            <p data-testid="activation-monitor-empty">لا توجد مقالات منزلة ضمن الفلاتر الحالية.</p>
          ) : null}
          <p data-testid="activation-monitor-privacy-note" className="text-xs opacity-70">
            هذه المتابعة للمشرف فقط — لا تُعرض للمستقلين أوزان أو أرصدة الصندوق أو إجراءات الإدارة.
          </p>
        </div>
      ) : null}
    </div>
  );
}
