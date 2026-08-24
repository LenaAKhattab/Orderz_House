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
import "../../pages/dashboard/super-admin-article-management.css";

const emptyInventory = {
  title: "",
  planTierCode: "starter",
  description: "",
  status: "ready",
  visibilityDurationHours: 24,
  minimumBiddersPerArticle: 10,
};

function fundEntryTypeAr(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("deposit") || t === "credit") return "إيداع";
  if (t.includes("withdraw") || t === "debit") return "سحب";
  return type || "—";
}

function inventoryStatusAr(status) {
  switch (String(status || "").toLowerCase()) {
    case "draft":
      return "مسودة";
    case "ready":
      return "جاهز";
    case "released":
      return "منزّل";
    default:
      return status || "—";
  }
}

function releaseModeAr(mode) {
  switch (String(mode || "").toLowerCase()) {
    case "manual":
      return "يدوي";
    case "auto":
    case "automatic":
      return "تلقائي";
    default:
      return mode || "—";
  }
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
      setError(getSafeApiErrorMessage(err) || "تعذر تحميل تشغيل المقالات.");
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
        minimumBiddersPerArticle: Number(invForm.minimumBiddersPerArticle) || 10,
        visibilityDurationHours: Number(invForm.visibilityDurationHours) || 24,
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

  const articleDetailHref = (articleId) =>
    `/dashboard/super-admin/article-management?tab=articles&edit=${articleId}`;

  return (
    <div data-testid="activation-article-ops-panel" className="grid gap-4">
      {!hideTabBar ? (
        <div className="flex flex-wrap gap-2" data-testid="activation-ops-tabs">
          {[
            { id: "fund", label: "صندوق المقالات" },
            { id: "alloc", label: "توزيع الخطط" },
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
      ) : null}
      {error ? <p data-testid="activation-ops-error">{error}</p> : null}

      {tab === "fund" ? (
        <div data-testid="activation-fund-tab" className="grid gap-3 max-w-2xl">
          <p className="oh-am-helper">أضف أو اسحب رصيد تمويل مقالات التفعيل لهذه الحملة.</p>
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
            <h3>آخر العمليات</h3>
            <ul>
              {(fund?.recentEntries || []).map((e) => (
                <li key={e.id}>
                  {fundEntryTypeAr(e.entryType)}: {e.amountJod} JOD
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "alloc" ? (
        <div data-testid="activation-alloc-tab" className="grid gap-3 max-w-4xl">
          <p className="oh-am-helper">حدّد قيمة المقال وعدد المقالات اليومية لكل خطة.</p>
          <form onSubmit={onSaveAllocation} data-testid="activation-alloc-form" className="grid gap-2">
            <label>
              الخطة
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
              حصة المستقل
              <input
                value={allocForm.freelancerShareJod}
                onChange={(e) => setAllocForm({ ...allocForm, freelancerShareJod: e.target.value })}
              />
            </label>
            <label>
              حصة المنصة
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
            <label>
              عدد المتقدمين المطلوب
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
              تكرار إنزال المقالات
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
              <span className="oh-am-helper">
                يحدد كل كم يوم يتم إنزال دفعة جديدة من المقالات.
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(allocForm.autoAssignEnabled)}
                onChange={(e) =>
                  setAllocForm({ ...allocForm, autoAssignEnabled: e.target.checked })
                }
              />{" "}
              تفعيل التوزيع التلقائي
            </label>
            <details className="oh-am-advanced">
              <summary>إعدادات متقدمة</summary>
              <div className="grid gap-2 mt-2">
                <label>
                  وضع الإنزال
                  <select
                    value={allocForm.releaseMode}
                    onChange={(e) => setAllocForm({ ...allocForm, releaseMode: e.target.value })}
                  >
                    <option value="manual">يدوي</option>
                    <option value="auto">تلقائي</option>
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
                  إعادة التدوير عند نفاد المخزون
                </label>
              </div>
            </details>
            {allocError ? <p data-testid="activation-alloc-error">{allocError}</p> : null}
            <button type="submit" disabled={busy}>
              حفظ توزيع الخطة
            </button>
          </form>
          <table data-testid="activation-alloc-table">
            <thead>
              <tr>
                <th>الخطة</th>
                <th>الحد اليومي بالدينار</th>
                <th>الحد اليومي بعدد المقالات</th>
                <th>إجمالي قيمة المقال</th>
                <th>حصة المستقل</th>
                <th>حصة التدقيق</th>
                <th>حصة المنصة</th>
                <th>عدد المتقدمين المطلوب</th>
                <th>تكرار الإنزال (يوم)</th>
                <th>تفعيل التوزيع التلقائي</th>
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
                  <td>{a.autoAssignEnabled ? "نعم" : "لا"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "inventory" ? (
        <div data-testid="activation-inventory-tab" className="grid gap-3 max-w-2xl">
          <p className="oh-am-helper">ضع هنا المقالات الجاهزة ليتم إنزالها لاحقاً للمستقلين.</p>
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
            <label>
              عدد المتقدمين المطلوب
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
              مدة ظهور المقال للمستقلين
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
              <span className="oh-am-helper">
                إذا لم يحصل المقال على عدد العروض المطلوب خلال هذه المدة، يُغلق المقال
                وتُعاد العروض للمستقلين ويعود المقال لجولة لاحقة.
              </span>
            </label>
            {invError ? <p data-testid="activation-inventory-error">{invError}</p> : null}
            <button type="submit" disabled={busy}>
              إضافة مقال للمخزن
            </button>
          </form>
          <ul data-testid="activation-inventory-list">
            {inventory.map((item) => (
              <li key={item.id}>
                {item.title} · {item.planTierCode} · {inventoryStatusAr(item.status)} · إنزال{" "}
                {item.releasedCount}
                {item.visibilityDurationHours != null
                  ? ` · ظهور ${item.visibilityDurationHours} ساعة`
                  : ""}
                {item.status === "draft" ? (
                  <button type="button" onClick={() => void onMarkReady(item.id)} disabled={busy}>
                    جاهز للإنزال
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
            ملاحظة: الإسناد التلقائي للفائز يُدار من تبويب المتابعة عند تفعيله للخطة.
          </p>
        </div>
      ) : null}

      {tab === "release" ? (
        <div data-testid="activation-release-tab" className="grid gap-3 max-w-3xl">
          <p className="oh-am-helper">استخدم هذه الصفحة لإنزال مقالات من المخزن حسب التوزيع المحدد.</p>
          <label>
            الخطة
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
            <div data-testid="activation-release-preview-json" className="oh-am-advanced">
              <p>
                المتوقع: {releasePreview.plannedCount ?? "—"} مقال · قيمة{" "}
                {releasePreview.plannedValueJod ?? "—"} JOD · رصيد الصندوق{" "}
                {releasePreview.fundBalanceJod ?? "—"} JOD
              </p>
            </div>
          ) : null}
          <div data-testid="activation-release-runs">
            <h3>آخر عمليات الإنزال</h3>
            <ul>
              {releaseRuns.map((r) => (
                <li key={r.id} data-testid={`activation-release-run-${r.id}`}>
                  {r.runDate} · {releaseModeAr(r.runType)} · {r.status} · {r.releasedCount} مقال ·{" "}
                  {r.totalReservedValueJod} JOD
                </li>
              ))}
            </ul>
          </div>
          <p data-testid="activation-release-no-auto-assign">
            الإنزال من هذا التبويب لا يختار فائزًا تلقائيًا — استخدم المتابعة عند الحاجة.
          </p>
        </div>
      ) : null}

      {tab === "monitor" ? (
        <div data-testid="activation-monitor-tab" className="grid gap-3">
          <p className="oh-am-helper">تابع المقالات التي ظهرت للمستقلين وحالة التقديم والتوزيع.</p>
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
              الخطة
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
                  {item.reviewStatus || "—"} · نشر Bildazo: {item.bildazoPublishStatus || "—"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    data-testid="activation-monitor-open-article"
                    href={articleDetailHref(item.articleId)}
                  >
                    فتح التفاصيل
                  </a>
                  <a
                    data-testid="activation-monitor-view-apps"
                    href={articleDetailHref(item.articleId)}
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
