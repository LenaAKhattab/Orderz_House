import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { getOnboardingGettingStartedRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { resolveSafeInternalNavPath } from "../../utils/safeInternalNavPath";
import { useTranslation } from "../../i18n/LanguageProvider";
import "./freelancerGettingStarted.css";

export default function FreelancerGettingStartedPage() {
  const { t } = useTranslation();
  const gs = "dashboard.gettingStartedPage";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await getOnboardingGettingStartedRequest();
      setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t(`${gs}.loadError`));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell>
      <div className="fgs-page">
        <DashboardPageHeader
          className="fgs-page__header"
          title={t(`${gs}.title`)}
          description={t(`${gs}.description`)}
        />
        <DashboardSection className="fgs-page__section">
          {loading ? <DashboardLoadingState /> : null}
          {!loading && error ? <DashboardErrorState message={error} onRetry={load} /> : null}
          {!loading && !error && items.length === 0 ? (
            <DashboardEmptyState
              className="fgs-empty"
              title={t(`${gs}.emptyTitle`)}
              description={t(`${gs}.emptyDescription`)}
            />
          ) : null}
          {!loading && !error && items.length > 0 ? (
            <div className="fgs-list">
              {items.map((item) => {
                const inner = (
                  <>
                    <h2 className="fgs-card__title">{item.title}</h2>
                    <p className="fgs-card__body">{item.body}</p>
                  </>
                );
                const safeCta = resolveSafeInternalNavPath(item.ctaUrl, "");
                if (safeCta) {
                  return (
                    <Link key={item.id ?? item.title} className="fgs-card" to={safeCta}>
                      {inner}
                    </Link>
                  );
                }
                return (
                  <article key={item.id ?? item.title} className="fgs-card">
                    {inner}
                  </article>
                );
              })}
            </div>
          ) : null}
        </DashboardSection>
      </div>
    </DashboardShell>
  );
}
