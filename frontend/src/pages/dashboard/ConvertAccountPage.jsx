import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { breadcrumbHomeCrumb } from "../../components/dashboard/dashboardBreadcrumbs";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  convertAccountRoleRequest,
  getRoleConversionEligibilityRequest,
} from "../../services/api";
import { invalidateFreelancerSessionCache } from "../../services/freelancerSessionCache";
import "./shared/account-pages.css";

export default function ConvertAccountPage() {
  const { t, dir } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const role = user?.primaryRole || user?.role;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [eligibility, setEligibility] = useState(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [agreed, setAgreed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getRoleConversionEligibilityRequest();
      setEligibility(res?.data || null);
    } catch (err) {
      setEligibility(null);
      setError(err?.response?.data?.message || t("dashboard.convertAccount.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const fromRole = eligibility?.fromRole || role;
  const toRole = eligibility?.toRole;
  const canConvert = Boolean(eligibility?.canConvert);

  const handleConvert = async () => {
    if (busy || !canConvert || !agreed) return;
    setBusy(true);
    try {
      const res = await convertAccountRoleRequest({
        currentPassword: password,
        confirmation,
      });
      invalidateFreelancerSessionCache();
      toast.success(res?.message || t("dashboard.convertAccount.success"));
      logout();
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || t("dashboard.convertAccount.error"));
    } finally {
      setBusy(false);
    }
  };

  const fromLabel =
    fromRole === "freelancer"
      ? t("dashboard.roles.freelancer")
      : fromRole === "client"
        ? t("dashboard.roles.client")
        : fromRole || "—";
  const toLabel =
    toRole === "freelancer"
      ? t("dashboard.roles.freelancer")
      : toRole === "client"
        ? t("dashboard.roles.client")
        : "—";

  return (
    <div className="oh-account-page" dir={dir}>
      <DashboardPageHeader
        title={t("dashboard.convertAccount.title")}
        subtitle={t("dashboard.convertAccount.subtitle")}
        crumbs={[
          breadcrumbHomeCrumb(t),
          { label: t("dashboard.convertAccount.title") },
        ]}
      />

      <section className="oh-account-card" style={{ marginTop: 16 }}>
        {loading ? (
          <div className="oh-account-skel" style={{ height: 160 }} />
        ) : error ? (
          <>
            <p className="oh-account-error" style={{ margin: 0 }}>
              {error}
            </p>
            <button type="button" className="oh-account-btn-primary" style={{ marginTop: 12 }} onClick={() => void load()}>
              {t("dashboard.convertAccount.retry")}
            </button>
          </>
        ) : (
          <>
            <h2 className="oh-account-card__title">{t("dashboard.convertAccount.cardTitle")}</h2>
            <p className="oh-account-value" style={{ color: "#4b5563", marginBottom: 12 }}>
              {t("dashboard.convertAccount.direction", { from: fromLabel, to: toLabel })}
            </p>
            <ul className="oh-account-value" style={{ margin: "0 0 16px", paddingInlineStart: 18, color: "#4b5563" }}>
              <li>{t("dashboard.convertAccount.ruleOnce")}</li>
              <li>{t("dashboard.convertAccount.ruleWipe")}</li>
              <li>{t("dashboard.convertAccount.ruleRelogin")}</li>
            </ul>

            {!canConvert ? (
              <p className="oh-account-error" style={{ margin: 0 }}>
                {eligibility?.alreadyConverted
                  ? t("dashboard.convertAccount.alreadyConverted")
                  : t("dashboard.convertAccount.notAllowed")}
              </p>
            ) : (
              <>
                <label className="oh-account-label" htmlFor="convert-password">
                  {t("dashboard.convertAccount.password")}
                </label>
                <input
                  id="convert-password"
                  type="password"
                  className="oh-account-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={busy}
                />

                <label className="oh-account-label" htmlFor="convert-confirm" style={{ marginTop: 12 }}>
                  {t("dashboard.convertAccount.confirmationLabel")}
                </label>
                <input
                  id="convert-confirm"
                  type="text"
                  className="oh-account-input"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder={t("dashboard.convertAccount.confirmationPlaceholder")}
                  disabled={busy}
                />

                <label className="oh-activate-terms-check" style={{ marginTop: 14 }}>
                  <input
                    type="checkbox"
                    checked={agreed}
                    disabled={busy}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  <span>{t("dashboard.convertAccount.agreeCheckbox")}</span>
                </label>

                <div style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className="oh-account-btn-primary"
                    disabled={busy || !agreed || !password || !confirmation}
                    onClick={() => void handleConvert()}
                  >
                    {busy ? t("dashboard.convertAccount.converting") : t("dashboard.convertAccount.cta")}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
