import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { adminBreadcrumbs, superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  listSuperAdminFreelancerActivationRequestsRequest,
  getSuperAdminFreelancerActivationRequestRequest,
  approveSuperAdminFreelancerActivationRequestRequest,
  rejectSuperAdminFreelancerActivationRequestRequest,
  fetchSuperAdminFreelancerActivationKycFileBlob,
} from "../../services/api";
import { isAdminStaffShell, staffIdentityRequestsPath } from "../../lib/staff/staffDashboardPaths";
import { ADMIN_LIST_SEARCH_DEBOUNCE_MS } from "../../lib/staff/adminListLoad";
import { useAdminListLoad } from "../../hooks/useAdminListLoad";
import "./kycActivationReviewActions.css";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/activationResources";

function formatDate(value, locale) {
  if (!value) return "—";
  try {
    const tag = locale === "en" ? "en-JO-u-nu-latn" : "ar-JO-u-nu-latn";
    return new Date(value).toLocaleString(tag);
  } catch {
    return String(value);
  }
}

function kycImageErrorMessage(err, t) {
  if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError") {
    return "";
  }
  const status = err?.response?.status;
  if (status === 404) return t("activation.requests.kycNotFound");
  if (status === 401 || status === 403) return t("activation.requests.kycForbidden");
  if (status === 502 || status === 503) return t("activation.requests.kycLoadFailed");
  const fromApi = getSafeApiErrorMessage(err, "");
  if (fromApi && fromApi !== "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً.") {
    return fromApi;
  }
  if (status >= 400) return t("activation.requests.kycLoadFailed");
  return t("activation.requests.kycLoadFailed");
}

function KycImage({ requestId, side, label }) {
  const { t } = useTranslation();
  const [src, setSrc] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const controller = new AbortController();
    setSrc("");
    setErr("");
    (async () => {
      try {
        const blob = await fetchSuperAdminFreelancerActivationKycFileBlob(requestId, side, {
          signal: controller.signal,
        });
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setSrc(objectUrl);
      } catch (e) {
        if (!active || e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError") {
          return;
        }
        setErr(kycImageErrorMessage(e, t));
      }
    })();
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [requestId, side, t]);

  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>{label}</h3>
      {err ? <p style={{ color: "#b91c1c" }}>{err}</p> : null}
      {src ? (
        <img
          src={src}
          alt={label}
          style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
      ) : !err ? (
        <p style={{ color: "#6b7280" }}>{t("activation.requests.loading")}</p>
      ) : null}
    </div>
  );
}

function RequestDetail({ id, onBack }) {
  const { t, locale } = useTranslation();
  const statusLabels = useMemo(
    () => ({
      pending_review: t("activation.requests.statusLabels.pending_review"),
      approved: t("activation.requests.statusLabels.approved"),
      rejected: t("activation.requests.statusLabels.rejected"),
      draft: t("activation.requests.statusLabels.draft"),
      cancelled: t("activation.requests.statusLabels.cancelled"),
    }),
    [t],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSuperAdminFreelancerActivationRequestRequest(id);
      setPayload(res?.data ?? null);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("activation.requests.errLoadRequest"));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const request = payload?.request;
  const freelancer = payload?.freelancer;
  const pending = request?.status === "pending_review";

  const handleApprove = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await approveSuperAdminFreelancerActivationRequestRequest(id);
      await load();
    } catch (err) {
      setActionError(getSafeApiErrorMessage(err) || t("activation.requests.errApprove"));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!pending || busy) return;
    if (!String(rejectionReason || "").trim()) {
      setActionError(t("activation.requests.rejectReasonRequired"));
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      await rejectSuperAdminFreelancerActivationRequestRequest(id, {
        rejectionReason: rejectionReason.trim(),
        adminNotes: adminNotes.trim() || undefined,
      });
      await load();
    } catch (err) {
      setActionError(getSafeApiErrorMessage(err) || t("activation.requests.errReject"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <DashboardLoadingState />;
  if (error) return <DashboardErrorState message={error} onRetry={() => void load()} />;
  if (!request) return <DashboardEmptyState title={t("activation.requests.notFound")} />;

  return (
    <DashboardSection title={t("activation.requests.requestHeading", { id: request.id })}>
      <button type="button" className="oh-account-btn-ghost" onClick={onBack} style={{ marginBottom: 12 }}>
        {t("activation.requests.backToList")}
      </button>

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <div>
          <strong>{t("activation.requests.freelancer")}</strong> {freelancer?.name || "—"} ({freelancer?.email || "—"})
        </div>
        <div>
          <strong>{t("activation.requests.status")}</strong> {statusLabels[request.status] || request.status}
        </div>
        <div>
          <strong>{t("activation.requests.submittedAt")}</strong> {formatDate(request.submittedAt, locale)}
        </div>
        <div>
          <strong>{t("activation.requests.termsAccepted")}</strong> {formatDate(request.termsAcceptedAt, locale)} —{" "}
          {request.termsVersion || "—"}
        </div>
        {request.reviewedAt ? (
          <div>
            <strong>{t("activation.requests.reviewedAt")}</strong> {formatDate(request.reviewedAt, locale)}
          </div>
        ) : null}
        {request.rejectionReason ? (
          <div>
            <strong>{t("activation.requests.rejectionReason")}</strong> {request.rejectionReason}
          </div>
        ) : null}
        {request.adminNotes ? (
          <div>
            <strong>{t("activation.requests.adminNotes")}</strong> {request.adminNotes}
          </div>
        ) : null}
      </div>

      <KycImage requestId={request.id} side="front" label={t("activation.requests.idFront")} />
      <KycImage requestId={request.id} side="back" label={t("activation.requests.idBack")} />

      {pending ? (
        <div style={{ marginTop: 16, display: "grid", gap: 12, maxWidth: 520 }}>
          <label>
            {t("activation.requests.rejectReasonLabel")}
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              style={{ width: "100%", marginTop: 6 }}
              disabled={busy}
            />
          </label>
          <label>
            {t("activation.requests.adminNotesLabel")}
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={2}
              style={{ width: "100%", marginTop: 6 }}
              disabled={busy}
            />
          </label>
          {actionError ? <p style={{ color: "#b91c1c", margin: 0 }}>{actionError}</p> : null}
          <div className="kyc-review-actions">
            <button
              type="button"
              className="kyc-review-btn kyc-review-btn--approve"
              disabled={busy}
              onClick={() => void handleApprove()}
            >
              {t("activation.requests.approve")}
            </button>
            <button
              type="button"
              className="kyc-review-btn kyc-review-btn--reject"
              disabled={busy}
              onClick={() => void handleReject()}
            >
              {t("activation.requests.reject")}
            </button>
          </div>
        </div>
      ) : null}
    </DashboardSection>
  );
}

export default function SuperAdminFreelancerActivationRequestsPage() {
  const { t } = useTranslation();
  const statusLabels = useMemo(
    () => ({
      pending_review: t("activation.requests.statusLabels.pending_review"),
      approved: t("activation.requests.statusLabels.approved"),
      rejected: t("activation.requests.statusLabels.rejected"),
      draft: t("activation.requests.statusLabels.draft"),
      cancelled: t("activation.requests.statusLabels.cancelled"),
    }),
    [t],
  );
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const listBase = staffIdentityRequestsPath(pathname);
  const crumbs = isAdminStaffShell(pathname)
    ? adminBreadcrumbs("dashboard.breadcrumbs.identityVerification")
    : superAdminBreadcrumbs("dashboard.breadcrumbs.freelancerActivationRequests");
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const itemsLenRef = useRef(0);
  itemsLenRef.current = items.length;
  const {
    initialLoading,
    refreshing,
    initialLoadError,
    refreshError,
    rateLimited,
    run: runListLoad,
  } = useAdminListLoad({
    mapError: (err) => getSafeApiErrorMessage(err) || t("activation.requests.errLoadList"),
  });

  useEffect(() => {
    const debounceTimer = setTimeout(() => setDebouncedSearch(searchInput.trim()), ADMIN_LIST_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceTimer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const result = await runListLoad(
      ({ signal }) =>
        listSuperAdminFreelancerActivationRequestsRequest(
          {
            status: statusFilter || undefined,
            search: debouncedSearch || undefined,
            limit: 50,
          },
          { signal },
        ),
      { hasExistingRows: itemsLenRef.current > 0 },
    );
    if (result.ok) {
      setItems(result.data?.data?.items || []);
    }
  }, [runListLoad, statusFilter, debouncedSearch]);

  useEffect(() => {
    if (id) return;
    void load();
  }, [id, load]);

  const controlsDisabled = refreshing || rateLimited;
  return (
    <DashboardShell>
      <DashboardPageHeader
        title={isAdminStaffShell(pathname) ? t("activation.requests.staffTitle") : t("activation.requests.title")}
        subtitle={t("activation.requests.subtitle")}
        crumbs={crumbs}
      />

      {id ? (
        <RequestDetail id={id} onBack={() => navigate(listBase)} />
      ) : (
        <DashboardSection title={t("activation.requests.listTitle")}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              disabled={controlsDisabled}
            >
              <option value="pending_review">{t("activation.requests.statusLabels.pending_review")}</option>
              <option value="approved">{t("activation.requests.statusLabels.approved")}</option>
              <option value="rejected">{t("activation.requests.statusLabels.rejected")}</option>
              <option value="">{t("activation.requests.filterAll")}</option>
            </select>
            <input
              type="search"
              placeholder={t("activation.requests.searchPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label={t("activation.requests.searchAria")}
              disabled={rateLimited}
              data-testid="admin-identity-search"
            />
            <button
              type="button"
              onClick={() => void load()}
              disabled={controlsDisabled || (initialLoading && items.length === 0)}
              data-testid="admin-identity-refresh"
            >
              {t("activation.requests.refresh")}
            </button>
            {refreshing ? (
              <span style={{ color: "#64748b", fontSize: "0.875rem" }} data-testid="admin-list-refreshing">
                {searchInput.trim() ? t("activation.requests.searching") : t("activation.requests.refreshing")}
              </span>
            ) : null}
            {rateLimited ? (
              <span style={{ color: "#b45309", fontSize: "0.875rem" }} data-testid="admin-list-rate-limit-cooldown">
                {t("activation.requests.softWait")}
              </span>
            ) : null}
          </div>

          {refreshError ? (
            <p
              role="status"
              data-testid="admin-list-refresh-soft-note"
              style={{ color: "#b45309", margin: "0 0 12px", fontSize: "0.9rem" }}
            >
              {refreshError}
            </p>
          ) : null}

          {initialLoading && items.length === 0 ? <DashboardLoadingState /> : null}
          {initialLoadError && items.length === 0 ? (
            <DashboardErrorState message={initialLoadError} onRetry={() => void load()} />
          ) : null}
          {!initialLoading && !initialLoadError && items.length === 0 ? (
            <DashboardEmptyState title={t("activation.requests.empty")} />
          ) : null}
          {items.length > 0 ? (
            <div style={{ overflowX: "auto" }} data-testid="admin-identity-table">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="right">{t("activation.requests.colFreelancer")}</th>
                    <th align="right">{t("activation.requests.colEmail")}</th>
                    <th align="right">{t("activation.requests.colStatus")}</th>
                    <th align="right">{t("activation.requests.colSubmitted")}</th>
                    <th align="right">{t("activation.requests.colReview")}</th>
                    <th align="right">{t("activation.requests.colAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.freelancerName || "—"}</td>
                      <td>{row.freelancerEmail || "—"}</td>
                      <td>{statusLabels[row.status] || row.status}</td>
                      <td>{formatDate(row.submittedAt)}</td>
                      <td>{formatDate(row.reviewedAt)}</td>
                      <td>
                        <Link to={`${listBase}/${row.id}`}>{t("activation.requests.view")}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </DashboardSection>
      )}
    </DashboardShell>
  );
}
