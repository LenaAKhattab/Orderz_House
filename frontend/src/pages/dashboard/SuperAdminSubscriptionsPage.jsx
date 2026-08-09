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

function errorMessage(err) {
  const apiMsg = err?.response?.data?.message;
  if (apiMsg) return apiMsg;
  const status = err?.response?.status;
  if (status === 401 || status === 403) {
    return "ليست لديك صلاحية لتنفيذ هذه العملية.";
  }
  if (status === 400 || status === 422) {
    return "بيانات غير صالحة. تحقق من القيم المدخلة.";
  }
  // Axios timeout / aborted request (no response) — common when a prior hang occurred.
  if (err?.code === "ECONNABORTED" || err?.code === "ERR_CANCELED" || !err?.response) {
    return "انتهت مهلة الطلب. حاول مجددًا.";
  }
  return "تعذر تنفيذ العملية. حاول مجدداً.";
}


function formatDisplayRange(pagination) {
  const total = Number(pagination?.total) || 0;
  if (total <= 0) return "لا توجد اشتراكات مطابقة";
  const page = Number(pagination?.page) || 1;
  const limit = Number(pagination?.limit) || PAGE_LIMIT;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return `عرض ${start}–${end} من أصل ${total} اشتراك`;
}

const SuperAdminSubscriptionsPage = () => {
  const [plans, setPlans] = useState([]);
  const [subs, setSubs] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [aggregates, setAggregates] = useState(EMPTY_AGGREGATES);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      { key: "total", label: "إجمالي الاشتراكات", value: aggregates.total },
      { key: "active", label: "النشطة", value: aggregates.active },
      { key: "pendingActivation", label: "بانتظار تفعيل الشركة", value: aggregates.pendingActivation },
      { key: "notStarted", label: "لم يبدأ بعد", value: aggregates.notStarted },
      { key: "expiringSoon", label: "تنتهي قريبًا", value: aggregates.expiringSoon },
      { key: "inactiveCancelled", label: "المعلقة / المعطلة", value: aggregates.inactiveCancelled },
    ],
    [aggregates],
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
        if (!cancelled) setError(errorMessage(err));
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
      setListLoading(true);
      setError("");
      try {
        const res = await listSubscriptionsRequest({
          page: targetPage,
          limit: PAGE_LIMIT,
          search: debouncedSearch || undefined,
          status: filterStatus || undefined,
          planId: filterPlanId || undefined,
        });
        const nextSubs = res?.data?.subscriptions || [];
        const nextPagination = res?.data?.pagination || EMPTY_PAGINATION;
        const nextAggregates = res?.data?.aggregates || EMPTY_AGGREGATES;

        if (nextSubs.length === 0 && targetPage > 1 && (nextPagination.total ?? 0) > 0) {
          setPage(targetPage - 1);
          setListLoading(false);
          return;
        }

        setSubs(nextSubs);
        setPagination(nextPagination);
        setAggregates(nextAggregates);
        if (pageOverride == null && targetPage !== page) {
          setPage(targetPage);
        }
      } catch (err) {
        setError(errorMessage(err));
        setSubs([]);
        setPagination(EMPTY_PAGINATION);
        setAggregates(EMPTY_AGGREGATES);
      } finally {
        setListLoading(false);
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
      setNotifyError(errorMessage(err));
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
      setNotifyError("يرجى إدخال بريد إلكتروني صحيح");
      return;
    }
    setNotifyBusy(true);
    setNotifyError("");
    setNotifySuccess("");
    try {
      const res = await updateSubscriptionNotificationEmailRequest(email);
      setNotifyEmail(res?.data?.email || "");
      setNotifyEnvFallback(res?.data?.envFallback || null);
      setNotifySuccess("تم حفظ بريد إشعارات الاشتراكات بنجاح");
    } catch (err) {
      setNotifyError(errorMessage(err) || "تعذر حفظ البريد الإلكتروني");
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
      setFeeError(errorMessage(err));
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
      setFeeError("يرجى إدخال قيمة صحيحة أكبر من صفر لرسوم التفعيل");
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
          ? "تم حفظ إعدادات رسوم التفعيل بنجاح"
          : "تم تعطيل رسوم التفعيل مع الإبقاء على القيمة المحفوظة",
      );
    } catch (err) {
      setFeeError(errorMessage(err) || "تعذر حفظ إعدادات رسوم التفعيل");
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
              freelancerLabel: f ? `${f.name || "مستقل"} • ${f.email || ""}`.trim() : `ID: ${uid}`,
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
          failures.push({ freelancerUserId: String(freelancerUserId), message: errorMessage(e) });
        }
      }

      if (failures.length) {
        setError(`تعذر إسناد الباقة لبعض المستخدمين: ${failures.map((f) => `ID ${f.freelancerUserId}`).join("، ")}`);
      } else {
        resetAssignForm();
        setAssignModalOpen(false);
      }

      if (failures.length < freelancerIds.length) {
        setPage(1);
      }
    } catch (err) {
      setError(errorMessage(err));
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
      setError(errorMessage(err));
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
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const companyActivate = async (sub) => {
    setError("");
    setSubmitting(true);
    try {
      await activateSubscriptionCompanyRequest(sub.id);
      await loadSubscriptions(page);
    } catch (err) {
      setError(errorMessage(err));
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
      title: "تأكيد تعطيل الاشتراك",
      body: (
        <p className="m-0 text-sm leading-relaxed text-slate-600">
          سيتم تعطيل اشتراك <strong className="text-slate-900">#{sub.id}</strong>. هذا لا يعني استردادًا ماليًا — يغيّر حالة
          الاشتراك فقط.
        </p>
      ),
      confirmLabel: "نعم، عطّل",
    });
    if (!ok) return;
    await setStatus(sub, "inactive");
  };

  const handleCancel = async (sub) => {
    const ok = await askConfirm({
      title: "تأكيد إلغاء الاشتراك",
      body: (
        <p className="m-0 text-sm leading-relaxed text-slate-600">
          سيتم إلغاء اشتراك <strong className="text-slate-900">#{sub.id}</strong>. هذا لا يعني استردادًا ماليًا تلقائيًا —
          يغيّر حالة الاشتراك في النظام فقط.
        </p>
      ),
      confirmLabel: "نعم، ألغِ",
    });
    if (!ok) return;
    await setStatus(sub, "cancelled");
  };

  const handleFirstOrder = async (sub) => {
    const ok = await askConfirm({
      title: "تسجيل أول طلب",
      body: (
        <p className="m-0 text-sm leading-relaxed text-slate-600">
          سيتم تسجيل أول طلب لاشتراك <strong className="text-slate-900">#{sub.id}</strong> وبدء احتساب مدة الاشتراك من
          الآن.
        </p>
      ),
      confirmLabel: "تسجيل أول طلب",
    });
    if (!ok) return;
    await markFirstOrder(sub, new Date().toISOString());
  };

  const assignConfirmBody = (
    <>
      <p className="m-0 mb-3 text-sm leading-relaxed text-slate-600">
        بعض المستقلين لديهم اشتراك حالي. إذا أكملت، سيتم <strong className="text-slate-900">تغيير باقتهم</strong> إلى:{" "}
        <strong className="text-[color:var(--primary,#2f3b65)]">{confirmPlanTitle}</strong>
      </p>
      <p className="m-0 mb-3 text-sm leading-relaxed text-amber-950">
        سيُعتبر اشتراك الخطة ورسوم التفعيل مدفوعين أوفلاين، وسيتمكن المستقل من استلام الطلبات مباشرة وفق حدود الخطة.
      </p>
      <div className="mt-1 grid gap-2.5">
        {confirmItems.map((x) => (
          <div
            key={x.freelancerUserId}
            className="grid gap-1 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3 sm:p-4 dark:border-slate-600/50 dark:bg-slate-900/30"
          >
            <div className="text-sm font-bold text-[color:var(--primary,#2f3b65)]">{x.freelancerLabel}</div>
            <div className="text-xs font-bold text-slate-500">
              الباقة الحالية:{" "}
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
        title="تأكيد تغيير الباقة"
        body={assignConfirmBody}
        confirmLabel="نعم، غيّر الباقة"
        cancelLabel="إلغاء"
        confirmFirst
        layerClassName="z-[1300]"
        onConfirm={() => closeAssignConfirm(true)}
        onCancel={() => closeAssignConfirm(false)}
      />

      <ConfirmDialog
        open={Boolean(actionConfirm)}
        title={actionConfirm?.title || ""}
        body={actionConfirm?.body}
        confirmLabel={actionConfirm?.confirmLabel || "تأكيد"}
        cancelLabel="إلغاء"
        confirmFirst
        onConfirm={() => closeActionConfirm(true)}
        onCancel={() => closeActionConfirm(false)}
      />

      <DashboardModal
        open={assignModalOpen}
        title="إسناد باقة لمستقل"
        ariaLabel="Assign Package — إسناد باقة لمستقل"
        className="oh-sa-subs-assign-modal"
        onClose={closeAssignModal}
        footer={
          <>
            <Button type="button" variant="secondary" disabled={submitting} onClick={closeAssignModal}>
              إلغاء
            </Button>
            <Button type="button" variant="primary" disabled={!canAssign || submitting} onClick={() => void assign()}>
              إسناد الباقة
            </Button>
          </>
        }
      >
        <div className="oh-sa-subs-assign">
          <p className="mb-3 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-sm font-semibold text-amber-950" role="note">
            عند تعيين الخطة يدويًا، سيُعتبر اشتراك الخطة ورسوم التفعيل مدفوعين أوفلاين، وسيتمكن المستقل من استلام الطلبات مباشرة وفق حدود الخطة.
          </p>
          <div className="oh-sa-subs-assign__fields">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className={fieldLabelClass}>البحث عن مستقل</span>
              <div className="relative">
                <input
                  className={controlClass}
                  type="text"
                  value={freelancerQuery}
                  placeholder="ابحث بالاسم أو البريد أو رقم الحساب…"
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
                      {freelancerBusy ? "جارٍ البحث…" : "اختر من النتائج"}
                    </div>
                    <div className="max-h-[220px] overflow-y-auto overscroll-contain">
                      {freelancerMatches.length === 0 && !freelancerBusy ? (
                        <div className="px-3 py-3 text-sm font-bold text-slate-500">لا توجد نتائج.</div>
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
              <span className={fieldLabelClass}>اختيار الباقة</span>
              <select
                className={controlClass}
                value={form.planId}
                onChange={(e) => setForm((v) => ({ ...v, planId: e.target.value }))}
                disabled={submitting || plansLoading}
              >
                <option value="">اختر باقة…</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.durationDays} يوم)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(form.freelancerUserIds || []).length > 0 ? (
            <div className="oh-sa-subs-assign__chips">
              <div className="mb-2 text-xs font-bold text-slate-600">المستقلون المختارون:</div>
              <div className="flex flex-wrap gap-2">
                {(form.freelancerUserIds || []).map((id) => {
                  const f = selectedFreelancersById[String(id)] || null;
                  const label = f
                    ? `${f.name || "مستقل"}${f.accountId ? ` · ${f.accountId}` : ""}`.trim()
                    : `ID: ${String(id)}`;
                  return (
                    <span
                      key={String(id)}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--dash-card-border)] bg-white px-2.5 py-1 text-xs font-bold text-[color:var(--primary,#2f3b65)]"
                    >
                      <span className="min-w-0 truncate">{label}</span>
                      <button
                        type="button"
                        className="inline-flex h-5 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-50 px-1.5 text-xs font-bold leading-none text-slate-600"
                        aria-label={`إزالة ${label}`}
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
            <p className="m-0 text-xs text-slate-500">لم يتم اختيار مستقل بعد.</p>
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
        title="إعداد بريد إشعارات الاشتراكات"
        ariaLabel="Subscription Notification Email — إعداد بريد إشعارات الاشتراكات"
        onClose={closeNotifyModal}
        footer={
          <>
            <Button type="button" variant="secondary" disabled={notifyBusy} onClick={closeNotifyModal}>
              إلغاء
            </Button>
            <Button type="button" variant="primary" disabled={notifyBusy || notifyLoading} onClick={() => void saveNotifyEmail()}>
              {notifyBusy ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <p className="m-0 text-sm leading-relaxed text-slate-600">
            هذا هو البريد الإلكتروني الذي يستقبل إشعار كل اشتراك مدفوع جديد تلقائياً.
          </p>
          {notifyLoading ? (
            <div className="text-sm text-slate-500">جارٍ تحميل البريد الحالي…</div>
          ) : (
            <div className="flex min-w-0 flex-col gap-1.5">
              <label className={fieldLabelClass} htmlFor="sa-subs-notify-email">
                بريد الإشعارات الحالي
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
                  الإعداد الافتراضي (متغير البيئة): <span dir="ltr">{notifyEnvFallback}</span>
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
        title="رسوم التفعيل"
        ariaLabel="Subscription Activation Fee Settings"
        onClose={closeFeeModal}
        footer={
          <>
            <Button type="button" variant="secondary" disabled={feeBusy} onClick={closeFeeModal}>
              إلغاء
            </Button>
            <Button type="button" variant="primary" disabled={feeBusy || feeLoading} onClick={() => void saveFeeSettings()}>
              {feeBusy ? "جارٍ الحفظ…" : "حفظ التغييرات"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <p className="m-0 text-sm leading-relaxed text-slate-600">
            تطبق على المستخدم عند الحاجة وفق سياسة الصلاحية الحالية ({feeValidityDays} يومًا). تعطيل الرسوم لا يغيّر السجلات التاريخية.
          </p>
          {feeLoading ? (
            <div className="text-sm text-slate-500">جارٍ تحميل الإعدادات…</div>
          ) : (
            <>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <span className="text-sm font-bold text-slate-800">تفعيل رسوم التفعيل</span>
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
                  قيمة رسوم التفعيل
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
                  <span className="shrink-0 text-sm font-bold text-slate-600">د.أ</span>
                </div>
                {!feeEnabled ? (
                  <p className="m-0 text-xs text-slate-500">الرسوم معطّلة حالياً — تُحفظ القيمة لاستخدامها عند إعادة التفعيل.</p>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
                مدة الصلاحية: <strong>{feeValidityDays}</strong> يومًا (للقراءة فقط)
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
        eyebrow="لوحة المدير الأعلى"
        title="اشتراكات المستقلين"
        description="إسناد الباقات ومتابعة حالة الاشتراك (للمدير الأعلى فقط)."
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.subscriptions")}
      />

      {error ? (
        <DashboardErrorState
          message={error}
          actions={
            <Button type="button" variant="secondary" onClick={() => void loadSubscriptions(page)}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : null}

      {!listLoading ? (
        <div className="oh-sa-subs-stats" aria-label="ملخص الاشتراكات">
          {statItems.map((item) => (
            <article key={item.key} className="oh-sa-subs-stat">
              <p className="oh-sa-subs-stat__label">{item.label}</p>
              <p className="oh-sa-subs-stat__value">{item.value}</p>
            </article>
          ))}
        </div>
      ) : null}

      <DashboardSection
        title="إدارة الاشتراكات"
        description="استعرض سجلات الاشتراكات وابحث وفلتر النتائج."
        actions={
          <>
            <Button type="button" variant="secondary" disabled={submitting} onClick={() => void openFeeModal()}>
              رسوم التفعيل
            </Button>
            <Button type="button" variant="secondary" disabled={submitting} onClick={() => void openNotifyModal()}>
              إعداد بريد إشعارات الاشتراكات
            </Button>
            <Button type="button" variant="primary" disabled={submitting} onClick={() => setAssignModalOpen(true)}>
              إسناد باقة لمستقل
            </Button>
          </>
        }
      >
        {initialLoading ? <DashboardLoadingState label="جارٍ تحميل الاشتراكات…" /> : null}

        {showListToolbar ? (
          <div
            className="oh-sa-subs-toolbar dash-ui-toolbar"
            role="search"
            aria-label="Browse subscription records, search, and filter results."
          >
            <div className="oh-sa-subs-toolbar__grid">
              <div className="oh-sa-subs-toolbar__field oh-sa-subs-toolbar__field--search">
                <label className={fieldLabelClass} htmlFor="sa-subs-list-search">
                  بحث في القائمة
                </label>
                <input
                  id="sa-subs-list-search"
                  className={controlClass}
                  type="search"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="اسم المستقل، الحساب، أو رقم الاشتراك"
                  autoComplete="off"
                  disabled={listLoading}
                />
              </div>

              <div className="oh-sa-subs-toolbar__field">
                <label className={fieldLabelClass} htmlFor="sa-subs-filter-status">
                  الحالة
                </label>
                <select
                  id="sa-subs-filter-status"
                  className={controlClass}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  disabled={listLoading}
                >
                  <option value="">كل الحالات</option>
                  <option value="active">نشط</option>
                  <option value="assigned_not_started">لم يبدأ بعد</option>
                  <option value="inactive">غير نشط</option>
                  <option value="expired">منتهي</option>
                  <option value="cancelled">ملغي</option>
                </select>
              </div>

              <div className="oh-sa-subs-toolbar__field">
                <label className={fieldLabelClass} htmlFor="sa-subs-filter-plan">
                  الباقة
                </label>
                <select
                  id="sa-subs-filter-plan"
                  className={controlClass}
                  value={filterPlanId}
                  onChange={(e) => setFilterPlanId(e.target.value)}
                  disabled={listLoading}
                >
                  <option value="">كل الباقات</option>
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
                    مسح الفلاتر
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" disabled={listLoading || submitting} onClick={() => void loadSubscriptions(page)}>
                  تحديث
                </Button>
              </div>
            </div>

            <div className="oh-sa-subs-toolbar__meta">
              <StatusBadge tone="neutral" className="oh-sa-subs-toolbar__count">
                {listLoading ? "جارٍ التحميل…" : formatDisplayRange(pagination)}
              </StatusBadge>
            </div>
          </div>
        ) : null}

        {listLoading && !initialLoading ? (
          <div className="oh-sa-subs-list-loading" aria-live="polite">
            جارٍ تحميل الصفحة…
          </div>
        ) : null}

        {!listLoading && !initialLoading && pagination.total === 0 && !hasFilters ? (
          <DashboardEmptyState title="لا توجد اشتراكات حالياً" description="ستظهر الاشتراكات هنا بعد الإسناد أو عند توفر بيانات من الخادم." />
        ) : null}

        {!listLoading && !initialLoading && pagination.total === 0 && hasFilters ? (
          <DashboardEmptyState
            title="لا توجد نتائج مطابقة"
            description="جرّب تعديل البحث أو إعادة ضبط التصفية لعرض المزيد من الاشتراكات."
          />
        ) : null}

        {!listLoading && subs.length > 0 ? (
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
