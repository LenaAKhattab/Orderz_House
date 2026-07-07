import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardModal from "../../components/dashboard/DashboardModal";
import DashboardFieldGroup from "../../components/dashboard/DashboardFieldGroup";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  cancelFinancialCenterBonusRowRequest,
  createFinancialCenterBonusRowRequest,
  createFinancialCenterPersonRequest,
  createFinancialCenterPersonAccountRequest,
  suspendFinancialCenterPersonAccountRequest,
  activateFinancialCenterPersonAccountRequest,
  deactivateFinancialCenterPersonRequest,
  getFinancialCenterBonusRowRequest,
  getFinancialCenterSummaryRequest,
  listFinancialCenterBonusRowsRequest,
  listFinancialCenterOrderPaymentsRequest,
  listFinancialCenterPeopleRequest,
  listFinancialCenterDepartmentsRequest,
  listFinancialCenterSubscriptionPaymentsRequest,
  markFinancialCenterAllocationPaidRequest,
  markFinancialCenterAllocationUnpaidRequest,
  markFinancialCenterAllocationHeldRequest,
  markFinancialCenterBonusRowPaidRequest,
  markFinancialCenterBonusRowReceivedRequest,
  updateFinancialCenterBonusRowRequest,
  updateFinancialCenterPersonRequest,
} from "../../services/api";
import {
  computeBonusPreview,
  currentMonthKey,
  monthOptions,
  roundMoney,
} from "./financialCenter/financialCenterCalculations";
import FinancialDepartmentCombobox from "./financialCenter/FinancialDepartmentCombobox";
import FinancialCenterScrollSelect from "./financialCenter/FinancialCenterScrollSelect";
import FinancialCenterTableWrap from "./financialCenter/FinancialCenterTableWrap";
import FinancialCenterRowActions from "./financialCenter/FinancialCenterRowActions";
import FinancialCenterPagination, { FC_TABLE_PAGE_SIZE } from "./financialCenter/FinancialCenterPagination";
import { allocationPaidBadge, getAuditActionLabel } from "./financialCenter/financialCenterAuditLabels";
import { getFinancialDepartmentLabel } from "./financialCenter/financialDepartmentLabels";
import "./financialCenter/superAdminFinancialCenter.css";

const FC_EMPLOYEE_PATH = (id) => `/dashboard/super-admin/financial-center/employees/${id}`;

function formatMoney(value, currency = "د.أ") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${new Intl.NumberFormat("ar-JO-u-nu-latn", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function FcTdEllipsis({ children, className = "", dir }) {
  const display = children == null || children === false ? "—" : children;
  const titleText =
    typeof display === "string" || typeof display === "number" ? String(display) : undefined;
  return (
    <td
      className={`fc-cell-ellipsis${className ? ` ${className}` : ""}`}
      title={titleText}
      dir={dir}
    >
      {display}
    </td>
  );
}

function rowStatusBadge(status, t) {
  const map = {
    draft: ["fc-badge--draft", t("dashboard.financialCenter.draft")],
    approved: ["fc-badge--approved", t("dashboard.financialCenter.readyForPayment")],
    unpaid: ["fc-badge--unpaid", t("dashboard.financialCenter.unpaid")],
    paid: ["fc-badge--paid", t("dashboard.financialCenter.paid")],
    cancelled: ["fc-badge--cancelled", t("dashboard.financialCenter.cancelled")],
  };
  const [cls, label] = map[status] || ["fc-badge--draft", status];
  return <span className={`fc-badge ${cls}`}>{label}</span>;
}

function resolveBonusRowStatusOnSave(preview) {
  if (preview.shareTotal > 100 || preview.grossAmount <= 0) return "draft";
  const hasAllocations = (preview.allocations || []).some((a) => a.personId && Number(a.percentageShare) > 0);
  if (!hasAllocations) return "draft";
  if (preview.shareTotal < 100) return "draft";
  return "unpaid";
}

function isRowReadyForPayment(status) {
  return status === "unpaid" || status === "approved";
}

function receivedBadge(status, t) {
  const map = {
    received: ["fc-badge--received", t("dashboard.financialCenter.received")],
    not_received: ["fc-badge--not_received", t("dashboard.financialCenter.notReceived")],
    partially_received: ["fc-badge--partially_received", t("dashboard.financialCenter.partiallyReceived")],
  };
  const [cls, label] = map[status] || ["fc-badge--not_received", status];
  return <span className={`fc-badge ${cls}`}>{label}</span>;
}

function sourceLabel(type, t) {
  if (type === "manual") return t("dashboard.financialCenter.sourceManual");
  if (type === "subscription_payment") return t("dashboard.financialCenter.sourceSubscriptions");
  if (type === "order_payment") return t("dashboard.financialCenter.sourceOrders");
  return type;
}

function accountStatusBadge(status, t) {
  const map = {
    none: ["fc-badge--inactive", t("dashboard.financialCenter.accountNone")],
    active: ["fc-badge--active", t("dashboard.financialCenter.accountActive")],
    suspended: ["fc-badge--cancelled", t("dashboard.financialCenter.accountSuspended")],
  };
  const [cls, label] = map[status] || ["fc-badge--inactive", status];
  return <span className={`fc-badge ${cls}`}>{label}</span>;
}

const EMPTY_PERSON = {
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
  createLoginAccount: false,
  loginEmail: "",
  password: "",
  confirmPassword: "",
};

const EMPTY_ACCOUNT_FORM = {
  loginEmail: "",
  password: "",
  confirmPassword: "",
};

function emptyReceivedForm(row) {
  return {
    receivedStatus: row?.receivedStatus || "not_received",
    receivedAmount: row?.receivedAmount != null ? String(row.receivedAmount) : "",
    receivedAt: row?.receivedAt ? new Date(row.receivedAt).toISOString().slice(0, 16) : "",
    receivedNote: row?.receivedNote || "",
  };
}

function emptyBonusForm(monthKey) {
  return {
    title: "",
    monthKey,
    note: "",
    sourceType: "manual",
    sourceRefId: "",
    sourceLabel: "",
    grossAmount: "",
    stripeDeductionEnabled: false,
    stripePercentage: "2.9",
    stripeFixedFee: "0.30",
    bonusPercentage: "20",
    receivedStatus: "not_received",
    status: "draft",
    allocations: [],
  };
}

function ShareHint({ shareTotal, t }) {
  if (shareTotal > 100) {
    return <p className="fc-share-hint fc-share-hint--err m-0">{t("dashboard.financialCenter.shareError")}</p>;
  }
  if (shareTotal === 100) {
    return <p className="fc-share-hint fc-share-hint--ok m-0">{t("dashboard.financialCenter.shareSuccess")}</p>;
  }
  if (shareTotal > 0) {
    return <p className="fc-share-hint fc-share-hint--warn m-0">{t("dashboard.financialCenter.shareWarning")}</p>;
  }
  return null;
}

export default function SuperAdminFinancialCenterPage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const navigate = useNavigate();
  const [monthFilter, setMonthFilter] = useState(currentMonthKey());
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [people, setPeople] = useState([]);
  const [peoplePage, setPeoplePage] = useState(1);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [rows, setRows] = useState([]);
  const [bonusRowsPage, setBonusRowsPage] = useState(1);
  const [bonusRowsTotal, setBonusRowsTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [allocationPeople, setAllocationPeople] = useState([]);
  const [peopleQ, setPeopleQ] = useState("");
  const [peopleStatus, setPeopleStatus] = useState("");
  const [rowsQ, setRowsQ] = useState("");
  const [rowsStatus, setRowsStatus] = useState("");
  const [rowsSource, setRowsSource] = useState("");
  const [rowsReceived, setRowsReceived] = useState("");

  const [personModal, setPersonModal] = useState(null);
  const [personForm, setPersonForm] = useState(EMPTY_PERSON);
  const [bonusModal, setBonusModal] = useState(null);
  const [bonusForm, setBonusForm] = useState(() => emptyBonusForm(currentMonthKey()));
  const [sourceItems, setSourceItems] = useState([]);
  const [sourceQ, setSourceQ] = useState("");
  const [detailRow, setDetailRow] = useState(null);
  const [accountModal, setAccountModal] = useState(null);
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT_FORM);
  const [receivedModal, setReceivedModal] = useState(false);
  const [receivedForm, setReceivedForm] = useState(() => emptyReceivedForm(null));
  const [actionBusy, setActionBusy] = useState(false);

  const currency = t("dashboard.financialCenter.currency");

  const months = useMemo(() => monthOptions(18), []);
  const preview = useMemo(() => computeBonusPreview(bonusForm), [bonusForm]);

  const peopleHasFilters = Boolean(peopleQ.trim() || peopleStatus);
  const rowsHasFilters = Boolean(rowsQ.trim() || rowsStatus || rowsSource || rowsReceived);

  const loadSummaryAndDepts = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const [sumRes, deptRes] = await Promise.all([
        getFinancialCenterSummaryRequest({ month: monthFilter }),
        listFinancialCenterDepartmentsRequest(),
      ]);
      setSummary(sumRes?.data?.summary || null);
      setDepartments(deptRes?.data?.departments || []);
    } catch (e) {
      push(e?.response?.data?.message || e?.message || t("dashboard.financialCenter.loadError"), "error");
    } finally {
      setSummaryLoading(false);
    }
  }, [monthFilter, push, t]);

  const loadPeopleTable = useCallback(async () => {
    setPeopleLoading(true);
    try {
      const offset = (peoplePage - 1) * FC_TABLE_PAGE_SIZE;
      const peopleRes = await listFinancialCenterPeopleRequest({
        q: peopleQ,
        status: peopleStatus || undefined,
        limit: FC_TABLE_PAGE_SIZE,
        offset,
      });
      setPeople(peopleRes?.data?.people || []);
      setPeopleTotal(peopleRes?.data?.total ?? 0);
    } catch (e) {
      push(e?.response?.data?.message || e?.message || t("dashboard.financialCenter.loadError"), "error");
    } finally {
      setPeopleLoading(false);
    }
  }, [peopleQ, peopleStatus, peoplePage, push, t]);

  const loadRowsTable = useCallback(async () => {
    setRowsLoading(true);
    try {
      const offset = (bonusRowsPage - 1) * FC_TABLE_PAGE_SIZE;
      const rowsRes = await listFinancialCenterBonusRowsRequest({
        month: monthFilter,
        q: rowsQ,
        status: rowsStatus || undefined,
        sourceType: rowsSource || undefined,
        receivedStatus: rowsReceived || undefined,
        limit: FC_TABLE_PAGE_SIZE,
        offset,
      });
      setRows(rowsRes?.data?.rows || []);
      setBonusRowsTotal(rowsRes?.data?.total ?? 0);
    } catch (e) {
      push(e?.response?.data?.message || e?.message || t("dashboard.financialCenter.loadError"), "error");
    } finally {
      setRowsLoading(false);
    }
  }, [monthFilter, rowsQ, rowsStatus, rowsSource, rowsReceived, bonusRowsPage, push, t]);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadSummaryAndDepts(), loadPeopleTable(), loadRowsTable()]);
  }, [loadSummaryAndDepts, loadPeopleTable, loadRowsTable]);

  const loadAllocationPeople = useCallback(async () => {
    try {
      const res = await listFinancialCenterPeopleRequest({ status: "active", limit: 100 });
      setAllocationPeople(res?.data?.people || []);
    } catch {
      setAllocationPeople([]);
    }
  }, []);

  useEffect(() => {
    void loadSummaryAndDepts();
  }, [loadSummaryAndDepts]);

  useEffect(() => {
    void loadPeopleTable();
  }, [loadPeopleTable]);

  useEffect(() => {
    void loadRowsTable();
  }, [loadRowsTable]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(peopleTotal / FC_TABLE_PAGE_SIZE) || 1);
    if (peoplePage > maxPage) setPeoplePage(maxPage);
  }, [peopleTotal, peoplePage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(bonusRowsTotal / FC_TABLE_PAGE_SIZE) || 1);
    if (bonusRowsPage > maxPage) setBonusRowsPage(maxPage);
  }, [bonusRowsTotal, bonusRowsPage]);

  const loadSourcePayments = useCallback(
    async (type, q) => {
      try {
        const fn =
          type === "subscription_payment"
            ? listFinancialCenterSubscriptionPaymentsRequest
            : listFinancialCenterOrderPaymentsRequest;
        const res = await fn({ q, limit: 30 });
        setSourceItems(res?.data?.items || []);
      } catch {
        setSourceItems([]);
      }
    },
    [],
  );

  useEffect(() => {
    if (!bonusModal) return;
    void loadAllocationPeople();
  }, [bonusModal, loadAllocationPeople]);

  useEffect(() => {
    if (!bonusModal) return;
    if (bonusForm.sourceType === "subscription_payment" || bonusForm.sourceType === "order_payment") {
      void loadSourcePayments(bonusForm.sourceType, sourceQ);
    } else {
      setSourceItems([]);
    }
  }, [bonusModal, bonusForm.sourceType, sourceQ, loadSourcePayments]);

  const openCreatePerson = () => {
    setPersonForm(EMPTY_PERSON);
    setPersonModal("create");
  };

  const openEditPerson = (p) => {
    setPersonForm({
      fullName: p.fullName || "",
      email: p.email || "",
      phone: p.phone || "",
      jobTitle: p.jobTitle || "",
      department: p.department || "",
      departmentId: p.departmentId || "",
      notes: p.notes || "",
      status: p.status || "active",
      paymentMethod: p.paymentMethod || "",
      paymentDetails: p.paymentDetails || "",
      createLoginAccount: false,
      loginEmail: p.loginEmail || p.email || "",
      password: "",
      confirmPassword: "",
    });
    setPersonModal(p.id);
  };

  const validatePersonForm = () => {
    if (!String(personForm.fullName || "").trim()) {
      push(t("dashboard.financialCenter.fullNameRequired"), "error");
      return false;
    }
    if (personModal === "create" && personForm.createLoginAccount) {
      const email = String(personForm.loginEmail || personForm.email || "").trim();
      if (!email) {
        push(t("dashboard.financialCenter.loginEmailRequired"), "error");
        return false;
      }
      if (!personForm.password || personForm.password.length < 8) {
        push(t("dashboard.financialCenter.passwordMinLength"), "error");
        return false;
      }
      if (personForm.password !== personForm.confirmPassword) {
        push(t("dashboard.financialCenter.passwordMismatch"), "error");
        return false;
      }
    }
    return true;
  };

  const savePerson = async () => {
    if (!validatePersonForm()) return;
    setActionBusy(true);
    try {
      const payload = {
        fullName: personForm.fullName,
        email: personForm.email || null,
        phone: personForm.phone || null,
        jobTitle: personForm.jobTitle || null,
        departmentId: personForm.departmentId || null,
        notes: personForm.notes || null,
        status: personForm.status,
        paymentMethod: personForm.paymentMethod || null,
        paymentDetails: personForm.paymentDetails || null,
      };
      if (personModal === "create") {
        if (personForm.createLoginAccount) {
          payload.createLoginAccount = true;
          payload.loginEmail = personForm.loginEmail || personForm.email;
          payload.password = personForm.password;
        }
        await createFinancialCenterPersonRequest(payload);
        push(t("dashboard.financialCenter.personAdded"), "success");
      } else {
        await updateFinancialCenterPersonRequest(personModal, payload);
        push(t("dashboard.financialCenter.personUpdated"), "success");
      }
      setPersonModal(null);
      await reloadAll();
    } catch (e) {
      push(e?.response?.data?.message || t("dashboard.financialCenter.personSaveError"), "error");
    } finally {
      setActionBusy(false);
    }
  };

  const openAccountModal = (person) => {
    setAccountForm({
      loginEmail: person.loginEmail || person.email || "",
      password: "",
      confirmPassword: "",
    });
    setAccountModal(person);
  };

  const saveAccount = async () => {
    if (!accountModal) return;
    const email = String(accountForm.loginEmail || "").trim();
    if (!email) {
      push(t("dashboard.financialCenter.emailRequired"), "error");
      return;
    }
    if (!accountForm.password || accountForm.password.length < 8) {
      push(t("dashboard.financialCenter.passwordMinLength"), "error");
      return;
    }
    if (accountForm.password !== accountForm.confirmPassword) {
      push(t("dashboard.financialCenter.passwordMismatch"), "error");
      return;
    }
    setActionBusy(true);
    try {
      await createFinancialCenterPersonAccountRequest(accountModal.id, {
        loginEmail: email,
        password: accountForm.password,
      });
      push(t("dashboard.financialCenter.accountCreatedOk"), "success");
      setAccountModal(null);
      await reloadAll();
    } catch (e) {
      push(e?.response?.data?.message || t("dashboard.financialCenter.accountCreateError"), "error");
    } finally {
      setActionBusy(false);
    }
  };

  const toggleAccountStatus = async (person, suspend) => {
    if (suspend && !window.confirm(t("dashboard.financialCenter.confirmSuspendAccount"))) return;
    setActionBusy(true);
    try {
      const fn = suspend ? suspendFinancialCenterPersonAccountRequest : activateFinancialCenterPersonAccountRequest;
      await fn(person.id);
      push(suspend ? t("dashboard.financialCenter.accountSuspendedOk") : t("dashboard.financialCenter.accountActivatedOk"), "success");
      await reloadAll();
    } catch (e) {
      push(e?.response?.data?.message || t("dashboard.financialCenter.accountUpdateError"), "error");
    } finally {
      setActionBusy(false);
    }
  };

  const openCreateBonus = () => {
    setBonusForm(emptyBonusForm(monthFilter));
    setSourceQ("");
    setBonusModal("create");
  };

  const openEditBonus = async (row) => {
    setActionBusy(true);
    try {
      const res = await getFinancialCenterBonusRowRequest(row.id);
      const r = res?.data?.row;
      if (!r) return;
      setBonusForm({
        title: r.title,
        monthKey: r.monthKey,
        note: r.note || "",
        sourceType: r.sourceType,
        sourceRefId: r.sourceRefId || "",
        sourceLabel: r.sourceLabel || "",
        grossAmount: String(r.grossAmount),
        stripeDeductionEnabled: r.stripeDeductionEnabled,
        stripePercentage: String(r.stripePercentage),
        stripeFixedFee: String(r.stripeFixedFee),
        bonusPercentage: String(r.bonusPercentage),
        receivedStatus: r.receivedStatus,
        status: r.status,
        allocations: (r.allocations || []).map((a) => ({
          personId: a.personId,
          percentageShare: String(a.percentageShare),
          note: a.note || "",
        })),
      });
      setBonusModal(r.id);
    } catch (e) {
      push(e?.response?.data?.message || t("dashboard.financialCenter.loadRowError"), "error");
    } finally {
      setActionBusy(false);
    }
  };

  const buildBonusPayload = () => ({
    title: bonusForm.title.trim(),
    monthKey: bonusForm.monthKey,
    note: bonusForm.note || null,
    sourceType: bonusForm.sourceType,
    sourceRefId: bonusForm.sourceRefId ? Number(bonusForm.sourceRefId) : null,
    sourceLabel: bonusForm.sourceLabel || null,
    grossAmount: Number(bonusForm.grossAmount),
    stripeDeductionEnabled: bonusForm.stripeDeductionEnabled,
    stripePercentage: Number(bonusForm.stripePercentage || 0),
    stripeFixedFee: Number(bonusForm.stripeFixedFee || 0),
    bonusPercentage: Number(bonusForm.bonusPercentage || 0),
    receivedStatus: bonusForm.receivedStatus,
    status: resolveBonusRowStatusOnSave(preview),
    allocations: preview.allocations.map((a) => ({
      personId: Number(a.personId),
      percentageShare: Number(a.percentageShare),
      note: a.note || null,
    })),
  });

  const saveBonus = async () => {
    if (preview.shareTotal > 100) {
      push(t("dashboard.financialCenter.shareError"), "error");
      return;
    }
    if (preview.grossAmount <= 0) {
      push(t("dashboard.financialCenter.grossAmountRequired"), "error");
      return;
    }
    setActionBusy(true);
    try {
      const payload = buildBonusPayload();
      if (bonusModal === "create") {
        await createFinancialCenterBonusRowRequest(payload);
        push(t("dashboard.financialCenter.bonusCreated"), "success");
      } else {
        await updateFinancialCenterBonusRowRequest(bonusModal, payload);
        push(t("dashboard.financialCenter.bonusUpdated"), "success");
      }
      setBonusModal(null);
      await reloadAll();
    } catch (e) {
      push(e?.response?.data?.message || t("dashboard.financialCenter.saveBonusError"), "error");
    } finally {
      setActionBusy(false);
    }
  };

  const rowAction = async (fn, successMsg) => {
    setActionBusy(true);
    try {
      await fn();
      push(successMsg, "success");
      await reloadAll();
      if (detailRow) {
        const res = await getFinancialCenterBonusRowRequest(detailRow.id);
        setDetailRow(res?.data?.row || null);
      }
    } catch (e) {
      push(e?.response?.data?.message || t("dashboard.financialCenter.actionFailed"), "error");
    } finally {
      setActionBusy(false);
    }
  };

  const addAllocationRow = () => {
    setBonusForm((f) => ({
      ...f,
      allocations: [...(f.allocations || []), { personId: "", percentageShare: "", note: "" }],
    }));
  };

  const updateAllocation = (idx, patch) => {
    setBonusForm((f) => {
      const next = [...(f.allocations || [])];
      next[idx] = { ...next[idx], ...patch };
      return { ...f, allocations: next };
    });
  };

  const removeAllocation = (idx) => {
    setBonusForm((f) => ({
      ...f,
      allocations: (f.allocations || []).filter((_, i) => i !== idx),
    }));
  };

  const selectSourcePayment = (item) => {
    setBonusForm((f) => ({
      ...f,
      sourceRefId: item.id,
      sourceLabel: item.label,
      grossAmount: String(item.amountJod || 0),
    }));
  };

  const openReceivedModal = () => {
    if (!detailRow) return;
    setReceivedForm(emptyReceivedForm(detailRow));
    setReceivedModal(true);
  };

  const validateReceivedForm = () => {
    if (!detailRow) return false;
    const gross = Number(detailRow.grossAmount) || 0;
    if (receivedForm.receivedStatus === "partially_received") {
      const amount = Number(receivedForm.receivedAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        push(t("dashboard.financialCenter.receivedAmountPartialRequired"), "error");
        return false;
      }
      if (amount >= gross) {
        push(t("dashboard.financialCenter.grossAmountRequired"), "error");
        return false;
      }
    }
    return true;
  };

  const saveReceivedStatus = async () => {
    if (!detailRow || !validateReceivedForm()) return;
    const gross = Number(detailRow.grossAmount) || 0;
    let receivedAmount;
    if (receivedForm.receivedStatus === "not_received") {
      receivedAmount = 0;
    } else if (receivedForm.receivedStatus === "partially_received") {
      receivedAmount = Number(receivedForm.receivedAmount);
    } else {
      receivedAmount =
        receivedForm.receivedAmount !== "" ? Number(receivedForm.receivedAmount) : gross;
    }
    setActionBusy(true);
    try {
      await markFinancialCenterBonusRowReceivedRequest(detailRow.id, {
        receivedStatus: receivedForm.receivedStatus,
        receivedAmount,
        receivedAt: receivedForm.receivedAt ? new Date(receivedForm.receivedAt).toISOString() : undefined,
        receivedNote: receivedForm.receivedNote || null,
      });
      push(t("dashboard.financialCenter.receivedUpdatedOk"), "success");
      await reloadAll();
      const res = await getFinancialCenterBonusRowRequest(detailRow.id);
      setDetailRow(res?.data?.row || null);
      setReceivedModal(false);
    } catch (e) {
      push(e?.response?.data?.message || t("dashboard.financialCenter.actionFailed"), "error");
    } finally {
      setActionBusy(false);
    }
  };

  const canEditAllocations = detailRow && detailRow.status !== "cancelled" && detailRow.status !== "paid";

  return (
    <DashboardShell className="fc-financial-center">
      <DashboardPageHeader
        eyebrow={t("dashboard.nav.superAdmin.panelTitle")}
        title={t("dashboard.financialCenter.title")}
        description={t("dashboard.financialCenter.description")}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={openCreatePerson}>
              {t("dashboard.financialCenter.addPerson")}
            </button>
            <button type="button" className="btn btn-primary" onClick={openCreateBonus}>
              {t("dashboard.financialCenter.createBonusRow")}
            </button>
          </>
        }
      />

      <div className="fc-page">
        <div className="fc-filters fc-filters--month">
          <label>
            {t("dashboard.financialCenter.month")}:{" "}
            <FinancialCenterScrollSelect
              value={monthFilter}
              onChange={(value) => {
                setMonthFilter(value);
                setBonusRowsPage(1);
              }}
              options={months}
            />
          </label>
        </div>

        {summaryLoading && !summary ? (
          <DashboardLoadingState />
        ) : (
          <div className="fc-summary-grid">
            <div className="fc-summary-card">
              <span className="fc-summary-card__label">{t("dashboard.financialCenter.activePeople")}</span>
              <strong className="fc-summary-card__value">{summary?.activePeople ?? 0}</strong>
            </div>
            <div className="fc-summary-card">
              <span className="fc-summary-card__label">{t("dashboard.financialCenter.totalBonusMonth")}</span>
              <strong className="fc-summary-card__value">{formatMoney(summary?.totalBonusMonth, currency)}</strong>
            </div>
            <div className="fc-summary-card">
              <span className="fc-summary-card__label">{t("dashboard.financialCenter.totalPaidMonth")}</span>
              <strong className="fc-summary-card__value">{formatMoney(summary?.totalPaidMonth, currency)}</strong>
            </div>
            <div className="fc-summary-card">
              <span className="fc-summary-card__label">{t("dashboard.financialCenter.totalUnpaid")}</span>
              <strong className="fc-summary-card__value">{formatMoney(summary?.totalUnpaid, currency)}</strong>
            </div>
            <div className="fc-summary-card">
              <span className="fc-summary-card__label">{t("dashboard.financialCenter.unreceivedRows")}</span>
              <strong className="fc-summary-card__value">{summary?.unreceivedRows ?? 0}</strong>
            </div>
          </div>
        )}

        <DashboardSection title={t("dashboard.financialCenter.people")}>
          <div className="fc-filters fc-filters--people">
            <input
              type="search"
              placeholder={t("dashboard.financialCenter.search")}
              value={peopleQ}
              onChange={(e) => {
                setPeopleQ(e.target.value);
                setPeoplePage(1);
              }}
            />
            <select
              value={peopleStatus}
              onChange={(e) => {
                setPeopleStatus(e.target.value);
                setPeoplePage(1);
              }}
            >
              <option value="">{t("dashboard.financialCenter.allStatuses")}</option>
              <option value="active">{t("dashboard.financialCenter.active")}</option>
              <option value="inactive">{t("dashboard.financialCenter.inactive")}</option>
            </select>
          </div>
          {!people.length && !peopleLoading ? (
            <DashboardEmptyState
              title={
                peopleHasFilters
                  ? t("dashboard.financialCenter.pagination.noMatchingResults")
                  : t("dashboard.financialCenter.noPeople")
              }
            />
          ) : (
            <div className={`fc-table-block${peopleLoading ? " fc-table-section--loading" : ""}`}>
            <FinancialCenterTableWrap>
              <table className="fc-table fc-table--people fc-table--fixed">
                <colgroup>
                  <col className="fc-colw-name" />
                  <col className="fc-colw-dept" />
                  <col className="fc-colw-phone" />
                  <col className="fc-colw-email" />
                  <col className="fc-colw-status" />
                  <col className="fc-colw-status" />
                  <col className="fc-colw-money" />
                  <col className="fc-colw-money" />
                  <col className="fc-colw-money" />
                  <col className="fc-colw-date" />
                  <col className="fc-colw-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t("dashboard.financialCenter.colName")}</th>
                    <th>{t("dashboard.financialCenter.colDepartment")}</th>
                    <th>{t("dashboard.financialCenter.colPhone")}</th>
                    <th>{t("dashboard.financialCenter.colEmail")}</th>
                    <th>{t("dashboard.financialCenter.employeeStatus")}</th>
                    <th>{t("dashboard.financialCenter.colLoginAccount")}</th>
                    <th>{t("dashboard.financialCenter.colTotalBonus")}</th>
                    <th>{t("dashboard.financialCenter.colPaid")}</th>
                    <th>{t("dashboard.financialCenter.colUnpaid")}</th>
                    <th>{t("dashboard.financialCenter.colLastActivity")}</th>
                    <th>{t("dashboard.financialCenter.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.id}>
                      <FcTdEllipsis>{p.fullName}</FcTdEllipsis>
                      <td className="fc-col-compact">
                        {p.departmentId || p.departmentName || p.department ? (
                          <span className="fc-badge fc-badge--dept">
                            {getFinancialDepartmentLabel(p, t)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="fc-col-compact" dir="ltr">{p.phone || "—"}</td>
                      <FcTdEllipsis dir="ltr">{p.email || "—"}</FcTdEllipsis>
                      <td className="fc-col-compact">
                        <span className={`fc-badge fc-badge--${p.status === "active" ? "active" : "inactive"}`}>
                          {p.status === "active"
                            ? t("dashboard.financialCenter.active")
                            : t("dashboard.financialCenter.inactive")}
                        </span>
                      </td>
                      <td className="fc-col-compact">{accountStatusBadge(p.accountStatus, t)}</td>
                      <td className="fc-col-money">{formatMoney(p.totalBonus, currency)}</td>
                      <td className="fc-col-money">{formatMoney(p.totalPaid, currency)}</td>
                      <td className="fc-col-money">{formatMoney(p.totalUnpaid, currency)}</td>
                      <td className="fc-col-compact">{formatDate(p.lastBonusAt)}</td>
                      <td className="fc-col-actions">
                        <FinancialCenterRowActions
                          label={t("dashboard.financialCenter.actions")}
                          items={[
                            {
                              key: "view",
                              label: t("dashboard.financialCenter.viewDetails"),
                              onClick: () => navigate(FC_EMPLOYEE_PATH(p.id)),
                            },
                            {
                              key: "edit",
                              label: t("dashboard.financialCenter.edit"),
                              onClick: () => openEditPerson(p),
                            },
                            {
                              key: "create-account",
                              label: t("dashboard.financialCenter.createLoginAccount"),
                              onClick: () => openAccountModal(p),
                              hidden: p.accountStatus !== "none",
                            },
                            {
                              key: "suspend",
                              label: t("dashboard.financialCenter.suspendAccount"),
                              onClick: () => toggleAccountStatus(p, true),
                              hidden: p.accountStatus !== "active",
                              disabled: actionBusy,
                            },
                            {
                              key: "activate",
                              label: t("dashboard.financialCenter.activateAccount"),
                              onClick: () => toggleAccountStatus(p, false),
                              hidden: p.accountStatus !== "suspended",
                              disabled: actionBusy,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FinancialCenterTableWrap>
            <FinancialCenterPagination
              page={peoplePage}
              total={peopleTotal}
              isLoading={peopleLoading}
              onPageChange={setPeoplePage}
            />
            </div>
          )}
        </DashboardSection>

        <DashboardSection title={t("dashboard.financialCenter.bonusRows")}>
          <div className="fc-filters fc-filters--rows">
            <input
              type="search"
              placeholder={t("dashboard.financialCenter.search")}
              value={rowsQ}
              onChange={(e) => {
                setRowsQ(e.target.value);
                setBonusRowsPage(1);
              }}
            />
            <select
              value={rowsStatus}
              onChange={(e) => {
                setRowsStatus(e.target.value);
                setBonusRowsPage(1);
              }}
            >
              <option value="">{t("dashboard.financialCenter.status")}</option>
              <option value="draft">{t("dashboard.financialCenter.draft")}</option>
              <option value="unpaid">{t("dashboard.financialCenter.unpaid")}</option>
              <option value="paid">{t("dashboard.financialCenter.paid")}</option>
              <option value="cancelled">{t("dashboard.financialCenter.cancelled")}</option>
            </select>
            <select
              value={rowsSource}
              onChange={(e) => {
                setRowsSource(e.target.value);
                setBonusRowsPage(1);
              }}
            >
              <option value="">{t("dashboard.financialCenter.sourceType")}</option>
              <option value="manual">{t("dashboard.financialCenter.sourceManual")}</option>
              <option value="subscription_payment">{t("dashboard.financialCenter.sourceSubscriptions")}</option>
              <option value="order_payment">{t("dashboard.financialCenter.sourceOrders")}</option>
            </select>
            <select
              value={rowsReceived}
              onChange={(e) => {
                setRowsReceived(e.target.value);
                setBonusRowsPage(1);
              }}
            >
              <option value="">{t("dashboard.financialCenter.receivedStatus")}</option>
              <option value="received">{t("dashboard.financialCenter.received")}</option>
              <option value="not_received">{t("dashboard.financialCenter.notReceived")}</option>
              <option value="partially_received">{t("dashboard.financialCenter.partiallyReceived")}</option>
            </select>
          </div>
          {!rows.length && !rowsLoading ? (
            <DashboardEmptyState
              title={
                rowsHasFilters
                  ? t("dashboard.financialCenter.pagination.noMatchingResults")
                  : t("dashboard.financialCenter.noRows")
              }
            />
          ) : (
            <div className={`fc-table-block${rowsLoading ? " fc-table-section--loading" : ""}`}>
            <FinancialCenterTableWrap>
              <table className="fc-table fc-table--bonus fc-table--fixed">
                <colgroup>
                  <col className="fc-colw-month" />
                  <col className="fc-colw-title" />
                  <col className="fc-colw-source" />
                  <col className="fc-colw-money" />
                  <col className="fc-colw-compact" />
                  <col className="fc-colw-compact" />
                  <col className="fc-colw-money" />
                  <col className="fc-colw-beneficiaries" />
                  <col className="fc-colw-status" />
                  <col className="fc-colw-status" />
                  <col className="fc-colw-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t("dashboard.financialCenter.month")}</th>
                    <th>{t("dashboard.financialCenter.colTitle")}</th>
                    <th>{t("dashboard.financialCenter.sourceType")}</th>
                    <th>{t("dashboard.financialCenter.grossAmount")}</th>
                    <th>{t("dashboard.financialCenter.stripeFee")}</th>
                    <th>{t("dashboard.financialCenter.netAfterStripe")}</th>
                    <th>{t("dashboard.financialCenter.bonusPoolAmount")}</th>
                    <th>{t("dashboard.financialCenter.colBeneficiaries")}</th>
                    <th>{t("dashboard.financialCenter.receivedStatus")}</th>
                    <th>{t("dashboard.financialCenter.status")}</th>
                    <th>{t("dashboard.financialCenter.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="fc-col-compact">{r.monthKey}</td>
                      <FcTdEllipsis>{r.title}</FcTdEllipsis>
                      <FcTdEllipsis>{sourceLabel(r.sourceType, t)}</FcTdEllipsis>
                      <td className="fc-col-money">{formatMoney(r.grossAmount, currency)}</td>
                      <td className="fc-col-compact">{formatMoney(r.stripeFeeAmount, currency)}</td>
                      <td className="fc-col-compact">{formatMoney(r.netAmountAfterStripe, currency)}</td>
                      <td className="fc-col-money">{formatMoney(r.bonusPoolAmount, currency)}</td>
                      <td className="fc-col-compact">{r.beneficiaryCount ?? 0}</td>
                      <td className="fc-col-compact">{receivedBadge(r.receivedStatus, t)}</td>
                      <td className="fc-col-compact">{rowStatusBadge(r.status, t)}</td>
                      <td className="fc-col-actions">
                        <FinancialCenterRowActions
                          label={t("dashboard.financialCenter.actions")}
                          items={[
                            {
                              key: "view",
                              label: t("dashboard.financialCenter.viewDetails"),
                              onClick: async () => {
                                const res = await getFinancialCenterBonusRowRequest(r.id);
                                setDetailRow(res?.data?.row || null);
                              },
                            },
                            {
                              key: "edit",
                              label: t("dashboard.financialCenter.edit"),
                              onClick: () => openEditBonus(r),
                              hidden: r.status === "paid" || r.status === "cancelled",
                            },
                            {
                              key: "received",
                              label: t("dashboard.financialCenter.markReceived"),
                              onClick: () =>
                                rowAction(
                                  () => markFinancialCenterBonusRowReceivedRequest(r.id, { receivedStatus: "received" }),
                                  t("dashboard.financialCenter.receivedOk"),
                                ),
                              hidden: r.receivedStatus === "received" || r.status === "cancelled",
                              disabled: actionBusy,
                            },
                            {
                              key: "cancel",
                              label: t("dashboard.financialCenter.cancel"),
                              onClick: () =>
                                rowAction(
                                  () => cancelFinancialCenterBonusRowRequest(r.id),
                                  t("dashboard.financialCenter.cancelledOk"),
                                ),
                              hidden: r.status === "cancelled" || r.status === "paid",
                              disabled: actionBusy,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FinancialCenterTableWrap>
            <FinancialCenterPagination
              page={bonusRowsPage}
              total={bonusRowsTotal}
              isLoading={rowsLoading}
              onPageChange={setBonusRowsPage}
            />
            </div>
          )}
        </DashboardSection>
      </div>

      <DashboardModal
        open={Boolean(personModal)}
        className="fc-modal"
        title={personModal === "create" ? t("dashboard.financialCenter.addPerson") : t("dashboard.financialCenter.editPerson")}
        onClose={() => setPersonModal(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setPersonModal(null)}>
              {t("dashboard.financialCenter.close")}
            </button>
            <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={savePerson}>
              {t("dashboard.financialCenter.save")}
            </button>
          </>
        }
      >
        <div className="dash-ui-modal__form" dir="rtl">
          <DashboardFieldGroup label={`${t("dashboard.financialCenter.colName")} *`}>
            <input
              className="input"
              placeholder={t("dashboard.financialCenter.placeholderFullName")}
              value={personForm.fullName}
              onChange={(e) => setPersonForm((f) => ({ ...f, fullName: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("dashboard.financialCenter.colEmail")}>
            <input
              className="input"
              type="email"
              placeholder="example@email.com"
              dir="ltr"
              value={personForm.email}
              onChange={(e) => setPersonForm((f) => ({ ...f, email: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("dashboard.financialCenter.colPhone")}>
            <input
              className="input"
              placeholder="+962..."
              dir="ltr"
              value={personForm.phone}
              onChange={(e) => setPersonForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("dashboard.financialCenter.colJobTitle")}>
            <input
              className="input"
              placeholder={t("dashboard.financialCenter.placeholderJobTitle")}
              value={personForm.jobTitle}
              onChange={(e) => setPersonForm((f) => ({ ...f, jobTitle: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("dashboard.financialCenter.colDepartment")}>
            <FinancialDepartmentCombobox
              value={personForm.departmentId}
              onChange={(departmentId) => setPersonForm((f) => ({ ...f, departmentId }))}
              departments={departments}
              onDepartmentCreated={(dept) => setDepartments((list) => [...list, dept])}
              disabled={actionBusy}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("dashboard.financialCenter.colPaymentMethod")}>
            <input
              className="input"
              placeholder={t("dashboard.financialCenter.placeholderPaymentMethod")}
              value={personForm.paymentMethod}
              onChange={(e) => setPersonForm((f) => ({ ...f, paymentMethod: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("dashboard.financialCenter.colPaymentDetails")}>
            <textarea
              className="input textarea"
              rows={2}
              placeholder={t("dashboard.financialCenter.placeholderPaymentDetails")}
              value={personForm.paymentDetails}
              onChange={(e) => setPersonForm((f) => ({ ...f, paymentDetails: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("dashboard.financialCenter.colNotes")}>
            <textarea
              className="input textarea"
              rows={2}
              placeholder={t("dashboard.financialCenter.placeholderNotes")}
              value={personForm.notes}
              onChange={(e) => setPersonForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("dashboard.financialCenter.status")}>
            <select
              className="input"
              value={personForm.status}
              onChange={(e) => setPersonForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="active">{t("dashboard.financialCenter.active")}</option>
              <option value="inactive">{t("dashboard.financialCenter.inactive")}</option>
            </select>
          </DashboardFieldGroup>
          {personModal === "create" ? (
            <>
              <label className="flex items-center gap-2 text-[0.85rem] font-bold text-slate-600">
                <input
                  type="checkbox"
                  checked={Boolean(personForm.createLoginAccount)}
                  onChange={(e) =>
                    setPersonForm((f) => ({
                      ...f,
                      createLoginAccount: e.target.checked,
                      loginEmail: e.target.checked && !f.loginEmail ? f.email : f.loginEmail,
                    }))
                  }
                />
                {t("dashboard.financialCenter.createLoginAccountLabel")}
              </label>
              {personForm.createLoginAccount ? (
                <>
                  <DashboardFieldGroup label={t("dashboard.financialCenter.loginEmail")}>
                    <input
                      className="input"
                      type="email"
                      placeholder="login@email.com"
                      dir="ltr"
                      value={personForm.loginEmail}
                      onChange={(e) => setPersonForm((f) => ({ ...f, loginEmail: e.target.value }))}
                    />
                  </DashboardFieldGroup>
                  <DashboardFieldGroup label={t("dashboard.financialCenter.password")}>
                    <input
                      className="input"
                      type="password"
                      placeholder={t("dashboard.financialCenter.placeholderPasswordMin")}
                      dir="ltr"
                      value={personForm.password}
                      onChange={(e) => setPersonForm((f) => ({ ...f, password: e.target.value }))}
                    />
                  </DashboardFieldGroup>
                  <DashboardFieldGroup label={t("dashboard.financialCenter.confirmPassword")}>
                    <input
                      className="input"
                      type="password"
                      placeholder={t("dashboard.financialCenter.placeholderConfirmPassword")}
                      dir="ltr"
                      value={personForm.confirmPassword}
                      onChange={(e) => setPersonForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    />
                  </DashboardFieldGroup>
                </>
              ) : null}
            </>
          ) : null}
          {personModal !== "create" ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={actionBusy}
              onClick={() =>
                rowAction(() => deactivateFinancialCenterPersonRequest(personModal), t("dashboard.financialCenter.deactivatedOk"))
              }
            >
              {t("dashboard.financialCenter.deactivateEmployee")}
            </button>
          ) : null}
        </div>
      </DashboardModal>

      <DashboardModal
        open={Boolean(bonusModal)}
        title={bonusModal === "create" ? t("dashboard.financialCenter.createBonusRow") : t("dashboard.financialCenter.editBonusRow")}
        onClose={() => setBonusModal(null)}
        className="fc-modal fc-modal--wide"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setBonusModal(null)}>
              {t("dashboard.financialCenter.close")}
            </button>
            <button type="button" className="btn btn-primary" disabled={actionBusy || preview.shareTotal > 100} onClick={saveBonus}>
              {t("dashboard.financialCenter.save")}
            </button>
          </>
        }
      >
        <div className="dash-ui-modal__form" dir="rtl">
          <DashboardFieldGroup label={`${t("dashboard.financialCenter.colTitle")} *`}>
            <input
              className="input"
              placeholder={t("dashboard.financialCenter.placeholderBonusTitle")}
              value={bonusForm.title}
              onChange={(e) => setBonusForm((f) => ({ ...f, title: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("dashboard.financialCenter.month")}>
            <FinancialCenterScrollSelect
              className="fc-scroll-select--input"
              value={bonusForm.monthKey}
              onChange={(monthKey) => setBonusForm((f) => ({ ...f, monthKey }))}
              options={months}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("dashboard.financialCenter.sourceType")}>
            <select
              className="input"
              value={bonusForm.sourceType}
              onChange={(e) =>
                setBonusForm((f) => ({
                  ...f,
                  sourceType: e.target.value,
                  sourceRefId: "",
                  sourceLabel: "",
                  grossAmount: e.target.value === "manual" ? f.grossAmount : "",
                }))
              }
            >
              <option value="manual">{t("dashboard.financialCenter.sourceManual")}</option>
              <option value="subscription_payment">{t("dashboard.financialCenter.sourceSubscriptions")}</option>
              <option value="order_payment">{t("dashboard.financialCenter.sourceOrders")}</option>
            </select>
          </DashboardFieldGroup>

          {bonusForm.sourceType === "manual" ? (
            <DashboardFieldGroup label={t("dashboard.financialCenter.grossAmount")}>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={bonusForm.grossAmount}
                onChange={(e) => setBonusForm((f) => ({ ...f, grossAmount: e.target.value }))}
              />
            </DashboardFieldGroup>
          ) : (
            <>
              <input
                className="input"
                type="search"
                placeholder={t("dashboard.financialCenter.search")}
                value={sourceQ}
                onChange={(e) => setSourceQ(e.target.value)}
              />
              <div className="fc-source-list">
                {sourceItems.map((item) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    className={`fc-source-item${String(bonusForm.sourceRefId) === String(item.id) ? " fc-source-item--selected" : ""}`}
                    onClick={() => selectSourcePayment(item)}
                  >
                    <div>{item.label}</div>
                    <div>
                      {formatMoney(item.amountJod, currency)} — {formatDate(item.paidAt)}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={bonusForm.stripeDeductionEnabled}
              onChange={(e) => setBonusForm((f) => ({ ...f, stripeDeductionEnabled: e.target.checked }))}
            />
            {t("dashboard.financialCenter.stripeQuestion")}
          </label>
          {bonusForm.stripeDeductionEnabled ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label>
                {t("dashboard.financialCenter.stripePercentage")}
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={bonusForm.stripePercentage}
                  onChange={(e) => setBonusForm((f) => ({ ...f, stripePercentage: e.target.value }))}
                />
              </label>
              <label>
                {t("dashboard.financialCenter.stripeFixedFee")}
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={bonusForm.stripeFixedFee}
                  onChange={(e) => setBonusForm((f) => ({ ...f, stripeFixedFee: e.target.value }))}
                />
              </label>
            </div>
          ) : null}

          <label>
            {t("dashboard.financialCenter.bonusPercentage")}
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={bonusForm.bonusPercentage}
              onChange={(e) => setBonusForm((f) => ({ ...f, bonusPercentage: e.target.value }))}
            />
          </label>

          <div className="fc-preview-box">
            <div className="fc-preview-row">
              <span>{t("dashboard.financialCenter.grossAmount")}</span>
              <strong>{formatMoney(preview.grossAmount, currency)}</strong>
            </div>
            <div className="fc-preview-row">
              <span>{t("dashboard.financialCenter.stripeFee")}</span>
              <strong>{formatMoney(preview.stripeFeeAmount, currency)}</strong>
            </div>
            <div className="fc-preview-row">
              <span>{t("dashboard.financialCenter.netAfterStripe")}</span>
              <strong>{formatMoney(preview.netAmountAfterStripe, currency)}</strong>
            </div>
            <div className="fc-preview-row">
              <span>{t("dashboard.financialCenter.bonusPoolAmount")}</span>
              <strong>{formatMoney(preview.bonusPoolAmount, currency)}</strong>
            </div>
          </div>

          <div>
            <div className="fc-section__head">
              <strong>{t("dashboard.financialCenter.allocations")}</strong>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addAllocationRow}>
                {t("dashboard.financialCenter.addEmployee")}
              </button>
            </div>
            {(bonusForm.allocations || []).map((a, idx) => (
              <div key={idx} className="fc-allocation-row">
                <select
                  className="input"
                  value={a.personId}
                  onChange={(e) => updateAllocation(idx, { personId: e.target.value })}
                >
                  <option value="">{t("dashboard.financialCenter.selectEmployee")}</option>
                  {allocationPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="%"
                  value={a.percentageShare}
                  onChange={(e) => updateAllocation(idx, { percentageShare: e.target.value })}
                />
                <span>{formatMoney(preview.allocations[idx]?.calculatedAmount, currency)}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeAllocation(idx)}>
                  ×
                </button>
              </div>
            ))}
            <p className="m-0 text-sm">
              {t("dashboard.financialCenter.shareTotal")}: {roundMoney(preview.shareTotal)}%
            </p>
            <ShareHint shareTotal={preview.shareTotal} t={t} />
          </div>
        </div>
      </DashboardModal>

      <DashboardModal
        open={Boolean(accountModal)}
        className="fc-modal"
        title={t("dashboard.financialCenter.createLoginAccount")}
        onClose={() => setAccountModal(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAccountModal(null)}>
              {t("dashboard.financialCenter.close")}
            </button>
            <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={saveAccount}>
              {t("dashboard.financialCenter.save")}
            </button>
          </>
        }
      >
        <div className="dash-ui-modal__form" dir="rtl">
          <DashboardFieldGroup label={t("dashboard.financialCenter.loginEmail")}>
            <input
              className="input"
              type="email"
              dir="ltr"
              placeholder="login@email.com"
              value={accountForm.loginEmail}
              onChange={(e) => setAccountForm((f) => ({ ...f, loginEmail: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("dashboard.financialCenter.password")}>
            <input
              className="input"
              type="password"
              dir="ltr"
              placeholder={t("dashboard.financialCenter.placeholderPasswordMin")}
              value={accountForm.password}
              onChange={(e) => setAccountForm((f) => ({ ...f, password: e.target.value }))}
            />
          </DashboardFieldGroup>
          <DashboardFieldGroup label={t("dashboard.financialCenter.confirmPassword")}>
            <input
              className="input"
              type="password"
              dir="ltr"
              placeholder={t("dashboard.financialCenter.placeholderConfirmPassword")}
              value={accountForm.confirmPassword}
              onChange={(e) => setAccountForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            />
          </DashboardFieldGroup>
        </div>
      </DashboardModal>

      <DashboardModal
        open={Boolean(detailRow)}
        title={detailRow?.title || t("dashboard.financialCenter.viewDetails")}
        onClose={() => setDetailRow(null)}
        className="fc-modal fc-modal--wide"
        footer={
          <div className="flex flex-wrap gap-2">
            {detailRow?.status !== "cancelled" ? (
              <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={openReceivedModal}>
                {t("dashboard.financialCenter.updateReceivedStatus")}
              </button>
            ) : null}
            {detailRow && isRowReadyForPayment(detailRow.status) ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={actionBusy}
                onClick={() =>
                  rowAction(
                    () => markFinancialCenterBonusRowPaidRequest(detailRow.id),
                    t("dashboard.financialCenter.rowPaidOk"),
                  )
                }
              >
                {t("dashboard.financialCenter.markPaid")}
              </button>
            ) : null}
          </div>
        }
      >
        {detailRow ? (
          <div className="grid gap-3">
            <div className="fc-preview-box">
              <div className="fc-preview-row">
                <span>{t("dashboard.financialCenter.grossAmount")}</span>
                <strong>{formatMoney(detailRow.grossAmount, currency)}</strong>
              </div>
              <div className="fc-preview-row">
                <span>{t("dashboard.financialCenter.netAfterStripe")}</span>
                <strong>{formatMoney(detailRow.netAmountAfterStripe, currency)}</strong>
              </div>
              <div className="fc-preview-row">
                <span>{t("dashboard.financialCenter.bonusPoolAmount")}</span>
                <strong>{formatMoney(detailRow.bonusPoolAmount, currency)}</strong>
              </div>
              <div className="fc-preview-row">
                <span>{t("dashboard.financialCenter.receivedStatus")}</span>
                {receivedBadge(detailRow.receivedStatus, t)}
              </div>
            </div>
            <FinancialCenterTableWrap>
              <table className="fc-table fc-table--allocations fc-table--fixed">
                <colgroup>
                  <col className="fc-colw-name" />
                  <col className="fc-colw-compact" />
                  <col className="fc-colw-money" />
                  <col className="fc-colw-status" />
                  <col className="fc-colw-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t("dashboard.financialCenter.employee")}</th>
                    <th>{t("dashboard.financialCenter.colPercentage")}</th>
                    <th>{t("dashboard.financialCenter.colAmount")}</th>
                    <th>{t("dashboard.financialCenter.colPayment")}</th>
                    <th>{t("dashboard.financialCenter.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailRow.allocations || []).map((a) => {
                    const paid = allocationPaidBadge(a.paidStatus, t);
                    return (
                    <tr key={a.id}>
                      <FcTdEllipsis>{a.personName}</FcTdEllipsis>
                      <td className="fc-col-compact">{a.percentageShare}%</td>
                      <td className="fc-col-money">{formatMoney(a.calculatedAmount, currency)}</td>
                      <td className="fc-col-compact">
                        <StatusBadge tone={paid.tone}>{paid.label}</StatusBadge>
                      </td>
                      <td className="fc-col-actions">
                        {canEditAllocations ? (
                          <FinancialCenterRowActions
                            label={t("dashboard.financialCenter.actions")}
                            items={[
                              {
                                key: "paid",
                                label: t("dashboard.financialCenter.markPaid"),
                                onClick: () =>
                                  rowAction(
                                    () => markFinancialCenterAllocationPaidRequest(a.id),
                                    t("dashboard.financialCenter.allocationPaidOk"),
                                  ),
                                hidden: a.paidStatus !== "unpaid",
                                disabled: actionBusy,
                              },
                              {
                                key: "held",
                                label: t("dashboard.financialCenter.deferPayment"),
                                onClick: () =>
                                  rowAction(
                                    () => markFinancialCenterAllocationHeldRequest(a.id),
                                    t("dashboard.financialCenter.allocationHeldOk"),
                                  ),
                                hidden: a.paidStatus !== "unpaid",
                                disabled: actionBusy,
                              },
                              {
                                key: "unpaid",
                                label: t("dashboard.financialCenter.markUnpaid"),
                                onClick: () =>
                                  rowAction(
                                    () => markFinancialCenterAllocationUnpaidRequest(a.id),
                                    t("dashboard.financialCenter.allocationUnpaidOk"),
                                  ),
                                hidden: a.paidStatus !== "paid" && a.paidStatus !== "held",
                                disabled: actionBusy,
                              },
                            ]}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </FinancialCenterTableWrap>
            {detailRow.auditLogs?.length ? (
              <div>
                <strong>{t("dashboard.financialCenter.auditLog")}</strong>
                <ul className="fc-audit-list">
                  {detailRow.auditLogs.map((log) => (
                    <li key={log.id}>
                      <strong>{getAuditActionLabel(log.action, log.entityType, t)}</strong> — {formatDate(log.createdAt)}
                      {log.actorName ? ` · ${log.actorName}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </DashboardModal>

      <DashboardModal
        open={receivedModal}
        className="fc-modal"
        title={t("dashboard.financialCenter.updateReceivedStatus")}
        onClose={() => setReceivedModal(false)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setReceivedModal(false)}>
              {t("dashboard.financialCenter.close")}
            </button>
            <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={() => void saveReceivedStatus()}>
              {t("dashboard.financialCenter.save")}
            </button>
          </>
        }
      >
        <div className="dash-ui-modal__form" dir="rtl">
          <DashboardFieldGroup label={t("dashboard.financialCenter.receivedStatus")}>
            <select
              className="input"
              value={receivedForm.receivedStatus}
              onChange={(e) => {
                const next = e.target.value;
                setReceivedForm((f) => ({
                  ...f,
                  receivedStatus: next,
                  receivedAmount:
                    next === "received" && detailRow
                      ? String(detailRow.grossAmount)
                      : next === "not_received"
                        ? "0"
                        : f.receivedAmount,
                }));
              }}
            >
              <option value="not_received">{t("dashboard.financialCenter.notReceived")}</option>
              <option value="received">{t("dashboard.financialCenter.received")}</option>
              <option value="partially_received">{t("dashboard.financialCenter.partiallyReceived")}</option>
            </select>
          </DashboardFieldGroup>
          {receivedForm.receivedStatus !== "not_received" ? (
            <DashboardFieldGroup label={t("dashboard.financialCenter.receivedAmount")}>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={receivedForm.receivedAmount}
                onChange={(e) => setReceivedForm((f) => ({ ...f, receivedAmount: e.target.value }))}
              />
            </DashboardFieldGroup>
          ) : null}
          {receivedForm.receivedStatus !== "not_received" ? (
            <DashboardFieldGroup label={t("dashboard.financialCenter.receivedAt")}>
              <input
                className="input"
                type="datetime-local"
                value={receivedForm.receivedAt}
                onChange={(e) => setReceivedForm((f) => ({ ...f, receivedAt: e.target.value }))}
              />
            </DashboardFieldGroup>
          ) : null}
          <DashboardFieldGroup label={t("dashboard.financialCenter.receivedNote")}>
            <textarea
              className="input textarea"
              rows={2}
              value={receivedForm.receivedNote}
              onChange={(e) => setReceivedForm((f) => ({ ...f, receivedNote: e.target.value }))}
            />
          </DashboardFieldGroup>
        </div>
      </DashboardModal>
    </DashboardShell>
  );
}
