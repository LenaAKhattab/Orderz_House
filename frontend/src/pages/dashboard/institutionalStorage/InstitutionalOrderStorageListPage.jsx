import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Package } from "lucide-react";
import DashboardPageHeader from "../../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import DashboardTable from "../../../components/dashboard/DashboardTable";
import Pagination from "../../../components/common/Pagination";
import { superAdminBreadcrumbs } from "../../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { useToast } from "../../../components/ui/toastContext";
import {
  adminCreateInstitutionalStorageRequest,
  adminListInstitutionalStoragesRequest,
  adminListInstitutionsRequest,
} from "../../../services/api";
import { getSafeApiErrorMessage, isAxiosTimeoutError } from "../../../utils/apiErrorMessage";

const BASE = "/dashboard/super-admin/institutional-order-storage";
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const EMPTY_SUMMARY = {
  totalStorages: 0,
  activeStorages: 0,
  pausedStorages: 0,
  totalFinancialLimitsJod: 0,
  totalRemainingJod: 0,
  pendingApprovalsCount: 0,
  overdueBatchesCount: 0,
};

function statusLabel(status, t) {
  const key = `dashboard.institutionalOrderStorage.status_${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

function StatusBadge({ status, t }) {
  const tone =
    status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : status === "paused"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : status === "archived"
          ? "border-slate-200 bg-slate-50 text-slate-700"
          : "border-slate-200 bg-white text-slate-700";
  return (
    <span
      className={`inline-flex min-h-[1.75rem] items-center justify-center rounded-md border px-2 text-[0.78rem] font-semibold ${tone}`}
    >
      {statusLabel(status, t)}
    </span>
  );
}

function formatMoney(value, t) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t("dashboard.institutionalOrderStorage.currencyJod")}`;
}

function formatDate(value, locale) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(locale === "en" ? "en-GB" : "ar-JO");
  } catch {
    return String(value);
  }
}

function formatDateTime(value, locale) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(locale === "en" ? "en-GB" : "ar-JO");
  } catch {
    return String(value);
  }
}

function institutionNames(storage) {
  return (storage.institutions || []).map((i) => i.name).filter(Boolean);
}

function mapCreateError(err, t) {
  const code = err?.response?.data?.code || err?.response?.data?.publicCode;
  if (code === "NO_INSTITUTIONS_SELECTED") return t("dashboard.institutionalOrderStorage.errorNoInstitutions");
  if (code === "INSTITUTION_NOT_FOUND") return t("dashboard.institutionalOrderStorage.errorInstitutionNotFound");
  if (code === "INSTITUTION_INACTIVE") return t("dashboard.institutionalOrderStorage.errorInstitutionInactive");
  if (isAxiosTimeoutError(err)) return t("dashboard.institutionalOrderStorage.timeoutError");
  return getSafeApiErrorMessage(err);
}

export default function InstitutionalOrderStorageListPage() {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const listAbortRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [timedOut, setTimedOut] = useState(false);
  const [storages, setStorages] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState(EMPTY_SUMMARY);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [institutionFilter, setInstitutionFilter] = useState("");
  const [startDateFrom, setStartDateFrom] = useState("");
  const [startDateTo, setStartDateTo] = useState("");
  const [sort, setSort] = useState("created_at_desc");

  const [filterInstitutions, setFilterInstitutions] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    financialLimitJod: "100",
    distributionMonths: "5",
    distributionStartDate: new Date().toISOString().slice(0, 10),
    institutionIds: [],
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [instSearchInput, setInstSearchInput] = useState("");
  const [debouncedInstQ, setDebouncedInstQ] = useState("");
  const [activeInstitutions, setActiveInstitutions] = useState([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedInstQ(instSearchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [instSearchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, statusFilter, institutionFilter, startDateFrom, startDateTo, sort, limit]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminListInstitutionsRequest({ status: "active", limit: 100 });
        if (!cancelled) setFilterInstitutions(res?.data?.institutions || []);
      } catch {
        /* filter dropdown is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(
    async ({ soft = false } = {}) => {
      if (listAbortRef.current) listAbortRef.current.abort();
      const controller = new AbortController();
      listAbortRef.current = controller;

      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setTimedOut(false);
      try {
        const res = await adminListInstitutionalStoragesRequest(
          {
            q: debouncedQ || undefined,
            status: statusFilter || undefined,
            institutionId: institutionFilter || undefined,
            startDateFrom: startDateFrom || undefined,
            startDateTo: startDateTo || undefined,
            sort,
            page,
            limit,
          },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setStorages(res?.data?.storages || []);
        setPagination(res?.data?.pagination || { page: 1, limit, total: 0, totalPages: 1 });
        setSummary(res?.data?.summary || EMPTY_SUMMARY);
      } catch (e) {
        if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || controller.signal.aborted) return;
        const timeout = isAxiosTimeoutError(e);
        setTimedOut(timeout);
        const msg = timeout
          ? t("dashboard.institutionalOrderStorage.timeoutError")
          : getSafeApiErrorMessage(e) || t("dashboard.institutionalOrderStorage.loadError");
        setError(msg);
        if (!soft) push({ type: "error", message: msg });
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      debouncedQ,
      statusFilter,
      institutionFilter,
      startDateFrom,
      startDateTo,
      sort,
      page,
      limit,
      push,
      t,
    ],
  );

  useEffect(() => {
    void load({ soft: storages.length > 0 });
    return () => {
      if (listAbortRef.current) listAbortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- soft refresh when filters change
  }, [load]);

  useEffect(() => {
    if (!showCreate) return undefined;
    const controller = new AbortController();
    setInstitutionsLoading(true);
    (async () => {
      try {
        const res = await adminListInstitutionsRequest(
          { status: "active", q: debouncedInstQ || undefined, limit: 50 },
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setActiveInstitutions(res?.data?.institutions || []);
        }
      } catch (e) {
        if (e?.code === "ERR_CANCELED" || controller.signal.aborted) return;
        push({ type: "error", message: getSafeApiErrorMessage(e) });
      } finally {
        if (!controller.signal.aborted) setInstitutionsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [showCreate, debouncedInstQ, push]);

  const resetFilters = () => {
    setSearchInput("");
    setDebouncedQ("");
    setStatusFilter("");
    setInstitutionFilter("");
    setStartDateFrom("");
    setStartDateTo("");
    setSort("created_at_desc");
    setLimit(20);
    setPage(1);
  };

  const hasFilters = Boolean(
    debouncedQ ||
      statusFilter ||
      institutionFilter ||
      startDateFrom ||
      startDateTo ||
      sort !== "created_at_desc" ||
      limit !== 20,
  );
  const hasNoStoragesAtAll = !hasFilters && pagination.total === 0 && !loading && !error;
  const hasNoFilterResults = hasFilters && storages.length === 0 && !loading && !error;

  const toggleInstitution = (id) => {
    const sid = String(id);
    setForm((f) => ({
      ...f,
      institutionIds: f.institutionIds.includes(sid)
        ? f.institutionIds.filter((x) => x !== sid)
        : [...f.institutionIds, sid],
    }));
    setFieldErrors((fe) => ({ ...fe, institutionIds: null }));
  };

  const validateForm = () => {
    const errors = {};
    const name = form.name.trim();
    if (!name) errors.name = t("dashboard.institutionalOrderStorage.validationNameRequired");
    else if (name.length < 2) errors.name = t("dashboard.institutionalOrderStorage.validationNameShort");
    const limitNum = Number(form.financialLimitJod);
    if (!Number.isFinite(limitNum) || limitNum <= 0) {
      errors.financialLimitJod = t("dashboard.institutionalOrderStorage.validationLimit");
    }
    const months = Math.floor(Number(form.distributionMonths));
    if (!Number.isInteger(months) || months < 1 || months > 120) {
      errors.distributionMonths = t("dashboard.institutionalOrderStorage.validationMonths");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.distributionStartDate || ""))) {
      errors.distributionStartDate = t("dashboard.institutionalOrderStorage.validationStartDate");
    }
    if (!form.institutionIds.length) {
      errors.institutionIds = t("dashboard.institutionalOrderStorage.validationInstitutions");
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const canSubmit = useMemo(() => {
    return (
      form.name.trim().length >= 2 &&
      Number(form.financialLimitJod) > 0 &&
      Number(form.distributionMonths) >= 1 &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(form.distributionStartDate || "")) &&
      form.institutionIds.length > 0 &&
      !saving
    );
  }, [form, saving]);

  const create = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!validateForm()) return;
    setSaving(true);
    setFormError(null);
    try {
      await adminCreateInstitutionalStorageRequest({
        name: form.name.trim(),
        description: form.description.trim() || null,
        financialLimitJod: Number(form.financialLimitJod),
        distributionMonths: Number(form.distributionMonths),
        distributionStartDate: form.distributionStartDate,
        institutionIds: [...new Set(form.institutionIds.map(Number))],
      });
      setShowCreate(false);
      setForm({
        name: "",
        description: "",
        financialLimitJod: "100",
        distributionMonths: "5",
        distributionStartDate: new Date().toISOString().slice(0, 10),
        institutionIds: [],
      });
      setFieldErrors({});
      push({ type: "success", message: t("dashboard.institutionalOrderStorage.created") });
      if (page !== 1) setPage(1);
      else await load({ soft: true });
    } catch (err) {
      const msg = mapCreateError(err, t);
      setFormError(msg);
      push({ type: "error", message: msg });
    } finally {
      setSaving(false);
    }
  };

  const pendingTotal = summary.pendingApprovalsCount || 0;

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("dashboard.institutionalOrderStorage.title")}
        description={t("dashboard.institutionalOrderStorage.description")}
        breadcrumbs={superAdminBreadcrumbs("dashboard.nav.superAdmin.institutionalOrderStorage")}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link to={`${BASE}/pending`} className="btn btn-secondary">
              {t("dashboard.institutionalOrderStorage.pendingApprovals")}
              {pendingTotal ? ` (${pendingTotal})` : ""}
            </Link>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCreate((v) => !v)}
              aria-expanded={showCreate}
            >
              {t("dashboard.institutionalOrderStorage.create")}
            </button>
          </div>
        }
      />

      <DashboardSection title={t("dashboard.institutionalOrderStorage.summaryTitle")}>
        <div
          className="mb-1 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
          aria-label={t("dashboard.institutionalOrderStorage.summaryTitle")}
        >
          {[
            { key: "total", label: t("dashboard.institutionalOrderStorage.metricTotal"), value: summary.totalStorages },
            { key: "active", label: t("dashboard.institutionalOrderStorage.metricActive"), value: summary.activeStorages },
            { key: "paused", label: t("dashboard.institutionalOrderStorage.metricPaused"), value: summary.pausedStorages },
            {
              key: "limits",
              label: t("dashboard.institutionalOrderStorage.metricTotalLimits"),
              value: formatMoney(summary.totalFinancialLimitsJod, t),
            },
            {
              key: "remaining",
              label: t("dashboard.institutionalOrderStorage.metricTotalRemaining"),
              value: formatMoney(summary.totalRemainingJod, t),
            },
            {
              key: "pending",
              label: t("dashboard.institutionalOrderStorage.metricPendingApprovals"),
              value: summary.pendingApprovalsCount,
            },
            {
              key: "overdue",
              label: t("dashboard.institutionalOrderStorage.metricOverdueBatches"),
              value: summary.overdueBatchesCount,
            },
          ].map((item) => (
            <article key={item.key} className="dash-ui-form-card flex min-w-0 flex-col gap-1 p-3">
              <p className="m-0 text-[0.72rem] font-bold leading-snug text-slate-500">{item.label}</p>
              <p className="m-0 text-lg font-black tabular-nums text-slate-900 break-words">{item.value}</p>
            </article>
          ))}
        </div>
      </DashboardSection>

      {showCreate ? (
        <DashboardSection title={t("dashboard.institutionalOrderStorage.create")}>
          <form onSubmit={create} className="dash-ui-form-card grid gap-6 p-4 lg:grid-cols-3" noValidate>
            <fieldset className="m-0 min-w-0 border-0 p-0 lg:col-span-1">
              <legend className="mb-3 text-sm font-bold text-slate-800">
                {t("dashboard.institutionalOrderStorage.basicInfo")}
              </legend>
              <div className="grid gap-3">
                <label className="dash-ui-stack grid gap-1.5">
                  <span>{t("dashboard.institutionalOrderStorage.name")} *</span>
                  <input
                    className="input"
                    value={form.name}
                    onChange={(e) => {
                      setForm({ ...form, name: e.target.value });
                      setFieldErrors((fe) => ({ ...fe, name: null }));
                    }}
                    disabled={saving}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? "ios-name-err" : undefined}
                  />
                  {fieldErrors.name ? (
                    <span id="ios-name-err" role="alert" className="text-danger text-sm">
                      {fieldErrors.name}
                    </span>
                  ) : null}
                </label>
                <label className="dash-ui-stack grid gap-1.5">
                  <span>{t("dashboard.institutionalOrderStorage.descriptionOptional")}</span>
                  <textarea
                    className="input"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    disabled={saving}
                  />
                </label>
                <label className="dash-ui-stack grid gap-1.5">
                  <span>{t("dashboard.institutionalOrderStorage.financialLimit")} *</span>
                  <input
                    className="input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.financialLimitJod}
                    onChange={(e) => {
                      setForm({ ...form, financialLimitJod: e.target.value });
                      setFieldErrors((fe) => ({ ...fe, financialLimitJod: null }));
                    }}
                    disabled={saving}
                    aria-invalid={Boolean(fieldErrors.financialLimitJod)}
                  />
                  {fieldErrors.financialLimitJod ? (
                    <span role="alert" className="text-danger text-sm">
                      {fieldErrors.financialLimitJod}
                    </span>
                  ) : null}
                </label>
                <label className="dash-ui-stack grid gap-1.5">
                  <span>{t("dashboard.institutionalOrderStorage.months")} *</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="120"
                    value={form.distributionMonths}
                    onChange={(e) => {
                      setForm({ ...form, distributionMonths: e.target.value });
                      setFieldErrors((fe) => ({ ...fe, distributionMonths: null }));
                    }}
                    disabled={saving}
                    aria-invalid={Boolean(fieldErrors.distributionMonths)}
                  />
                  {fieldErrors.distributionMonths ? (
                    <span role="alert" className="text-danger text-sm">
                      {fieldErrors.distributionMonths}
                    </span>
                  ) : null}
                </label>
                <label className="dash-ui-stack grid gap-1.5">
                  <span>{t("dashboard.institutionalOrderStorage.startDate")} *</span>
                  <input
                    className="input"
                    type="date"
                    value={form.distributionStartDate}
                    onChange={(e) => {
                      setForm({ ...form, distributionStartDate: e.target.value });
                      setFieldErrors((fe) => ({ ...fe, distributionStartDate: null }));
                    }}
                    disabled={saving}
                    aria-invalid={Boolean(fieldErrors.distributionStartDate)}
                  />
                  {fieldErrors.distributionStartDate ? (
                    <span role="alert" className="text-danger text-sm">
                      {fieldErrors.distributionStartDate}
                    </span>
                  ) : null}
                </label>
              </div>
            </fieldset>

            <fieldset className="m-0 min-w-0 border-0 p-0 lg:col-span-1">
              <legend className="mb-3 text-sm font-bold text-slate-800">
                {t("dashboard.institutionalOrderStorage.institutionSelection")}
              </legend>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {t("dashboard.institutionalOrderStorage.selectedCount", { count: form.institutionIds.length })}
                </span>
                {form.institutionIds.length ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setForm((f) => ({ ...f, institutionIds: [] }))}
                    disabled={saving}
                  >
                    {t("dashboard.institutionalOrderStorage.clearSelected")}
                  </button>
                ) : null}
              </div>
              <label className="dash-ui-stack mb-2 grid gap-1.5">
                <span>{t("dashboard.institutionalOrderStorage.institutionSearch")}</span>
                <input
                  className="input"
                  type="search"
                  value={instSearchInput}
                  onChange={(e) => setInstSearchInput(e.target.value)}
                  placeholder={t("dashboard.institutionalOrderStorage.institutionSearchPlaceholder")}
                  disabled={saving}
                />
              </label>
              {fieldErrors.institutionIds ? (
                <p role="alert" className="text-danger text-sm">
                  {fieldErrors.institutionIds}
                </p>
              ) : null}
              <div
                className="max-h-64 overflow-y-auto rounded-md border border-slate-200 p-2"
                role="group"
                aria-label={t("dashboard.institutionalOrderStorage.selectInstitutions")}
              >
                {institutionsLoading ? (
                  <p className="m-0 text-sm text-slate-600">
                    {t("dashboard.institutionalOrderStorage.institutionsLoading")}
                  </p>
                ) : activeInstitutions.length === 0 ? (
                  <p className="m-0 text-sm text-slate-600">
                    {t("dashboard.institutionalOrderStorage.noActiveInstitutions")}
                  </p>
                ) : (
                  <ul className="m-0 grid list-none gap-1.5 p-0">
                    {activeInstitutions.map((inst) => {
                      const sid = String(inst.id);
                      const checked = form.institutionIds.includes(sid);
                      return (
                        <li key={sid}>
                          <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleInstitution(sid)}
                              disabled={saving}
                            />
                            <span className="min-w-0 break-words text-sm leading-snug" title={inst.name}>
                              {inst.name}
                              {inst.memberCount != null ? ` (${inst.memberCount})` : ""}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </fieldset>

            <div className="min-w-0 lg:col-span-1">
              <h3 className="mb-3 mt-0 text-sm font-bold text-slate-800">
                {t("dashboard.institutionalOrderStorage.creationSummary")}
              </h3>
              <dl className="m-0 grid gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">{t("dashboard.institutionalOrderStorage.financialLimit")}</dt>
                  <dd className="m-0 font-semibold tabular-nums">{formatMoney(form.financialLimitJod, t)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">{t("dashboard.institutionalOrderStorage.months")}</dt>
                  <dd className="m-0 font-semibold">{form.distributionMonths || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">{t("dashboard.institutionalOrderStorage.startDate")}</dt>
                  <dd className="m-0 font-semibold">{form.distributionStartDate || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">{t("dashboard.institutionalOrderStorage.institutions")}</dt>
                  <dd className="m-0 font-semibold">{form.institutionIds.length}</dd>
                </div>
              </dl>
              <p className="mt-3 text-sm text-slate-600">
                {t("dashboard.institutionalOrderStorage.approxMonthlyNote", {
                  months: form.distributionMonths || "—",
                })}
              </p>
              <p className="mt-2 text-sm font-medium text-slate-700">
                {t("dashboard.institutionalOrderStorage.approvalBudgetNote")}
              </p>
              {formError ? (
                <p role="alert" className="text-danger mt-3 text-sm">
                  {formError}
                </p>
              ) : null}
              <button type="submit" className="btn btn-primary mt-4 w-full justify-center" disabled={!canSubmit}>
                {saving
                  ? t("dashboard.institutionalOrderStorage.saving")
                  : t("dashboard.institutionalOrderStorage.save")}
              </button>
            </div>
          </form>
        </DashboardSection>
      ) : null}

      <DashboardSection title={t("dashboard.institutionalOrderStorage.listTitle")}>
        <div
          className="dash-ui-toolbar mb-4 grid gap-3"
          role="search"
          aria-label={t("dashboard.institutionalOrderStorage.search")}
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", alignItems: "end" }}
        >
          <label className="dash-ui-stack grid gap-1.5">
            <span>{t("dashboard.institutionalOrderStorage.search")}</span>
            <input
              className="input"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("dashboard.institutionalOrderStorage.searchPlaceholder")}
              disabled={loading && !storages.length}
            />
          </label>
          <label className="dash-ui-stack grid gap-1.5">
            <span>{t("dashboard.institutionalOrderStorage.statusFilter")}</span>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t("dashboard.institutionalOrderStorage.statusAll")}</option>
              {["draft", "active", "paused", "archived"].map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s, t)}
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
              {filterInstitutions.map((inst) => (
                <option key={inst.id} value={String(inst.id)}>
                  {inst.name}
                </option>
              ))}
            </select>
          </label>
          <label className="dash-ui-stack grid gap-1.5">
            <span>{t("dashboard.institutionalOrderStorage.dateFrom")}</span>
            <input
              className="input"
              type="date"
              value={startDateFrom}
              onChange={(e) => setStartDateFrom(e.target.value)}
            />
          </label>
          <label className="dash-ui-stack grid gap-1.5">
            <span>{t("dashboard.institutionalOrderStorage.dateTo")}</span>
            <input
              className="input"
              type="date"
              value={startDateTo}
              onChange={(e) => setStartDateTo(e.target.value)}
            />
          </label>
          <label className="dash-ui-stack grid gap-1.5">
            <span>{t("dashboard.institutionalOrderStorage.sortBy")}</span>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="created_at_desc">{t("dashboard.institutionalOrderStorage.sortCreatedDesc")}</option>
              <option value="created_at_asc">{t("dashboard.institutionalOrderStorage.sortCreatedAsc")}</option>
              <option value="start_date_asc">{t("dashboard.institutionalOrderStorage.sortStartAsc")}</option>
              <option value="start_date_desc">{t("dashboard.institutionalOrderStorage.sortStartDesc")}</option>
              <option value="next_release_asc">{t("dashboard.institutionalOrderStorage.sortNextReleaseAsc")}</option>
              <option value="next_release_desc">{t("dashboard.institutionalOrderStorage.sortNextReleaseDesc")}</option>
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
          <div className="flex flex-wrap gap-2">
            {hasFilters ? (
              <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                {t("dashboard.institutionalOrderStorage.resetFilters")}
              </button>
            ) : null}
          </div>
        </div>

        <p className="mb-3">
          {t("dashboard.institutionalOrderStorage.resultsCount", { count: pagination.total ?? 0 })}
          {refreshing ? ` — ${t("dashboard.institutionalOrderStorage.refreshing")}` : ""}
        </p>

        {loading && storages.length === 0 ? (
          <DashboardLoadingState label={t("dashboard.institutionalOrderStorage.loading")} />
        ) : error && storages.length === 0 ? (
          <div>
            <p role="alert">{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              {t("dashboard.institutionalOrderStorage.retry")}
            </button>
            {timedOut ? (
              <p className="text-sm text-slate-600 mt-2">{t("dashboard.institutionalOrderStorage.timeoutError")}</p>
            ) : null}
          </div>
        ) : hasNoStoragesAtAll ? (
          <DashboardEmptyState
            title={t("dashboard.institutionalOrderStorage.empty")}
            icon={<Package size={40} strokeWidth={1.5} aria-hidden />}
          />
        ) : hasNoFilterResults ? (
          <DashboardEmptyState
            title={t("dashboard.institutionalOrderStorage.emptyFiltered")}
            description={t("dashboard.institutionalOrderStorage.emptyFilteredHint")}
            icon={<Package size={40} strokeWidth={1.5} aria-hidden />}
            actions={
              <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                {t("dashboard.institutionalOrderStorage.resetFilters")}
              </button>
            }
          />
        ) : (
          <>
            <div className="oh-ios-desktop-table hidden xl:block">
              <DashboardTable caption={t("dashboard.institutionalOrderStorage.listTitle")}>
                <thead>
                  <tr>
                    <th style={{ minWidth: "11rem" }}>{t("dashboard.institutionalOrderStorage.name")}</th>
                    <th style={{ minWidth: "10rem" }}>{t("dashboard.institutionalOrderStorage.institutions")}</th>
                    <th style={{ width: "7.5rem" }}>{t("dashboard.institutionalOrderStorage.financialLimit")}</th>
                    <th style={{ width: "7.5rem" }}>{t("dashboard.institutionalOrderStorage.remaining")}</th>
                    <th style={{ width: "6.5rem" }}>{t("dashboard.institutionalOrderStorage.status")}</th>
                    <th style={{ width: "5.5rem" }}>{t("dashboard.institutionalOrderStorage.ordersCount")}</th>
                    <th style={{ width: "6rem" }}>{t("dashboard.institutionalOrderStorage.approvedCount")}</th>
                    <th style={{ width: "5.5rem" }}>{t("dashboard.institutionalOrderStorage.releasedCount")}</th>
                    <th style={{ width: "7rem" }}>{t("dashboard.institutionalOrderStorage.startDate")}</th>
                    <th style={{ width: "8rem" }}>{t("dashboard.institutionalOrderStorage.nextRelease")}</th>
                    <th style={{ width: "7rem" }}>{t("dashboard.institutionalOrderStorage.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {storages.map((s) => {
                    const names = institutionNames(s);
                    const namesText = names.join("، ") || "—";
                    return (
                      <tr key={s.id}>
                        <td className="max-w-[14rem] align-middle">
                          <Link
                            to={`${BASE}/${s.id}`}
                            className="break-words font-semibold"
                            title={s.name}
                          >
                            {s.name}
                          </Link>
                        </td>
                        <td className="max-w-[12rem] align-middle">
                          <span className="line-clamp-2 break-words" title={namesText}>
                            {namesText}
                          </span>
                        </td>
                        <td className="align-middle tabular-nums whitespace-nowrap">
                          {formatMoney(s.financialLimitJod, t)}
                        </td>
                        <td className="align-middle tabular-nums whitespace-nowrap">
                          {formatMoney(s.remainingJod, t)}
                        </td>
                        <td className="align-middle">
                          <StatusBadge status={s.status} t={t} />
                        </td>
                        <td className="align-middle tabular-nums">{s.totalOrdersCount ?? 0}</td>
                        <td className="align-middle tabular-nums">{s.approvedOrderCount ?? 0}</td>
                        <td className="align-middle tabular-nums">{s.releasedCount ?? 0}</td>
                        <td className="align-middle whitespace-nowrap">
                          {formatDate(s.distributionStartDate, locale)}
                        </td>
                        <td className="align-middle whitespace-nowrap">
                          {formatDateTime(s.nextReleaseAt, locale)}
                        </td>
                        <td className="align-middle whitespace-nowrap">
                          <Link to={`${BASE}/${s.id}`} className="btn btn-secondary">
                            {t("dashboard.institutionalOrderStorage.manage")}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DashboardTable>
            </div>

            <ul className="oh-ios-mobile-cards m-0 grid list-none gap-3 p-0 xl:hidden">
              {storages.map((s) => {
                const names = institutionNames(s);
                const namesText = names.join("، ") || "—";
                return (
                  <li key={`m-${s.id}`} className="dash-ui-form-card grid gap-2 p-3.5">
                    <Link to={`${BASE}/${s.id}`} className="break-words text-base font-bold leading-snug" title={s.name}>
                      {s.name}
                    </Link>
                    <span className="break-words text-sm" title={namesText}>
                      <strong>{t("dashboard.institutionalOrderStorage.institutions")}:</strong> {namesText}
                    </span>
                    <span className="text-sm">
                      <strong>{t("dashboard.institutionalOrderStorage.financialLimit")}:</strong>{" "}
                      {formatMoney(s.financialLimitJod, t)}
                      {" · "}
                      <strong>{t("dashboard.institutionalOrderStorage.remaining")}:</strong>{" "}
                      {formatMoney(s.remainingJod, t)}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <strong>{t("dashboard.institutionalOrderStorage.status")}:</strong>
                      <StatusBadge status={s.status} t={t} />
                    </span>
                    <span className="text-sm">
                      {t("dashboard.institutionalOrderStorage.ordersCount")}: {s.totalOrdersCount ?? 0}
                      {" · "}
                      {t("dashboard.institutionalOrderStorage.approvedCount")}: {s.approvedOrderCount ?? 0}
                      {" · "}
                      {t("dashboard.institutionalOrderStorage.releasedCount")}: {s.releasedCount ?? 0}
                    </span>
                    <span className="text-sm">
                      <strong>{t("dashboard.institutionalOrderStorage.nextRelease")}:</strong>{" "}
                      {formatDateTime(s.nextReleaseAt, locale)}
                    </span>
                    <Link to={`${BASE}/${s.id}`} className="btn btn-secondary w-full justify-center">
                      {t("dashboard.institutionalOrderStorage.viewDetails")}
                    </Link>
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
    </DashboardShell>
  );
}
