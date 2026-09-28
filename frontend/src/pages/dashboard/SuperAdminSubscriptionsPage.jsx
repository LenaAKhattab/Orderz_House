import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import Pagination from "../../components/common/Pagination";
import {
  activateSubscriptionCompanyRequest,
  assignPlanToFreelancerRequest,
  adminSearchFreelancersRequest,
  getFreelancerCurrentSubscriptionAdminRequest,
  getSubscriptionNotificationEmailRequest,
  listAssignablePlansAdminRequest,
  listSubscriptionsRequest,
  updateSubscriptionNotificationEmailRequest,
  getSubscriptionActivationFeeSettingsRequest,
  updateSubscriptionActivationFeeSettingsRequest,
  updateSubscriptionRequest,
} from "../../services/api";
import { invalidatePublicPlansCache } from "../../services/freelancerSessionCache";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import DashboardModal from "../../components/dashboard/DashboardModal";
import SuperAdminSubscriptionsList from "./SuperAdminSubscriptionsList";
import SubscriptionWhatsAppModal from "./SubscriptionWhatsAppModal";
import { ADMIN_LIST_TIMEOUT_MS } from "../../services/httpClient";
import {
  ADMIN_LIST_REFRESH_SOFT_NOTE,
  createAdminListRequestGate,
  isAdminListAbortError,
  resolveAdminListFailure,
} from "../../lib/staff/adminListLoad";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/subscriptionsResources";
import "./superAdminSubscriptionsPage.css";

const PAGE_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 400;

const controlClass =
  "w-full max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-start text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary,#2f3b65)]/20 disabled:opacity-60";

const fieldLabelClass = "text-xs font-bold text-slate-600";

const EMPTY_PAGINATION = {
  page: 1,
  limit: PAGE_LIMIT,
  total: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

const EMPTY_AGGREGATES = {
  total: 0,
  active: 0,
  notStarted: 0,
  inactiveCancelled: 0,
  pendingActivation: 0,
  expiringSoon: 0,
};

function errorMessage(err, t) {
  const apiMsg = err?.response?.data?.message;
  if (apiMsg) return apiMsg;
  const status = err?.response?.status;
  if (status === 401 || status === 403) {
    return t("subscriptions.errors.forbidden");
  }
  if (status === 400 || status === 422) {
    return t("subscriptions.errors.invalidInput");
  }
  // Axios timeout / aborted request (no response) — common when a prior hang occurred.
  if (err?.code === "ECONNABORTED" || err?.code === "ERR_CANCELED" || !err?.response) {
    return t("subscriptions.errors.timeout");
  }
  return t("subscriptions.errors.generic");
}


function formatDisplayRange(pagination, t) {
  const total = Number(pagination?.total) || 0;
  if (total <= 0) return t("subscriptions.page.displayRangeEmpty");
  const page = Number(pagination?.page) || 1;
  const limit = Number(pagination?.limit) || PAGE_LIMIT;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return t("subscriptions.page.displayRange", { start, end, total });
}

const SuperAdminSubscriptionsPage = () => {
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [subs, setSubs] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [aggregates, setAggregates] = useState(EMPTY_AGGREGATES);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const hasListDataRef = useRef(false);
  const listGateRef = useRef(null);
  if (!listGateRef.current) listGateRef.current = createAdminListRequestGate();
  useEffect(() => {
    hasListDataRef.current = Array.isArray(subs) && subs.length > 0;
  }, [subs]);
  useEffect(() => {
    return () => listGateRef.current?.abortInFlight();
  }, []);

  const [form, setForm] = useState({
    freelancerUserIds: [],
    planId: "",
  });

  const [freelancerQuery, setFreelancerQuery] = useState("");
  const [freelancerBusy, setFreelancerBusy] = useState(false);
  const [freelancerMatches, setFreelancerMatches] = useState([]);
  const [freelancerOpen, setFreelancerOpen] = useState(false);
  const [selectedFreelancersById, setSelectedFreelancersById] = useState({});

  const [assignConfirmOpen, setAssignConfirmOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [confirmItems, setConfirmItems] = useState([]);
  const [confirmPlanTitle, setConfirmPlanTitle] = useState("");
  const [assignConfirmContinue, setAssignConfirmContinue] = useState(null);

  const [actionConfirm, setActionConfirm] = useState(null);
  const [actionConfirmContinue, setActionConfirmContinue] = useState(null);

  const [whatsAppSub, setWhatsAppSub] = useState(null);

  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyEnvFallback, setNotifyEnvFallback] = useState(null);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyError, setNotifyError] = useState("");
  const [notifySuccess, setNotifySuccess] = useState("");

  const [feeModalOpen, setFeeModalOpen] = useState(false);
  const [feeEnabled, setFeeEnabled] = useState(true);
  const [feeAmountJod, setFeeAmountJod] = useState("25");
  const [feeValidityDays, setFeeValidityDays] = useState(365);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeBusy, setFeeBusy] = useState(false);
  const [feeError, setFeeError] = useState("");
  const [feeSuccess, setFeeSuccess] = useState("");

  const [searchParams] = useSearchParams();
  const initialSearch = (searchParams.get("search") || "").trim();
  const [listSearch, setListSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPlanId, setFilterPlanId] = useState("");

  const skipFilterPageReset = useRef(true);

  const planTitleById = useMemo(() => {
    const map = {};
    for (const p of plans || []) map[String(p.id)] = p.title || String(p.id);
    return map;
  }, [plans]);

  const statItems = useMemo(
    () => [
      { key: "total", label: t("subscriptions.stats.total"), value: aggregates.total },
      { key: "active", label: t("subscriptions.stats.active"), value: aggregates.active },
      { key: "pendingActivation", label: t("subscriptions.stats.pendingActivation"), value: aggregates.pendingActivation },
      { key: "notStarted", label: t("subscriptions.stats.notStarted"), value: aggregates.notStarted },
      { key: "expiringSoon", label: t("subscriptions.stats.expiringSoon"), value: aggregates.expiringSoon },
      { key: "inactiveCancelled", label: t("subscriptions.stats.inactiveCancelled"), value: aggregates.inactiveCancelled },
    ],
    [aggregates, t],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(listSearch.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [listSearch]);

  useEffect(() => {
    if (skipFilterPageReset.current) {
      skipFilterPageReset.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, filterStatus, filterPlanId]);

  useEffect(() => {
    let cancelled = false;
    const q = freelancerQuery.trim();
    async function run() {
      setFreelancerBusy(true);
      try {
        const res = await adminSearchFreelancersRequest({ q, limit: 20 });
        if (!cancelled) setFreelancerMatches(res?.data?.freelancers || []);
      } catch {
        if (!cancelled) setFreelancerMatches([]);
      } finally {
        if (!cancelled) setFreelancerBusy(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [freelancerQuery]);

  useEffect(() => {
    let cancelled = false;
    async function loadPlans() {
      setPlansLoading(true);
      try {
        const plansRes = await listAssignablePlansAdminRequest();
        if (!cancelled) setPlans(plansRes?.data?.plans || []);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, t));
      } finally {
        if (!cancelled) setPlansLoading(false);
      }
    }
    void loadPlans();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSubscriptions = useCallback(
    async (pageOverride) => {
      const targetPage = pageOverride ?? page;
      const hadRows = hasListDataRef.current;
      const ticket = listGateRef.current.begin();
      setListLoading(true);
      if (hadRows) {
        setRefreshError("");
      } else {
        setError("");
      }
      try {
        const res = await listSubscriptionsRequest(
          {
            page: targetPage,
            limit: PAGE_LIMIT,
            search: debouncedSearch || undefined,
            status: filterStatus || undefined,
            planId: filterPlanId || undefined,
          },
          { signal: ticket.signal, timeout: ADMIN_LIST_TIMEOUT_MS },
        );
        if (!ticket.isCurrent()) return;
        const nextSubs = res?.data?.subscriptions || [];
        const nextPagination = res?.data?.pagination || EMPTY_PAGINATION;
        const nextAggregates = res?.data?.aggregates || EMPTY_AGGREGATES;

        if (nextSubs.length === 0 && targetPage > 1 && (nextPagination.total ?? 0) > 0) {
          setPage(targetPage - 1);
          return;
        }

        setSubs(nextSubs);
        setPagination(nextPagination);
        setAggregates(nextAggregates);
        setRefreshError("");
        if (pageOverride == null && targetPage !== page) {
          setPage(targetPage);
        }
      } catch (err) {
        if (!ticket.isCurrent() || isAdminListAbortError(err)) return;
        const resolved = resolveAdminListFailure({
          hasExistingRows: hadRows,
          error: err,
          mapError: (e) => getSafeApiErrorMessage(e) || errorMessage(e, t),
        });
        if (resolved.softNote) {
          setRefreshError(ADMIN_LIST_REFRESH_SOFT_NOTE);
        } else if (resolved.hardError) {
          setError(resolved.hardError);
        }
        if (resolved.shouldClearRows) {
          setSubs([]);
          setPagination(EMPTY_PAGINATION);
          setAggregates(EMPTY_AGGREGATES);
        }
      } finally {
        if (ticket.isCurrent()) setListLoading(false);
      }
    },
    [page, debouncedSearch, filterStatus, filterPlanId],
  );

  useEffect(() => {
    void loadSubscriptions(page);
  }, [page, debouncedSearch, filterStatus, filterPlanId, loadSubscriptions]);

  const canAssign = useMemo(() => {
    return (form.freelancerUserIds || []).length > 0 && Number(form.planId) > 0;
  }, [form.freelancerUserIds, form.planId]);

  const resetAssignForm = useCallback(() => {
    setForm({ freelancerUserIds: [], planId: "" });
    setFreelancerQuery("");
    setFreelancerMatches([]);
    setFreelancerOpen(false);
    setSelectedFreelancersById({});
  }, []);

  const closeAssignModal = useCallback(() => {
    if (submitting) return;
    resetAssignForm();
    setAssignModalOpen(false);
  }, [resetAssignForm, submitting]);

  useEffect(() => {
    if (!assignModalOpen || submitting || assignConfirmOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeAssignModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [assignModalOpen, submitting, assignConfirmOpen, closeAssignModal]);

  const openNotifyModal = useCallback(async () => {
    setNotifyError("");
    setNotifySuccess("");
    setNotifyModalOpen(true);
    setNotifyLoading(true);
    try {
      const res = await getSubscriptionNotificationEmailRequest();
      setNotifyEmail(res?.data?.email || "");
      setNotifyEnvFallback(res?.data?.envFallback || null);
    } catch (err) {
      setNotifyError(errorMessage(err, t));
    } finally {
      setNotifyLoading(false);
    }
  }, []);

  const closeNotifyModal = useCallback(() => {
    if (notifyBusy) return;
    setNotifyModalOpen(false);
  }, [notifyBusy]);

  const saveNotifyEmail = useCallback(async () => {
    const email = notifyEmail.trim();
    if (email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setNotifySuccess("");
      setNotifyError(t("subscriptions.errors.notifyInvalidEmail"));
      return;
    }
    setNotifyBusy(true);
    setNotifyError("");
    setNotifySuccess("");
    try {
      const res = await updateSubscriptionNotificationEmailRequest(email);
      setNotifyEmail(res?.data?.email || "");
      setNotifyEnvFallback(res?.data?.envFallback || null);
      setNotifySuccess(t("subscriptions.errors.notifySaveSuccess"));
    } catch (err) {
      setNotifyError(errorMessage(err, t) || t("subscriptions.errors.notifySaveFailed"));
    } finally {
      setNotifyBusy(false);
    }
  }, [notifyEmail]);

  const openFeeModal = useCallback(async () => {
    setFeeError("");
    setFeeSuccess("");
    setFeeModalOpen(true);
    setFeeLoading(true);
    try {
      const res = await getSubscriptionActivationFeeSettingsRequest();
      setFeeEnabled(res?.data?.enabled !== false);
      const amount = res?.data?.amountJod;
      setFeeAmountJod(amount != null && Number.isFinite(Number(amount)) ? String(amount) : "25");
      setFeeValidityDays(Number(res?.data?.validityDays) || 365);
    } catch (err) {
      setFeeError(errorMessage(err, t));
    } finally {
      setFeeLoading(false);
    }
  }, []);

  const closeFeeModal = useCallback(() => {
    if (feeBusy) return;
    setFeeModalOpen(false);
  }, [feeBusy]);

  const saveFeeSettings = useCallback(async () => {
    const amount = Number(String(feeAmountJod).trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setFeeSuccess("");
      setFeeError(t("subscriptions.errors.feeInvalid"));
      return;
    }
    setFeeBusy(true);
    setFeeError("");
    setFeeSuccess("");
    try {
      const res = await updateSubscriptionActivationFeeSettingsRequest({
        enabled: Boolean(feeEnabled),
        amountJod: amount,
      });
      setFeeEnabled(res?.data?.enabled !== false);
      const savedAmount = res?.data?.amountJod;
      setFeeAmountJod(
        savedAmount != null && Number.isFinite(Number(savedAmount)) ? String(savedAmount) : String(amount),
      );
      setFeeValidityDays(Number(res?.data?.validityDays) || 365);
      invalidatePublicPlansCache();
      setFeeSuccess(
        res?.data?.enabled
          ? t("subscriptions.errors.feeSaveSuccessEnabled")
          : t("subscriptions.errors.feeSaveSuccessDisabled"),
      );
    } catch (err) {
      setFeeError(errorMessage(err, t) || t("subscriptions.errors.feeSaveFailed"));
    } finally {
      setFeeBusy(false);
    }
  }, [feeAmountJod, feeEnabled]);

  useEffect(() => {
    if (!notifyModalOpen || notifyBusy) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeNotifyModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [notifyModalOpen, notifyBusy, closeNotifyModal]);

  useEffect(() => {
    if (!feeModalOpen || feeBusy) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeFeeModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [feeModalOpen, feeBusy, closeFeeModal]);

  const askConfirm = useCallback((config) => {
    return new Promise((resolve) => {
      setActionConfirmContinue(() => resolve);
      setActionConfirm(config);
    });
  }, []);

  const closeActionConfirm = (value) => {
    setActionConfirm(null);
    const c = actionConfirmContinue;
    setActionConfirmContinue(null);
    c?.(value);
  };

  const assign = async () => {
    setError("");
    setSubmitting(true);
    try {
      const freelancerIds = (form.freelancerUserIds || []).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
      const planId = Number(form.planId);

      const existing = [];
      for (const freelancerUserId of freelancerIds) {
        try {
          const res = await getFreelancerCurrentSubscriptionAdminRequest(freelancerUserId);
          const sub = res?.data?.subscription || null;
          if (sub?.id) {
            const uid = String(freelancerUserId);
            const f = selectedFreelancersById[uid] || null;
            existing.push({
              freelancerUserId: uid,
              freelancerLabel: f
                ? t("subscriptions.assignModal.freelancerLabel", { name: f.name || t("subscriptions.assignModal.freelancerFallback"), email: f.email || "" }).trim()
                : t("subscriptions.assignModal.freelancerId", { id: uid }),
              currentPlanId: String(sub.planId || ""),
              currentPlanTitle: planTitleById[String(sub.planId || "")] || String(sub.planId || ""),
            });
          }
        } catch {
          // Backend handles safely if preflight fails.
        }
      }

      if (existing.length) {
        setSubmitting(false);
        setConfirmItems(existing);
        setConfirmPlanTitle(planTitleById[String(planId)] || `planId: ${String(planId)}`);
        const ok = await new Promise((resolve) => {
          setAssignConfirmContinue(() => resolve);
          setAssignConfirmOpen(true);
        });
        if (!ok) return;
        setSubmitting(true);
      }

      const failures = [];
      for (const freelancerUserId of freelancerIds) {
        try {
          await assignPlanToFreelancerRequest({ freelancerUserId, planId, notes: null });
        } catch (e) {
          failures.push({ freelancerUserId: String(freelancerUserId), message: errorMessage(e, t) });
        }
      }

      if (failures.length) {
        setError(
          t("subscriptions.errors.assignPartial", {
            details: failures
              .map((f) => t("subscriptions.errors.assignPartialItem", { id: f.freelancerUserId }))
              .join(", "),
          }),
        );
      } else {
        resetAssignForm();
        setAssignModalOpen(false);
      }

      if (failures.length < freelancerIds.length) {
        setPage(1);
      }
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const markFirstOrder = async (sub, isoDate) => {
    setError("");
    setSubmitting(true);
    try {
      await updateSubscriptionRequest(sub.id, { hasFirstOrder: true, firstOrderDate: isoDate });
      await loadSubscriptions(page);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const setStatus = async (sub, status) => {
    setError("");
    setSubmitting(true);
    try {
      await updateSubscriptionRequest(sub.id, { status });
      await loadSubscriptions(page);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const companyActivate = async (sub) => {
    setError("");
    const overrideReason = window.prompt(t("subscriptions.kycPrompt"), "");
    if (overrideReason == null) return;
    const reason = String(overrideReason).trim();
    if (!reason) {
      setError(t("subscriptions.errors.kycOverrideRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await activateSubscriptionCompanyRequest(sub.id, { overrideReason: reason });
      await loadSubscriptions(page);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const closeAssignConfirm = (value) => {
    setAssignConfirmOpen(false);
    const c = assignConfirmContinue;
    setAssignConfirmContinue(null);
    c?.(value);
  };

  const handleDisable = async (sub) => {
    const ok = await askConfirm({
      title: t("subscriptions.confirm.deactivateTitle"),
      body: (
        <p className="m-0 text-sm leading-relaxed text-slate-600">
          {t("subscriptions.confirm.deactivateBody", { id: sub.id })}
        </p>
      ),
      confirmLabel: t("subscriptions.confirm.deactivateConfirm"),
    });
    if (!ok) return;
    await setStatus(sub, "inactive");
  };

  const handleCancel = async (sub) => {
    const ok = await askConfirm({
      title: t("subscriptions.confirm.cancelTitle"),
      body: (
        <p className="m-0 text-sm leading-relaxed text-slate-600">
          {t("subscriptions.confirm.cancelBody", { id: sub.id })}
        </p>
      ),
      confirmLabel: t("subscriptions.confirm.cancelConfirm"),
    });
    if (!ok) return;
    await setStatus(sub, "cancelled");
  };

  const handleFirstOrder = async (sub) => {
    const ok = await askConfirm({
      title: t("subscriptions.confirm.firstOrderTitle"),
      body: (
        <p className="m-0 text-sm leading-relaxed text-slate-600">
          {t("subscriptions.confirm.firstOrderBody", { id: sub.id })}
        </p>
      ),
      confirmLabel: t("subscriptions.confirm.firstOrderConfirm"),
    });
    if (!ok) return;
    await markFirstOrder(sub, new Date().toISOString());
  };

  const assignConfirmBody = (
    <>
      <p className="m-0 mb-3 text-sm leading-relaxed text-slate-600">
        {t("subscriptions.confirm.changePlanIntro")}{" "}
        <strong className="text-[color:var(--primary,#2f3b65)]">{confirmPlanTitle}</strong>
      </p>
      <p className="m-0 mb-3 text-sm leading-relaxed text-amber-950">{t("subscriptions.confirm.changePlanOfflineNote")}</p>
      <div className="mt-1 grid gap-2.5">
        {confirmItems.map((x) => (
          <div
            key={x.freelancerUserId}
            className="grid gap-1 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3 sm:p-4 dark:border-slate-600/50 dark:bg-slate-900/30"
          >
            <div className="text-sm font-bold text-[color:var(--primary,#2f3b65)]">{x.freelancerLabel}</div>
            <div className="text-xs font-bold text-slate-500">
              {t("subscriptions.confirm.currentPlan")}{" "}
              <span className="font-bold text-slate-800 dark:text-slate-200">{x.currentPlanTitle || x.currentPlanId || "—"}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  const initialLoading = plansLoading && listLoading && subs.length === 0;
  const hasFilters = Boolean(debouncedSearch || filterStatus || filterPlanId);
  const hasActiveFilters = Boolean(listSearch.trim() || filterStatus || filterPlanId);
  const showListToolbar = !initialLoading && (pagination.total > 0 || hasFilters || listLoading);

  const clearFilters = useCallback(() => {
    setListSearch("");
    setFilterStatus("");
    setFilterPlanId("");
    setPage(1);
  }, []);

  return (
    <DashboardShell className="oh-sa-subs flex min-h-0 w-full min-w-0 flex-col text-start">
      <ConfirmDialog
        open={assignConfirmOpen}
        title={t("subscriptions.confirm.changePlanTitle")}
        body={assignConfirmBody}
        confirmLabel={t("subscriptions.confirm.changePlanConfirm")}
        cancelLabel={t("subscriptions.confirm.cancel")}
        confirmFirst
        layerClassName="z-[1300]"
        onConfirm={() => closeAssignConfirm(true)}
        onCancel={() => closeAssignConfirm(false)}
      />

      <ConfirmDialog
        open={Boolean(actionConfirm)}
        title={actionConfirm?.title || ""}
        body={actionConfirm?.body}
        confirmLabel={actionConfirm?.confirmLabel || t("subscriptions.confirm.genericConfirm")}
        cancelLabel={t("subscriptions.confirm.cancel")}
        confirmFirst
        onConfirm={() => closeActionConfirm(true)}
        onCancel={() => closeActionConfirm(false)}
      />

      <DashboardModal
        open={assignModalOpen}
        title={t("subscriptions.assignModal.title")}
        ariaLabel={t("subscriptions.assignModal.ariaLabel")}
        className="oh-sa-subs-assign-modal"
        onClose={closeAssignModal}
        footer={
          <>
            <Button type="button" variant="secondary" disabled={submitting} onClick={closeAssignModal}>
              {t("subscriptions.assignModal.cancel")}
            </Button>
            <Button type="button" variant="primary" disabled={!canAssign || submitting} onClick={() => void assign()}>
              {t("subscriptions.assignModal.submit")}
            </Button>
          </>
        }
      >
        <div className="oh-sa-subs-assign">
          <p className="mb-3 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-sm font-semibold text-amber-950" role="note">
            {t("subscriptions.assignModal.offlineNote")}
          </p>
          <div className="oh-sa-subs-assign__fields">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className={fieldLabelClass}>{t("subscriptions.assignModal.searchFreelancer")}</span>
              <div className="relative">
                <input
                  className={controlClass}
                  type="text"
                  value={freelancerQuery}
                  placeholder={t("subscriptions.assignModal.searchPlaceholder")}
                  onChange={(e) => {
                    setFreelancerQuery(e.target.value);
                    setFreelancerOpen(true);
                  }}
                  onFocus={() => setFreelancerOpen(true)}
                  onBlur={() => setTimeout(() => setFreelancerOpen(false), 120)}
                  disabled={submitting}
                />
                {freelancerOpen ? (
                  <div className="absolute end-0 start-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-[color:var(--dash-card-border)] bg-white shadow-[var(--dash-card-shadow)]">
                    <div className="border-b border-slate-100 bg-slate-50/90 px-3 py-2 text-xs font-bold text-slate-500">
                      {freelancerBusy ? t("subscriptions.assignModal.searchBusy") : t("subscriptions.assignModal.pickFromResults")}
                    </div>
                    <div className="max-h-[220px] overflow-y-auto overscroll-contain">
                      {freelancerMatches.length === 0 && !freelancerBusy ? (
                        <div className="px-3 py-3 text-sm font-bold text-slate-500">{t("subscriptions.assignModal.noResults")}</div>
                      ) : null}
                      {freelancerMatches.map((f) => (
                        <button
                          key={String(f.id)}
                          type="button"
                          className="grid w-full cursor-pointer gap-0.5 border-0 bg-transparent px-3 py-2.5 text-start font-inherit transition-colors hover:bg-slate-50"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setForm((v) => ({
                              ...v,
                              freelancerUserIds: Array.from(new Set([...(v.freelancerUserIds || []), String(f.id)])).slice(0, 50),
                            }));
                            setSelectedFreelancersById((p) => ({
                              ...p,
                              [String(f.id)]: {
                                id: String(f.id),
                                name: f.name || "",
                                email: f.email || "",
                                accountId: f.accountId || "",
                              },
                            }));
                            setFreelancerQuery("");
                          }}
                        >
                          <div className="text-sm font-bold text-[color:var(--primary,#2f3b65)]">{f.name || "—"}</div>
                          <div className="text-xs font-semibold text-slate-500">
                            {f.email || ""}
                            {f.accountId ? ` • ${f.accountId}` : ""} • ID: {String(f.id)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <span className={fieldLabelClass}>{t("subscriptions.assignModal.pickPlan")}</span>
              <select
                className={controlClass}
                value={form.planId}
                onChange={(e) => setForm((v) => ({ ...v, planId: e.target.value }))}
                disabled={submitting || plansLoading}
              >
                <option value="">{t("subscriptions.assignModal.pickPlanPlaceholder")}</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {t("subscriptions.page.planOptionDays", { title: p.title, days: p.durationDays })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(form.freelancerUserIds || []).length > 0 ? (
            <div className="oh-sa-subs-assign__chips">
              <div className="mb-2 text-xs font-bold text-slate-600">{t("subscriptions.assignModal.selectedFreelancers")}</div>
              <div className="flex flex-wrap gap-2">
                {(form.freelancerUserIds || []).map((id) => {
                  const f = selectedFreelancersById[String(id)] || null;
                  const label = f
                    ? `${f.name || t("subscriptions.assignModal.freelancerFallback")}${f.accountId ? ` · ${f.accountId}` : ""}`.trim()
                    : t("subscriptions.assignModal.freelancerId", { id: String(id) });
                  return (
                    <span
                      key={String(id)}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--dash-card-border)] bg-white px-2.5 py-1 text-xs font-bold text-[color:var(--primary,#2f3b65)]"
                    >
                      <span className="min-w-0 truncate">{label}</span>
                      <button
                        type="button"
                        className="inline-flex h-5 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-50 px-1.5 text-xs font-bold leading-none text-slate-600"
                        aria-label={t("subscriptions.assignModal.removeFreelancer", { label })}
                        onClick={() =>
                          setForm((v) => ({
                            ...v,
                            freelancerUserIds: (v.freelancerUserIds || []).filter((x) => String(x) !== String(id)),
                          }))
                        }
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="m-0 text-xs text-slate-500">{t("subscriptions.assignModal.noFreelancerYet")}</p>
          )}
        </div>
      </DashboardModal>

      <SubscriptionWhatsAppModal
        open={Boolean(whatsAppSub)}
        subscription={whatsAppSub}
        planTitle={whatsAppSub ? planTitleById[String(whatsAppSub.planId || "")] : ""}
        onClose={() => setWhatsAppSub(null)}
      />

      <DashboardModal
        open={notifyModalOpen}
        title={t("subscriptions.notifyModal.title")}
        ariaLabel={t("subscriptions.notifyModal.ariaLabel")}
        onClose={closeNotifyModal}
        footer={
          <>
            <Button type="button" variant="secondary" disabled={notifyBusy} onClick={closeNotifyModal}>
              {t("subscriptions.notifyModal.cancel")}
            </Button>
            <Button type="button" variant="primary" disabled={notifyBusy || notifyLoading} onClick={() => void saveNotifyEmail()}>
              {notifyBusy ? t("subscriptions.notifyModal.saving") : t("subscriptions.notifyModal.save")}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <p className="m-0 text-sm leading-relaxed text-slate-600">{t("subscriptions.notifyModal.description")}</p>
          {notifyLoading ? (
            <div className="text-sm text-slate-500">{t("subscriptions.notifyModal.loading")}</div>
          ) : (
            <div className="flex min-w-0 flex-col gap-1.5">
              <label className={fieldLabelClass} htmlFor="sa-subs-notify-email">
                {t("subscriptions.notifyModal.currentLabel")}
              </label>
              <input
                id="sa-subs-notify-email"
                className={controlClass}
                type="email"
                dir="ltr"
                value={notifyEmail}
                placeholder="name@example.com"
                autoComplete="off"
                disabled={notifyBusy}
                onChange={(e) => {
                  setNotifyEmail(e.target.value);
                  if (notifyError) setNotifyError("");
                  if (notifySuccess) setNotifySuccess("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !notifyBusy) {
                    e.preventDefault();
                    void saveNotifyEmail();
                  }
                }}
              />
              {notifyEnvFallback ? (
                <p className="m-0 text-xs text-slate-500">
                  {t("subscriptions.notifyModal.envFallback")} <span dir="ltr">{notifyEnvFallback}</span>
                </p>
              ) : null}
            </div>
          )}
          {notifyError ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700"
            >
              {notifyError}
            </div>
          ) : null}
          {notifySuccess ? (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700"
            >
              {notifySuccess}
            </div>
          ) : null}
        </div>
      </DashboardModal>

      <DashboardModal
        open={feeModalOpen}
        title={t("subscriptions.feeModal.title")}
        ariaLabel={t("subscriptions.feeModal.title")}
        onClose={closeFeeModal}
        footer={
          <>
            <Button type="button" variant="secondary" disabled={feeBusy} onClick={closeFeeModal}>
              {t("subscriptions.feeModal.cancel")}
            </Button>
            <Button type="button" variant="primary" disabled={feeBusy || feeLoading} onClick={() => void saveFeeSettings()}>
              {feeBusy ? t("subscriptions.feeModal.saving") : t("subscriptions.feeModal.save")}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <p className="m-0 text-sm leading-relaxed text-slate-600">
            {t("subscriptions.feeModal.description", { days: feeValidityDays })}
          </p>
          {feeLoading ? (
            <div className="text-sm text-slate-500">{t("subscriptions.feeModal.loading")}</div>
          ) : (
            <>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <span className="text-sm font-bold text-slate-800">{t("subscriptions.feeModal.enableLabel")}</span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[color:var(--primary,#2f3b65)]"
                  checked={feeEnabled}
                  disabled={feeBusy}
                  onChange={(e) => {
                    setFeeEnabled(e.target.checked);
                    if (feeError) setFeeError("");
                    if (feeSuccess) setFeeSuccess("");
                  }}
                />
              </label>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label className={fieldLabelClass} htmlFor="sa-subs-activation-fee-amount">
                  {t("subscriptions.feeModal.amountLabel")}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="sa-subs-activation-fee-amount"
                    className={controlClass}
                    type="number"
                    min="0.001"
                    step="0.001"
                    dir="ltr"
                    value={feeAmountJod}
                    disabled={feeBusy}
                    aria-disabled={!feeEnabled}
                    style={feeEnabled ? undefined : { opacity: 0.65 }}
                    onChange={(e) => {
                      setFeeAmountJod(e.target.value);
                      if (feeError) setFeeError("");
                      if (feeSuccess) setFeeSuccess("");
                    }}
                  />
                  <span className="shrink-0 text-sm font-bold text-slate-600">{t("subscriptions.feeModal.currency")}</span>
                </div>
                {!feeEnabled ? (
                  <p className="m-0 text-xs text-slate-500">{t("subscriptions.feeModal.disabledHint")}</p>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
                {t("subscriptions.feeModal.validityReadonly")}{" "}
                <strong>{t("subscriptions.feeModal.validityDays", { days: feeValidityDays })}</strong>
              </div>
            </>
          )}
          {feeError ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700"
            >
              {feeError}
            </div>
          ) : null}
          {feeSuccess ? (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700"
            >
              {feeSuccess}
            </div>
          ) : null}
        </div>
      </DashboardModal>

      <DashboardPageHeader
        eyebrow={t("subscriptions.page.eyebrow")}
        title={t("subscriptions.page.title")}
        description={t("subscriptions.page.description")}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.subscriptions")}
      />

      {error && subs.length === 0 ? (
        <DashboardErrorState
          message={error}
          actions={
            <Button type="button" variant="secondary" onClick={() => void loadSubscriptions(page)}>
              {t("subscriptions.page.retry")}
            </Button>
          }
        />
      ) : null}

      {(!listLoading || subs.length > 0) && !plansLoading ? (
        <div className="oh-sa-subs-stats" aria-label={t("subscriptions.page.statsAria")}>
          {statItems.map((item) => (
            <article key={item.key} className="oh-sa-subs-stat">
              <p className="oh-sa-subs-stat__label">{item.label}</p>
              <p className="oh-sa-subs-stat__value">{item.value}</p>
            </article>
          ))}
        </div>
      ) : null}

      <DashboardSection
        title={t("subscriptions.page.sectionTitle")}
        description={t("subscriptions.page.sectionDescription")}
        actions={
          <>
            <Button type="button" variant="secondary" disabled={submitting} onClick={() => void openFeeModal()}>
              {t("subscriptions.page.activationFee")}
            </Button>
            <Button type="button" variant="secondary" disabled={submitting} onClick={() => void openNotifyModal()}>
              {t("subscriptions.page.notifyEmail")}
            </Button>
            <Button type="button" variant="primary" disabled={submitting} onClick={() => setAssignModalOpen(true)}>
              {t("subscriptions.page.assignPlan")}
            </Button>
          </>
        }
      >
        {initialLoading ? <DashboardLoadingState label={t("subscriptions.page.loading")} /> : null}

        {showListToolbar ? (
          <div
            className="oh-sa-subs-toolbar dash-ui-toolbar"
            role="search"
            aria-label="Browse subscription records, search, and filter results."
          >
            <div className="oh-sa-subs-toolbar__grid">
              <div className="oh-sa-subs-toolbar__field oh-sa-subs-toolbar__field--search">
                <label className={fieldLabelClass} htmlFor="sa-subs-list-search">
                  {t("subscriptions.page.searchLabel")}
                </label>
                <input
                  id="sa-subs-list-search"
                  className={controlClass}
                  type="search"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder={t("subscriptions.page.searchPlaceholder")}
                  autoComplete="off"
                  disabled={listLoading}
                />
              </div>

              <div className="oh-sa-subs-toolbar__field">
                <label className={fieldLabelClass} htmlFor="sa-subs-filter-status">
                  {t("subscriptions.page.statusFilter")}
                </label>
                <select
                  id="sa-subs-filter-status"
                  className={controlClass}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  disabled={listLoading}
                >
                  <option value="">{t("subscriptions.page.allStatuses")}</option>
                  <option value="active">{t("subscriptions.status.subscription.active")}</option>
                  <option value="assigned_not_started">{t("subscriptions.status.subscription.assigned_not_started")}</option>
                  <option value="inactive">{t("subscriptions.status.subscription.inactive")}</option>
                  <option value="expired">{t("subscriptions.status.subscription.expired")}</option>
                  <option value="cancelled">{t("subscriptions.status.subscription.cancelled")}</option>
                </select>
              </div>

              <div className="oh-sa-subs-toolbar__field">
                <label className={fieldLabelClass} htmlFor="sa-subs-filter-plan">
                  {t("subscriptions.page.planFilter")}
                </label>
                <select
                  id="sa-subs-filter-plan"
                  className={controlClass}
                  value={filterPlanId}
                  onChange={(e) => setFilterPlanId(e.target.value)}
                  disabled={listLoading}
                >
                  <option value="">{t("subscriptions.page.allPlans")}</option>
                  {plans.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="oh-sa-subs-toolbar__actions">
                {hasActiveFilters ? (
                  <Button type="button" variant="secondary" disabled={listLoading || submitting} onClick={clearFilters}>
                    {t("subscriptions.page.clearFilters")}
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" disabled={listLoading || submitting} onClick={() => void loadSubscriptions(page)}>
                  {t("subscriptions.page.refresh")}
                </Button>
              </div>
            </div>

            <div className="oh-sa-subs-toolbar__meta">
              <StatusBadge tone="neutral" className="oh-sa-subs-toolbar__count">
                {listLoading && subs.length > 0
                  ? t("subscriptions.page.refreshing")
                  : listLoading
                    ? t("subscriptions.page.loadingList")
                    : formatDisplayRange(pagination, t)}
              </StatusBadge>
            </div>
          </div>
        ) : null}

        {refreshError ? (
          <p role="status" data-testid="admin-list-refresh-soft-note" className="mb-2 text-sm text-amber-700">
            {refreshError}
          </p>
        ) : null}

        {listLoading && !initialLoading && subs.length === 0 ? (
          <div className="oh-sa-subs-list-loading" aria-live="polite">
            {t("subscriptions.page.loadingPage")}
          </div>
        ) : null}

        {!listLoading && !initialLoading && pagination.total === 0 && !hasFilters ? (
          <DashboardEmptyState title={t("subscriptions.page.emptyTitle")} description={t("subscriptions.page.emptyDescription")} />
        ) : null}

        {!listLoading && !initialLoading && pagination.total === 0 && hasFilters ? (
          <DashboardEmptyState
            title={t("subscriptions.page.noResultsTitle")}
            description={t("subscriptions.page.noResultsDescription")}
          />
        ) : null}

        {subs.length > 0 ? (
          <>
            <SuperAdminSubscriptionsList
              subscriptions={subs}
              planTitleById={planTitleById}
              submitting={submitting}
              onDisable={handleDisable}
              onCancel={handleCancel}
              onFirstOrder={handleFirstOrder}
              onCompanyActivate={companyActivate}
              onWhatsApp={setWhatsAppSub}
            />
            <div className="oh-sa-subs-pagination-wrap">
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={setPage}
                isLoading={listLoading}
                className="oh-sa-subs-pagination"
              />
            </div>
          </>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
};

export default SuperAdminSubscriptionsPage;
