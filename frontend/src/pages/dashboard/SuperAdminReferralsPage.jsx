import { useEffect, useState } from "react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import { useTranslation } from "../../i18n/LanguageProvider";
import { formatLocaleDate } from "../../i18n/formatLocale";
import "../../i18n/referralsResources";
import {
  createReferralRewardRequest,
  getReferralOverviewRequest,
  getReferralPolicyHistoryRequest,
  getReferralRelationshipRequest,
  getReferralSettingsRequest,
  getReferralTopRequest,
  listReferralCommissionsRequest,
  listReferralRelationshipsRequest,
  listReferralRewardsRequest,
  listReferralWithdrawalsRequest,
  reviewReferralWithdrawalRequest,
  saveReferralSettingsRequest,
} from "../../services/referralsApi";
import "./superAdminUsersPage.css";

function jod(minor) {
  return (Number(minor || 0) / 1000).toFixed(3);
}

const TABS = ["overview", "referrals", "commissions", "withdrawals", "rewards", "settings"];

export default function SuperAdminReferralsPage() {
  const { t, locale } = useTranslation();
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [top, setTop] = useState([]);
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState(null);
  const [history, setHistory] = useState([]);
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [range, setRange] = useState("30");

  function rangeParams() {
    const to = new Date();
    const from = new Date();
    if (range === "today") from.setHours(0, 0, 0, 0);
    else from.setDate(from.getDate() - Number(range));
    return { from: from.toISOString(), to: to.toISOString() };
  }

  async function load() {
    setLoading(true);
    if (tab === "overview") {
      const [ov, leaders] = await Promise.all([getReferralOverviewRequest(rangeParams()), getReferralTopRequest()]);
      setOverview(ov.data.data);
      setTop(leaders.data.data);
    } else if (tab === "referrals") setRows((await listReferralRelationshipsRequest()).data.data);
    else if (tab === "commissions") setRows((await listReferralCommissionsRequest()).data.data);
    else if (tab === "withdrawals") setRows((await listReferralWithdrawalsRequest()).data.data);
    else if (tab === "rewards") setRows((await listReferralRewardsRequest()).data.data);
    else {
      setSettings((await getReferralSettingsRequest()).data.data);
      setHistory((await getReferralPolicyHistoryRequest()).data.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [tab, range]);

  async function save() {
    await saveReferralSettingsRequest({
      confirm: true,
      enabled: settings.enabled,
      calculationMode: settings.calculationMode,
      percentage: (settings.percentageBps || 0) / 100,
      fixedAmountJod: (settings.fixedAmountMinor || 0) / 1000,
      commissionHoldDays: settings.commissionHoldDays,
      minimumWithdrawalJod: (settings.minimumWithdrawalMinor || 0) / 1000,
      eligiblePaymentTypes: settings.eligiblePaymentTypes,
      discountEnabled: settings.discountEnabled,
      discountMode: settings.discountMode,
      discountPercentage: (settings.discountPercentageBps || 0) / 100,
      discountFixedJod: (settings.discountFixedMinor || 0) / 1000,
    });
    setConfirm(false);
    await load();
  }

  return (
    <DashboardShell>
      <div className="oh-sa-users-list-head">
        <h1 className="oh-sa-users-list-head__title">{t("referrals.admin.title")}</h1>
        <p className="oh-sa-users-list-head__desc">{t("referrals.admin.description")}</p>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((id) => (
          <button key={id} type="button" className={`oh-sa-users-tab${tab === id ? " is-active" : ""}`} onClick={() => setTab(id)}>
            <span className="oh-sa-users-tab__label">{t(`referrals.admin.tabs.${id}`)}</span>
          </button>
        ))}
      </div>
      {loading ? <DashboardLoadingState /> : null}
      {!loading && tab === "overview" && overview ? (
        <DashboardSection title={t("referrals.admin.tabs.overview")} description={t("referrals.admin.definitions")}>
          <div className="mb-3 flex gap-2">
            <Button type="button" onClick={() => setRange("today")}>{t("referrals.admin.ranges.today")}</Button>
            <Button type="button" onClick={() => setRange("7")}>{t("referrals.admin.ranges.days7")}</Button>
            <Button type="button" onClick={() => setRange("30")}>{t("referrals.admin.ranges.days30")}</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [t("referrals.admin.kpis.visits"), overview.visits],
              [t("referrals.admin.kpis.registrations"), overview.registrations],
              [t("referrals.admin.kpis.paid"), overview.paidReferrals],
              [t("referrals.admin.kpis.revenue"), jod(overview.attributedRevenueMinor)],
              [t("referrals.admin.kpis.pending"), jod(overview.pendingMinor)],
              [t("referrals.admin.kpis.available"), jod(overview.availableMinor)],
              [t("referrals.admin.kpis.paidOut"), jod(overview.paidMinor)],
              [t("referrals.admin.kpis.withdrawals"), overview.pendingWithdrawals],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-100 p-3">
                <div className="text-xs text-slate-400">{label}</div>
                <div className="text-lg font-bold">{value}</div>
              </div>
            ))}
          </div>
          <h2 className="mt-6 font-bold">{t("referrals.admin.top")}</h2>
          <div className="oh-sa-users-table-wrap oh-sa-users-table-wrap--airy">
            <table className="oh-sa-users-table oh-sa-users-table--airy">
              <thead>
                <tr>
                  <th>{t("referrals.dashboard.user")}</th>
                  <th>{t("referrals.dashboard.registrations")}</th>
                  <th>{t("referrals.dashboard.paidReferrals")}</th>
                  <th>{t("referrals.dashboard.revenue")}</th>
                  <th>{t("referrals.dashboard.total")}</th>
                  <th>{t("referrals.dashboard.available")}</th>
                  <th>{t("referrals.dashboard.paid")}</th>
                </tr>
              </thead>
              <tbody>
                {top.map((row) => (
                  <tr key={row.userId}>
                    <td>{row.displayName}</td>
                    <td>{row.referrals}</td>
                    <td>{row.paidReferrals}</td>
                    <td>{jod(row.attributedRevenueMinor)}</td>
                    <td>{jod(row.totalCommissionMinor)}</td>
                    <td>{jod(row.availableMinor)}</td>
                    <td>{jod(row.paidMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashboardSection>
      ) : null}
      {!loading && tab === "referrals" ? (
        <DashboardSection title={t("referrals.admin.tabs.referrals")}>
          <div className="oh-sa-users-table-wrap oh-sa-users-table-wrap--airy">
            <table className="oh-sa-users-table oh-sa-users-table--airy">
              <thead><tr><th>ID</th><th>{t("referrals.dashboard.registered")}</th><th>{t("referrals.admin.policy")}</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={async () => setDetail((await getReferralRelationshipRequest(row.id)).data.data)}>
                    <td>{row.id}</td>
                    <td>{formatLocaleDate(row.registered_at, locale)}</td>
                    <td>{row.policy_version_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail ? (
            <pre className="mt-4 overflow-auto rounded-xl bg-slate-50 p-3 text-sm">{JSON.stringify(detail, null, 2)}</pre>
          ) : null}
        </DashboardSection>
      ) : null}
      {!loading && tab === "commissions" ? (
        <DashboardSection title={t("referrals.admin.tabs.commissions")}>
          <div className="oh-sa-users-table-wrap oh-sa-users-table-wrap--airy">
            <table className="oh-sa-users-table oh-sa-users-table--airy">
              <thead><tr><th>{t("referrals.dashboard.date")}</th><th>{t("referrals.dashboard.source")}</th><th>{t("referrals.dashboard.base")}</th><th>{t("referrals.dashboard.amount")}</th><th>{t("referrals.dashboard.status")}</th><th>{t("referrals.admin.policy")}</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatLocaleDate(row.created_at, locale)}</td>
                    <td>{row.payment_source_type}</td>
                    <td>{jod(row.payment_base_minor)}</td>
                    <td>{jod(row.commission_minor)}</td>
                    <td>{row.status}</td>
                    <td>{row.policy_version_id} / {row.calculation_mode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashboardSection>
      ) : null}
      {!loading && tab === "withdrawals" ? (
        <DashboardSection title={t("referrals.admin.tabs.withdrawals")}>
          {rows.map((row) => (
            <div key={row.id} className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 p-3">
              <span>#{row.id}</span>
              <span>{jod(row.amount_minor)}</span>
              <span>{row.status}</span>
              <Button type="button" onClick={() => reviewReferralWithdrawalRequest(row.id, { action: "approve" }).then(load)}>{t("referrals.admin.approve")}</Button>
              <Button type="button" onClick={() => reviewReferralWithdrawalRequest(row.id, { action: "reject" }).then(load)}>{t("referrals.admin.reject")}</Button>
              <Button type="button" onClick={() => {
                const payoutReference = window.prompt(t("referrals.admin.reference")) || "";
                return reviewReferralWithdrawalRequest(row.id, { action: "paid", payoutReference }).then(load);
              }}>{t("referrals.admin.markPaid")}</Button>
            </div>
          ))}
        </DashboardSection>
      ) : null}
      {!loading && tab === "rewards" ? (
        <DashboardSection title={t("referrals.admin.tabs.rewards")}>
          <form className="mb-4 flex flex-wrap gap-2" onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            await createReferralRewardRequest({
              thresholdPaidReferrals: Number(form.get("threshold")),
              bonusAmountJod: Number(form.get("bonus")),
            });
            event.currentTarget.reset();
            await load();
          }}>
            <input name="threshold" placeholder={t("referrals.admin.threshold")} className="rounded-lg border px-3 py-2" required />
            <input name="bonus" placeholder={t("referrals.admin.bonus")} className="rounded-lg border px-3 py-2" required />
            <Button type="submit">{t("referrals.admin.addRule")}</Button>
          </form>
          {rows.map((row) => (
            <p key={row.id}>{row.threshold_paid_referrals} → {jod(row.bonus_amount_minor)} ({row.enabled ? "on" : "off"})</p>
          ))}
        </DashboardSection>
      ) : null}
      {!loading && tab === "settings" && settings ? (
        <DashboardSection title={t("referrals.admin.tabs.settings")}>
          <label className="mb-2 block">
            <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} /> {t("referrals.admin.enabled")}
          </label>
          <label className="mb-2 block">
            {t("referrals.admin.mode")}
            <select className="mt-1 block rounded-lg border px-3 py-2" value={settings.calculationMode} onChange={(e) => setSettings({ ...settings, calculationMode: e.target.value })}>
              <option value="percentage">{t("referrals.admin.percentage")}</option>
              <option value="fixed">{t("referrals.admin.fixed")}</option>
            </select>
          </label>
          {settings.calculationMode === "percentage" ? (
            <label className="mb-2 block">{t("referrals.admin.value")}
              <input className="mt-1 block rounded-lg border px-3 py-2" value={(settings.percentageBps || 0) / 100} onChange={(e) => setSettings({ ...settings, percentageBps: Math.round(Number(e.target.value) * 100) })} />
            </label>
          ) : (
            <label className="mb-2 block">{t("referrals.admin.value")}
              <input className="mt-1 block rounded-lg border px-3 py-2" value={(settings.fixedAmountMinor || 0) / 1000} onChange={(e) => setSettings({ ...settings, fixedAmountMinor: Math.round(Number(e.target.value) * 1000) })} />
            </label>
          )}
          <label className="mb-2 block">{t("referrals.admin.hold")}
            <input className="mt-1 block rounded-lg border px-3 py-2" value={settings.commissionHoldDays} onChange={(e) => setSettings({ ...settings, commissionHoldDays: Number(e.target.value) })} />
          </label>
          <label className="mb-2 block">{t("referrals.admin.minimum")}
            <input className="mt-1 block rounded-lg border px-3 py-2" value={(settings.minimumWithdrawalMinor || 0) / 1000} onChange={(e) => setSettings({ ...settings, minimumWithdrawalMinor: Math.round(Number(e.target.value) * 1000) })} />
          </label>
          <fieldset className="mb-3">
            <legend>{t("referrals.admin.types")}</legend>
            {["training_package_purchase", "marketplace_membership_purchase"].map((type) => (
              <label key={type} className="mr-3">
                <input type="checkbox" checked={settings.eligiblePaymentTypes?.includes(type)} onChange={(e) => {
                  const next = new Set(settings.eligiblePaymentTypes || []);
                  if (e.target.checked) next.add(type); else next.delete(type);
                  setSettings({ ...settings, eligiblePaymentTypes: [...next] });
                }} /> {type === "training_package_purchase" ? t("referrals.admin.training") : t("referrals.admin.membership")}
              </label>
            ))}
          </fieldset>
          <label className="mb-2 block">
            <input type="checkbox" checked={settings.discountEnabled} onChange={(e) => setSettings({ ...settings, discountEnabled: e.target.checked, discountMode: settings.discountMode || "percentage" })} /> {t("referrals.admin.discount")}
          </label>
          <p className="text-sm text-slate-500">{t("referrals.admin.discountOff")}</p>
          <Button type="button" onClick={() => setConfirm(true)}>{t("referrals.admin.save")}</Button>
          <h2 className="mt-6 font-bold">{t("referrals.admin.history")}</h2>
          <div className="oh-sa-users-table-wrap oh-sa-users-table-wrap--airy">
            <table className="oh-sa-users-table oh-sa-users-table--airy">
              <thead><tr><th>{t("referrals.admin.version")}</th><th>{t("referrals.admin.mode")}</th><th>{t("referrals.admin.value")}</th><th>{t("referrals.admin.effective")}</th></tr></thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.calculationMode}</td>
                    <td>{row.calculationMode === "percentage" ? `${(row.percentageBps || 0) / 100}%` : jod(row.fixedAmountMinor)}</td>
                    <td>{formatLocaleDate(row.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashboardSection>
      ) : null}
      <ConfirmDialog
        open={confirm}
        title={t("referrals.admin.confirmTitle")}
        body={t("referrals.admin.confirmBody")}
        onCancel={() => setConfirm(false)}
        onConfirm={save}
      />
    </DashboardShell>
  );
}
