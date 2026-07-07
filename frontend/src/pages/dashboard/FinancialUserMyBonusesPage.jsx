import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getFinancialUserMyBonusesRequest, getFinancialUserSummaryRequest } from "../../services/api";
import { currentMonthKey, monthOptions } from "./financialCenter/financialCenterCalculations";
import FinancialCenterScrollSelect from "./financialCenter/FinancialCenterScrollSelect";
import FinancialCenterTableWrap from "./financialCenter/FinancialCenterTableWrap";
import { allocationPaidBadge } from "./financialCenter/financialCenterAuditLabels";
import "./financialCenter/superAdminFinancialCenter.css";

function formatMoney(value, currency = "JOD") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${new Intl.NumberFormat("ar-JO-u-nu-latn", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function sourceLabel(type, t) {
  if (type === "manual") return t("dashboard.financialCenter.sourceManual");
  if (type === "subscription_payment") return t("dashboard.financialCenter.sourceSubscriptions");
  if (type === "order_payment") return t("dashboard.financialCenter.sourceOrders");
  return type;
}

export default function FinancialUserMyBonusesPage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const [monthFilter, setMonthFilter] = useState("");
  const [busy, setBusy] = useState(true);
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const currency = t("dashboard.financialCenter.currency");

  const months = useMemo(
    () => [
      { value: "", label: t("dashboard.financialUser.allMonths") },
      ...monthOptions(18).map((m) => ({ value: m, label: m })),
    ],
    [t],
  );

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [summaryRes, bonusesRes] = await Promise.all([
        getFinancialUserSummaryRequest(),
        getFinancialUserMyBonusesRequest({ month: monthFilter || undefined }),
      ]);
      setSummary(summaryRes?.data?.summary || null);
      setItems(bonusesRes?.data?.items || []);
    } catch (e) {
      push(e?.response?.data?.message || t("dashboard.financialUser.loadError"), "error");
    } finally {
      setBusy(false);
    }
  }, [monthFilter, push, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("dashboard.financialUser.myBonuses")}
        description={
          summary?.fullName
            ? t("dashboard.financialUser.welcome", { name: summary.fullName })
            : t("dashboard.financialUser.description")
        }
      />

      <div className="fc-page">
        <div className="fc-filters">
          <label>
            {t("dashboard.financialCenter.month")}:{" "}
            <FinancialCenterScrollSelect
              value={monthFilter}
              onChange={setMonthFilter}
              options={months}
              placeholder={t("dashboard.financialUser.allMonths")}
              ariaLabel={t("dashboard.financialCenter.month")}
            />
          </label>
        </div>

        {busy && !summary ? (
          <DashboardLoadingState />
        ) : (
          <div className="fc-summary-grid">
            <div className="fc-summary-card">
              <span className="fc-summary-card__label">{t("dashboard.financialUser.totalBonus")}</span>
              <strong className="fc-summary-card__value">{formatMoney(summary?.totalBonus, currency)}</strong>
            </div>
            <div className="fc-summary-card">
              <span className="fc-summary-card__label">{t("dashboard.financialUser.totalPaid")}</span>
              <strong className="fc-summary-card__value">{formatMoney(summary?.totalPaid, currency)}</strong>
            </div>
            <div className="fc-summary-card">
              <span className="fc-summary-card__label">{t("dashboard.financialUser.totalUnpaid")}</span>
              <strong className="fc-summary-card__value">{formatMoney(summary?.totalUnpaid, currency)}</strong>
            </div>
            <div className="fc-summary-card">
              <span className="fc-summary-card__label">{t("dashboard.financialUser.monthBonus")}</span>
              <strong className="fc-summary-card__value">{formatMoney(summary?.monthBonus, currency)}</strong>
            </div>
            <div className="fc-summary-card">
              <span className="fc-summary-card__label">{t("dashboard.financialUser.lastPayment")}</span>
              <strong className="fc-summary-card__value">{formatDate(summary?.lastPaidAt)}</strong>
            </div>
          </div>
        )}

        <DashboardSection title={t("dashboard.financialUser.bonusTable")}>
          {!items.length && !busy ? (
            <DashboardEmptyState title={t("dashboard.financialUser.noBonuses")} />
          ) : (
            <FinancialCenterTableWrap>
              <table className="fc-table">
                <thead>
                  <tr>
                    <th>{t("dashboard.financialCenter.month")}</th>
                    <th>{t("dashboard.financialUser.bonusTitle")}</th>
                    <th>{t("dashboard.financialCenter.sourceType")}</th>
                    <th>{t("dashboard.financialUser.poolAmount")}</th>
                    <th>{t("dashboard.financialUser.myShare")}</th>
                    <th>{t("dashboard.financialUser.myAmount")}</th>
                    <th>{t("dashboard.financialCenter.status")}</th>
                    <th>{t("dashboard.financialUser.paidAt")}</th>
                    <th>{t("dashboard.financialUser.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const paid = allocationPaidBadge(item.paidStatus, t);
                    return (
                      <tr key={item.allocationId}>
                        <td>{item.monthKey}</td>
                        <td>{item.title}</td>
                        <td>{sourceLabel(item.sourceType, t)}</td>
                        <td>{formatMoney(item.bonusPoolAmount, currency)}</td>
                        <td>{item.percentageShare}%</td>
                        <td>{formatMoney(item.myAmount, currency)}</td>
                        <td>
                          <StatusBadge tone={paid.tone}>{paid.label}</StatusBadge>
                        </td>
                        <td>{formatDate(item.paidAt)}</td>
                        <td>{item.note || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </FinancialCenterTableWrap>
          )}
        </DashboardSection>
      </div>
    </DashboardShell>
  );
}
