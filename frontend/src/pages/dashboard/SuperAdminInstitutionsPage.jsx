import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, UserPlus } from "lucide-react";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import Pagination from "../../components/common/Pagination";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import { formatSubscriptionAdminDate } from "../../admin/subscriptions/subscriptionAdminDisplay";
import {
  adminCreateInstitutionRequest,
  adminDeleteInstitutionRequest,
  adminListInstitutionsRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";

const DETAIL_BASE = "/dashboard/super-admin/institutions";
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DELETE_CONFIRM_BODY =
  "سيتم تعطيل المؤسسة مع الاحتفاظ بالسجلات والطلبات السابقة.";
const EMPTY_SUMMARY = {
  totalInstitutions: 0,
  activeInstitutions: 0,
  inactiveInstitutions: 0,
  totalActiveMembers: 0,
  institutionsLinkedToStorage: 0,
};

function statusLabel(status, t) {
  if (status === "frozen") return t("dashboard.institutions.frozen");
  return status === "active" ? t("dashboard.institutions.active") : t("dashboard.institutions.inactive");
}

function StatusBadge({ status, t }) {
  const active = status === "active";
  const frozen = status === "frozen";
  return (
    <span
      className={`inline-flex min-h-[1.75rem] min-w-[4.75rem] items-center justify-center rounded-md border px-2 text-[0.78rem] font-semibold ${
        frozen
          ? "border-sky-200 bg-sky-50 text-sky-900"
          : active
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-slate-200 bg-slate-50 text-slate-700"
      }`}
    >
      {statusLabel(status, t)}
    </span>
  );
}

function truncateDescription(text, max = 120) {
  const s = String(text || "").trim();
  if (!s) return null;
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

export default function SuperAdminInstitutionsPage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState({ name: "", description: "", status: "active" });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, statusFilter, limit]);

  const load = useCallback(
    async ({ soft = false } = {}) => {
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await adminListInstitutionsRequest({
          q: debouncedQ || undefined,
          status: statusFilter || undefined,
          page,
          limit,
        });
        setInstitutions(res?.data?.institutions || []);
        setPagination(res?.data?.pagination || { page: 1, limit, total: 0, totalPages: 1 });
        setSummary(res?.data?.summary || EMPTY_SUMMARY);
      } catch (e) {
        const msg = getSafeApiErrorMessage(e) || t("dashboard.institutions.loadError");
        setError(msg);
        if (!soft) push({ type: "error", message: msg });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedQ, statusFilter, page, limit, push, t],
  );

  useEffect(() => {
    void load({ soft: institutions.length > 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- soft refresh when filters change
  }, [load]);

  const resetFilters = () => {
    setSearchInput("");
    setDebouncedQ("");
    setStatusFilter("");
    setLimit(20);
    setPage(1);
  };

  const hasFilters = Boolean(debouncedQ || statusFilter || limit !== 20);
  const hasNoInstitutionsAtAll = !hasFilters && pagination.total === 0 && !loading && !error;
  const hasNoFilterResults = hasFilters && institutions.length === 0 && !loading && !error;

  const create = async (e) => {
    e.preventDefault();
    if (saving) return;
    const name = form.name.trim();
    if (name.length < 2) {
      setFormError(t("dashboard.institutions.validationNameShort"));
      return;
    }
    if (name.length > 200) {
      setFormError(t("dashboard.institutions.validationNameLong"));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await adminCreateInstitutionRequest({
        name,
        description: form.description.trim() || null,
        status: form.status === "inactive" ? "inactive" : "active",
      });
      setForm({ name: "", description: "", status: "active" });
      push({ type: "success", message: t("dashboard.institutions.created") });
      if (page !== 1) setPage(1);
      else await load({ soft: true });
    } catch (err) {
      const code = err?.response?.data?.code || err?.response?.data?.publicCode;
      const msg =
        code === "DUPLICATE_INSTITUTION_NAME"
          ? t("dashboard.institutions.duplicateName")
          : getSafeApiErrorMessage(err);
      setFormError(msg);
      push({ type: "error", message: msg });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const res = await adminDeleteInstitutionRequest(deleteTarget.id);
      const msg =
        res?.data?.message ||
        res?.message ||
        t("dashboard.institutions.deactivated");
      push({ type: "success", message: msg });
      setDeleteTarget(null);
      await load({ soft: true });
    } catch (err) {
      const msg = getSafeApiErrorMessage(err) || t("dashboard.institutions.actionDeactivateError");
      push({ type: "error", message: msg });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("dashboard.institutions.title")}
        description={t("dashboard.institutions.description")}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.institutions")}
      />

      <DashboardSection title={t("dashboard.institutions.summaryTitle")}>
        <div
          className="mb-1 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          aria-label={t("dashboard.institutions.summaryTitle")}
        >
          {[
            { key: "total", label: t("dashboard.institutions.metricTotal"), value: summary.totalInstitutions },
            { key: "active", label: t("dashboard.institutions.metricActive"), value: summary.activeInstitutions },
            { key: "inactive", label: t("dashboard.institutions.metricInactive"), value: summary.inactiveInstitutions },
            { key: "members", label: t("dashboard.institutions.metricActiveMembers"), value: summary.totalActiveMembers },
            { key: "linked", label: t("dashboard.institutions.metricLinkedStorages"), value: summary.institutionsLinkedToStorage },
          ].map((item) => (
            <article key={item.key} className="dash-ui-form-card flex min-w-0 flex-col gap-1 p-3">
              <p className="m-0 text-[0.72rem] font-bold leading-snug text-slate-500">{item.label}</p>
              <p className="m-0 text-lg font-black tabular-nums text-slate-900">{item.value}</p>
            </article>
          ))}
        </div>
      </DashboardSection>

      <DashboardSection title={t("dashboard.institutions.add")}>
        <form
          className="dash-ui-form-card"
          onSubmit={create}
          style={{ display: "grid", gap: 12, maxWidth: 720 }}
        >
          <div className="dash-ui-toolbar" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label className="dash-ui-stack" style={{ display: "grid", gap: 6 }}>
              <span>{t("dashboard.institutions.name")} *</span>
              <input
                id="institution-create-name"
                className="input"
                value={form.name}
                onChange={(ev) => setForm((f) => ({ ...f, name: ev.target.value }))}
                placeholder={t("dashboard.institutions.name")}
                required
                maxLength={200}
                disabled={saving}
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? "institution-create-error" : undefined}
              />
            </label>
            <label className="dash-ui-stack" style={{ display: "grid", gap: 6 }}>
              <span>{t("dashboard.institutions.descriptionLabel")}</span>
              <input
                className="input"
                value={form.description}
                onChange={(ev) => setForm((f) => ({ ...f, description: ev.target.value }))}
                placeholder={t("dashboard.institutions.descriptionOptional")}
                disabled={saving}
              />
            </label>
            <label className="dash-ui-stack" style={{ display: "grid", gap: 6 }}>
              <span>{t("dashboard.institutions.status")}</span>
              <select
                className="input"
                value={form.status}
                onChange={(ev) => setForm((f) => ({ ...f, status: ev.target.value }))}
                disabled={saving}
              >
                <option value="active">{t("dashboard.institutions.active")}</option>
                <option value="inactive">{t("dashboard.institutions.inactive")}</option>
              </select>
            </label>
          </div>
          {formError ? (
            <p id="institution-create-error" role="alert" className="text-danger">
              {formError}
            </p>
          ) : null}
          <div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t("dashboard.institutions.saving") : t("dashboard.institutions.add")}
            </button>
          </div>
        </form>
      </DashboardSection>

      <DashboardSection title={t("dashboard.institutions.sectionTitle")}>
        <div
          className="dash-ui-toolbar oh-institutions-list-toolbar"
          role="search"
          aria-label={t("dashboard.institutions.search")}
          style={{
            display: "grid",
            gap: 12,
            marginBottom: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            alignItems: "end",
          }}
        >
          <label className="dash-ui-stack" style={{ display: "grid", gap: 6 }}>
            <span>{t("dashboard.institutions.search")}</span>
            <input
              className="input"
              type="search"
              value={searchInput}
              onChange={(ev) => setSearchInput(ev.target.value)}
              placeholder={t("dashboard.institutions.searchPlaceholder")}
              disabled={loading && !institutions.length}
            />
          </label>
          <label className="dash-ui-stack" style={{ display: "grid", gap: 6 }}>
            <span>{t("dashboard.institutions.statusFilter")}</span>
            <select
              className="input"
              value={statusFilter}
              onChange={(ev) => setStatusFilter(ev.target.value)}
            >
              <option value="">{t("dashboard.institutions.statusAll")}</option>
              <option value="active">{t("dashboard.institutions.active")}</option>
              <option value="inactive">{t("dashboard.institutions.inactive")}</option>
            </select>
          </label>
          <label className="dash-ui-stack" style={{ display: "grid", gap: 6 }}>
            <span>{t("dashboard.institutions.pageSize")}</span>
            <select
              className="input"
              value={String(limit)}
              onChange={(ev) => setLimit(Number(ev.target.value) || 20)}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div
            className="oh-institutions-results-meta"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              minHeight: "2.5rem",
            }}
          >
            <p className="m-0 text-sm font-semibold text-slate-700" aria-live="polite">
              {t("dashboard.institutions.resultsCount", { count: pagination.total ?? 0 })}
              {refreshing ? ` — ${t("dashboard.institutions.refreshing")}` : ""}
            </p>
            {hasFilters ? (
              <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                {t("dashboard.institutions.resetFilters")}
              </button>
            ) : null}
          </div>
        </div>

        {loading && institutions.length === 0 ? (
          <DashboardLoadingState label={t("dashboard.institutions.loading")} />
        ) : error && institutions.length === 0 ? (
          <div>
            <p role="alert">{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              {t("dashboard.institutions.retry")}
            </button>
          </div>
        ) : hasNoInstitutionsAtAll ? (
          <DashboardEmptyState
            title={t("dashboard.institutions.empty")}
            icon={<Building2 size={40} strokeWidth={1.5} aria-hidden />}
          />
        ) : hasNoFilterResults ? (
          <DashboardEmptyState
            title={t("dashboard.institutions.emptyFiltered")}
            description={t("dashboard.institutions.emptyFilteredHint")}
            icon={<Building2 size={40} strokeWidth={1.5} aria-hidden />}
            actions={
              <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                {t("dashboard.institutions.resetFilters")}
              </button>
            }
          />
        ) : (
          <>
            <ul className="oh-institutions-card-grid m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {institutions.map((inst) => {
                const detailTo = `${DETAIL_BASE}/${inst.id}`;
                const addMembersTo = `${detailTo}?tab=members&addMember=1`;
                const name = inst.name || "";
                const shortDesc = truncateDescription(inst.description);
                return (
                  <li key={inst.id} className="dash-ui-form-card flex min-w-0 flex-col gap-2.5 p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link
                        to={detailTo}
                        className="oh-inst-name-link break-words text-base font-extrabold leading-snug"
                        title={name}
                        aria-label={`${t("dashboard.institutions.manage")}: ${name}`}
                      >
                        {name}
                      </Link>
                      <StatusBadge status={inst.status} t={t} />
                    </div>
                    {shortDesc ? (
                      <p className="m-0 line-clamp-2 text-sm leading-snug text-slate-600">{shortDesc}</p>
                    ) : (
                      <p className="m-0 text-sm text-slate-400">{t("dashboard.institutions.noDescription")}</p>
                    )}
                    <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.78rem] text-slate-700">
                      <div>
                        <dt className="inline font-bold text-slate-500 after:content-[':']">
                          {t("dashboard.institutions.members")}
                        </dt>{" "}
                        <dd className="inline m-0 tabular-nums font-semibold">{inst.memberCount ?? 0}</dd>
                      </div>
                      {inst.ordersCount != null ? (
                        <div>
                          <dt className="inline font-bold text-slate-500 after:content-[':']">
                            {t("dashboard.institutions.statsOrdersCount")}
                          </dt>{" "}
                          <dd className="inline m-0 tabular-nums font-semibold">{inst.ordersCount}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt className="inline font-bold text-slate-500 after:content-[':']">
                          {t("dashboard.institutions.linkedStorages")}
                        </dt>{" "}
                        <dd className="inline m-0 tabular-nums font-semibold">{inst.linkedStorageCount ?? 0}</dd>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <dt className="inline font-bold text-slate-500 after:content-[':']">
                          {t("dashboard.institutions.createdAt")}
                        </dt>{" "}
                        <dd className="inline m-0 tabular-nums">{formatSubscriptionAdminDate(inst.createdAt)}</dd>
                      </div>
                    </dl>
                    <div className="mt-auto flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
                      <Link to={detailTo} className="btn btn-primary flex-1 justify-center sm:flex-none">
                        {t("dashboard.institutions.manage")}
                      </Link>
                      <Link
                        to={addMembersTo}
                        className="btn btn-secondary inline-flex flex-1 items-center justify-center gap-1.5 sm:flex-none"
                      >
                        <UserPlus size={16} strokeWidth={1.75} aria-hidden />
                        إضافة أعضاء
                      </Link>
                      {inst.status !== "frozen" ? (
                        <button
                          type="button"
                          className="btn btn-danger flex-1 justify-center sm:flex-none"
                          onClick={() => setDeleteTarget(inst)}
                        >
                          حذف
                        </button>
                      ) : null}
                    </div>
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
        open={Boolean(deleteTarget)}
        title="تعطيل المؤسسة"
        body={DELETE_CONFIRM_BODY}
        confirmLabel="تعطيل"
        cancelLabel={t("dashboard.institutions.cancel")}
        confirmVariant="danger"
        confirmBusy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </DashboardShell>
  );
}
