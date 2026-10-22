import { useEffect, useState } from "react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import Button from "../../components/ui/Button";
import { useTranslation } from "../../i18n/LanguageProvider";
import { formatLocaleDate } from "../../i18n/formatLocale";
import "../../i18n/referralsResources";
import { getMyReferralsRequest, requestReferralWithdrawal } from "../../services/referralsApi";
import "./superAdminUsersPage.css";

function jod(minor) {
  return (Number(minor || 0) / 1000).toFixed(3);
}

export default function ReferralsDashboardPage() {
  const { t, locale } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await getMyReferralsRequest();
      setData(res.data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.code === "REFERRAL_ROLE_EXCLUDED" ? t("referrals.dashboard.unavailable") : t("referrals.dashboard.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function copy(value) {
    await navigator.clipboard.writeText(value);
    setNotice(t("referrals.dashboard.copied"));
  }

  async function share(url) {
    if (navigator.share) {
      await navigator.share({ url, title: t("referrals.dashboard.title") });
      return;
    }
    await copy(url);
  }

  async function withdraw(event) {
    event.preventDefault();
    setNotice("");
    await requestReferralWithdrawal(Number(amount));
    setAmount("");
    await load();
  }

  if (loading) return <DashboardLoadingState />;
  if (error) return <DashboardErrorState message={error} />;
  if (!data?.link) return <DashboardErrorState message={t("referrals.dashboard.unavailable")} />;

  const origin = window.location.origin;
  const url = `${origin}${data.link.path}`;
  const stats = [
    [t("referrals.dashboard.visits"), data.stats.linkVisits],
    [t("referrals.dashboard.uniqueVisits"), data.stats.uniqueVisits],
    [t("referrals.dashboard.registrations"), data.stats.registrations],
    [t("referrals.dashboard.paidReferrals"), data.stats.paidReferrals],
    [t("referrals.dashboard.revenue"), jod(data.stats.attributedRevenueMinor)],
    [t("referrals.dashboard.total"), jod(data.balances.totalCommissionMinor)],
    [t("referrals.dashboard.pending"), jod(data.balances.pendingMinor)],
    [t("referrals.dashboard.available"), jod(data.balances.availableMinor)],
    [t("referrals.dashboard.paid"), jod(data.balances.paidMinor)],
  ];

  return (
    <DashboardShell>
      <DashboardSection title={t("referrals.dashboard.title")} description={t("referrals.dashboard.description")}>
        <p className="oh-sa-users-list-head__desc">{data.link.programEnabled ? t("referrals.dashboard.programOn") : t("referrals.dashboard.programOff")}</p>
        <p className="oh-sa-users-list-head__title">{t("referrals.dashboard.linkLabel")}</p>
        <p dir="ltr">{url}</p>
        <p>{t("referrals.dashboard.codeLabel")}: <strong dir="ltr">{data.link.code}</strong></p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => copy(url)}>{t("referrals.dashboard.copyLink")}</Button>
          <Button type="button" onClick={() => copy(data.link.code)}>{t("referrals.dashboard.copyCode")}</Button>
          <Button type="button" onClick={() => share(url)}>{t("referrals.dashboard.share")}</Button>
        </div>
        {notice ? <p>{notice}</p> : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-100 p-3">
              <div className="text-xs text-slate-400">{label}</div>
              <div className="text-lg font-bold">{value}</div>
            </div>
          ))}
        </div>
        <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={withdraw}>
          <label>
            <span className="text-sm text-slate-500">{t("referrals.dashboard.amountJod")}</span>
            <input className="mt-1 block rounded-lg border border-slate-200 px-3 py-2" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required />
          </label>
          <Button type="submit">{t("referrals.dashboard.submitWithdraw")}</Button>
        </form>
      </DashboardSection>
      <DashboardSection title={t("referrals.dashboard.referrals")}>
        <div className="oh-sa-users-table-wrap oh-sa-users-table-wrap--airy">
          <table className="oh-sa-users-table oh-sa-users-table--airy">
            <thead>
              <tr>
                <th>{t("referrals.dashboard.user")}</th>
                <th>{t("referrals.dashboard.registered")}</th>
                <th>{t("referrals.dashboard.paymentStatus")}</th>
                <th>{t("referrals.dashboard.payments")}</th>
                <th>{t("referrals.dashboard.commission")}</th>
              </tr>
            </thead>
            <tbody>
              {data.referrals.length === 0 ? (
                <tr><td colSpan={5}>{t("referrals.dashboard.empty")}</td></tr>
              ) : data.referrals.map((row) => (
                <tr key={`${row.displayName}-${row.registeredAt}`}>
                  <td>{row.displayName}</td>
                  <td>{formatLocaleDate(row.registeredAt, locale)}</td>
                  <td>{row.paymentStatus === "paid" ? t("referrals.dashboard.paidStatus") : t("referrals.dashboard.registeredStatus")}</td>
                  <td>{row.eligiblePayments}</td>
                  <td>{jod(row.commissionMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardSection>
      <DashboardSection title={t("referrals.dashboard.commissions")}>
        <div className="oh-sa-users-table-wrap oh-sa-users-table-wrap--airy">
          <table className="oh-sa-users-table oh-sa-users-table--airy">
            <thead>
              <tr>
                <th>{t("referrals.dashboard.date")}</th>
                <th>{t("referrals.dashboard.source")}</th>
                <th>{t("referrals.dashboard.base")}</th>
                <th>{t("referrals.dashboard.mode")}</th>
                <th>{t("referrals.dashboard.rate")}</th>
                <th>{t("referrals.dashboard.amount")}</th>
                <th>{t("referrals.dashboard.status")}</th>
              </tr>
            </thead>
            <tbody>
              {data.commissions.length === 0 ? (
                <tr><td colSpan={7}>{t("referrals.dashboard.empty")}</td></tr>
              ) : data.commissions.map((row) => (
                <tr key={`${row.createdAt}-${row.policyVersionId}-${row.commissionMinor}`}>
                  <td>{formatLocaleDate(row.createdAt, locale)}</td>
                  <td>{row.paymentType}</td>
                  <td>{jod(row.paymentBaseMinor)}</td>
                  <td>{row.calculationMode}</td>
                  <td>{row.calculationMode === "percentage" ? `${(row.percentageBps || 0) / 100}%` : jod(row.fixedAmountMinor)}</td>
                  <td>{jod(row.commissionMinor)}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardSection>
    </DashboardShell>
  );
}
