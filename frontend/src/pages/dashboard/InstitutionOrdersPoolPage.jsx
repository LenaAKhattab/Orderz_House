import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import { getInstitutionMembershipRequest, getInstitutionPoolOrdersRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";

export default function InstitutionOrdersPoolPage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const [membershipChecked, setMembershipChecked] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getInstitutionMembershipRequest();
        if (!cancelled) {
          setIsMember(Boolean(res?.data?.isMember));
          setMembershipChecked(true);
        }
      } catch (e) {
        if (!cancelled) {
          setIsMember(false);
          setMembershipChecked(true);
          setError(getSafeApiErrorMessage(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (!isMember) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getInstitutionPoolOrdersRequest({ page, limit: 20, q });
      setOrders(res?.data?.orders || []);
      setPagination(res?.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (e) {
      const status = e?.response?.status;
      if (status === 403) {
        setIsMember(false);
        setError(t("dashboard.institutionPool.forbidden"));
      } else {
        setError(getSafeApiErrorMessage(e));
        push({ type: "error", message: getSafeApiErrorMessage(e) });
      }
    } finally {
      setLoading(false);
    }
  }, [isMember, page, q, push, t]);

  useEffect(() => {
    if (!membershipChecked) return;
    if (!isMember) {
      setLoading(false);
      return;
    }
    void load();
  }, [membershipChecked, isMember, load]);

  if (!membershipChecked) {
    return (
      <DashboardShell>
        <DashboardLoadingState label={t("dashboard.institutionPool.loading")} />
      </DashboardShell>
    );
  }

  if (!isMember) {
    return (
      <DashboardShell>
        <DashboardPageHeader
          title={t("dashboard.institutionPool.title")}
          description={t("dashboard.institutionPool.description")}
        />
        <DashboardSection title={t("dashboard.institutionPool.title")}>
          <p role="alert">{error || t("dashboard.institutionPool.forbidden")}</p>
        </DashboardSection>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("dashboard.institutionPool.title")}
        description={t("dashboard.institutionPool.description")}
      />

      <DashboardSection title={t("dashboard.institutionPool.listTitle")}>
        <p style={{ marginBottom: 12 }}>{t("dashboard.institutionPool.privateNotice")}</p>
        <form
          style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQ(searchInput.trim());
          }}
        >
          <label className="visually-hidden" htmlFor="institution-pool-search">
            {t("dashboard.institutionPool.search")}
          </label>
          <input
            id="institution-pool-search"
            className="input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("dashboard.institutionPool.searchPlaceholder")}
          />
          <button type="submit" className="btn btn-secondary">
            {t("dashboard.institutionPool.search")}
          </button>
        </form>

        {loading ? (
          <DashboardLoadingState label={t("dashboard.institutionPool.loading")} />
        ) : error ? (
          <div>
            <p role="alert">{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              {t("dashboard.institutionPool.retry")}
            </button>
          </div>
        ) : orders.length === 0 ? (
          <DashboardEmptyState
            title={t("dashboard.institutionPool.empty")}
            icon={<Building2 size={40} strokeWidth={1.5} aria-hidden />}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("dashboard.institutionPool.orderTitle")}</th>
                    <th>{t("dashboard.institutionPool.budget")}</th>
                    <th>{t("dashboard.institutionPool.status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>{o.title}</td>
                      <td>
                        {o.projectType === "bidding"
                          ? `${o.bidBudgetMin ?? "—"} – ${o.bidBudgetMax ?? "—"}`
                          : o.budget ?? "—"}
                      </td>
                      <td>{o.orderStatus}</td>
                      <td>
                        <Link to={`/dashboard/freelancer/orders/${o.id}`} className="btn btn-primary">
                          {t("dashboard.institutionPool.open")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination.totalPages > 1 ? (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("dashboard.institutionPool.prevPage")}
                </button>
                <span>
                  {page} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("dashboard.institutionPool.nextPage")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </DashboardSection>
    </DashboardShell>
  );
}
