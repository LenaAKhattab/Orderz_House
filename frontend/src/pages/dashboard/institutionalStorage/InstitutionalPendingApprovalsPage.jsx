import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import DashboardPageHeader from "../../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import DashboardTable from "../../../components/dashboard/DashboardTable";
import ConfirmDialog from "../../../components/dashboard/ConfirmDialog";
import Pagination from "../../../components/common/Pagination";
import { superAdminBreadcrumbs } from "../../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { useToast } from "../../../components/ui/toastContext";
import {
  adminApproveInstitutionalOrderRequest,
  adminArchiveInstitutionalOrderRequest,
  adminDeleteInstitutionalOrderRequest,
  adminListInstitutionalPendingApprovalsRequest,
  adminListInstitutionalStoragesRequest,
  adminListInstitutionsRequest,
  adminTransferInstitutionalOrderRequest,
} from "../../../services/api";
import { getSafeApiErrorMessage, isAxiosTimeoutError } from "../../../utils/apiErrorMessage";

const BASE = "/dashboard/super-admin/institutional-order-storage";
const PAGE_SIZE_OPTIONS = [10, 20, 50];

function formatMoney(value, t) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t("dashboard.institutionalOrderStorage.currencyJod")}`;
}

function formatDateTime(value, locale) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(locale === "en" ? "en-GB" : "ar-JO");
  } catch {
    return String(value);
  }
}

function lifecycleLabel(status, t) {
  const key = `dashboard.institutionalOrderStorage.lifecycle_${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

function mapActionError(err, t) {
  const code = err?.response?.data?.code || err?.response?.data?.publicCode;
  if (code === "FINANCIAL_LIMIT_EXCEEDED") {
    return t("dashboard.institutionalOrderStorage.financialLimitExceeded");
  }
  if (isAxiosTimeoutError(err)) return t("dashboard.institutionalOrderStorage.timeoutError");
  return getSafeApiErrorMessage(err);
}

export default function InstitutionalPendingApprovalsPage() {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const abortRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [storageFilter, setStorageFilter] = useState("");
  const [institutionFilter, setInstitutionFilter] = useState("");
  const [storages, setStorages] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [actingId, setActingId] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, storageFilter, institutionFilter, limit]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sRes, iRes] = await Promise.all([
          adminListInstitutionalStoragesRequest({ limit: 100 }),
          adminListInstitutionsRequest({ status: "active", limit: 100 }),
        ]);
        if (!cancelled) {
          setStorages(sRes?.data?.storages || []);
          setInstitutions(iRes?.data?.institutions || []);
        }
      } catch {
        /* filters optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(
    async ({ soft = false } = {}) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await adminListInstitutionalPendingApprovalsRequest(
          {
            q: debouncedQ || undefined,
            storageId: storageFilter || undefined,
            institutionId: institutionFilter || undefined,
            page,
            limit,
          },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setOrders(res?.data?.orders || []);
        setPagination(res?.data?.pagination || { page: 1, limit, total: 0, totalPages: 1 });
      } catch (e) {
        if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || controller.signal.aborted) return;
        const msg = isAxiosTimeoutError(e)
          ? t("dashboard.institutionalOrderStorage.timeoutError")
          : getSafeApiErrorMessage(e);
        setError(msg);
        if (!soft) push({ type: "error", message: msg });
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [debouncedQ, storageFilter, institutionFilter, page, limit, push, t],
  );

  useEffect(() => {
    void load({ soft: orders.length > 0 });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const resetFilters = () => {
    setSearchInput("");
    setDebouncedQ("");
    setStorageFilter("");
    setInstitutionFilter("");
    setLimit(20);
    setPage(1);
  };

  const hasFilters = Boolean(debouncedQ || storageFilter || institutionFilter || limit !== 20);
  const hasNoPendingAtAll = !hasFilters && pagination.total === 0 && !loading && !error;
  const hasNoFilterResults = hasFilters && orders.length === 0 && !loading && !error;

  const runAction = async (order, action) => {
    if (actingId) return;
    setActingId(order.id);
    try {
      if (action === "approve") await adminApproveInstitutionalOrderRequest(order.id);
      else if (action === "transfer") await adminTransferInstitutionalOrderRequest(order.id);
      else if (action === "archive") await adminArchiveInstitutionalOrderRequest(order.id);
      else if (action === "delete") await adminDeleteInstitutionalOrderRequest(order.id);
      setConfirm(null);
      await load({ soft: true });
    } catch (e) {
      push({ type: "error", message: mapActionError(e, t) });
    } finally {
      setActingId(null);
    }
  };

  const confirmBody = (order, action) => {
    if (action === "approve") {
      return (
        <div className="grid gap-2 text-sm">
          <p className="m-0">{t("dashboard.institutionalOrderStorage.confirmApproveBody")}</p>
          <p className="m-0 font-bold">{t("dashboard.institutionalOrderStorage.approveBudgetPreview")}</p>
          <ul className="m-0 grid list-none gap-1 p-0">
            <li>
              {t("dashboard.institutionalOrderStorage.financialLimit")}:{" "}
              {formatMoney(order.storageFinancialLimitJod, t)}
            </li>
            <li>
              {t("dashboard.institutionalOrderStorage.remaining")}:{" "}
              {formatMoney(order.storageRemainingJod, t)}
            </li>
            <li>
              {t("dashboard.institutionalOrderStorage.price")}: {formatMoney(order.orderPriceJod, t)}
            </li>
            <li>
              {t("dashboard.institutionalOrderStorage.remainingAfterApproval")}:{" "}
              {formatMoney(order.remainingAfterApprovalJod, t)}
            </li>
          </ul>
        </div>
      );
    }
    if (action === "transfer") return t("dashboard.institutionalOrderStorage.confirmTransferBody");
    if (action === "archive") return t("dashboard.institutionalOrderStorage.confirmArchiveBody");
    return t("dashboard.institutionalOrderStorage.confirmDeleteBody");
  };

  const confirmTitle = (action) => {
    if (action === "approve") return t("dashboard.institutionalOrderStorage.confirmApproveTitle");
    if (action === "transfer") return t("dashboard.institutionalOrderStorage.confirmTransferTitle");
    if (action === "archive") return t("dashboard.institutionalOrderStorage.confirmArchiveTitle");
    return t("dashboard.institutionalOrderStorage.confirmDeleteTitle");
  };

  const renderActions = (o) => (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        className="btn btn-primary"
        disabled={Boolean(actingId)}
        onClick={() => setConfirm({ order: o, action: "approve" })}
      >
        {t("dashboard.institutionalOrderStorage.approve")}
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={Boolean(actingId)}
        onClick={() => setConfirm({ order: o, action: "transfer" })}
      >
        {t("dashboard.institutionalOrderStorage.transferTraining")}
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={Boolean(actingId)}
        onClick={() => setConfirm({ order: o, action: "archive" })}
      >
        {t("dashboard.institutionalOrderStorage.archive")}
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={Boolean(actingId) || o.lifecycleStatus === "released"}
        onClick={() => setConfirm({ order: o, action: "delete" })}
        aria-label={t("dashboard.institutionalOrderStorage.delete")}
      >
        {t("dashboard.institutionalOrderStorage.delete")}
      </button>
    </div>
  );

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("dashboard.institutionalOrderStorage.pendingApprovals")}
        description={t("dashboard.institutionalOrderStorage.description")}
        breadcrumbs={superAdminBreadcrumbs("dashboard.nav.superAdmin.institutionalOrderStorage")}
        actions={
          <Link to={BASE} className="btn btn-secondary">
            {t("dashboard.institutionalOrderStorage.backToStorageList")}
          </Link>
        }
      />

      <DashboardSection title={t("dashboard.institutionalOrderStorage.pendingApprovals")}>
        <div
          className="dash-ui-toolbar mb-4 grid gap-3"
          role="search"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", alignItems: "end" }}
        >
          <label className="dash-ui-stack grid gap-1.5">
            <span>{t("dashboard.institutionalOrderStorage.search")}</span>
            <input
              className="input"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("dashboard.institutionalOrderStorage.searchPlaceholder")}
            />
          </label>
          <label className="dash-ui-stack grid gap-1.5">
            <span>{t("dashboard.institutionalOrderStorage.name")}</span>
            <select className="input" value={storageFilter} onChange={(e) => setStorageFilter(e.target.value)}>
              <option value="">{t("dashboard.institutionalOrderStorage.statusAll")}</option>
              {storages.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="dash-ui-stack grid gap-1.5">
            <span>{t("dashboard.institutionalOrderStorage.institutionFilter")}</span>
            <select
              className="input"
              value={institutionFilter}
              onChange={(e) => setInstitutionFilter(e.target.value)}
            >
              <option value="">{t("dashboard.institutionalOrderStorage.institutionAll")}</option>
              {institutions.map((inst) => (
                <option key={inst.id} value={String(inst.id)}>
                  {inst.name}
                </option>
              ))}
            </select>
          </label>
          <label className="dash-ui-stack grid gap-1.5">
            <span>{t("dashboard.institutionalOrderStorage.pageSize")}</span>
            <select
              className="input"
              value={String(limit)}
              onChange={(e) => setLimit(Number(e.target.value) || 20)}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {hasFilters ? (
            <div>
              <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                {t("dashboard.institutionalOrderStorage.resetFilters")}
              </button>
            </div>
          ) : null}
        </div>

        <p className="mb-3">
          {t("dashboard.institutionalOrderStorage.resultsCount", { count: pagination.total ?? 0 })}
          {refreshing ? ` — ${t("dashboard.institutionalOrderStorage.refreshing")}` : ""}
        </p>

        {loading && orders.length === 0 ? (
          <DashboardLoadingState label={t("dashboard.institutionalOrderStorage.loading")} />
        ) : error && orders.length === 0 ? (
          <div>
            <p role="alert">{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              {t("dashboard.institutionalOrderStorage.retry")}
            </button>
          </div>
        ) : hasNoPendingAtAll ? (
          <DashboardEmptyState
            title={t("dashboard.institutionalOrderStorage.pendingEmpty")}
            icon={<ClipboardList size={40} strokeWidth={1.5} aria-hidden />}
          />
        ) : hasNoFilterResults ? (
          <DashboardEmptyState
            title={t("dashboard.institutionalOrderStorage.pendingEmptyFiltered")}
            description={t("dashboard.institutionalOrderStorage.emptyFilteredHint")}
            icon={<ClipboardList size={40} strokeWidth={1.5} aria-hidden />}
            actions={
              <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                {t("dashboard.institutionalOrderStorage.resetFilters")}
              </button>
            }
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <DashboardTable caption={t("dashboard.institutionalOrderStorage.pendingApprovals")}>
                <thead>
                  <tr>
                    <th style={{ minWidth: "10rem" }}>{t("dashboard.institutionalOrderStorage.orderTitle")}</th>
                    <th style={{ minWidth: "9rem" }}>{t("dashboard.institutionalOrderStorage.name")}</th>
                    <th style={{ minWidth: "9rem" }}>{t("dashboard.institutionalOrderStorage.institutions")}</th>
                    <th style={{ width: "6rem" }}>{t("dashboard.institutionalOrderStorage.orderType")}</th>
                    <th style={{ width: "7rem" }}>{t("dashboard.institutionalOrderStorage.price")}</th>
                    <th style={{ width: "8rem" }}>{t("dashboard.institutionalOrderStorage.submittedBy")}</th>
                    <th style={{ width: "8rem" }}>{t("dashboard.institutionalOrderStorage.submittedDate")}</th>
                    <th style={{ width: "7rem" }}>{t("dashboard.institutionalOrderStorage.status")}</th>
                    <th style={{ minWidth: "14rem" }}>{t("dashboard.institutionalOrderStorage.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const instText = (o.institutions || []).map((i) => i.name).join("، ") || "—";
                    return (
                      <tr key={o.id}>
                        <td className="max-w-[12rem] align-middle">
                          <Link to={`${BASE}/${o.storageId}`} className="break-words font-semibold" title={o.title}>
                            {o.title}
                          </Link>
                        </td>
                        <td className="max-w-[10rem] align-middle">
                          <Link to={`${BASE}/${o.storageId}`} className="break-words" title={o.storageName}>
                            {o.storageName || o.storageId}
                          </Link>
                        </td>
                        <td className="max-w-[10rem] align-middle">
                          <span className="line-clamp-2 break-words" title={instText}>
                            {instText}
                          </span>
                        </td>
                        <td className="align-middle">
                          {o.projectType === "bidding"
                            ? t("dashboard.institutionalOrderStorage.projectBidding")
                            : t("dashboard.institutionalOrderStorage.projectFixed")}
                        </td>
                        <td className="align-middle tabular-nums whitespace-nowrap">
                          {formatMoney(o.orderPriceJod, t)}
                        </td>
                        <td className="align-middle break-words">{o.submittedByName || "—"}</td>
                        <td className="align-middle whitespace-nowrap">
                          {formatDateTime(o.submittedAt, locale)}
                        </td>
                        <td className="align-middle">{lifecycleLabel(o.lifecycleStatus, t)}</td>
                        <td className="align-middle">{renderActions(o)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </DashboardTable>
            </div>

            <ul className="m-0 grid list-none gap-3 p-0 lg:hidden">
              {orders.map((o) => {
                const instText = (o.institutions || []).map((i) => i.name).join("، ") || "—";
                return (
                  <li key={`m-${o.id}`} className="dash-ui-form-card grid gap-2 p-3.5">
                    <strong className="break-words">{o.title}</strong>
                    <span className="text-sm break-words">
                      {t("dashboard.institutionalOrderStorage.name")}:{" "}
                      <Link to={`${BASE}/${o.storageId}`}>{o.storageName || o.storageId}</Link>
                    </span>
                    <span className="text-sm break-words" title={instText}>
                      {t("dashboard.institutionalOrderStorage.institutions")}: {instText}
                    </span>
                    <span className="text-sm">
                      {t("dashboard.institutionalOrderStorage.orderType")}:{" "}
                      {o.projectType === "bidding"
                        ? t("dashboard.institutionalOrderStorage.projectBidding")
                        : t("dashboard.institutionalOrderStorage.projectFixed")}
                    </span>
                    <span className="text-sm">
                      {t("dashboard.institutionalOrderStorage.price")}: {formatMoney(o.orderPriceJod, t)}
                    </span>
                    <span className="text-sm">
                      {t("dashboard.institutionalOrderStorage.submittedBy")}: {o.submittedByName || "—"}
                    </span>
                    <span className="text-sm">
                      {t("dashboard.institutionalOrderStorage.submittedDate")}:{" "}
                      {formatDateTime(o.submittedAt, locale)}
                    </span>
                    <span className="text-sm">
                      {t("dashboard.institutionalOrderStorage.status")}: {lifecycleLabel(o.lifecycleStatus, t)}
                    </span>
                    {renderActions(o)}
                  </li>
                );
              })}
            </ul>

            {(pagination.totalPages || 1) > 1 ? (
              <div style={{ marginTop: 16 }}>
                <Pagination
                  currentPage={page}
                  totalPages={pagination.totalPages || 1}
                  onPageChange={setPage}
                  isLoading={loading || refreshing}
                />
              </div>
            ) : null}
          </>
        )}
      </DashboardSection>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm ? confirmTitle(confirm.action) : ""}
        body={confirm ? confirmBody(confirm.order, confirm.action) : null}
        confirmLabel={
          actingId
            ? t("dashboard.institutionalOrderStorage.acting")
            : confirm?.action === "approve"
              ? t("dashboard.institutionalOrderStorage.approve")
              : t("dashboard.institutionalOrderStorage.confirm")
        }
        cancelLabel={t("dashboard.institutionalOrderStorage.cancel")}
        confirmVariant={confirm?.action === "delete" ? "danger" : "primary"}
        confirmBusy={Boolean(actingId)}
        onCancel={() => {
          if (!actingId) setConfirm(null);
        }}
        onConfirm={() => {
          if (confirm) void runAction(confirm.order, confirm.action);
        }}
      />
    </DashboardShell>
  );
}
