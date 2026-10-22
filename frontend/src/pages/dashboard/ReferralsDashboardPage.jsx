import { useCallback, useEffect, useState } from "react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardStatsGrid from "../../components/dashboard/DashboardStatsGrid";
import DashboardStatCard from "../../components/dashboard/DashboardStatCard";
import DashboardTable from "../../components/dashboard/DashboardTable";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import Button from "../../components/ui/Button";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import { formatLocaleDate } from "../../i18n/formatLocale";
import "../../i18n/referralsResources";
import {
  cancelReferralWithdrawalRequest,
  getMyReferralsRequest,
  requestReferralWithdrawal,
} from "../../services/referralsApi";
import {
  COMMISSION_STATUS_TONE,
  WITHDRAWAL_STATUS_TONE,
  formatCommissionRate,
  formatMinorJod,
  referralErrorMessage,
} from "../../utils/referralMoney";
import "./superAdminUsersPage.css";

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(area);
  if (!ok) throw new Error("copy_failed");
}

export default function ReferralsDashboardPage() {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const money = useCallback((minor) => formatMinorJod(minor, locale), [locale]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getMyReferralsRequest();
      setData(res.data?.data || null);
    } catch (err) {
      setError(
        err?.response?.data?.code === "REFERRAL_ROLE_EXCLUDED"
          ? t("referrals.dashboard.unavailable")
          : t("referrals.dashboard.loadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function copy(value) {
    try {
      await copyText(value);
      push({ type: "success", message: t("referrals.dashboard.copied") });
    } catch {
      push({ type: "error", message: t("referrals.dashboard.copyFailed") });
    }
  }

  async function share(url) {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title: t("referrals.dashboard.title"), text: t("referrals.dashboard.shareText") });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    await copy(url);
  }

  async function withdraw(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await requestReferralWithdrawal(amount.trim());
      setAmount("");
      push({ type: "success", message: t("referrals.dashboard.withdrawSent") });
      await load();
    } catch (err) {
      push({ type: "error", message: referralErrorMessage(err, t) });
    } finally {
      setBusy(false);
    }
  }

  async function cancelWithdrawal(id) {
    setBusy(true);
    try {
      await cancelReferralWithdrawalRequest(id);
      push({ type: "success", message: t("referrals.dashboard.withdrawCancelled") });
      await load();
    } catch (err) {
      push({ type: "error", message: referralErrorMessage(err, t) });
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <DashboardShell>
        <DashboardLoadingState />
      </DashboardShell>
    );
  }
  if (error || !data?.link) {
    return (
      <DashboardShell>
        <DashboardErrorState
          message={error || t("referrals.dashboard.unavailable")}
          actions={
            error ? (
              <Button type="button" variant="secondary" onClick={load}>
                {t("referrals.common.retry")}
              </Button>
            ) : null
          }
        />
      </DashboardShell>
    );
  }

  const { link, balances, stats } = data;
  const url = `${window.location.origin}${link.path}`;
  const hasOpenWithdrawal = data.withdrawals.some((w) => w.status === "pending" || w.status === "approved");
  const canWithdraw = balances.availableMinor > 0 && balances.availableMinor >= balances.minimumWithdrawalMinor;

  return (
    <DashboardShell>
      <DashboardSection
        title={t("referrals.dashboard.title")}
        description={t("referrals.dashboard.description")}
        actions={
          <StatusBadge tone={link.programEnabled ? "active" : "inactive"}>
            {link.programEnabled ? t("referrals.dashboard.programOn") : t("referrals.dashboard.programOffTitle")}
          </StatusBadge>
        }
      >
        {!link.programEnabled ? (
          <DashboardEmptyState
            title={t("referrals.dashboard.programOffTitle")}
            description={t("referrals.dashboard.programOff")}
          />
        ) : (
          <div className="oh-sa-users-stack">
            <div className="oh-sa-users-kv">
              <div>
                <span>{t("referrals.dashboard.linkLabel")}</span>
                <strong dir="ltr" className="break-all">{url}</strong>
              </div>
              <div>
                <span>{t("referrals.dashboard.codeLabel")}</span>
                <strong dir="ltr">{link.code}</strong>
              </div>
            </div>
            <p className="oh-sa-users-muted m-0">{t("referrals.dashboard.codeHint")}</p>
            <div className="oh-sa-users-actions-row">
              <Button type="button" onClick={() => copy(url)}>
                {t("referrals.dashboard.copyLink")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => copy(link.code)}>
                {t("referrals.dashboard.copyCode")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => share(url)}>
                {t("referrals.dashboard.share")}
              </Button>
            </div>
          </div>
        )}
      </DashboardSection>

      <DashboardSection title={t("referrals.dashboard.statsTitle")}>
        <DashboardStatsGrid>
          <DashboardStatCard label={t("referrals.dashboard.visits")} value={stats.linkVisits} />
          <DashboardStatCard label={t("referrals.dashboard.uniqueVisits")} value={stats.uniqueVisits} />
          <DashboardStatCard label={t("referrals.dashboard.registrations")} value={stats.registrations} />
          <DashboardStatCard label={t("referrals.dashboard.paidReferrals")} value={stats.paidReferrals} />
          <DashboardStatCard label={t("referrals.dashboard.revenue")} value={money(stats.attributedRevenueMinor)} />
        </DashboardStatsGrid>
      </DashboardSection>

      <DashboardSection title={t("referrals.dashboard.walletTitle")}>
        <DashboardStatsGrid>
          <DashboardStatCard label={t("referrals.dashboard.total")} value={money(balances.totalCommissionMinor)} />
          <DashboardStatCard
            label={t("referrals.dashboard.pending")}
            value={money(balances.pendingMinor)}
            hint={t("referrals.dashboard.pendingHint")}
          />
          <DashboardStatCard label={t("referrals.dashboard.available")} value={money(balances.availableMinor)} />
          {balances.reservedMinor ? (
            <DashboardStatCard label={t("referrals.dashboard.reserved")} value={money(balances.reservedMinor)} />
          ) : null}
          <DashboardStatCard label={t("referrals.dashboard.paid")} value={money(balances.paidMinor)} />
        </DashboardStatsGrid>
        <form className="mt-5 oh-sa-users-form-grid" onSubmit={withdraw}>
          <label className="oh-sa-users-field">
            <span>{t("referrals.dashboard.amountJod")}</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              dir="ltr"
              required
              disabled={busy || !canWithdraw || hasOpenWithdrawal}
            />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={busy || !canWithdraw || hasOpenWithdrawal || !amount.trim()}>
              {t("referrals.dashboard.submitWithdraw")}
            </Button>
          </div>
        </form>
        <p className="oh-sa-users-muted mt-2">
          {hasOpenWithdrawal
            ? t("referrals.common.errors.WITHDRAWAL_ALREADY_OPEN")
            : t("referrals.dashboard.withdrawHint", { amount: money(balances.minimumWithdrawalMinor) })}
        </p>
      </DashboardSection>

      <DashboardSection title={t("referrals.dashboard.referrals")}>
        {data.referrals.length === 0 ? (
          <DashboardEmptyState title={t("referrals.dashboard.emptyReferrals")} />
        ) : (
          <DashboardTable caption={t("referrals.dashboard.referrals")}>
            <thead>
              <tr>
                <th>{t("referrals.dashboard.user")}</th>
                <th>{t("referrals.dashboard.registered")}</th>
                <th>{t("referrals.dashboard.joinedVia")}</th>
                <th>{t("referrals.dashboard.paymentStatus")}</th>
                <th>{t("referrals.dashboard.payments")}</th>
                <th>{t("referrals.dashboard.commission")}</th>
              </tr>
            </thead>
            <tbody>
              {data.referrals.map((row) => (
                <tr key={row.id}>
                  <td>{row.displayName}</td>
                  <td>{formatLocaleDate(row.registeredAt, locale)}</td>
                  <td>{t(`referrals.common.sources.${row.source}`)}</td>
                  <td>
                    <StatusBadge tone={row.paymentStatus === "paid" ? "success" : "neutral"}>
                      {row.paymentStatus === "paid"
                        ? t("referrals.dashboard.paidStatus")
                        : t("referrals.dashboard.registeredStatus")}
                    </StatusBadge>
                  </td>
                  <td>{row.eligiblePayments}</td>
                  <td>{money(row.commissionMinor)}</td>
                </tr>
              ))}
            </tbody>
          </DashboardTable>
        )}
      </DashboardSection>

      <DashboardSection title={t("referrals.dashboard.commissions")}>
        {data.commissions.length === 0 ? (
          <DashboardEmptyState title={t("referrals.dashboard.empty")} />
        ) : (
          <DashboardTable caption={t("referrals.dashboard.commissions")}>
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
              {data.commissions.map((row) => (
                <tr key={row.id}>
                  <td>{formatLocaleDate(row.createdAt, locale)}</td>
                  <td>{t(`referrals.common.paymentTypes.${row.paymentType}`)}</td>
                  <td>{money(row.paymentBaseMinor)}</td>
                  <td>{t(`referrals.common.modes.${row.calculationMode}`)}</td>
                  <td dir="ltr">{formatCommissionRate(row, locale)}</td>
                  <td>
                    {money(row.netCommissionMinor)}
                    {row.reversedMinor > 0 && row.status !== "reversed" ? (
                      <div className="oh-sa-users-cell-sub">
                        {t("referrals.dashboard.reversedPart", { amount: money(row.reversedMinor) })}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <StatusBadge tone={COMMISSION_STATUS_TONE[row.status] || "neutral"}>
                      {t(`referrals.common.commissionStatus.${row.status}`)}
                    </StatusBadge>
                    {row.status === "pending" && row.holdUntil ? (
                      <div className="oh-sa-users-cell-sub">
                        {t("referrals.dashboard.availableOn", { date: formatLocaleDate(row.holdUntil, locale) })}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DashboardTable>
        )}
      </DashboardSection>

      {data.withdrawals.length ? (
        <DashboardSection title={t("referrals.dashboard.withdrawals")}>
          <DashboardTable caption={t("referrals.dashboard.withdrawals")}>
            <thead>
              <tr>
                <th>{t("referrals.dashboard.date")}</th>
                <th>{t("referrals.dashboard.amountJod")}</th>
                <th>{t("referrals.dashboard.status")}</th>
                <th>{t("referrals.dashboard.reference")}</th>
                <th aria-label={t("referrals.dashboard.cancelWithdraw")} />
              </tr>
            </thead>
            <tbody>
              {data.withdrawals.map((row) => (
                <tr key={row.id}>
                  <td>{formatLocaleDate(row.createdAt, locale)}</td>
                  <td>{money(row.amountMinor)}</td>
                  <td>
                    <StatusBadge tone={WITHDRAWAL_STATUS_TONE[row.status] || "neutral"}>
                      {t(`referrals.common.withdrawalStatus.${row.status}`)}
                    </StatusBadge>
                  </td>
                  <td dir="ltr">{row.payoutReference || "—"}</td>
                  <td>
                    {row.status === "pending" ? (
                      <Button type="button" variant="secondary" disabled={busy} onClick={() => cancelWithdrawal(row.id)}>
                        {t("referrals.dashboard.cancelWithdraw")}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DashboardTable>
        </DashboardSection>
      ) : null}
    </DashboardShell>
  );
}
