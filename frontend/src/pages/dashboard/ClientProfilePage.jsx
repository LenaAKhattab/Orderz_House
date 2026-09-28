import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { getProfileMeRequest } from "../../services/api";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import { fullNameAr } from "../../utils/accountDisplay";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/clientAreaResources";
import "../../styles/dashboardHub.css";
import "./shared/account-pages.css";

export default function ClientProfilePage() {
  const { user: authUser } = useAuth();
  const { dir, t } = useTranslation();
  const p = "clientArea.profile";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getProfileMeRequest();
      setPayload(data?.data || null);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || t(`${p}.loadError`));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const user = payload?.user || authUser;
  const stats = payload?.stats || {};

  const displayName = useMemo(() => fullNameAr(user) || user?.email || "", [user]);

  if (loading) {
    return (
      <DashboardHubPage className="fdash-page--account">
        <div className="oh-account-page" dir={dir}>
          <div className="oh-account-hero">
            <div className="oh-account-skel" style={{ height: 14, width: "40%" }} />
            <div className="oh-account-skel" style={{ height: 32, width: "55%" }} />
          </div>
          <div className="oh-account-skel" style={{ height: 200, borderRadius: 18 }} />
        </div>
      </DashboardHubPage>
    );
  }

  if (error) {
    return (
      <DashboardHubPage className="fdash-page--account">
        <div className="oh-account-page" dir={dir}>
          <div className="oh-account-card">
            <p className="oh-account-error" style={{ margin: 0 }}>
              {error}
            </p>
            <button type="button" className="oh-account-btn-primary" style={{ marginTop: 12 }} onClick={load}>
              {t("clientArea.common.retry")}
            </button>
          </div>
        </div>
      </DashboardHubPage>
    );
  }

  return (
    <DashboardHubPage className="fdash-page--account">
    <div className="oh-account-page" dir={dir}>
      <div className="oh-account-hero">
        <p className="oh-account-hero__kicker">{t(`${p}.kicker`)}</p>
        <h1 className="oh-account-hero__title">{t(`${p}.title`)}</h1>
        <p className="oh-account-hero__lead">{t(`${p}.lead`)}</p>
      </div>

      <div className="oh-account-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div className="oh-account-avatar-row">
            {user?.avatarUrl ? (
              <img className="oh-account-avatar-preview" src={user.avatarUrl} alt="" />
            ) : (
              <div className="oh-account-avatar-placeholder" aria-hidden>
                {(user?.firstName || user?.email || "U").trim().slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="oh-account-card__title" style={{ marginBottom: 4 }}>
                {displayName}
              </h2>
              <span className="oh-account-pill">{t(`${p}.roleClient`)}</span>
            </div>
          </div>
          <Link className="oh-account-btn-primary" to="/dashboard/client/settings">
            {t(`${p}.edit`)}
          </Link>
        </div>
        <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
          <div>
            <span className="oh-account-label">{t(`${p}.email`)}</span>
            <p className="oh-account-value">{user?.email || "—"}</p>
          </div>
          <div>
            <span className="oh-account-label">{t(`${p}.phone`)}</span>
            <p className="oh-account-value">{user?.phone || "—"}</p>
          </div>
        </div>
      </div>

      <div className="oh-account-card" style={{ marginTop: 16 }}>
        <h3 className="oh-account-card__title">{t(`${p}.ordersSummary`)}</h3>
        <div className="oh-account-stats">
          <div className="oh-account-stat">
            <p className="oh-account-stat__label">{t(`${p}.ordersCreated`)}</p>
            <p className="oh-account-stat__value">{stats.ordersCreated ?? 0}</p>
          </div>
          <div className="oh-account-stat">
            <p className="oh-account-stat__label">{t(`${p}.active`)}</p>
            <p className="oh-account-stat__value">{stats.activeOrders ?? 0}</p>
          </div>
          <div className="oh-account-stat">
            <p className="oh-account-stat__label">{t(`${p}.completed`)}</p>
            <p className="oh-account-stat__value">{stats.completedOrders ?? 0}</p>
          </div>
        </div>
        <p className="oh-account-value" style={{ marginTop: 12, fontSize: "0.85rem", color: "#6b7280" }}>
          {t(`${p}.paymentsNote`)}
        </p>
      </div>
    </div>
    </DashboardHubPage>
  );
}
