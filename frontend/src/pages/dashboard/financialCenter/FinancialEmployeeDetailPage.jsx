import "../../../i18n/financeResources";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import DashboardPageHeader from "../../../components/dashboard/DashboardPageHeader";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardModal from "../../../components/dashboard/DashboardModal";
import DashboardFieldGroup from "../../../components/dashboard/DashboardFieldGroup";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import { useToast } from "../../../components/ui/toastContext";
import { useTranslation } from "../../../i18n/LanguageProvider";
import {
  activateFinancialCenterPersonAccountRequest,
  createFinancialCenterPersonAccountRequest,
  getFinancialCenterPersonBonusDetailsRequest,
  getFinancialCenterPersonRequest,
  listFinancialCenterDepartmentsRequest,
  suspendFinancialCenterPersonAccountRequest,
  updateFinancialCenterPersonRequest,
} from "../../../services/api";
import FinancialDepartmentCombobox from "./FinancialDepartmentCombobox";
import FinancialCenterTableWrap from "./FinancialCenterTableWrap";
import { allocationPaidBadge, getAuditActionLabel } from "./financialCenterAuditLabels";
import { getFinancialDepartmentLabel } from "./financialDepartmentLabels";
import {
  accountStatusBadge,
  FcTdEllipsis,
  formatDate,
  formatMoney,
  sourceLabel,
} from "./financialCenterDisplayUtils";
import { currentMonthKey } from "./financialCenterCalculations";
import "./superAdminFinancialCenter.css";

const FC_CENTER_PATH = "/dashboard/super-admin/financial-center";

const EMPTY_PERSON_FORM = {
  fullName: "",
  email: "",
  phone: "",
  jobTitle: "",
  department: "",
  departmentId: "",
  notes: "",
  status: "active",
  paymentMethod: "",
  paymentDetails: "",
};

const EMPTY_ACCOUNT_FORM = {
  loginEmail: "",
  password: "",
  confirmPassword: "",
};

function DetailField({ label, children }) {
  return (
    <div className="fc-detail-field">
      <span className="fc-detail-field__label">{label}</span>
      <div className="fc-detail-field__value">{children ?? "—"}</div>
    </div>
  );
}

export default function FinancialEmployeeDetailPage() {
  const { personId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [person, setPerson] = useState(null);
  const [bonusDetails, setBonusDetails] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [personModal, setPersonModal] = useState(false);
  const [personForm, setPersonForm] = useState(EMPTY_PERSON_FORM);
  const [accountModal, setAccountModal] = useState(false);
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT_FORM);
  const [actionBusy, setActionBusy] = useState(false);

  const currency = t("finance.financialCenter.currency");
  const monthKey = currentMonthKey();

  const loadData = useCallback(async () => {
    if (!personId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    try {
      const [personRes, bonusRes] = await Promise.all([
        getFinancialCenterPersonRequest(personId),
        getFinancialCenterPersonBonusDetailsRequest(personId),
      ]);
      setPerson(personRes?.data?.person || null);
      setAuditLogs(personRes?.data?.auditLogs || []);
      setBonusDetails(bonusRes?.data || null);
    } catch (e) {
      if (e?.response?.status === 404) {
        setNotFound(true);
        setPerson(null);
      } else {
        push(e?.response?.data?.message || t("finance.financialCenter.loadDetailsError"), "error");
      }
    } finally {
      setLoading(false);
    }
  }, [personId, push, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void listFinancialCenterDepartmentsRequest()
      .then((res) => setDepartments(res?.data?.departments || []))
      .catch(() => setDepartments([]));
  }, []);

  const lastPaymentAt = useMemo(() => {
    const paidDates = (bonusDetails?.items || [])
      .map((item) => item.paidAt)
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);
    if (paidDates.length) {
      return new Date(Math.max(...paidDates)).toISOString();
    }
    return person?.lastBonusAt || null;
  }, [bonusDetails, person]);

  const currentMonthBonus = useMemo(() => {
    const fromApi = bonusDetails?.currentMonthBonus;
    if (fromApi != null) return fromApi;
    return (bonusDetails?.items || [])
      .filter((item) => item.monthKey === monthKey)
      .reduce((sum, item) => sum + (Number(item.calculatedAmount) || 0), 0);
  }, [bonusDetails, monthKey]);

  const openEditPerson = () => {
    if (!person) return;
    setPersonForm({
      fullName: person.fullName || "",
      email: person.email || "",
      phone: person.phone || "",
      jobTitle: person.jobTitle || "",
      department: person.department || "",
      departmentId: person.departmentId || "",
      notes: person.notes || "",
      status: person.status || "active",
      paymentMethod: person.paymentMethod || "",
      paymentDetails: person.paymentDetails || "",
    });
    setPersonModal(true);
  };

  const savePerson = async () => {
    if (!String(personForm.fullName || "").trim()) {
      push(t("finance.financialCenter.fullNameRequired"), "error");
      return;
    }
    setActionBusy(true);
    try {
      await updateFinancialCenterPersonRequest(personId, personForm);
      push(t("finance.financialCenter.personUpdated"), "success");
      setPersonModal(false);
      await loadData();
    } catch (e) {
      push(e?.response?.data?.message || t("finance.financialCenter.actionFailed"), "error");
    } finally {
      setActionBusy(false);
    }
  };

  const openAccountModal = () => {
    if (!person) return;
    setAccountForm({
      loginEmail: person.loginEmail || person.email || "",
      password: "",
      confirmPassword: "",
    });
    setAccountModal(true);
  };

  const saveAccount = async () => {
    const email = String(accountForm.loginEmail || "").trim();
    if (!email) {
      push(t("finance.financialCenter.emailRequired"), "error");
      return;
    }
    if (!accountForm.password || accountForm.password.length < 8) {
      push(t("finance.financialCenter.passwordMinLength"), "error");
      return;
    }
    if (accountForm.password !== accountForm.confirmPassword) {
      push(t("finance.financialCenter.passwordMismatch"), "error");
      return;
    }
    setActionBusy(true);
    try {
      await createFinancialCenterPersonAccountRequest(personId, {
        loginEmail: email,
        password: accountForm.password,
      });
      push(t("finance.financialCenter.accountCreatedOk"), "success");
      setAccountModal(false);
      await loadData();
    } catch (e) {
      push(e?.response?.data?.message || t("finance.financialCenter.accountCreateError"), "error");
    } finally {
      setActionBusy(false);
    }
  };

  const toggleAccountStatus = async (suspend) => {
    if (!person || actionBusy) return;
    if (suspend && !window.confirm(t("finance.financialCenter.confirmSuspendAccount"))) return;
    setActionBusy(true);
    try {
      const fn = suspend ? suspendFinancialCenterPersonAccountRequest : activateFinancialCenterPersonAccountRequest;
      await fn(person.id);
      push(
        suspend ? t("finance.financialCenter.accountSuspendedOk") : t("finance.financialCenter.accountActivatedOk"),
        "success",
      );
      await loadData();
    } catch (e) {
      push(e?.response?.data?.message || t("finance.financialCenter.accountUpdateError"), "error");
    } finally {
      setActionBusy(false);
    }
  };

  const breadcrumbs = [
    { labelKey: "dashboard.breadcrumbs.home", href: "/dashboard/super-admin" },
    { labelKey: "dashboard.breadcrumbs.financialCenter", href: FC_CENTER_PATH },
    { label: person?.fullName || t("finance.financialCenter.employeeDetail.title") },
  ];

  if (loading && !person) {
    return (
      <DashboardShell className="fc-financial-center">
        <DashboardLoadingState />
      </DashboardShell>
    );
  }

  if (notFound) {
    return (
      <DashboardShell className="fc-financial-center">
        <DashboardPageHeader
          title={t("finance.financialCenter.employeeDetail.title")}
          breadcrumbs={breadcrumbs}
        />
        <DashboardEmptyState title={t("finance.financialCenter.employeeDetail.notFound")} />
        <Link to={FC_CENTER_PATH} className="btn btn-secondary mt-3">
          {t("finance.financialCenter.employeeDetail.backToCenter")}
        </Link>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="fc-financial-center">
      <DashboardPageHeader
        eyebrow={t("dashboard.nav.superAdmin.panelTitle")}
        title={person?.fullName || t("finance.financialCenter.employeeDetail.title")}
        description={t("finance.financialCenter.employeeDetail.description")}
        breadcrumbs={breadcrumbs}
        statusBadge={
          <span className={`fc-badge fc-badge--${person?.status === "active" ? "active" : "inactive"}`}>
            {person?.status === "active"
              ? t("finance.financialCenter.active")
              : t("finance.financialCenter.inactive")}
          </span>
        }
        actions={
          <div className="fc-detail-header-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate(FC_CENTER_PATH)}>
              {t("finance.financialCenter.employeeDetail.backToCenter")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={openEditPerson}>
              {t("finance.financialCenter.edit")}
            </button>
          </div>
        }
      />

      <div className="fc-page">
        <div className="fc-detail-meta">
          {(person?.departmentId || person?.departmentName) && (
            <span className="fc-badge fc-badge--dept">{getFinancialDepartmentLabel(person, t)}</span>
          )}
          {accountStatusBadge(person?.accountStatus, t)}
        </div>

        <DashboardSection title={t("finance.financialCenter.employeeDetail.employeeInfo")}>
          <div className="fc-detail-grid">
            <DetailField label={t("finance.financialCenter.colName")}>{person?.fullName}</DetailField>
            <DetailField label={t("finance.financialCenter.colEmail")}>
              <span dir="ltr">{person?.email || "—"}</span>
            </DetailField>
            <DetailField label={t("finance.financialCenter.colPhone")}>
              <span dir="ltr">{person?.phone || "—"}</span>
            </DetailField>
            <DetailField label={t("finance.financialCenter.colDepartment")}>
              {getFinancialDepartmentLabel(person, t)}
            </DetailField>
            <DetailField label={t("finance.financialCenter.colJobTitle")}>{person?.jobTitle}</DetailField>
            <DetailField label={t("finance.financialCenter.colPaymentMethod")}>{person?.paymentMethod}</DetailField>
            <DetailField label={t("finance.financialCenter.colPaymentDetails")}>{person?.paymentDetails}</DetailField>
            <DetailField label={t("finance.financialCenter.colNotes")}>{person?.notes}</DetailField>
            <DetailField label={t("finance.financialCenter.employeeDetail.addedAt")}>
              {formatDate(person?.createdAt)}
            </DetailField>
          </div>
        </DashboardSection>

        <DashboardSection title={t("finance.financialCenter.employeeDetail.loginAccount")}>
          <div className="fc-preview-box">
            <div className="fc-preview-row">
              <span>{t("finance.financialCenter.accountStatus")}</span>
              {accountStatusBadge(person?.accountStatus, t)}
            </div>
            {person?.loginEmail ? (
              <div className="fc-preview-row">
                <span>{t("finance.financialCenter.loginEmail")}</span>
                <strong dir="ltr">{person.loginEmail}</strong>
              </div>
            ) : null}
            {person?.accountCreatedAt ? (
              <div className="fc-preview-row">
                <span>{t("finance.financialCenter.accountCreatedAt")}</span>
                <strong>{formatDate(person.accountCreatedAt)}</strong>
              </div>
            ) : null}
            <div className="fc-actions">
              {person?.accountStatus === "none" ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={openAccountModal}>
                  {t("finance.financialCenter.createLoginAccount")}
                </button>
              ) : null}
              {person?.accountStatus === "active" ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={actionBusy}
                  onClick={() => toggleAccountStatus(true)}
                >
                  {t("finance.financialCenter.suspendAccount")}
                </button>
              ) : null}
              {person?.accountStatus === "suspended" ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={actionBusy}
                  onClick={() => toggleAccountStatus(false)}
                >
                  {t("finance.financialCenter.activateAccount")}
                </button>
              ) : null}
            </div>
          </div>
        </DashboardSection>

        <div className="fc-summary-grid">
          <div className="fc-summary-card">
            <span className="fc-summary-card__label">{t("finance.financialCenter.colTotalBonus")}</span>
            <strong className="fc-summary-card__value">{formatMoney(person?.totalBonus, currency)}</strong>
          </div>
          <div className="fc-summary-card">
            <span className="fc-summary-card__label">{t("finance.financialCenter.colPaid")}</span>
            <strong className="fc-summary-card__value">{formatMoney(person?.totalPaid, currency)}</strong>
          </div>
          <div className="fc-summary-card">
            <span className="fc-summary-card__label">{t("finance.financialCenter.colUnpaid")}</span>
            <strong className="fc-summary-card__value">{formatMoney(person?.totalUnpaid, currency)}</strong>
          </div>
          <div className="fc-summary-card">
            <span className="fc-summary-card__label">{t("finance.financialUser.monthBonus")}</span>
            <strong className="fc-summary-card__value">{formatMoney(currentMonthBonus, currency)}</strong>
          </div>
          <div className="fc-summary-card">
            <span className="fc-summary-card__label">{t("finance.financialCenter.employeeDetail.lastPayment")}</span>
            <strong className="fc-summary-card__value">{formatDate(lastPaymentAt)}</strong>
          </div>
        </div>

        <DashboardSection title={t("finance.financialCenter.employeeDetail.employeeBonuses")}>
          {!bonusDetails?.items?.length ? (
            <DashboardEmptyState title={t("finance.financialCenter.employeeDetail.noBonuses")} />
          ) : (
            <FinancialCenterTableWrap>
              <table className="fc-table fc-table--employee-bonus fc-table--fixed">
                <colgroup>
                  <col className="fc-colw-month" />
                  <col className="fc-colw-title" />
                  <col className="fc-colw-source" />
                  <col className="fc-colw-money" />
                  <col className="fc-colw-compact" />
                  <col className="fc-colw-money" />
                  <col className="fc-colw-status" />
                  <col className="fc-colw-date" />
                  <col className="fc-colw-note" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t("finance.financialCenter.month")}</th>
                    <th>{t("finance.financialCenter.colTitle")}</th>
                    <th>{t("finance.financialCenter.sourceType")}</th>
                    <th>{t("finance.financialCenter.bonusPoolAmount")}</th>
                    <th>{t("finance.financialCenter.colPercentage")}</th>
                    <th>{t("finance.financialCenter.colAmount")}</th>
                    <th>{t("finance.financialCenter.colPayment")}</th>
                    <th>{t("finance.financialUser.paidAt")}</th>
                    <th>{t("finance.financialUser.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {bonusDetails.items.map((item) => {
                    const paid = allocationPaidBadge(item.paidStatus, t);
                    return (
                      <tr key={item.allocationId}>
                        <td className="fc-col-compact">{item.monthKey}</td>
                        <FcTdEllipsis>{item.title}</FcTdEllipsis>
                        <FcTdEllipsis>{sourceLabel(item.sourceType, t)}</FcTdEllipsis>
                        <td className="fc-col-money">{formatMoney(item.bonusPoolAmount, currency)}</td>
                        <td className="fc-col-compact">{item.percentageShare}%</td>
                        <td className="fc-col-money">{formatMoney(item.calculatedAmount, currency)}</td>
                        <td className="fc-col-compact">
                          <StatusBadge tone={paid.tone}>{paid.label}</StatusBadge>
                        </td>
                        <td className="fc-col-compact">{formatDate(item.paidAt)}</td>
                        <FcTdEllipsis>{item.note || "—"}</FcTdEllipsis>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </FinancialCenterTableWrap>
          )}
        </DashboardSection>

        {auditLogs.length ? (
          <DashboardSection title={t("finance.financialCenter.employeeDetail.auditLog")}>
            <ul className="fc-audit-list">
              {auditLogs.map((log) => (
                <li key={log.id}>
                  <strong>{getAuditActionLabel(log.action, log.entityType, t)}</strong> — {formatDate(log.createdAt)}
                  {log.actorName ? ` · ${log.actorName}` : ""}
                </li>
              ))}
            </ul>
          </DashboardSection>
        ) : null}
      </div>

      <DashboardModal
        open={personModal}
        className="fc-modal"
        title={t("finance.financialCenter.editPerson")}
        onClose={() => setPersonModal(false)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setPersonModal(false)}>
              {t("finance.financialCenter.close")}
            </button>
            <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={savePerson}>
              {t("finance.financialCenter.save")}
            </button>
          </>
        }
      >
        <div className="dash-ui-modal__form" dir="rtl">
          <DashboardFieldGroup label={`${t("finance.financialCenter.colName")} *`}>
            <input
              className="input"
              value={personForm.fullName}
              onChange={(e) => setPersonForm((f) => ({ ...f, fullName: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("finance.financialCenter.colEmail")}>
            <input
              className="input"
              type="email"
              dir="ltr"
              value={personForm.email}
              onChange={(e) => setPersonForm((f) => ({ ...f, email: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("finance.financialCenter.colPhone")}>
            <input
              className="input"
              dir="ltr"
              value={personForm.phone}
              onChange={(e) => setPersonForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("finance.financialCenter.colJobTitle")}>
            <input
              className="input"
              value={personForm.jobTitle}
              onChange={(e) => setPersonForm((f) => ({ ...f, jobTitle: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("finance.financialCenter.colDepartment")}>
            <FinancialDepartmentCombobox
              value={personForm.departmentId}
              onChange={(departmentId) => setPersonForm((f) => ({ ...f, departmentId }))}
              departments={departments}
              onDepartmentCreated={(dept) => setDepartments((list) => [...list, dept])}
              disabled={actionBusy}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("finance.financialCenter.colPaymentMethod")}>
            <input
              className="input"
              value={personForm.paymentMethod}
              onChange={(e) => setPersonForm((f) => ({ ...f, paymentMethod: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("finance.financialCenter.colPaymentDetails")}>
            <textarea
              className="input textarea"
              rows={2}
              value={personForm.paymentDetails}
              onChange={(e) => setPersonForm((f) => ({ ...f, paymentDetails: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("finance.financialCenter.colNotes")}>
            <textarea
              className="input textarea"
              rows={2}
              value={personForm.notes}
              onChange={(e) => setPersonForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("finance.financialCenter.status")}>
            <select
              className="input"
              value={personForm.status}
              onChange={(e) => setPersonForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="active">{t("finance.financialCenter.active")}</option>
              <option value="inactive">{t("finance.financialCenter.inactive")}</option>
            </select>
          </DashboardFieldGroup>
        </div>
      </DashboardModal>

      <DashboardModal
        open={accountModal}
        className="fc-modal"
        title={t("finance.financialCenter.createLoginAccount")}
        onClose={() => setAccountModal(false)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAccountModal(false)}>
              {t("finance.financialCenter.close")}
            </button>
            <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={saveAccount}>
              {t("finance.financialCenter.save")}
            </button>
          </>
        }
      >
        <div className="dash-ui-modal__form" dir="rtl">
          <DashboardFieldGroup label={t("finance.financialCenter.loginEmail")}>
            <input
              className="input"
              type="email"
              dir="ltr"
              value={accountForm.loginEmail}
              onChange={(e) => setAccountForm((f) => ({ ...f, loginEmail: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("finance.financialCenter.password")}>
            <input
              className="input"
              type="password"
              dir="ltr"
              value={accountForm.password}
              onChange={(e) => setAccountForm((f) => ({ ...f, password: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("finance.financialCenter.confirmPassword")}>
            <input
              className="input"
              type="password"
              dir="ltr"
              value={accountForm.confirmPassword}
              onChange={(e) => setAccountForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            />
          </DashboardFieldGroup>
        </div>
      </DashboardModal>
    </DashboardShell>
  );
}
