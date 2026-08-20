import { useCallback, useEffect, useState } from "react";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  getSuperAdminFreelancerActivationSettingsRequest,
  getSuperAdminFreelancerActivationEarnedBalanceRequest,
  getSuperAdminFreelancerActivationTrialsRequest,
  getSuperAdminWorkInventoryReserveRequest,
  listSuperAdminActivationCampaignsRequest,
  createSuperAdminActivationCampaignRequest,
  getSuperAdminActivationCampaignRequest,
  pauseSuperAdminActivationCampaignRequest,
  resumeSuperAdminActivationCampaignRequest,
  emergencyStopSuperAdminActivationCampaignRequest,
  createSuperAdminActivationWaveRequest,
  updateSuperAdminFreelancerActivationSettingsRequest,
} from "../../services/api";
import { sharesSumToTotal } from "../../constants/freelancerActivationCampaign";
import FreelancerActivationKpiDashboard from "../../components/admin/FreelancerActivationKpiDashboard";
import FreelancerActivationArticleOpsPanel from "../../components/admin/FreelancerActivationArticleOpsPanel";

const emptyCampaignForm = {
  name: "",
  totalBudgetJod: "0.000",
  articleTotalValueJod: "1.000",
  freelancerShareJod: "0.500",
  companyShareJod: "0.300",
  reviewerShareJod: "0.200",
};

const emptyWaveForm = {
  name: "",
  budgetJod: "0.000",
};

export default function SuperAdminFreelancerActivationPage() {
  const [settings, setSettings] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [earnedBalance, setEarnedBalance] = useState(null);
  const [conversion, setConversion] = useState(null);
  const [workInventoryReserve, setWorkInventoryReserve] = useState(null);
  const [wirSaving, setWirSaving] = useState(false);
  const [wirFormError, setWirFormError] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyCampaignForm);
  const [formError, setFormError] = useState("");
  const [waveForm, setWaveForm] = useState(emptyWaveForm);
  const [waveError, setWaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [settingsRes, listRes, earnedRes, trialsRes, wirRes] = await Promise.all([
        getSuperAdminFreelancerActivationSettingsRequest(),
        listSuperAdminActivationCampaignsRequest(),
        getSuperAdminFreelancerActivationEarnedBalanceRequest().catch(() => null),
        getSuperAdminFreelancerActivationTrialsRequest().catch(() => null),
        getSuperAdminWorkInventoryReserveRequest().catch(() => null),
      ]);
      setSettings(settingsRes?.data?.settings || null);
      setCampaigns(listRes?.data?.campaigns || []);
      setEarnedBalance(earnedRes?.data || null);
      setConversion(trialsRes?.data?.conversion || null);
      setWorkInventoryReserve(wirRes?.data || null);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || "تعذر تحميل حملات التفعيل.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function openCampaign(id) {
    try {
      const res = await getSuperAdminActivationCampaignRequest(id);
      setDetail(res?.data || null);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || "تعذر تحميل الحملة.");
    }
  }

  async function onCreateCampaign(e) {
    e.preventDefault();
    setFormError("");
    if (Number(form.totalBudgetJod) < 0) {
      setFormError("الميزانية لا يمكن أن تكون سالبة.");
      return;
    }
    if (!sharesSumToTotal(form.articleTotalValueJod, form.freelancerShareJod, form.companyShareJod, form.reviewerShareJod)) {
      setFormError("يجب أن يساوي مجموع الحصص قيمة المقال.");
      return;
    }
    setSaving(true);
    try {
      const res = await createSuperAdminActivationCampaignRequest(form);
      setForm(emptyCampaignForm);
      await loadList();
      if (res?.data?.campaign?.id) await openCampaign(res.data.campaign.id);
    } catch (err) {
      setFormError(getSafeApiErrorMessage(err) || "تعذر إنشاء الحملة.");
    } finally {
      setSaving(false);
    }
  }

  async function onCreateWave(e) {
    e.preventDefault();
    if (!detail?.campaign?.id) return;
    setWaveError("");
    if (Number(waveForm.budgetJod) < 0) {
      setWaveError("ميزانية الموجة لا يمكن أن تكون سالبة.");
      return;
    }
    setSaving(true);
    try {
      await createSuperAdminActivationWaveRequest(detail.campaign.id, waveForm);
      setWaveForm(emptyWaveForm);
      await openCampaign(detail.campaign.id);
      await loadList();
    } catch (err) {
      setWaveError(getSafeApiErrorMessage(err) || "تعذر إنشاء الموجة.");
    } finally {
      setSaving(false);
    }
  }

  async function onEmergencyStop() {
    if (!detail?.campaign?.id) return;
    const ok = window.confirm(
      "Emergency stop blocks new applications and assignment for linked articles. The campaign and active waves are paused. Continue?",
    );
    if (!ok) return;
    setSaving(true);
    try {
      await emergencyStopSuperAdminActivationCampaignRequest(detail.campaign.id);
      await openCampaign(detail.campaign.id);
      await loadList();
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || "تعذر إيقاف الحملة.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveWorkInventorySettings(e) {
    e.preventDefault();
    setWirFormError("");
    const enabled = e.target.workInventoryEnabled?.checked === true;
    const percentage = Number(e.target.workInventoryPercentage?.value);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      setWirFormError("النسبة يجب أن تكون بين 0 و 100.");
      return;
    }
    setWirSaving(true);
    try {
      const res = await updateSuperAdminFreelancerActivationSettingsRequest({
        workInventoryEnabled: enabled,
        workInventoryPercentage: percentage,
      });
      setSettings(res?.data?.settings || null);
      const wirRes = await getSuperAdminWorkInventoryReserveRequest().catch(() => null);
      setWorkInventoryReserve(wirRes?.data || null);
    } catch (err) {
      setWirFormError(getSafeApiErrorMessage(err) || "تعذر حفظ إعدادات احتياطي مخزون العمل.");
    } finally {
      setWirSaving(false);
    }
  }

  const budget = detail?.budget;

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="Freelancer Activation Engine"
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.freelancerActivation")}
      />
      {loading ? <DashboardLoadingState /> : null}
      {!loading && error ? <DashboardErrorState message={error} onRetry={loadList} /> : null}

      {settings ? (
        <DashboardSection title="Engine settings">
          <p data-testid="activation-settings-snapshot">
            Engine {settings.engineEnabled ? "on" : "off"} · trial {settings.trialDurationDays}d ·
            bids {settings.trialBids} · daily {settings.dailyBidLimit}
          </p>
        </DashboardSection>
      ) : null}

      {earnedBalance ? (
        <DashboardSection title="Earned balance (freelancer share)">
          <p data-testid="admin-earned-balance-summary">
            Pending {earnedBalance.totalPendingJod} JOD · accepted {earnedBalance.totalAcceptedArticles} ·
            published {earnedBalance.totalPublishedArticles}
          </p>
        </DashboardSection>
      ) : null}

      {workInventoryReserve || settings ? (
        <DashboardSection title="Work Inventory Reserve">
          <div data-testid="admin-work-inventory-reserve" className="grid gap-3 max-w-2xl">
            <p data-testid="admin-wir-status">
              Reserve{" "}
              {(workInventoryReserve?.settings?.workInventoryEnabled ?? settings?.workInventoryEnabled)
                ? "enabled"
                : "disabled"}{" "}
              · {workInventoryReserve?.settings?.workInventoryPercentage ??
                settings?.workInventoryPercentage ??
                50}
              %
            </p>
            <p data-testid="admin-wir-totals">
              Total allocated {workInventoryReserve?.totalReserveAllocatedJod ?? "0.000"} JOD · active{" "}
              {workInventoryReserve?.totalReserveActiveJod ?? "0.000"} JOD · reversed{" "}
              {workInventoryReserve?.totalReserveReversedJod ?? "0.000"} JOD
            </p>
            <p data-testid="admin-wir-internal-note" className="text-sm opacity-90">
              هذا سجل داخلي لتخصيص جزء من الاشتراكات لتمويل فرص العمل المستقبلية، ولا يمثل رصيدًا قابلًا
              للسحب.
            </p>
            <form
              onSubmit={onSaveWorkInventorySettings}
              data-testid="admin-wir-settings-form"
              className="grid gap-2"
            >
              <label>
                <input
                  type="checkbox"
                  name="workInventoryEnabled"
                  defaultChecked={Boolean(
                    workInventoryReserve?.settings?.workInventoryEnabled ??
                      settings?.workInventoryEnabled,
                  )}
                />{" "}
                Enable Work Inventory Reserve
              </label>
              <label>
                Reserve percentage (0–100)
                <input
                  name="workInventoryPercentage"
                  type="number"
                  min={0}
                  max={100}
                  step="0.001"
                  defaultValue={
                    workInventoryReserve?.settings?.workInventoryPercentage ??
                    settings?.workInventoryPercentage ??
                    50
                  }
                />
              </label>
              {wirFormError ? <p data-testid="admin-wir-settings-error">{wirFormError}</p> : null}
              <button type="submit" className="oh-account-btn-primary" disabled={wirSaving}>
                Save reserve settings
              </button>
            </form>
            {(workInventoryReserve?.recentEntries || []).length > 0 ? (
              <ul data-testid="admin-wir-recent-entries">
                {workInventoryReserve.recentEntries.slice(0, 10).map((entry) => (
                  <li key={entry.id}>
                    user {entry.freelancerUserId} · {entry.planCode} · {entry.reserveAmountJod} JOD ·{" "}
                    {entry.status}
                  </li>
                ))}
              </ul>
            ) : (
              <p data-testid="admin-wir-empty">No reserve entries yet.</p>
            )}
          </div>
        </DashboardSection>
      ) : null}

      {conversion ? (
        <DashboardSection title="Silver conversion (compact)">
          <p data-testid="admin-conversion-counters">
            CTA shown {conversion.ctaShownCount ?? 0} · payment started{" "}
            {conversion.paymentStartedCount ?? 0} · paid active {conversion.paidActiveCount ?? 0}
            {conversion.trialToSilverRate != null
              ? ` · rate ${conversion.trialToSilverRate}`
              : " · rate —"}
          </p>
        </DashboardSection>
      ) : null}

      {!loading ? (
        <DashboardSection title="مؤشرات محرك التفعيل (KPI)">
          <FreelancerActivationKpiDashboard campaigns={campaigns} />
        </DashboardSection>
      ) : null}

      <DashboardSection title="Create campaign">
        <form onSubmit={onCreateCampaign} data-testid="create-campaign-form" className="grid gap-2 max-w-xl">
          <input
            required
            placeholder="Campaign name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <label>
            Total budget JOD
            <input
              value={form.totalBudgetJod}
              onChange={(e) => setForm({ ...form, totalBudgetJod: e.target.value })}
            />
          </label>
          <label>
            Article value / freelancer / company / reviewer
            <input
              value={form.articleTotalValueJod}
              onChange={(e) => setForm({ ...form, articleTotalValueJod: e.target.value })}
            />
            <input
              value={form.freelancerShareJod}
              onChange={(e) => setForm({ ...form, freelancerShareJod: e.target.value })}
            />
            <input
              value={form.companyShareJod}
              onChange={(e) => setForm({ ...form, companyShareJod: e.target.value })}
            />
            <input
              value={form.reviewerShareJod}
              onChange={(e) => setForm({ ...form, reviewerShareJod: e.target.value })}
            />
          </label>
          {formError ? <p data-testid="create-campaign-error">{formError}</p> : null}
          <button type="submit" className="oh-account-btn-primary" disabled={saving}>
            Create campaign
          </button>
        </form>
      </DashboardSection>

      <DashboardSection title="Campaigns">
        {campaigns.length === 0 ? (
          <DashboardEmptyState title="No campaigns yet" description="Create a campaign to fund trial Mini Articles later." />
        ) : (
          <ul data-testid="activation-campaign-list">
            {campaigns.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => void openCampaign(c.id)}>
                  {c.name} · {c.status} · remaining {c.budget?.remainingBudgetJod}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      {detail?.campaign ? (
        <DashboardSection title="Campaign detail">
          <div data-testid="campaign-detail">
            <p>
              {detail.campaign.name} · {detail.campaign.status}
              {detail.campaign.emergencyStopEnabled ? " · emergency stop" : ""}
            </p>
            <p data-testid="linked-articles-count">
              Linked articles: {detail.linkedArticlesCount ?? 0}
            </p>
            <p data-testid="emergency-stop-copy">
              Emergency stop blocks new applications and assignment for linked Mini Articles. It does not spend budget.
            </p>
            <dl data-testid="campaign-budget-summary">
              <div>Total {budget?.totalBudgetJod}</div>
              <div>Reserved {budget?.reservedBudgetJod}</div>
              <div>Used {budget?.usedBudgetJod}</div>
              <div>Remaining {budget?.remainingBudgetJod}</div>
              <div>Allocated {budget?.allocatedToWavesJod}</div>
              <div>Unallocated {budget?.unallocatedBudgetJod}</div>
            </dl>
            <p data-testid="assigned-articles-count">Assigned articles: {detail.assignedArticleCount ?? 0}</p>
            <p data-testid="accepted-articles-count">Accepted articles: {detail.acceptedArticleCount ?? 0}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void pauseSuperAdminActivationCampaignRequest(detail.campaign.id).then(() => openCampaign(detail.campaign.id))}
              >
                Pause
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void resumeSuperAdminActivationCampaignRequest(detail.campaign.id).then(() => openCampaign(detail.campaign.id))}
              >
                Resume
              </button>
              <button
                type="button"
                data-testid="emergency-stop-button"
                disabled={saving}
                onClick={() => void onEmergencyStop()}
              >
                Emergency stop
              </button>
            </div>
            <div className="mt-4">
              <FreelancerActivationArticleOpsPanel campaignId={detail.campaign.id} />
            </div>
            <h3 className="mt-3">Waves</h3>
            <ul data-testid="activation-wave-list">
              {(detail.waves || []).map((w) => (
                <li key={w.id} data-testid="activation-wave-budget">
                  {w.name} · {w.status} · reserved {w.budget?.reservedBudgetJod} · used {w.budget?.usedBudgetJod} · remaining {w.budget?.remainingBudgetJod}
                </li>
              ))}
            </ul>
            <form onSubmit={onCreateWave} data-testid="create-wave-form" className="mt-2 grid gap-2 max-w-xl">
              <input
                required
                placeholder="Wave name"
                value={waveForm.name}
                onChange={(e) => setWaveForm({ ...waveForm, name: e.target.value })}
              />
              <input
                value={waveForm.budgetJod}
                onChange={(e) => setWaveForm({ ...waveForm, budgetJod: e.target.value })}
              />
              {waveError ? <p>{waveError}</p> : null}
              <button type="submit" disabled={saving}>
                Create wave
              </button>
            </form>
          </div>
        </DashboardSection>
      ) : null}
    </DashboardShell>
  );
}
