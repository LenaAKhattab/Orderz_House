import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import DashboardTable from "../../components/dashboard/DashboardTable";
import StatusBadge from "../../components/dashboard/StatusBadge";
import Pagination from "../../components/common/Pagination";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import { listSuperAdminFeedbackRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  feedbackPriorityLabel,
  feedbackRoleLabel,
  feedbackStatusLabel,
  feedbackStatusTone,
  feedbackTypeLabel,
  formatFeedbackDate,
} from "../../constants/feedback";
import "./superAdminFeedbackPage.css";

const DETAIL_BASE = "/dashboard/super-admin/feedback";
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const EMPTY_SUMMARY = {
  total: 0,
  new: 0,
  inReview: 0,
  resolved: 0,
  closed: 0,
  problems: 0,
  suggestions: 0,
  other: 0,
};

export default function SuperAdminFeedbackPage() {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, typeFilter, statusFilter, roleFilter, priorityFilter, limit]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listSuperAdminFeedbackRequest({
        q: debouncedQ || undefined,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        userRole: roleFilter || undefined,
        priority: priorityFilter || undefined,
        page,
        limit,
      });
      setItems(res?.data?.items || []);
      setPagination(res?.data?.pagination || { page: 1, limit, total: 0, totalPages: 1 });
      setSummary(res?.data?.summary || EMPTY_SUMMARY);
    } catch (err) {
      const msg = getSafeApiErrorMessage(err) || t("dashboard.feedback.adminLoadError");
      setError(msg);
      setItems([]);
      push({ type: "error", message: msg });
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, typeFilter, statusFilter, roleFilter, priorityFilter, page, limit, push, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetFilters = () => {
    setSearchInput("");
    setDebouncedQ("");
    setTypeFilter("");
    setStatusFilter("");
    setRoleFilter("");
    setPriorityFilter("");
    setLimit(20);
    setPage(1);
  };

  const hasFilters = Boolean(debouncedQ || typeFilter || statusFilter || roleFilter || priorityFilter || limit !== 20);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("dashboard.feedback.title")}
        description={t("dashboard.feedback.adminIntro")}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.problemsSuggestions")}
      />

      <DashboardSection title={t("dashboard.feedback.metricTotal")}>
        <div className="sa-feedback-metrics" aria-label={t("dashboard.feedback.metricTotal")}>
          {[
            { key: "total", label: t("dashboard.feedback.metricTotal"), value: summary.total },
            { key: "new", label: t("dashboard.feedback.metricNew"), value: summary.new },
            { key: "inReview", label: t("dashboard.feedback.metricInReview"), value: summary.inReview },
            { key: "resolved", label: t("dashboard.feedback.metricResolved"), value: summary.resolved },
            { key: "problems", label: t("dashboard.feedback.metricProblems"), value: summary.problems },
            { key: "suggestions", label: t("dashboard.feedback.metricSuggestions"), value: summary.suggestions },
          ].map((item) => (
            <article key={item.key} className="dash-ui-form-card sa-feedback-metric">
              <p className="sa-feedback-metric__label">{item.label}</p>
              <p className="sa-feedback-metric__value">{item.value}</p>
            </article>
          ))}
        </div>
      </DashboardSection>

      <DashboardSection title={t("dashboard.feedback.searchLabel")}>
        <div className="sa-feedback-filters dash-ui-form-card">
          <label className="sa-feedback-filter">
            <span>{t("dashboard.feedback.searchLabel")}</span>
            <input
              className="input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("dashboard.feedback.searchPlaceholder")}
            />
          </label>
          <label className="sa-feedback-filter">
            <span>{t("dashboard.feedback.typeLabel")}</span>
            <select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">{t("dashboard.feedback.filterAll")}</option>
              {FEEDBACK_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {locale === "en" ? opt.en : opt.ar}
                </option>
              ))}
            </select>
          </label>
          <label className="sa-feedback-filter">
            <span>{t("dashboard.feedback.statusLabel")}</span>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t("dashboard.feedback.filterAll")}</option>
              {FEEDBACK_STATUSES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {locale === "en" ? opt.en : opt.ar}
                </option>
              ))}
            </select>
          </label>
          <label className="sa-feedback-filter">
            <span>{t("dashboard.feedback.roleLabel")}</span>
            <select className="input" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">{t("dashboard.feedback.filterAll")}</option>
              <option value="client">{feedbackRoleLabel("client", locale)}</option>
              <option value="freelancer">{feedbackRoleLabel("freelancer", locale)}</option>
            </select>
          </label>
          <label className="sa-feedback-filter">
            <span>{t("dashboard.feedback.priorityLabel")}</span>
            <select className="input" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="">{t("dashboard.feedback.filterAll")}</option>
              {FEEDBACK_PRIORITIES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {locale === "en" ? opt.en : opt.ar}
                </option>
              ))}
            </select>
          </label>
          <label className="sa-feedback-filter">
            <span>{t("dashboard.feedback.pageSize")}</span>
            <select className="input" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {hasFilters ? (
            <button type="button" className="sa-feedback-reset" onClick={resetFilters}>
              {t("dashboard.feedback.resetFilters")}
            </button>
          ) : null}
        </div>
      </DashboardSection>

      <DashboardSection title={t("dashboard.feedback.tableTitle")}>
        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? (
          <DashboardErrorState
            message={error}
            actions={
              <button type="button" className="sa-feedback-reset" onClick={load}>
                {t("dashboard.feedback.retry")}
              </button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <DashboardEmptyState
            title={t("dashboard.feedback.adminEmptyTitle")}
            description={t("dashboard.feedback.adminEmptyDescription")}
          />
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <>
            <DashboardTable>
              <thead>
                <tr>
                  <th>{t("dashboard.feedback.colUser")}</th>
                  <th>{t("dashboard.feedback.colRole")}</th>
                  <th>{t("dashboard.feedback.colType")}</th>
                  <th>{t("dashboard.feedback.colSubject")}</th>
                  <th>{t("dashboard.feedback.colStatus")}</th>
                  <th>{t("dashboard.feedback.colPriority")}</th>
                  <th>{t("dashboard.feedback.colDate")}</th>
                  <th>{t("dashboard.feedback.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="sa-feedback-user">
                        <strong>{row.userName}</strong>
                        <a href={`mailto:${row.userEmail}`}>{row.userEmail}</a>
                      </div>
                    </td>
                    <td>
                      <StatusBadge tone="neutral">{feedbackRoleLabel(row.userRole, locale)}</StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone="admin_assigned">{feedbackTypeLabel(row.type, locale)}</StatusBadge>
                    </td>
                    <td className="sa-feedback-subject">{row.subject}</td>
                    <td>
                      <StatusBadge tone={feedbackStatusTone(row.status)}>
                        {feedbackStatusLabel(row.status, locale)}
                      </StatusBadge>
                    </td>
                    <td>{feedbackPriorityLabel(row.priority, locale)}</td>
                    <td>{formatFeedbackDate(row.createdAt, locale)}</td>
                    <td>
                      <Link className="sa-feedback-link" to={`${DETAIL_BASE}/${row.id}`}>
                        {t("dashboard.feedback.viewDetails")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DashboardTable>
            {pagination.totalPages > 1 ? (
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={setPage}
                isLoading={loading}
              />
            ) : null}
          </>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
