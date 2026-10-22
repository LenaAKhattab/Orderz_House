import { useCallback, useEffect, useState } from "react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardStatsGrid from "../../components/dashboard/DashboardStatsGrid";
import DashboardStatCard from "../../components/dashboard/DashboardStatCard";
import DashboardTable from "../../components/dashboard/DashboardTable";
import DashboardTabs, { DashboardTab } from "../../components/dashboard/DashboardTabs";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import Pagination from "../../components/common/Pagination";
import Button from "../../components/ui/Button";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import { formatLocaleDate, formatLocaleDateTime } from "../../i18n/formatLocale";
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
  updateReferralRewardRequest,
} from "../../services/referralsApi";
import {
  COMMISSION_STATUS_TONE,
  WITHDRAWAL_STATUS_TONE,
  formatCommissionRate,
  formatMinorJod,
  referralErrorMessage,
} from "../../utils/referralMoney";
import "./superAdminUsersPage.css";

const TABS = ["overview", "referrals", "commissions", "withdrawals", "rewards", "settings"];
const PAYMENT_TYPES = ["training_package_purchase", "marketplace_membership_purchase"];
const RANGES = [
  { id: "today", key: "today" },
  { id: "7", key: "days7" },
  { id: "30", key: "days30" },
  { id: "90", key: "days90" },
];

function rangeParams(range) {
  const to = new Date();
  const from = new Date();
  if (range === "today") from.setHours(0, 0, 0, 0);
  else from.setDate(from.getDate() - Number(range));
  return { from: from.toISOString(), to: to.toISOString() };
}

function totalPages(list) {
  return Math.max(1, Math.ceil((list?.total || 0) / (list?.limit || 25)));
}

function Modal({ open, title, children, onClose, busy }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="oh-sa-users-modal" role="dialog" aria-modal="true" aria-labelledby="oh-ref-modal-title">
      <button type="button" className="oh-sa-users-modal__backdrop" aria-label={t("referrals.admin.close")} onClick={busy ? undefined : onClose} />
      <div className="oh-sa-users-modal__panel">
        <header className="oh-sa-users-modal__header">
          <h2 id="oh-ref-modal-title">{title}</h2>
          <button type="button" className="oh-sa-users-modal__close" onClick={onClose} disabled={busy} aria-label={t("referrals.admin.close")}>
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function StatusFilter({ value, onChange, options, ns }) {
  const { t } = useTranslation();
  return (
    <label className="oh-sa-users-field oh-sa-users-field--inline">
      <span>{t("referrals.admin.statusFilter")}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("referrals.admin.all")}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {t(`referrals.common.${ns}.${opt}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function OverviewTab({ money }) {
  const { t } = useTranslation();
  const [range, setRange] = useState("30");
  const [sort, setSort] = useState("commission");
  const [overview, setOverview] = useState(null);
  const [top, setTop] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([getReferralOverviewRequest(rangeParams(range)), getReferralTopRequest({ sort })])
      .then(([ov, leaders]) => {
        if (cancelled) return;
        setOverview(ov.data.data);
        setTop(leaders.data.data);
      })
      .catch((err) => !cancelled && setError(referralErrorMessage(err, t)));
    return () => {
      cancelled = true;
    };
  }, [range, sort, t]);

  if (error) return <DashboardErrorState message={error} />;
  if (!overview) return <DashboardLoadingState />;
  const rangeScope = t("referrals.admin.rangeScope");
  const nowScope = t("referrals.admin.nowScope");

  return (
    <>
      <DashboardSection
        title={t("referrals.admin.tabs.overview")}
        description={t("referrals.admin.definitions")}
        actions={
          <DashboardTabs aria-label={t("referrals.admin.rangeScope")}>
            {RANGES.map((r) => (
              <DashboardTab key={r.id} selected={range === r.id} onSelect={() => setRange(r.id)}>
                {t(`referrals.admin.ranges.${r.key}`)}
              </DashboardTab>
            ))}
          </DashboardTabs>
        }
      >
        <DashboardStatsGrid>
          <DashboardStatCard label={t("referrals.admin.kpis.visits")} value={overview.visits} scopeLabel={rangeScope} />
          <DashboardStatCard label={t("referrals.admin.kpis.uniqueVisits")} value={overview.uniqueVisits} scopeLabel={rangeScope} />
          <DashboardStatCard label={t("referrals.admin.kpis.registrations")} value={overview.registrations} scopeLabel={rangeScope} />
          <DashboardStatCard label={t("referrals.admin.kpis.paid")} value={overview.paidReferrals} scopeLabel={rangeScope} />
          <DashboardStatCard label={t("referrals.admin.kpis.revenue")} value={money(overview.attributedRevenueMinor)} scopeLabel={rangeScope} />
          <DashboardStatCard label={t("referrals.admin.kpis.commission")} value={money(overview.commissionMinor)} scopeLabel={rangeScope} />
          <DashboardStatCard label={t("referrals.admin.kpis.pending")} value={money(overview.pendingMinor)} scopeLabel={nowScope} />
          <DashboardStatCard label={t("referrals.admin.kpis.available")} value={money(overview.availableMinor)} scopeLabel={nowScope} />
          <DashboardStatCard label={t("referrals.admin.kpis.reserved")} value={money(overview.reservedMinor)} scopeLabel={nowScope} />
          <DashboardStatCard label={t("referrals.admin.kpis.paidOut")} value={money(overview.paidMinor)} scopeLabel={nowScope} />
          <DashboardStatCard
            label={t("referrals.admin.kpis.withdrawals")}
            value={overview.pendingWithdrawals + overview.approvedWithdrawals}
            scopeLabel={nowScope}
          />
        </DashboardStatsGrid>
      </DashboardSection>
      <DashboardSection
        title={t("referrals.admin.top")}
        actions={
          <label className="oh-sa-users-field oh-sa-users-field--inline">
            <span>{t("referrals.admin.sortBy")}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {["commission", "paid_referrals", "revenue"].map((id) => (
                <option key={id} value={id}>
                  {t(`referrals.admin.sort.${id}`)}
                </option>
              ))}
            </select>
          </label>
        }
      >
        {top.length === 0 ? (
          <DashboardEmptyState title={t("referrals.dashboard.empty")} />
        ) : (
          <DashboardTable caption={t("referrals.admin.top")}>
            <thead>
              <tr>
                <th>{t("referrals.admin.referrer")}</th>
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
                  <td>
                    <span className="oh-sa-users-cell-primary">{row.displayName}</span>
                    <div className="oh-sa-users-cell-sub" dir="ltr">
                      {row.accountId} · {t(`referrals.common.roles.${row.role}`)}
                    </div>
                  </td>
                  <td>{row.referrals}</td>
                  <td>{row.paidReferrals}</td>
                  <td>{money(row.attributedRevenueMinor)}</td>
                  <td>{money(row.totalCommissionMinor)}</td>
                  <td>{money(row.availableMinor)}</td>
                  <td>{money(row.paidMinor)}</td>
                </tr>
              ))}
            </tbody>
          </DashboardTable>
        )}
      </DashboardSection>
    </>
  );
}

function CommissionRows({ rows, money, showParties }) {
  const { t, locale } = useTranslation();
  return rows.map((row) => (
    <tr key={row.id}>
      <td>{formatLocaleDate(row.createdAt, locale)}</td>
      {showParties ? (
        <td>
          <span className="oh-sa-users-cell-primary">{row.referrer}</span>
          <div className="oh-sa-users-cell-sub">→ {row.referred}</div>
        </td>
      ) : null}
      <td>{t(`referrals.common.paymentTypes.${row.paymentType}`)}</td>
      <td>
        {money(row.paymentBaseMinor)}
        {row.discountMinor > 0 ? (
          <div className="oh-sa-users-cell-sub">
            {money(row.listAmountMinor)} − {money(row.discountMinor)}
          </div>
        ) : null}
      </td>
      <td dir="ltr">{formatCommissionRate(row, locale)}</td>
      <td>
        {money(row.netCommissionMinor)}
        {row.reversedMinor > 0 && row.status !== "reversed" ? (
          <div className="oh-sa-users-cell-sub">{t("referrals.dashboard.reversedPart", { amount: money(row.reversedMinor) })}</div>
        ) : null}
      </td>
      <td>
        <StatusBadge tone={COMMISSION_STATUS_TONE[row.status] || "neutral"}>
          {t(`referrals.common.commissionStatus.${row.status}`)}
        </StatusBadge>
      </td>
      <td>v{row.policyVersionId}</td>
    </tr>
  ));
}

function ReferralDrawer({ id, onClose, money }) {
  const { t, locale } = useTranslation();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    setDetail(null);
    setError("");
    getReferralRelationshipRequest(id)
      .then((res) => !cancelled && setDetail(res.data.data))
      .catch((err) => !cancelled && setError(referralErrorMessage(err, t)));
    return () => {
      cancelled = true;
    };
  }, [id, t]);
  if (!id) return null;
  return (
    <div className="oh-sa-users-drawer" role="dialog" aria-modal="true" aria-labelledby="oh-ref-drawer-title">
      <button type="button" className="oh-sa-users-drawer__backdrop" aria-label={t("referrals.admin.close")} onClick={onClose} />
      <aside className="oh-sa-users-drawer__panel">
        <header className="oh-sa-users-drawer__header">
          <div>
            <h2 id="oh-ref-drawer-title">{t("referrals.admin.detail")}</h2>
            {detail ? <p className="oh-sa-users-drawer__sub" dir="ltr">#{detail.id} · {detail.code}</p> : null}
          </div>
          <button type="button" className="oh-sa-users-drawer__close" onClick={onClose} aria-label={t("referrals.admin.close")}>
            ×
          </button>
        </header>
        <div className="oh-sa-users-drawer__body">
          {error ? <DashboardErrorState message={error} /> : null}
          {!detail && !error ? <DashboardLoadingState /> : null}
          {detail ? (
            <div className="oh-sa-users-stack">
              <div className="oh-sa-users-kv">
                <div>
                  <span>{t("referrals.admin.referrer")}</span>
                  <strong>{detail.referrer}</strong>
                  <span dir="ltr">{detail.referrerAccountId}</span>
                </div>
                <div>
                  <span>{t("referrals.admin.referred")}</span>
                  <strong>{detail.referred}</strong>
                  <span dir="ltr">{detail.referredAccountId}</span>
                </div>
                <div>
                  <span>{t("referrals.dashboard.registered")}</span>
                  <strong>{formatLocaleDateTime(detail.registeredAt, locale)}</strong>
                </div>
                <div>
                  <span>{t("referrals.dashboard.joinedVia")}</span>
                  <strong>{t(`referrals.common.sources.${detail.source}`)}</strong>
                </div>
                <div>
                  <span>{t("referrals.admin.policy")}</span>
                  <strong>
                    v{detail.policyVersionId} · {t(`referrals.common.modes.${detail.calculationMode}`)} ·{" "}
                    <span dir="ltr">{formatCommissionRate(detail, locale)}</span>
                  </strong>
                </div>
                <div>
                  <span>{t("referrals.admin.hold")}</span>
                  <strong>{detail.commissionHoldDays}</strong>
                </div>
                <div>
                  <span>{t("referrals.admin.types")}</span>
                  <strong>{(detail.eligiblePaymentTypes || []).map((p) => t(`referrals.common.paymentTypes.${p}`)).join(locale === "ar" ? "، " : ", ")}</strong>
                </div>
                <div>
                  <span>{t("referrals.admin.discount")}</span>
                  <strong>
                    {detail.discountEnabled
                      ? detail.discountMode === "percentage"
                        ? `${(detail.discountPercentageBps || 0) / 100}%`
                        : money(detail.discountFixedMinor)
                      : t("referrals.admin.discountOff")}
                  </strong>
                </div>
              </div>
              {detail.flags?.length ? (
                <section className="oh-sa-users-gates" aria-label={t("referrals.admin.flags")}>
                  <h3>{t("referrals.admin.flags")}</h3>
                  <ul>
                    {detail.flags.map((flag, idx) => (
                      <li key={`${flag}-${idx}`}>{t(`referrals.admin.flagReasons.${flag}`)}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {detail.payments.length ? (
                <DashboardTable caption={t("referrals.dashboard.commissions")}>
                  <thead>
                    <tr>
                      <th>{t("referrals.dashboard.date")}</th>
                      <th>{t("referrals.dashboard.source")}</th>
                      <th>{t("referrals.dashboard.base")}</th>
                      <th>{t("referrals.dashboard.rate")}</th>
                      <th>{t("referrals.dashboard.amount")}</th>
                      <th>{t("referrals.dashboard.status")}</th>
                      <th>{t("referrals.admin.policy")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <CommissionRows rows={detail.payments} money={money} showParties={false} />
                  </tbody>
                </DashboardTable>
              ) : (
                <DashboardEmptyState title={t("referrals.dashboard.empty")} />
              )}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function ReferralsTab({ money }) {
  const { t, locale } = useTranslation();
  const [page, setPage] = useState(1);
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  useEffect(() => {
    let cancelled = false;
    listReferralRelationshipsRequest({ page, limit: 25 })
      .then((res) => !cancelled && setList(res.data.data))
      .catch((err) => !cancelled && setError(referralErrorMessage(err, t)));
    return () => {
      cancelled = true;
    };
  }, [page, t]);
  if (error) return <DashboardErrorState message={error} />;
  if (!list) return <DashboardLoadingState />;
  return (
    <DashboardSection title={t("referrals.admin.tabs.referrals")}>
      {list.items.length === 0 ? (
        <DashboardEmptyState title={t("referrals.dashboard.empty")} />
      ) : (
        <>
          <DashboardTable caption={t("referrals.admin.tabs.referrals")}>
            <thead>
              <tr>
                <th>{t("referrals.admin.referrer")}</th>
                <th>{t("referrals.admin.referred")}</th>
                <th>{t("referrals.dashboard.registered")}</th>
                <th>{t("referrals.dashboard.joinedVia")}</th>
                <th>{t("referrals.dashboard.payments")}</th>
                <th>{t("referrals.admin.policy")}</th>
                <th aria-label={t("referrals.admin.detail")} />
              </tr>
            </thead>
            <tbody>
              {list.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="oh-sa-users-cell-primary">{row.referrer}</span>
                    <div className="oh-sa-users-cell-sub" dir="ltr">{row.referrerAccountId} · {row.code}</div>
                  </td>
                  <td>
                    <span className="oh-sa-users-cell-primary">{row.referred}</span>
                    <div className="oh-sa-users-cell-sub">{t(`referrals.common.roles.${row.referredRole}`)}</div>
                  </td>
                  <td>{formatLocaleDate(row.registeredAt, locale)}</td>
                  <td>{t(`referrals.common.sources.${row.source}`)}</td>
                  <td>{row.payments}</td>
                  <td>v{row.policyVersionId}</td>
                  <td>
                    <Button type="button" variant="secondary" onClick={() => setOpenId(row.id)}>
                      {t("referrals.admin.detail")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DashboardTable>
          <div className="oh-sa-users-pagination">
            <Pagination currentPage={page} totalPages={totalPages(list)} onPageChange={setPage} />
          </div>
        </>
      )}
      <ReferralDrawer id={openId} onClose={() => setOpenId(null)} money={money} />
    </DashboardSection>
  );
}

function CommissionsTab({ money }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    listReferralCommissionsRequest({ page, limit: 25, status: status || undefined })
      .then((res) => !cancelled && setList(res.data.data))
      .catch((err) => !cancelled && setError(referralErrorMessage(err, t)));
    return () => {
      cancelled = true;
    };
  }, [page, status, t]);
  if (error) return <DashboardErrorState message={error} />;
  return (
    <DashboardSection
      title={t("referrals.admin.tabs.commissions")}
      actions={
        <StatusFilter
          value={status}
          onChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
          options={["pending", "available", "reversed"]}
          ns="commissionStatus"
        />
      }
    >
      {!list ? (
        <DashboardLoadingState />
      ) : list.items.length === 0 ? (
        <DashboardEmptyState title={t("referrals.dashboard.empty")} />
      ) : (
        <>
          <DashboardTable caption={t("referrals.admin.tabs.commissions")}>
            <thead>
              <tr>
                <th>{t("referrals.dashboard.date")}</th>
                <th>{t("referrals.admin.referrer")}</th>
                <th>{t("referrals.dashboard.source")}</th>
                <th>{t("referrals.dashboard.base")}</th>
                <th>{t("referrals.dashboard.rate")}</th>
                <th>{t("referrals.dashboard.amount")}</th>
                <th>{t("referrals.dashboard.status")}</th>
                <th>{t("referrals.admin.policy")}</th>
              </tr>
            </thead>
            <tbody>
              <CommissionRows rows={list.items} money={money} showParties />
            </tbody>
          </DashboardTable>
          <div className="oh-sa-users-pagination">
            <Pagination currentPage={page} totalPages={totalPages(list)} onPageChange={setPage} />
          </div>
        </>
      )}
    </DashboardSection>
  );
}

function WithdrawalsTab({ money, onChanged }) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [review, setReview] = useState(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState("");

  const load = useCallback(() => {
    setError("");
    return listReferralWithdrawalsRequest({ page, limit: 25, status: status || undefined })
      .then((res) => setList(res.data.data))
      .catch((err) => setError(referralErrorMessage(err, t)));
  }, [page, status, t]);

  useEffect(() => {
    load();
  }, [load]);

  function openReview(row, action) {
    setReview({ row, action });
    setReference("");
    setNote("");
    setModalError("");
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setModalError("");
    try {
      await reviewReferralWithdrawalRequest(review.row.id, {
        action: review.action,
        payoutReference: review.action === "paid" ? reference.trim() : undefined,
        note: note.trim() || undefined,
      });
      push({ type: "success", message: t("referrals.admin.reviewed") });
      setReview(null);
      await load();
      onChanged?.();
    } catch (err) {
      setModalError(referralErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <DashboardErrorState message={error} />;
  return (
    <DashboardSection
      title={t("referrals.admin.tabs.withdrawals")}
      actions={
        <StatusFilter
          value={status}
          onChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
          options={["pending", "approved", "paid", "rejected", "cancelled"]}
          ns="withdrawalStatus"
        />
      }
    >
      {!list ? (
        <DashboardLoadingState />
      ) : list.items.length === 0 ? (
        <DashboardEmptyState title={t("referrals.dashboard.empty")} />
      ) : (
        <>
          <DashboardTable caption={t("referrals.admin.tabs.withdrawals")}>
            <thead>
              <tr>
                <th>{t("referrals.dashboard.user")}</th>
                <th>{t("referrals.admin.requestedAmount")}</th>
                <th>{t("referrals.admin.balances")}</th>
                <th>{t("referrals.dashboard.status")}</th>
                <th>{t("referrals.admin.requestedAt")}</th>
                <th>{t("referrals.admin.reference")}</th>
                <th aria-label={t("referrals.admin.confirm")} />
              </tr>
            </thead>
            <tbody>
              {list.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="oh-sa-users-cell-primary">{row.user}</span>
                    <div className="oh-sa-users-cell-sub" dir="ltr">
                      {row.accountId} · {row.email}
                    </div>
                  </td>
                  <td>{money(row.amountMinor)}</td>
                  <td>
                    <div className="oh-sa-users-cell-sub">
                      {t("referrals.dashboard.available")}: {money(row.balances.availableMinor)}
                    </div>
                    <div className="oh-sa-users-cell-sub">
                      {t("referrals.dashboard.reserved")}: {money(row.balances.reservedMinor)}
                    </div>
                    <div className="oh-sa-users-cell-sub">
                      {t("referrals.dashboard.paid")}: {money(row.balances.paidMinor)}
                    </div>
                  </td>
                  <td>
                    <StatusBadge tone={WITHDRAWAL_STATUS_TONE[row.status] || "neutral"}>
                      {t(`referrals.common.withdrawalStatus.${row.status}`)}
                    </StatusBadge>
                    {row.cancelledByUser ? <div className="oh-sa-users-cell-sub">{t("referrals.admin.cancelledByUser")}</div> : null}
                    {row.reviewedAt && !row.cancelledByUser ? (
                      <div className="oh-sa-users-cell-sub">
                        {t("referrals.admin.reviewedBy")}: {row.reviewedBy}
                      </div>
                    ) : null}
                  </td>
                  <td>{formatLocaleDateTime(row.createdAt, locale)}</td>
                  <td>
                    <span dir="ltr">{row.payoutReference || "—"}</span>
                    {row.adminNote ? <div className="oh-sa-users-cell-sub">{row.adminNote}</div> : null}
                  </td>
                  <td>
                    <div className="oh-sa-users-actions-row">
                      {row.status === "pending" ? (
                        <Button type="button" onClick={() => openReview(row, "approve")}>
                          {t("referrals.admin.approve")}
                        </Button>
                      ) : null}
                      {row.status === "pending" || row.status === "approved" ? (
                        <>
                          <Button type="button" variant="secondary" onClick={() => openReview(row, "paid")}>
                            {t("referrals.admin.markPaid")}
                          </Button>
                          <Button type="button" variant="danger" onClick={() => openReview(row, "reject")}>
                            {t("referrals.admin.reject")}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DashboardTable>
          <div className="oh-sa-users-pagination">
            <Pagination currentPage={page} totalPages={totalPages(list)} onPageChange={setPage} />
          </div>
        </>
      )}
      <Modal
        open={Boolean(review)}
        busy={busy}
        title={review ? t(`referrals.admin.reviewTitle.${review.action}`) : ""}
        onClose={() => !busy && setReview(null)}
      >
        {review ? (
          <form className="oh-sa-users-modal__body" onSubmit={submit}>
            <p className="oh-sa-users-modal__desc">{t(`referrals.admin.reviewBody.${review.action}`)}</p>
            <div className="oh-sa-users-kv">
              <div>
                <span>{t("referrals.dashboard.user")}</span>
                <strong>{review.row.user}</strong>
              </div>
              <div>
                <span>{t("referrals.admin.requestedAmount")}</span>
                <strong>{money(review.row.amountMinor)}</strong>
              </div>
            </div>
            {review.action === "paid" ? (
              <label className="oh-sa-users-field">
                <span>{t("referrals.admin.reference")}</span>
                <input value={reference} onChange={(e) => setReference(e.target.value)} required maxLength={200} dir="ltr" disabled={busy} />
              </label>
            ) : null}
            <label className="oh-sa-users-field">
              <span>{t("referrals.admin.note")}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={t("referrals.admin.noteOptional")}
                disabled={busy}
              />
            </label>
            {modalError ? <div className="oh-sa-users-modal__error">{modalError}</div> : null}
            <footer className="oh-sa-users-modal__footer">
              <Button type="button" variant="secondary" onClick={() => setReview(null)} disabled={busy}>
                {t("referrals.admin.cancel")}
              </Button>
              <Button type="submit" variant={review.action === "reject" ? "danger" : "primary"} disabled={busy}>
                {busy ? t("referrals.admin.working") : t("referrals.admin.confirm")}
              </Button>
            </footer>
          </form>
        ) : null}
      </Modal>
    </DashboardSection>
  );
}

const EMPTY_RULE = { thresholdPaidReferrals: "", bonusAmountJod: "", label: "", effectiveFrom: "", enabled: true };

function RewardsTab({ money }) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const [rules, setRules] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(EMPTY_RULE);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState("");

  const load = useCallback(
    () =>
      listReferralRewardsRequest()
        .then((res) => setRules(res.data.data))
        .catch((err) => setError(referralErrorMessage(err, t))),
    [t],
  );
  useEffect(() => {
    load();
  }, [load]);

  function openEditor(rule) {
    setModalError("");
    setEditing(rule || { id: null });
    setDraft(
      rule
        ? {
            thresholdPaidReferrals: String(rule.thresholdPaidReferrals),
            bonusAmountJod: String(rule.bonusAmountMinor / 1000),
            label: rule.label || "",
            effectiveFrom: rule.effectiveFrom ? String(rule.effectiveFrom).slice(0, 10) : "",
            enabled: rule.enabled,
          }
        : EMPTY_RULE,
    );
  }

  async function persist(rule, body) {
    setBusy(true);
    setModalError("");
    try {
      if (rule?.id) await updateReferralRewardRequest(rule.id, body);
      else await createReferralRewardRequest(body);
      push({ type: "success", message: t("referrals.admin.ruleSaved") });
      setEditing(null);
      await load();
    } catch (err) {
      const message = referralErrorMessage(err, t);
      if (editing) setModalError(message);
      else push({ type: "error", message });
    } finally {
      setBusy(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    const awarded = editing?.awards > 0;
    const body = awarded
      ? { label: draft.label, enabled: draft.enabled }
      : {
          thresholdPaidReferrals: Number(draft.thresholdPaidReferrals),
          bonusAmountJod: draft.bonusAmountJod,
          label: draft.label,
          enabled: draft.enabled,
          effectiveFrom: draft.effectiveFrom || undefined,
        };
    persist(editing, body);
  }

  if (error) return <DashboardErrorState message={error} />;
  if (!rules) return <DashboardLoadingState />;
  const awardedEdit = editing?.awards > 0;

  return (
    <DashboardSection
      title={t("referrals.admin.tabs.rewards")}
      description={t("referrals.admin.rewardsHint")}
      actions={
        <Button type="button" onClick={() => openEditor(null)}>
          {t("referrals.admin.addRule")}
        </Button>
      }
    >
      {rules.length === 0 ? (
        <DashboardEmptyState title={t("referrals.dashboard.empty")} />
      ) : (
        <DashboardTable caption={t("referrals.admin.tabs.rewards")}>
          <thead>
            <tr>
              <th>{t("referrals.admin.label")}</th>
              <th>{t("referrals.admin.threshold")}</th>
              <th>{t("referrals.admin.bonus")}</th>
              <th>{t("referrals.admin.effectiveFrom")}</th>
              <th>{t("referrals.admin.awards")}</th>
              <th>{t("referrals.dashboard.status")}</th>
              <th>{t("referrals.admin.createdBy")}</th>
              <th aria-label={t("referrals.admin.edit")} />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.label || "—"}</td>
                <td>{rule.thresholdPaidReferrals}</td>
                <td>{money(rule.bonusAmountMinor)}</td>
                <td>{formatLocaleDate(rule.effectiveFrom, locale)}</td>
                <td>{rule.awards}</td>
                <td>
                  <StatusBadge tone={rule.enabled ? "active" : "inactive"}>
                    {rule.enabled ? t("referrals.admin.enableRule") : t("referrals.admin.disableRule")}
                  </StatusBadge>
                </td>
                <td>
                  {rule.createdByName || "—"}
                  <div className="oh-sa-users-cell-sub">{formatLocaleDate(rule.createdAt, locale)}</div>
                </td>
                <td>
                  <div className="oh-sa-users-actions-row">
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => openEditor(rule)}>
                      {t("referrals.admin.edit")}
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => persist(rule, { enabled: !rule.enabled })}>
                      {rule.enabled ? t("referrals.admin.disableRule") : t("referrals.admin.enableRule")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DashboardTable>
      )}
      <Modal
        open={Boolean(editing)}
        busy={busy}
        title={editing?.id ? t("referrals.admin.editRule") : t("referrals.admin.addRule")}
        onClose={() => !busy && setEditing(null)}
      >
        <form className="oh-sa-users-modal__body" onSubmit={submit}>
          {awardedEdit ? <p className="oh-sa-users-modal__desc">{t("referrals.admin.ruleAwardedHint")}</p> : null}
          <div className="oh-sa-users-form-grid">
            <label className="oh-sa-users-field">
              <span>{t("referrals.admin.threshold")}</span>
              <input
                value={draft.thresholdPaidReferrals}
                onChange={(e) => setDraft((d) => ({ ...d, thresholdPaidReferrals: e.target.value }))}
                inputMode="numeric"
                dir="ltr"
                required={!awardedEdit}
                disabled={busy || awardedEdit}
              />
            </label>
            <label className="oh-sa-users-field">
              <span>{t("referrals.admin.bonus")}</span>
              <input
                value={draft.bonusAmountJod}
                onChange={(e) => setDraft((d) => ({ ...d, bonusAmountJod: e.target.value }))}
                inputMode="decimal"
                dir="ltr"
                required={!awardedEdit}
                disabled={busy || awardedEdit}
              />
            </label>
            <label className="oh-sa-users-field">
              <span>{t("referrals.admin.effectiveFrom")}</span>
              <input
                type="date"
                value={draft.effectiveFrom}
                onChange={(e) => setDraft((d) => ({ ...d, effectiveFrom: e.target.value }))}
                disabled={busy || awardedEdit}
              />
            </label>
            <label className="oh-sa-users-field">
              <span>{t("referrals.admin.label")}</span>
              <input
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                maxLength={120}
                placeholder={t("referrals.admin.labelOptional")}
                disabled={busy}
              />
            </label>
          </div>
          <label className="oh-sa-users-check">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} disabled={busy} />
            <span>{t("referrals.admin.enableRule")}</span>
          </label>
          {modalError ? <div className="oh-sa-users-modal__error">{modalError}</div> : null}
          <footer className="oh-sa-users-modal__footer">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              {t("referrals.admin.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("referrals.admin.working") : t("referrals.admin.confirm")}
            </Button>
          </footer>
        </form>
      </Modal>
    </DashboardSection>
  );
}

function policyToDraft(policy) {
  return {
    enabled: Boolean(policy.enabled),
    calculationMode: policy.calculationMode,
    percentage: policy.percentageBps != null ? String(policy.percentageBps / 100) : "10",
    fixedAmountJod: policy.fixedAmountMinor != null ? String(policy.fixedAmountMinor / 1000) : "5",
    commissionHoldDays: String(policy.commissionHoldDays),
    minimumWithdrawalJod: String(policy.minimumWithdrawalMinor / 1000),
    eligiblePaymentTypes: [...(policy.eligiblePaymentTypes || [])],
    discountEnabled: Boolean(policy.discountEnabled),
    discountMode: policy.discountMode || "percentage",
    discountPercentage: policy.discountPercentageBps != null ? String(policy.discountPercentageBps / 100) : "10",
    discountFixedJod: policy.discountFixedMinor != null ? String(policy.discountFixedMinor / 1000) : "5",
    discountPaymentTypes: policy.discountPaymentTypes?.length ? [...policy.discountPaymentTypes] : [...PAYMENT_TYPES],
  };
}

function TypeChecks({ value, onChange, disabled }) {
  const { t } = useTranslation();
  return (
    <div className="oh-sa-users-stack">
      {PAYMENT_TYPES.map((type) => (
        <label key={type} className="oh-sa-users-check">
          <input
            type="checkbox"
            checked={value.includes(type)}
            disabled={disabled}
            onChange={(e) => {
              const next = new Set(value);
              if (e.target.checked) next.add(type);
              else next.delete(type);
              onChange(PAYMENT_TYPES.filter((p) => next.has(p)));
            }}
          />
          <span>{type === "training_package_purchase" ? t("referrals.admin.training") : t("referrals.admin.membership")}</span>
        </label>
      ))}
    </div>
  );
}

function SettingsTab({ money, onSaved }) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const [current, setCurrent] = useState(null);
  const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [settings, versions] = await Promise.all([getReferralSettingsRequest(), getReferralPolicyHistoryRequest()]);
      setCurrent(settings.data.data);
      setDraft(policyToDraft(settings.data.data));
      setHistory(versions.data.data);
    } catch (err) {
      setError(referralErrorMessage(err, t));
    }
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      await saveReferralSettingsRequest({
        confirm: true,
        enabled: draft.enabled,
        calculationMode: draft.calculationMode,
        percentage: draft.calculationMode === "percentage" ? draft.percentage : undefined,
        fixedAmountJod: draft.calculationMode === "fixed" ? draft.fixedAmountJod : undefined,
        commissionHoldDays: Number(draft.commissionHoldDays),
        minimumWithdrawalJod: draft.minimumWithdrawalJod,
        eligiblePaymentTypes: draft.eligiblePaymentTypes,
        discountEnabled: draft.discountEnabled,
        discountMode: draft.discountEnabled ? draft.discountMode : undefined,
        discountPercentage: draft.discountEnabled && draft.discountMode === "percentage" ? draft.discountPercentage : undefined,
        discountFixedJod: draft.discountEnabled && draft.discountMode === "fixed" ? draft.discountFixedJod : undefined,
        discountPaymentTypes: draft.discountEnabled ? draft.discountPaymentTypes : [],
      });
      push({ type: "success", message: t("referrals.admin.saved") });
      setConfirm(false);
      await load();
      onSaved?.();
    } catch (err) {
      setConfirm(false);
      push({ type: "error", message: referralErrorMessage(err, t) });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <DashboardErrorState message={error} />;
  if (!draft) return <DashboardLoadingState />;
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const enabling = draft.enabled && !current.enabled;

  return (
    <>
      <DashboardSection
        title={t("referrals.admin.tabs.settings")}
        actions={
          <StatusBadge tone={current.enabled ? "active" : "inactive"}>
            v{current.id} · {current.enabled ? t("referrals.admin.programState.on") : t("referrals.admin.programState.off")}
          </StatusBadge>
        }
      >
        <div className="oh-sa-users-stack">
          <p className="oh-sa-users-note" role="alert">
            {t("referrals.admin.confirmBody")}
          </p>
          <label className="oh-sa-users-check">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} disabled={busy} />
            <span>
              <strong>{t("referrals.admin.enabled")}</strong> — {t("referrals.admin.enabledOn")}
            </span>
          </label>
          <div className="oh-sa-users-form-grid">
            <label className="oh-sa-users-field">
              <span>{t("referrals.admin.mode")}</span>
              <select value={draft.calculationMode} onChange={(e) => set({ calculationMode: e.target.value })} disabled={busy}>
                <option value="percentage">{t("referrals.admin.percentage")}</option>
                <option value="fixed">{t("referrals.admin.fixed")}</option>
              </select>
            </label>
            {draft.calculationMode === "percentage" ? (
              <label className="oh-sa-users-field">
                <span>{t("referrals.admin.percentValue")}</span>
                <input value={draft.percentage} onChange={(e) => set({ percentage: e.target.value })} inputMode="decimal" dir="ltr" disabled={busy} />
              </label>
            ) : (
              <label className="oh-sa-users-field">
                <span>{t("referrals.admin.fixedValue")}</span>
                <input value={draft.fixedAmountJod} onChange={(e) => set({ fixedAmountJod: e.target.value })} inputMode="decimal" dir="ltr" disabled={busy} />
              </label>
            )}
            <label className="oh-sa-users-field">
              <span>{t("referrals.admin.hold")}</span>
              <input value={draft.commissionHoldDays} onChange={(e) => set({ commissionHoldDays: e.target.value })} inputMode="numeric" dir="ltr" disabled={busy} />
            </label>
            <label className="oh-sa-users-field">
              <span>{t("referrals.admin.minimum")}</span>
              <input value={draft.minimumWithdrawalJod} onChange={(e) => set({ minimumWithdrawalJod: e.target.value })} inputMode="decimal" dir="ltr" disabled={busy} />
            </label>
          </div>
          <section className="oh-sa-users-gates" aria-label={t("referrals.admin.types")}>
            <h3>{t("referrals.admin.types")}</h3>
            <TypeChecks value={draft.eligiblePaymentTypes} onChange={(v) => set({ eligiblePaymentTypes: v })} disabled={busy} />
            <p className="oh-sa-users-muted mt-2">{t("referrals.admin.typesHint")}</p>
          </section>
          <section className="oh-sa-users-gates" aria-label={t("referrals.admin.discount")}>
            <h3>{t("referrals.admin.discount")}</h3>
            <label className="oh-sa-users-check">
              <input type="checkbox" checked={draft.discountEnabled} onChange={(e) => set({ discountEnabled: e.target.checked })} disabled={busy} />
              <span>{t("referrals.admin.discountEnabled")}</span>
            </label>
            {draft.discountEnabled ? (
              <div className="oh-sa-users-stack mt-3">
                <div className="oh-sa-users-form-grid">
                  <label className="oh-sa-users-field">
                    <span>{t("referrals.admin.discountMode")}</span>
                    <select value={draft.discountMode} onChange={(e) => set({ discountMode: e.target.value })} disabled={busy}>
                      <option value="percentage">{t("referrals.admin.percentage")}</option>
                      <option value="fixed">{t("referrals.admin.fixed")}</option>
                    </select>
                  </label>
                  {draft.discountMode === "percentage" ? (
                    <label className="oh-sa-users-field">
                      <span>{t("referrals.admin.discountPercent")}</span>
                      <input value={draft.discountPercentage} onChange={(e) => set({ discountPercentage: e.target.value })} inputMode="decimal" dir="ltr" disabled={busy} />
                      <small className="oh-sa-users-muted">{t("referrals.admin.discountPercentHint")}</small>
                    </label>
                  ) : (
                    <label className="oh-sa-users-field">
                      <span>{t("referrals.admin.discountFixed")}</span>
                      <input value={draft.discountFixedJod} onChange={(e) => set({ discountFixedJod: e.target.value })} inputMode="decimal" dir="ltr" disabled={busy} />
                    </label>
                  )}
                </div>
                <span className="oh-sa-users-muted">{t("referrals.admin.discountTypes")}</span>
                <TypeChecks value={draft.discountPaymentTypes} onChange={(v) => set({ discountPaymentTypes: v })} disabled={busy} />
              </div>
            ) : null}
          </section>
          <div className="oh-sa-users-actions-row">
            <Button type="button" onClick={() => setConfirm(true)} disabled={busy}>
              {t("referrals.admin.save")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDraft(policyToDraft(current))} disabled={busy}>
              {t("referrals.admin.cancel")}
            </Button>
          </div>
        </div>
      </DashboardSection>
      <DashboardSection title={t("referrals.admin.history")} description={t("referrals.admin.historyHint")}>
        <DashboardTable caption={t("referrals.admin.history")}>
          <thead>
            <tr>
              <th>{t("referrals.admin.version")}</th>
              <th>{t("referrals.admin.enabled")}</th>
              <th>{t("referrals.admin.mode")}</th>
              <th>{t("referrals.admin.value")}</th>
              <th>{t("referrals.admin.types")}</th>
              <th>{t("referrals.admin.hold")}</th>
              <th>{t("referrals.admin.minimum")}</th>
              <th>{t("referrals.admin.discount")}</th>
              <th>{t("referrals.admin.referralCount")}</th>
              <th>{t("referrals.admin.effective")}</th>
              <th>{t("referrals.admin.createdBy")}</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.id}>
                <td>v{row.id}</td>
                <td>
                  <StatusBadge tone={row.enabled ? "active" : "inactive"}>
                    {row.enabled ? t("referrals.admin.programState.on") : t("referrals.admin.programState.off")}
                  </StatusBadge>
                </td>
                <td>{t(`referrals.common.modes.${row.calculationMode}`)}</td>
                <td dir="ltr">{formatCommissionRate(row, locale)}</td>
                <td>{row.eligiblePaymentTypes.map((p) => t(`referrals.common.paymentTypes.${p}`)).join(locale === "ar" ? "، " : ", ")}</td>
                <td>{row.commissionHoldDays}</td>
                <td>{money(row.minimumWithdrawalMinor)}</td>
                <td>
                  {row.discountEnabled ? (
                    <>
                      <span dir="ltr">
                        {row.discountMode === "percentage" ? `${(row.discountPercentageBps || 0) / 100}%` : money(row.discountFixedMinor)}
                      </span>
                      <div className="oh-sa-users-cell-sub">
                        {(row.discountPaymentTypes || []).map((p) => t(`referrals.common.paymentTypes.${p}`)).join(locale === "ar" ? "، " : ", ")}
                      </div>
                    </>
                  ) : (
                    t("referrals.admin.discountOff")
                  )}
                </td>
                <td>{row.referralCount}</td>
                <td>{formatLocaleDateTime(row.createdAt, locale)}</td>
                <td>{row.createdByName || t("referrals.admin.system")}</td>
              </tr>
            ))}
          </tbody>
        </DashboardTable>
      </DashboardSection>
      <ConfirmDialog
        open={confirm}
        title={t("referrals.admin.confirmTitle")}
        body={enabling ? `${t("referrals.admin.confirmBody")} ${t("referrals.admin.confirmEnable")}` : t("referrals.admin.confirmBody")}
        confirmLabel={t("referrals.admin.save")}
        cancelLabel={t("referrals.admin.cancel")}
        confirmBusy={busy}
        confirmVariant={enabling ? "danger" : "primary"}
        onCancel={() => !busy && setConfirm(false)}
        onConfirm={save}
      />
    </>
  );
}

export default function SuperAdminReferralsPage() {
  const { t, locale } = useTranslation();
  const [tab, setTab] = useState("overview");
  const [summary, setSummary] = useState(null);
  const money = useCallback((minor) => formatMinorJod(minor, locale), [locale]);

  const loadSummary = useCallback(() => {
    Promise.all([getReferralSettingsRequest(), getReferralOverviewRequest(rangeParams("30"))])
      .then(([settings, ov]) =>
        setSummary({
          enabled: Boolean(settings.data.data?.enabled),
          openWithdrawals: (ov.data.data?.pendingWithdrawals || 0) + (ov.data.data?.approvedWithdrawals || 0),
        }),
      )
      .catch(() => setSummary(null));
  }, []);
  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  return (
    <DashboardShell>
      <DashboardSection className="oh-sa-users-list-section">
        <header className="oh-sa-users-list-head">
          <div className="oh-sa-users-list-head__top">
            <div className="oh-sa-users-list-head__titles">
              <h2 className="oh-sa-users-list-head__title">{t("referrals.admin.title")}</h2>
              <p className="oh-sa-users-list-head__desc">{t("referrals.admin.description")}</p>
            </div>
            {summary ? (
              <StatusBadge tone={summary.enabled ? "active" : "inactive"}>
                {summary.enabled ? t("referrals.admin.programState.on") : t("referrals.admin.programState.off")}
              </StatusBadge>
            ) : null}
          </div>
          <div className="oh-sa-users-toolbar__tabs" role="tablist" aria-label={t("referrals.admin.title")}>
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`oh-sa-users-tab${tab === id ? " is-active" : ""}`}
                onClick={() => setTab(id)}
              >
                <span className="oh-sa-users-tab__label">{t(`referrals.admin.tabs.${id}`)}</span>
                {id === "withdrawals" && summary?.openWithdrawals ? (
                  <span className="oh-sa-users-tab__badge">{summary.openWithdrawals}</span>
                ) : null}
              </button>
            ))}
          </div>
        </header>
      </DashboardSection>
      {tab === "overview" ? <OverviewTab money={money} /> : null}
      {tab === "referrals" ? <ReferralsTab money={money} /> : null}
      {tab === "commissions" ? <CommissionsTab money={money} /> : null}
      {tab === "withdrawals" ? <WithdrawalsTab money={money} onChanged={loadSummary} /> : null}
      {tab === "rewards" ? <RewardsTab money={money} /> : null}
      {tab === "settings" ? <SettingsTab money={money} onSaved={loadSummary} /> : null}
    </DashboardShell>
  );
}
