import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Building2, ClipboardList, Coins, Snowflake, UserMinus, UserPlus, Users } from "lucide-react";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardTable from "../../components/dashboard/DashboardTable";
import DashboardTabs, { DashboardTab } from "../../components/dashboard/DashboardTabs";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import Pagination from "../../components/common/Pagination";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import "../../i18n/institutionsResources";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import { useAuth } from "../../context/useAuth";
import {
  adminAddInstitutionMemberRequest,
  adminFreezeInstitutionRequest,
  adminGetInstitutionDeactivationImpactRequest,
  adminGetInstitutionRequest,
  adminListInstitutionMembersRequest,
  adminListInstitutionOrdersRequest,
  adminListInstitutionStoragesRequest,
  adminPatchInstitutionRequest,
  adminRemoveInstitutionMemberRequest,
  adminUnfreezeInstitutionRequest,
  adminUpdateInstitutionMemberRequest,
} from "../../services/api";
import {
  getSafeApiErrorMessage,
  isAxiosCanceledError,
  isAxiosTimeoutError,
} from "../../utils/apiErrorMessage";
import { formatJodMoney } from "../../utils/formatJodMoney";
import InstitutionAddMemberModal from "./institutions/InstitutionAddMemberModal";
import InstitutionCreateWorkModal from "./institutions/InstitutionCreateWorkModal";

const LIST_PATH = "/dashboard/super-admin/institutions";
const STORAGE_BASE = "/dashboard/super-admin/institutional-order-storage";
const EMPTY_STATS = { ordersCount: 0, usersCount: 0, ordersTotalAmount: 0 };
const WORK_DETAIL_BASE = (instId) => `/dashboard/super-admin/institutions/${instId}/work`;

function JodMoneyValue({ amount, locale, className = "" }) {
  return (
    <bdi dir="ltr" className={["oh-num", "oh-money", className].filter(Boolean).join(" ")}>
      {formatJodMoney(amount, { locale })}
    </bdi>
  );
}

function statusBadgeClass(status) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "frozen") return "border-sky-200 bg-sky-50 text-sky-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function statusLabel(status, t) {
  if (status === "active") return t("institutions.active");
  if (status === "frozen") return t("institutions.frozen");
  return t("institutions.inactive");
}

function memberStatusLabel(status, t) {
  if (status === "active") return t("institutions.memberActive");
  if (status === "inactive") return t("institutions.memberInactive");
  return String(status || "—");
}

function memberRoleLabel(role, t) {
  if (role === "manager") return t("institutions.roleManager");
  return t("institutions.roleMember");
}

function platformRoleLabel(role, t) {
  if (role === "super_admin") return t("dashboard.roles.superAdmin");
  if (role === "admin") return t("dashboard.roles.admin");
  if (role === "freelancer") return t("dashboard.roles.freelancer");
  if (role === "client") return t("dashboard.roles.client");
  return role || "—";
}

function storageStatusLabel(status, t) {
  const key = {
    active: "dashboard.institutionalOrderStorage.active",
    paused: "dashboard.institutionalOrderStorage.paused",
    archived: "dashboard.institutionalOrderStorage.archived",
    draft: "dashboard.institutionalOrderStorage.draft",
  }[status];
  return key ? t(key) : status;
}

function passiveSectionMessage(err, t) {
  if (isAxiosTimeoutError(err)) return t("institutions.sectionTimeout");
  return t("institutions.sectionLoadError");
}

function actionErrorMessage(err, t, fallbackKey) {
  if (isAxiosCanceledError(err)) return null;
  if (isAxiosTimeoutError(err)) return t(fallbackKey);
  const msg = getSafeApiErrorMessage(err, t(fallbackKey));
  return msg || t(fallbackKey);
}

function SectionInlineError({ message, onRetry, retryLabel }) {
  return (
    <div className="grid gap-2">
      <p role="alert" className="m-0 text-sm text-slate-700">
        {message}
      </p>
      {onRetry ? (
        <div>
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            {retryLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function SuperAdminInstitutionDetailPage() {
  const { institutionId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = (user?.primaryRole || user?.role) === "super_admin";

  const workspaceTabs = useMemo(
    () => [
      { id: "members", label: t("institutions.tabs.members") },
      { id: "orders", label: t("institutions.tabs.orders") },
      { id: "settings", label: t("institutions.tabs.settings") },
    ],
    [t],
  );

  const activeTab = workspaceTabs.some((tab) => tab.id === searchParams.get("tab"))
    ? searchParams.get("tab")
    : "members";
  const setActiveTab = (tabId) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tabId);
      next.delete("addMember");
      return next;
    });
  };

  const overviewAbortRef = useRef(null);
  const membersAbortRef = useRef(null);
  const storagesAbortRef = useRef(null);
  const addMemberBtnRef = useRef(null);
  const tRef = useRef(t);
  tRef.current = t;
  const loadGenRef = useRef(0);
  /** null until initial bundle settles; then last fetched members/storages page. */
  const lastFetchedMembersPageRef = useRef(null);
  const lastFetchedStoragesPageRef = useRef(null);

  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewRefreshing, setOverviewRefreshing] = useState(false);
  const [overviewError, setOverviewError] = useState(null);
  const [overviewStatus, setOverviewStatus] = useState(null);
  const [institution, setInstitution] = useState(null);

  const [membersLoading, setMembersLoading] = useState(true);
  const [membersRefreshing, setMembersRefreshing] = useState(false);
  const [membersError, setMembersError] = useState(null);
  const [members, setMembers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [memberSearchInput, setMemberSearchInput] = useState("");
  const [debouncedMemberQ, setDebouncedMemberQ] = useState("");
  const [memberStatusFilter, setMemberStatusFilter] = useState("");
  const [updatingMemberId, setUpdatingMemberId] = useState(null);

  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  const [ordersError, setOrdersError] = useState(null);
  const [institutionOrders, setInstitutionOrders] = useState([]);
  const [ordersPagination, setOrdersPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [ordersPage, setOrdersPage] = useState(1);
  const ordersLoadedRef = useRef(false);
  const [createWorkOpen, setCreateWorkOpen] = useState(false);
  const createWorkBtnRef = useRef(null);
  const [ordersWorkTypeFilter, setOrdersWorkTypeFilter] = useState("");
  const [ordersSearchInput, setOrdersSearchInput] = useState("");
  const [debouncedOrdersQ, setDebouncedOrdersQ] = useState("");

  const [storagesLoading, setStoragesLoading] = useState(true);
  const [storagesRefreshing, setStoragesRefreshing] = useState(false);
  const [storagesError, setStoragesError] = useState(null);
  const [storages, setStorages] = useState([]);
  const [storagePagination, setStoragePagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [storagePage, setStoragePage] = useState(1);

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addingUserId, setAddingUserId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", slug: "", status: "active" });
  const [editError, setEditError] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [unfreezeOpen, setUnfreezeOpen] = useState(false);
  const [impact, setImpact] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statistics, setStatistics] = useState(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedMemberQ(memberSearchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [memberSearchInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedOrdersQ(ordersSearchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [ordersSearchInput]);

  useEffect(() => {
    setOrdersPage(1);
  }, [debouncedOrdersQ, ordersWorkTypeFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedMemberQ, memberStatusFilter]);

  const formatDate = (value) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString(locale === "en" ? "en-GB" : "ar-JO");
    } catch {
      return String(value);
    }
  };

  const applyInstitution = useCallback((inst) => {
    setInstitution(inst);
    if (inst) {
      setEditForm({
        name: inst.name || "",
        description: inst.description || "",
        slug: inst.slug || "",
        status: inst.status || "active",
      });
    }
  }, []);

  const loadInitialBundle = useCallback(
    async ({ soft = false, membersPage = 1, storagesPage = 1 } = {}) => {
      if (!institutionId) return;
      const gen = ++loadGenRef.current;
      if (overviewAbortRef.current) overviewAbortRef.current.abort();
      if (membersAbortRef.current) membersAbortRef.current.abort();
      if (storagesAbortRef.current) storagesAbortRef.current.abort();
      const controller = new AbortController();
      overviewAbortRef.current = controller;
      membersAbortRef.current = controller;
      storagesAbortRef.current = controller;

      if (soft) {
        setOverviewRefreshing(true);
        setMembersRefreshing(true);
        setStoragesRefreshing(true);
      } else {
        setOverviewLoading(true);
        setMembersLoading(true);
        setStoragesLoading(true);
      }
      setOverviewError(null);
      setOverviewStatus(null);
      setMembersError(null);
      setStoragesError(null);
      setStatsError(null);
      setStatsLoading(true);

      try {
        const res = await adminGetInstitutionRequest(institutionId, {
          signal: controller.signal,
          bundle: true,
          membersPage,
          storagesPage,
          membersLimit: 20,
          storagesLimit: 20,
        });
        if (controller.signal.aborted || gen !== loadGenRef.current) return;
        const inst = res?.data?.institution || null;
        applyInstitution(inst);
        if (!inst) {
          setOverviewStatus(404);
          setOverviewError(tRef.current("institutions.notFound"));
          return;
        }
        setMembers(res?.data?.members || []);
        setPagination(res?.data?.membersPagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
        setStorages(res?.data?.storages || []);
        setStoragePagination(res?.data?.storagesPagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
        const stats = res?.data?.statistics;
        if (stats && typeof stats === "object") {
          setStatistics({
            ordersCount: Number(stats.ordersCount || 0),
            usersCount: Number(stats.usersCount || 0),
            ordersTotalAmount: Number(stats.ordersTotalAmount || 0),
          });
          setStatsError(null);
        } else {
          setStatistics(EMPTY_STATS);
          setStatsError(tRef.current("institutions.statsError"));
        }
        lastFetchedMembersPageRef.current = membersPage;
        lastFetchedStoragesPageRef.current = storagesPage;
      } catch (e) {
        if (isAxiosCanceledError(e) || controller.signal.aborted || gen !== loadGenRef.current) return;
        const status = e?.response?.status;
        setOverviewStatus(status || null);
        const msg =
          status === 403
            ? tRef.current("institutions.forbidden")
            : status === 404
              ? tRef.current("institutions.notFound")
              : passiveSectionMessage(e, tRef.current);
        setOverviewError(msg);
        if (status !== 403 && status !== 404) {
          setMembersError(msg);
          setStoragesError(msg);
          setStatsError(msg);
        }
      } finally {
        if (!controller.signal.aborted && gen === loadGenRef.current) {
          setOverviewLoading(false);
          setOverviewRefreshing(false);
          setMembersLoading(false);
          setMembersRefreshing(false);
          setStoragesLoading(false);
          setStoragesRefreshing(false);
          setStatsLoading(false);
        }
      }
    },
    [institutionId, applyInstitution],
  );

  const loadOverview = useCallback(
    async ({ soft = false } = {}) => {
      if (!institutionId) return;
      if (overviewAbortRef.current) overviewAbortRef.current.abort();
      const controller = new AbortController();
      overviewAbortRef.current = controller;
      if (soft) setOverviewRefreshing(true);
      else setOverviewLoading(true);
      setOverviewError(null);
      setOverviewStatus(null);
      try {
        const instRes = await adminGetInstitutionRequest(institutionId, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const inst = instRes?.data?.institution || null;
        applyInstitution(inst);
        if (!inst) {
          setOverviewStatus(404);
          setOverviewError(tRef.current("institutions.notFound"));
        }
      } catch (e) {
        if (isAxiosCanceledError(e) || controller.signal.aborted) return;
        const status = e?.response?.status;
        setOverviewStatus(status || null);
        if (status === 403) setOverviewError(tRef.current("institutions.forbidden"));
        else if (status === 404) setOverviewError(tRef.current("institutions.notFound"));
        else setOverviewError(passiveSectionMessage(e, tRef.current));
      } finally {
        if (!controller.signal.aborted) {
          setOverviewLoading(false);
          setOverviewRefreshing(false);
        }
      }
    },
    [institutionId, applyInstitution],
  );

  const loadMembers = useCallback(
    async ({ soft = false } = {}) => {
      if (!institutionId) return;
      if (membersAbortRef.current) membersAbortRef.current.abort();
      const controller = new AbortController();
      membersAbortRef.current = controller;
      if (soft) setMembersRefreshing(true);
      else setMembersLoading(true);
      setMembersError(null);
      try {
        const memRes = await adminListInstitutionMembersRequest(
          institutionId,
          {
            page,
            limit: 20,
            q: debouncedMemberQ || undefined,
            status: memberStatusFilter || undefined,
          },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setMembers(memRes?.data?.members || []);
        setPagination(memRes?.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
        lastFetchedMembersPageRef.current = page;
      } catch (e) {
        if (isAxiosCanceledError(e) || controller.signal.aborted) return;
        setMembersError(passiveSectionMessage(e, tRef.current));
      } finally {
        if (!controller.signal.aborted) {
          setMembersLoading(false);
          setMembersRefreshing(false);
        }
      }
    },
    [institutionId, page, debouncedMemberQ, memberStatusFilter],
  );

  const loadOrders = useCallback(
    async ({ soft = false } = {}) => {
      if (!institutionId) return;
      if (soft) setOrdersRefreshing(true);
      else setOrdersLoading(true);
      setOrdersError(null);
      try {
        const res = await adminListInstitutionOrdersRequest(institutionId, {
          page: ordersPage,
          limit: 20,
          q: debouncedOrdersQ || undefined,
          workType: ordersWorkTypeFilter || undefined,
        });
        const items = res?.data?.items || res?.data?.orders || [];
        setInstitutionOrders(Array.isArray(items) ? items : []);
        setOrdersPagination(res?.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
        ordersLoadedRef.current = true;
      } catch (e) {
        setOrdersError(passiveSectionMessage(e, tRef.current));
      } finally {
        setOrdersLoading(false);
        setOrdersRefreshing(false);
      }
    },
    [institutionId, ordersPage, debouncedOrdersQ, ordersWorkTypeFilter],
  );

  const loadStorages = useCallback(
    async ({ soft = false } = {}) => {
      if (!institutionId) return;
      if (storagesAbortRef.current) storagesAbortRef.current.abort();
      const controller = new AbortController();
      storagesAbortRef.current = controller;
      if (soft) setStoragesRefreshing(true);
      else setStoragesLoading(true);
      setStoragesError(null);
      try {
        const storRes = await adminListInstitutionStoragesRequest(
          institutionId,
          { page: storagePage, limit: 20 },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setStorages(storRes?.data?.storages || []);
        setStoragePagination(storRes?.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
        lastFetchedStoragesPageRef.current = storagePage;
      } catch (e) {
        if (isAxiosCanceledError(e) || controller.signal.aborted) return;
        setStoragesError(passiveSectionMessage(e, tRef.current));
      } finally {
        if (!controller.signal.aborted) {
          setStoragesLoading(false);
          setStoragesRefreshing(false);
        }
      }
    },
    [institutionId, storagePage],
  );

  // Institution change: one bundled GET (page 1 / storages page 1). No parallel trio.
  useEffect(() => {
    if (!institutionId) return undefined;
    lastFetchedMembersPageRef.current = null;
    lastFetchedStoragesPageRef.current = null;
    setPage(1);
    setStoragePage(1);
    setInstitution(null);
    setMembers([]);
    setStorages([]);
    ordersLoadedRef.current = false;
    setInstitutionOrders([]);
    setOrdersPage(1);
    setOverviewError(null);
    setMembersError(null);
    setStoragesError(null);
    setOverviewStatus(null);
    void loadInitialBundle({ soft: false, membersPage: 1, storagesPage: 1 });
    return () => {
      loadGenRef.current += 1;
      if (overviewAbortRef.current) overviewAbortRef.current.abort();
    };
  }, [institutionId, loadInitialBundle]);

  // Members pagination / filters after bundle (skip when page already loaded by bundle without filters).
  useEffect(() => {
    if (!institutionId) return undefined;
    if (lastFetchedMembersPageRef.current === null) return undefined;
    if (
      lastFetchedMembersPageRef.current === page &&
      !debouncedMemberQ &&
      !memberStatusFilter
    ) {
      return undefined;
    }
    void loadMembers({ soft: true });
    return () => {
      if (membersAbortRef.current) membersAbortRef.current.abort();
    };
  }, [institutionId, page, debouncedMemberQ, memberStatusFilter, loadMembers]);

  useEffect(() => {
    if (!institutionId || activeTab !== "orders") return undefined;
    void loadOrders({ soft: ordersLoadedRef.current });
  }, [institutionId, activeTab, ordersPage, loadOrders]);

  // Storages pagination after bundle.
  useEffect(() => {
    if (!institutionId) return undefined;
    if (lastFetchedStoragesPageRef.current === null) return undefined;
    if (lastFetchedStoragesPageRef.current === storagePage) return undefined;
    void loadStorages({ soft: true });
    return () => {
      if (storagesAbortRef.current) storagesAbortRef.current.abort();
    };
  }, [institutionId, storagePage, loadStorages]);

  const activeMemberIds = useMemo(
    () => new Set(members.filter((m) => m.status === "active").map((m) => String(m.userId))),
    [members],
  );

  const addMember = async (user) => {
    if (!user?.id || addingUserId) return;
    if (activeMemberIds.has(String(user.id))) return;
    setAddingUserId(user.id);
    try {
      const res = await adminAddInstitutionMemberRequest(institutionId, { userId: user.id });
      const reactivated = Boolean(res?.data?.reactivated);
      push({
        type: "success",
        message: reactivated
          ? t("institutions.memberReactivated")
          : t("institutions.memberAdded"),
      });
      setAddMemberOpen(false);
      setStatistics((prev) => ({
        ...prev,
        usersCount: Number(prev.usersCount || 0) + 1,
      }));
      await Promise.all([loadOverview({ soft: true }), loadMembers({ soft: true })]);
    } catch (e) {
      const code = e?.response?.data?.code;
      const msg =
        code === "DUPLICATE_MEMBERSHIP"
          ? t("institutions.memberAlreadyActive")
          : actionErrorMessage(e, t, "institutions.actionAddMemberError");
      if (msg) push({ type: "error", message: msg });
    } finally {
      setAddingUserId(null);
    }
  };

  const patchMember = async (member, patch) => {
    if (!member?.userId || updatingMemberId) return;
    setUpdatingMemberId(member.userId);
    try {
      await adminUpdateInstitutionMemberRequest(institutionId, member.userId, patch);
      push({ type: "success", message: t("institutions.updated") });
      await Promise.all([loadOverview({ soft: true }), loadMembers({ soft: true })]);
    } catch (e) {
      const msg = actionErrorMessage(e, t, "institutions.actionSaveError");
      if (msg) push({ type: "error", message: msg });
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget || removing) return;
    setRemoving(true);
    try {
      await adminRemoveInstitutionMemberRequest(institutionId, removeTarget.userId);
      push({ type: "success", message: t("institutions.memberRemoved") });
      setRemoveTarget(null);
      await Promise.all([loadOverview({ soft: true }), loadMembers({ soft: true })]);
    } catch (e) {
      const msg = actionErrorMessage(e, t, "institutions.actionRemoveMemberError");
      if (msg) push({ type: "error", message: msg });
    } finally {
      setRemoving(false);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (savingEdit) return;
    const name = editForm.name.trim();
    if (name.length < 2) {
      setEditError(t("institutions.validationNameShort"));
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await adminPatchInstitutionRequest(institutionId, {
        name,
        description: editForm.description.trim() || null,
        slug: editForm.slug.trim() || null,
        status: editForm.status === "inactive" ? "inactive" : "active",
      });
      setInstitution(res?.data?.institution || null);
      push({ type: "success", message: t("institutions.updated") });
      await loadOverview({ soft: true });
    } catch (err) {
      const code = err?.response?.data?.code;
      const msg =
        code === "DUPLICATE_INSTITUTION_NAME"
          ? t("institutions.duplicateName")
          : actionErrorMessage(err, t, "institutions.actionSaveError");
      setEditError(msg);
      if (msg) push({ type: "error", message: msg });
    } finally {
      setSavingEdit(false);
    }
  };

  const openDeactivate = async () => {
    setDeactivateOpen(true);
    setImpactLoading(true);
    setImpact(null);
    try {
      const res = await adminGetInstitutionDeactivationImpactRequest(institutionId);
      setImpact(res?.data?.impact || null);
    } catch (e) {
      const msg = actionErrorMessage(e, t, "institutions.actionDeactivateError");
      if (msg) push({ type: "error", message: msg });
      setDeactivateOpen(false);
    } finally {
      setImpactLoading(false);
    }
  };

  const confirmDeactivate = async () => {
    if (statusBusy) return;
    setStatusBusy(true);
    try {
      const res = await adminPatchInstitutionRequest(institutionId, { status: "inactive" });
      setInstitution(res?.data?.institution || null);
      setDeactivateOpen(false);
      push({ type: "success", message: t("institutions.deactivated") });
      await loadOverview({ soft: true });
    } catch (e) {
      const msg = actionErrorMessage(e, t, "institutions.actionDeactivateError");
      if (msg) push({ type: "error", message: msg });
    } finally {
      setStatusBusy(false);
    }
  };

  const confirmActivate = async () => {
    if (statusBusy) return;
    setStatusBusy(true);
    try {
      const res = await adminPatchInstitutionRequest(institutionId, { status: "active" });
      setInstitution(res?.data?.institution || null);
      setActivateOpen(false);
      push({ type: "success", message: t("institutions.activated") });
      await loadOverview({ soft: true });
    } catch (e) {
      const msg = actionErrorMessage(e, t, "institutions.actionActivateError");
      if (msg) push({ type: "error", message: msg });
    } finally {
      setStatusBusy(false);
    }
  };

  const confirmFreeze = async () => {
    if (statusBusy || !isSuperAdmin) return;
    setStatusBusy(true);
    try {
      const res = await adminFreezeInstitutionRequest(institutionId);
      const inst = res?.data?.institution || null;
      if (inst) applyInstitution(inst);
      const stats = res?.data?.statistics;
      if (stats) {
        setStatistics({
          ordersCount: Number(stats.ordersCount || 0),
          usersCount: Number(stats.usersCount || 0),
          ordersTotalAmount: Number(stats.ordersTotalAmount || 0),
        });
        setStatsError(null);
      }
      setFreezeOpen(false);
      push({ type: "success", message: t("institutions.frozenSuccess") });
    } catch (e) {
      const msg = actionErrorMessage(e, t, "institutions.actionFreezeError");
      if (msg) push({ type: "error", message: msg });
    } finally {
      setStatusBusy(false);
    }
  };

  const confirmUnfreeze = async () => {
    if (statusBusy || !isSuperAdmin) return;
    setStatusBusy(true);
    try {
      const res = await adminUnfreezeInstitutionRequest(institutionId);
      const inst = res?.data?.institution || null;
      if (inst) applyInstitution(inst);
      const stats = res?.data?.statistics;
      if (stats) {
        setStatistics({
          ordersCount: Number(stats.ordersCount || 0),
          usersCount: Number(stats.usersCount || 0),
          ordersTotalAmount: Number(stats.ordersTotalAmount || 0),
        });
        setStatsError(null);
      }
      setUnfreezeOpen(false);
      push({ type: "success", message: t("institutions.unfrozenSuccess") });
    } catch (e) {
      const msg = actionErrorMessage(e, t, "institutions.actionUnfreezeError");
      if (msg) push({ type: "error", message: msg });
    } finally {
      setStatusBusy(false);
    }
  };

  const isFrozen = institution?.status === "frozen";
  const isActive = institution?.status === "active";

  useEffect(() => {
    if (searchParams.get("addMember") !== "1" || !institution || isFrozen) return;
    setAddMemberOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("addMember");
      return next;
    });
  }, [searchParams, institution, isFrozen, setSearchParams]);

  const deactivateBody = impactLoading ? (
    t("institutions.loadingImpact")
  ) : !impact ? (
    t("institutions.confirmDeactivateBody")
  ) : (
    <div style={{ display: "grid", gap: 8 }}>
      <p style={{ margin: 0 }}>{t("institutions.confirmDeactivateBody")}</p>
      <ul style={{ margin: 0, paddingInlineStart: "1.25rem" }}>
        <li>{t("institutions.impactActiveMembers", { count: impact.activeMemberCount ?? 0 })}</li>
        <li>{t("institutions.impactLinkedStorages", { count: impact.linkedStorageCount ?? 0 })}</li>
        <li>{t("institutions.impactActiveStorages", { count: impact.activeStorageCount ?? 0 })}</li>
        <li>{t("institutions.impactFutureReleases")}</li>
      </ul>
      {(impact.activeStoragesWithNoOtherActiveInstitution || 0) > 0 ? (
        <p style={{ margin: 0, fontWeight: 700 }} role="alert">
          {t("institutions.impactCriticalSoleInstitution", {
            count: impact.activeStoragesWithNoOtherActiveInstitution,
          })}
        </p>
      ) : null}
    </div>
  );

  if (overviewLoading && !institution) {
    return (
      <DashboardShell>
        <DashboardLoadingState label={t("institutions.loading")} />
      </DashboardShell>
    );
  }

  if ((overviewStatus === 403 || overviewStatus === 404) && !institution) {
    return (
      <DashboardShell>
        <DashboardSection title={t("institutions.title")}>
          <p role="alert">{overviewError}</p>
          <Link to={LIST_PATH} className="btn btn-secondary">
            {t("institutions.backToList")}
          </Link>
        </DashboardSection>
      </DashboardShell>
    );
  }

  if (overviewError && !institution) {
    return (
      <DashboardShell>
        <DashboardSection title={t("institutions.title")}>
          <SectionInlineError
            message={overviewError}
            onRetry={() => void loadInitialBundle({ soft: false, membersPage: 1, storagesPage: 1 })}
            retryLabel={t("institutions.retry")}
          />
        </DashboardSection>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={institution?.name || t("institutions.title")}
        description={
          institution?.description?.trim()
            ? institution.description
            : t("institutions.detailDescription")
        }
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.institutions")}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span
              className={`inline-flex min-h-[1.75rem] items-center justify-center rounded-md border px-2 text-[0.78rem] font-semibold ${statusBadgeClass(
                institution?.status,
              )}`}
            >
              {statusLabel(institution?.status, t)}
            </span>
            <Link to={LIST_PATH} className="btn btn-secondary">
              {t("institutions.backToList")}
            </Link>
            {!isFrozen ? (
              <button
                ref={addMemberBtnRef}
                type="button"
                className="btn btn-primary inline-flex items-center gap-1.5"
                onClick={() => setAddMemberOpen(true)}
              >
                <UserPlus size={16} strokeWidth={1.75} aria-hidden />
                {t("institutions.addMember")}
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary" onClick={() => setActiveTab("settings")}>
              {t("institutions.edit")}
            </button>
            {isSuperAdmin && isActive ? (
              <button
                type="button"
                className="btn btn-danger"
                disabled={statusBusy}
                onClick={() => setFreezeOpen(true)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Snowflake size={16} aria-hidden />
                  {t("institutions.freeze")}
                </span>
              </button>
            ) : null}
            {isSuperAdmin && isFrozen ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={statusBusy}
                onClick={() => setUnfreezeOpen(true)}
              >
                {t("institutions.unfreeze")}
              </button>
            ) : null}
          </div>
        }
      />

      <DashboardSection title={t("institutions.statsTitle")}>
        {statsLoading ? (
          <p className="m-0 text-sm text-slate-500">{t("institutions.statsLoading")}</p>
        ) : statsError ? (
          <SectionInlineError
            message={statsError}
            onRetry={() => void loadInitialBundle({ soft: true, membersPage: page, storagesPage: storagePage })}
            retryLabel={t("institutions.retry")}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                key: "orders",
                label: t("institutions.statsOrdersCount"),
                value: statistics.ordersCount,
                money: false,
                icon: ClipboardList,
              },
              {
                key: "users",
                label: t("institutions.statsUsersCount"),
                value: statistics.usersCount,
                money: false,
                icon: Users,
              },
              {
                key: "amount",
                label: t("institutions.statsOrdersTotalAmount"),
                value: statistics.ordersTotalAmount,
                money: true,
                icon: Coins,
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.key} className="dash-ui-form-card flex min-w-0 items-start gap-3 p-3.5">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                    <Icon size={18} strokeWidth={1.75} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 text-[0.72rem] font-bold leading-snug text-slate-500">{card.label}</p>
                    <p className="m-0 mt-1 text-lg font-black tabular-nums text-slate-900 break-words">
                      {card.money ? <JodMoneyValue amount={card.value} locale={locale} /> : card.value}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </DashboardSection>

      <DashboardSection>
        <DashboardTabs aria-label={t("institutions.workspaceTabsAria")} className="oh-institution-workspace-tabs mb-3">
          {workspaceTabs.map((tab) => (
            <DashboardTab key={tab.id} selected={activeTab === tab.id} onSelect={() => setActiveTab(tab.id)}>
              {tab.label}
            </DashboardTab>
          ))}
        </DashboardTabs>

        {activeTab === "members" ? (
          <DashboardSection
            title={t("institutions.membersList")}
            description={
              !membersLoading
                ? t("institutions.membersCount", {
                    count: Number(pagination.total) || members.length || 0,
                  })
                : undefined
            }
            actions={
              !isFrozen ? (
                <button
                  type="button"
                  className="btn btn-primary inline-flex items-center gap-1.5"
                  onClick={() => setAddMemberOpen(true)}
                >
                  <UserPlus size={16} strokeWidth={1.75} aria-hidden />
                  {t("institutions.addMember")}
                </button>
              ) : null
            }
          >
            <div
              className="dash-ui-toolbar mb-3"
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                alignItems: "end",
              }}
            >
              <label className="dash-ui-stack" style={{ display: "grid", gap: 6 }}>
                <span>{t("institutions.search")}</span>
                <input
                  className="input"
                  type="search"
                  value={memberSearchInput}
                  onChange={(e) => setMemberSearchInput(e.target.value)}
                  placeholder={t("institutions.memberSearchPlaceholder")}
                />
              </label>
              <label className="dash-ui-stack" style={{ display: "grid", gap: 6 }}>
                <span>{t("institutions.memberStatus")}</span>
                <select
                  className="input"
                  value={memberStatusFilter}
                  onChange={(e) => setMemberStatusFilter(e.target.value)}
                >
                  <option value="">{t("institutions.statusAll")}</option>
                  <option value="active">{t("institutions.memberActive")}</option>
                  <option value="inactive">{t("institutions.memberInactive")}</option>
                </select>
              </label>
            </div>
            {membersRefreshing ? (
              <p className="mb-2 mt-0 text-sm text-slate-500">{t("institutions.refreshing")}</p>
            ) : null}
            {membersLoading && members.length === 0 ? (
              <DashboardLoadingState label={t("institutions.loading")} />
            ) : membersError && members.length === 0 ? (
              <SectionInlineError
                message={membersError}
                onRetry={() => void loadMembers()}
                retryLabel={t("institutions.retry")}
              />
            ) : members.length === 0 ? (
              <DashboardEmptyState
                title={t("institutions.membersEmpty")}
                icon={<Building2 size={40} strokeWidth={1.5} aria-hidden />}
              />
            ) : (
              <>
                {membersError ? (
                  <div className="mb-3">
                    <SectionInlineError
                      message={membersError}
                      onRetry={() => void loadMembers({ soft: true })}
                      retryLabel={t("institutions.retry")}
                    />
                  </div>
                ) : null}
                <DashboardTable caption={t("institutions.membersList")}>
                  <thead>
                    <tr>
                      <th>{t("institutions.userName")}</th>
                      <th>{t("institutions.userId")}</th>
                      <th>{t("institutions.email")}</th>
                      <th>{t("institutions.phone")}</th>
                      <th>{t("institutions.platformRole")}</th>
                      <th>{t("institutions.memberRole")}</th>
                      <th>{t("institutions.memberStatus")}</th>
                      <th>{t("institutions.memberSince")}</th>
                      <th>{t("institutions.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td className="max-w-[12rem] break-words">{m.fullName || "—"}</td>
                        <td dir="ltr" className="tabular-nums">
                          {m.accountId || "—"}
                        </td>
                        <td className="max-w-[14rem] break-words">{m.email || "—"}</td>
                        <td dir="ltr">{m.phone || "—"}</td>
                        <td>{platformRoleLabel(m.userRole, t)}</td>
                        <td>
                          {/* manager is membership classification only — no separate permissions UX yet. */}
                          {!isFrozen ? (
                            <select
                              className="input"
                              style={{ minWidth: "7rem" }}
                              value={m.memberRole === "manager" ? "manager" : "member"}
                              disabled={updatingMemberId === m.userId}
                              onChange={(e) =>
                                void patchMember(m, {
                                  memberRole: e.target.value === "manager" ? "manager" : "member",
                                })
                              }
                            >
                              <option value="member">{t("institutions.roleMember")}</option>
                              <option value="manager">{t("institutions.roleManager")}</option>
                            </select>
                          ) : (
                            memberRoleLabel(m.memberRole, t)
                          )}
                        </td>
                        <td>{memberStatusLabel(m.status, t)}</td>
                        <td>{formatDate(m.createdAt)}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {!isFrozen && m.status === "active" ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={updatingMemberId === m.userId}
                                  onClick={() => void patchMember(m, { status: "inactive" })}
                                >
                                  {t("institutions.memberInactive")}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={() => setRemoveTarget(m)}
                                >
                                  <UserMinus size={16} aria-hidden /> {t("institutions.removeMember")}
                                </button>
                              </>
                            ) : null}
                            {!isFrozen && m.status === "inactive" ? (
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={updatingMemberId === m.userId}
                                onClick={() => void patchMember(m, { status: "active" })}
                              >
                                {t("institutions.memberActive")}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DashboardTable>
                {(pagination.totalPages || 1) > 1 ? (
                  <div style={{ marginTop: 12 }}>
                    <Pagination
                      currentPage={page}
                      totalPages={pagination.totalPages || 1}
                      onPageChange={setPage}
                      isLoading={membersLoading || membersRefreshing}
                    />
                  </div>
                ) : null}
              </>
            )}
          </DashboardSection>
        ) : null}

        {activeTab === "orders" ? (
          <DashboardSection
            title={t("institutions.ordersSection.title")}
            description={t("institutions.ordersSection.description")}
            actions={
              <button
                ref={createWorkBtnRef}
                type="button"
                className="btn btn-primary"
                onClick={() => setCreateWorkOpen(true)}
              >
                {t("institutions.ordersSection.addWork")}
              </button>
            }
          >
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">{t("institutions.search")}</span>
                <input
                  type="search"
                  className="form-control min-w-[12rem]"
                  value={ordersSearchInput}
                  onChange={(e) => setOrdersSearchInput(e.target.value)}
                  placeholder={t("institutions.ordersSection.searchPlaceholder")}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">{t("institutions.ordersSection.workType")}</span>
                <select
                  className="form-control"
                  value={ordersWorkTypeFilter}
                  onChange={(e) => setOrdersWorkTypeFilter(e.target.value)}
                >
                  <option value="">{t("institutions.statusAll")}</option>
                  <option value="order">{t("institutions.ordersSection.workTypeOrder")}</option>
                  <option value="article">{t("institutions.ordersSection.workTypeArticle")}</option>
                </select>
              </label>
            </div>
            {ordersRefreshing ? (
              <p className="mb-2 mt-0 text-sm text-slate-500">{t("institutions.refreshing")}</p>
            ) : null}
            {ordersLoading && institutionOrders.length === 0 ? (
              <DashboardLoadingState label={t("institutions.loading")} />
            ) : ordersError && institutionOrders.length === 0 ? (
              <SectionInlineError
                message={ordersError}
                onRetry={() => void loadOrders()}
                retryLabel={t("institutions.retry")}
              />
            ) : institutionOrders.length === 0 ? (
              <DashboardEmptyState title={t("institutions.ordersSection.empty")} />
            ) : (
              <>
                <DashboardTable caption={t("institutions.ordersSection.tableCaption")}>
                  <thead>
                    <tr>
                      <th>{t("institutions.ordersSection.colTitleCode")}</th>
                      <th>{t("institutions.ordersSection.colType")}</th>
                      <th>{t("institutions.ordersSection.colStatus")}</th>
                      <th>{t("institutions.ordersSection.colPublication")}</th>
                      <th>{t("institutions.ordersSection.colApplicants")}</th>
                      <th>{t("institutions.ordersSection.colFreelancer")}</th>
                      <th>{t("institutions.ordersSection.colSource")}</th>
                      <th>{t("institutions.createdAt")}</th>
                      <th>{t("institutions.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {institutionOrders.map((item) => {
                      const wt = item.workType || "order";
                      const workKey = `${wt}-${item.id}`;
                      const pub = item.publicationStatus || (item.isPublished ? "published" : "draft");
                      return (
                        <tr key={workKey}>
                          <td className="max-w-[14rem] break-words">
                            {item.title || item.code || item.orderCode || `#${item.id}`}
                          </td>
                          <td>
                            <span
                              className={[
                                "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                                wt === "article"
                                  ? "border-violet-200 bg-violet-50 text-violet-900"
                                  : "border-sky-200 bg-sky-50 text-sky-900",
                              ].join(" ")}
                            >
                              {wt === "article"
                                ? t("institutions.ordersSection.workTypeArticle")
                                : t("institutions.ordersSection.workTypeOrder")}
                            </span>
                          </td>
                          <td>{item.status || "—"}</td>
                          <td>
                            <span
                              className={[
                                "inline-flex rounded-full border px-2 py-0.5 text-xs",
                                pub === "published"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                  : "border-amber-200 bg-amber-50 text-amber-900",
                              ].join(" ")}
                            >
                              {pub === "published"
                                ? t("institutions.ordersSection.published")
                                : t("institutions.ordersSection.draft")}
                            </span>
                          </td>
                          <td>
                            <bdi dir="ltr" className="oh-num">
                              {Number(item.applicantCount ?? 0)}
                            </bdi>
                          </td>
                          <td className="max-w-[12rem] break-words">{item.assignedFreelancerName || "—"}</td>
                          <td>
                            {item.sourceLabel ||
                              (item.source === "storage"
                                ? t("institutions.ordersSection.sourceStorage")
                                : t("institutions.ordersSection.sourceDirect"))}
                          </td>
                          <td>{formatDate(item.createdAt)}</td>
                          <td>
                            <Link
                              to={`${WORK_DETAIL_BASE(institutionId)}/${wt}/${item.id}`}
                              className="btn btn-secondary"
                            >
                              {t("institutions.manage")}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DashboardTable>
                {(ordersPagination.totalPages || 1) > 1 ? (
                  <div style={{ marginTop: 12 }}>
                    <Pagination
                      currentPage={ordersPage}
                      totalPages={ordersPagination.totalPages || 1}
                      onPageChange={setOrdersPage}
                      isLoading={ordersLoading || ordersRefreshing}
                    />
                  </div>
                ) : null}
              </>
            )}
          </DashboardSection>
        ) : null}

        {activeTab === "settings" ? (
          <>
            {overviewRefreshing ? (
              <p className="mb-2 mt-0 text-sm text-slate-500">{t("institutions.refreshing")}</p>
            ) : null}
            {overviewError && institution ? (
              <div className="mb-3">
                <SectionInlineError
                  message={overviewError}
                  onRetry={() => void loadOverview({ soft: true })}
                  retryLabel={t("institutions.retry")}
                />
              </div>
            ) : null}
            <DashboardSection
              title={t("institutions.edit")}
              actions={
                <div className="flex flex-wrap gap-2">
                  {isActive ? (
                    <button type="button" className="btn btn-danger" onClick={() => void openDeactivate()}>
                      {t("institutions.deactivate")}
                    </button>
                  ) : null}
                  {institution?.status === "inactive" ? (
                    <button type="button" className="btn btn-primary" onClick={() => setActivateOpen(true)}>
                      {t("institutions.activate")}
                    </button>
                  ) : null}
                </div>
              }
            >
              {!isFrozen ? (
                <form className="dash-ui-form-card" onSubmit={saveEdit} style={{ display: "grid", gap: 12, maxWidth: 640 }}>
                  <label className="dash-ui-stack" style={{ display: "grid", gap: 6 }}>
                    <span>{t("institutions.name")} *</span>
                    <input
                      id="institution-edit-name"
                      className="input"
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      required
                      maxLength={200}
                      disabled={savingEdit}
                      aria-invalid={Boolean(editError)}
                      aria-describedby={editError ? "institution-edit-error" : undefined}
                    />
                  </label>
                  <label className="dash-ui-stack" style={{ display: "grid", gap: 6 }}>
                    <span>{t("institutions.descriptionLabel")}</span>
                    <textarea
                      className="input"
                      rows={3}
                      value={editForm.description}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                      disabled={savingEdit}
                    />
                  </label>
                  <label className="dash-ui-stack" style={{ display: "grid", gap: 6 }}>
                    <span>{t("institutions.status")}</span>
                    <select
                      className="input"
                      value={editForm.status}
                      onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                      disabled={savingEdit}
                    >
                      <option value="active">{t("institutions.active")}</option>
                      <option value="inactive">{t("institutions.inactive")}</option>
                    </select>
                  </label>
                  {editError ? (
                    <p id="institution-edit-error" role="alert">
                      {editError}
                    </p>
                  ) : null}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                      {savingEdit ? t("institutions.saving") : t("institutions.save")}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="m-0 text-sm text-slate-600">{t("institutions.frozen")}</p>
              )}
              <dl className="m-0 mt-4 grid gap-3 sm:grid-cols-2">
                <div className="dash-ui-form-card min-w-0 p-3">
                  <dt className="m-0 text-[0.72rem] font-bold text-slate-500">{t("institutions.slug")}</dt>
                  <dd className="m-0 mt-1 break-all font-medium">{institution?.slug || "—"}</dd>
                </div>
                <div className="dash-ui-form-card min-w-0 p-3">
                  <dt className="m-0 text-[0.72rem] font-bold text-slate-500">{t("institutions.institutionIdLabel")}</dt>
                  <dd className="m-0 mt-1 tabular-nums" dir="ltr">
                    {institution?.id}
                  </dd>
                </div>
                <div className="dash-ui-form-card min-w-0 p-3">
                  <dt className="m-0 text-[0.72rem] font-bold text-slate-500">{t("institutions.createdAt")}</dt>
                  <dd className="m-0 mt-1">{formatDate(institution?.createdAt)}</dd>
                </div>
                <div className="dash-ui-form-card min-w-0 p-3">
                  <dt className="m-0 text-[0.72rem] font-bold text-slate-500">{t("institutions.createdBy")}</dt>
                  <dd className="m-0 mt-1 break-words">
                    {institution?.createdByName || institution?.createdBy || "—"}
                  </dd>
                </div>
              </dl>
            </DashboardSection>

            <DashboardSection title={t("institutions.linkedStoragesSection")}>
        {storagesRefreshing ? (
          <p className="mb-2 mt-0 text-sm text-slate-500">{t("institutions.refreshing")}</p>
        ) : null}
        {storagesLoading && storages.length === 0 ? (
          <DashboardLoadingState label={t("institutions.loading")} />
        ) : storagesError && storages.length === 0 ? (
          <SectionInlineError
            message={storagesError}
            onRetry={() => void loadStorages()}
            retryLabel={t("institutions.retry")}
          />
        ) : storages.length === 0 ? (
          <DashboardEmptyState title={t("institutions.linkedStoragesEmpty")} />
        ) : (
          <>
            {storagesError ? (
              <div className="mb-3">
                <SectionInlineError
                  message={storagesError}
                  onRetry={() => void loadStorages({ soft: true })}
                  retryLabel={t("institutions.retry")}
                />
              </div>
            ) : null}
            <DashboardTable caption={t("institutions.linkedStoragesSection")}>
              <thead>
                <tr>
                  <th>{t("institutions.storageName")}</th>
                  <th>{t("institutions.storageStatus")}</th>
                  <th>{t("dashboard.institutionalOrderStorage.financialLimit")}</th>
                  <th>{t("dashboard.institutionalOrderStorage.remaining")}</th>
                  <th>{t("institutions.approvedReleasedCounts")}</th>
                  <th>{t("dashboard.institutionalOrderStorage.startDate")}</th>
                  <th>{t("institutions.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {storages.map((s) => (
                  <tr key={s.id}>
                    <td className="max-w-[14rem] break-words">{s.name}</td>
                    <td>{storageStatusLabel(s.status, t)}</td>
                    <td>
                      <JodMoneyValue amount={s.financialLimitJod} locale={locale} />
                    </td>
                    <td>
                      <JodMoneyValue amount={s.remainingJod} locale={locale} />
                    </td>
                    <td>
                      {s.approvedOrderCount} / {s.releasedCount}
                    </td>
                    <td>{s.distributionStartDate || "—"}</td>
                    <td>
                      <Link to={`${STORAGE_BASE}/${s.id}`} className="btn btn-secondary">
                        {t("institutions.openStorage")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DashboardTable>
            {(storagePagination.totalPages || 1) > 1 ? (
              <div style={{ marginTop: 12 }}>
                <Pagination
                  currentPage={storagePage}
                  totalPages={storagePagination.totalPages || 1}
                  onPageChange={setStoragePage}
                  isLoading={storagesLoading || storagesRefreshing}
                />
              </div>
            ) : null}
          </>
        )}
            </DashboardSection>
          </>
        ) : null}
      </DashboardSection>

      <InstitutionAddMemberModal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        onAddMember={addMember}
        addingUserId={addingUserId}
        existingActiveMemberIds={activeMemberIds}
        triggerRef={addMemberBtnRef}
      />

      <InstitutionCreateWorkModal
        open={createWorkOpen}
        institutionId={institutionId}
        institutionName={institution?.name || ""}
        onClose={() => setCreateWorkOpen(false)}
        onSuccess={() => void loadOrders({ soft: true })}
        triggerRef={createWorkBtnRef}
      />

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={t("institutions.confirmRemoveTitle")}
        body={t("institutions.confirmRemoveBody", {
          name: removeTarget?.fullName || removeTarget?.email || removeTarget?.userId,
        })}
        confirmLabel={t("institutions.removeMember")}
        cancelLabel={t("institutions.cancel")}
        confirmVariant="danger"
        confirmBusy={removing}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void confirmRemove()}
      />

      <ConfirmDialog
        open={deactivateOpen}
        title={t("institutions.confirmDeactivateTitle")}
        body={deactivateBody}
        panelClassName="max-w-[560px]"
        confirmLabel={t("institutions.deactivate")}
        cancelLabel={t("institutions.cancel")}
        confirmVariant="danger"
        confirmBusy={statusBusy || impactLoading}
        onCancel={() => setDeactivateOpen(false)}
        onConfirm={() => void confirmDeactivate()}
      />

      <ConfirmDialog
        open={activateOpen}
        title={t("institutions.confirmActivateTitle")}
        body={t("institutions.confirmActivateBody")}
        confirmLabel={t("institutions.activate")}
        cancelLabel={t("institutions.cancel")}
        confirmBusy={statusBusy}
        onCancel={() => setActivateOpen(false)}
        onConfirm={() => void confirmActivate()}
      />

      <ConfirmDialog
        open={freezeOpen}
        title={t("institutions.confirmFreezeTitle")}
        body={t("institutions.confirmFreezeBody")}
        panelClassName="max-w-[560px]"
        confirmLabel={t("institutions.freeze")}
        cancelLabel={t("institutions.cancel")}
        confirmVariant="danger"
        confirmBusy={statusBusy}
        onCancel={() => setFreezeOpen(false)}
        onConfirm={() => void confirmFreeze()}
      />

      <ConfirmDialog
        open={unfreezeOpen}
        title={t("institutions.confirmUnfreezeTitle")}
        body={t("institutions.confirmUnfreezeBody")}
        confirmLabel={t("institutions.unfreeze")}
        cancelLabel={t("institutions.cancel")}
        confirmBusy={statusBusy}
        onCancel={() => setUnfreezeOpen(false)}
        onConfirm={() => void confirmUnfreeze()}
      />
    </DashboardShell>
  );
}
