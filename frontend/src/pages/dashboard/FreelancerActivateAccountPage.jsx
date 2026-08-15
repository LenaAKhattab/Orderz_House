import { useCallback, useEffect, useState } from "react";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { breadcrumbHomeCrumb } from "../../components/dashboard/dashboardBreadcrumbs";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  getMySubscriptionRequest,
  getPublicSitePageBySlugRequest,
  selfActivateFreelancerAccountRequest,
} from "../../services/api";
import { invalidateFreelancerSessionCache } from "../../services/freelancerSessionCache";
import { formatJoDateMedium } from "../../utils/freelancerDashboardData";
import "./shared/account-pages.css";

function activationLabel(status, t) {
  const s = String(status || "");
  if (s === "company_approved") return t("freelancerDashboard.activateAccount.status.approved");
  if (s === "company_pending") return t("freelancerDashboard.activateAccount.status.pending");
  return s || t("freelancerDashboard.common.emDash");
}

function subscriptionStatusLabel(status, t) {
  if (status === "active") return t("freelancerDashboard.status.subscription.active");
  if (status === "assigned_not_started") {
    return t("freelancerDashboard.status.subscription.assignedNotStarted");
  }
  if (status === "expired") return t("freelancerDashboard.status.subscription.expired");
  if (status === "inactive") return t("freelancerDashboard.status.subscription.inactive");
  return status || t("freelancerDashboard.common.emDash");
}

function renderTermsBlock(block, index) {
  const trimmed = String(block || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("## ")) {
    return (
      <h4 key={index} className="oh-activate-terms__heading">
        {trimmed.slice(3).trim()}
      </h4>
    );
  }
  return (
    <p key={index} className="oh-activate-terms__para">
      {trimmed}
    </p>
  );
}

function ActivateTermsModal({
  open,
  busy,
  dir,
  t,
  agreed,
  onAgreedChange,
  onClose,
  onConfirm,
  termsTitle,
  termsBlocks,
  termsLoading,
  termsError,
}) {
  if (!open) return null;

  return (
    <div
      role="presentation"
      className="oh-activate-terms-overlay"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="oh-activate-terms-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activate-terms-title"
        dir={dir}
        onMouseDown={(ev) => ev.stopPropagation()}
      >
        <h3 id="activate-terms-title" className="oh-activate-terms-modal__title">
          {t("freelancerDashboard.activateAccount.termsModalTitle")}
        </h3>

        <div className="oh-activate-terms-panel" tabIndex={0}>
          {termsLoading ? (
            <p className="oh-account-value">{t("freelancerDashboard.common.loading")}</p>
          ) : (
            <>
              {termsError ? (
                <p className="oh-account-error" style={{ margin: "0 0 10px" }}>
                  {termsError}
                </p>
              ) : null}
              {termsTitle ? <h4 className="oh-activate-terms__doc-title">{termsTitle}</h4> : null}
              {termsBlocks.length > 0 ? (
                termsBlocks.map(renderTermsBlock)
              ) : (
                <p className="oh-activate-terms__para">
                  {t("freelancerDashboard.activateAccount.termsFallback")}
                </p>
              )}
            </>
          )}
        </div>

        <label className="oh-activate-terms-check">
          <input
            type="checkbox"
            checked={agreed}
            disabled={busy}
            onChange={(e) => onAgreedChange(e.target.checked)}
          />
          <span>{t("freelancerDashboard.activateAccount.agreeCheckbox")}</span>
        </label>

        <div className="oh-activate-terms-actions">
          <button
            type="button"
            className="oh-account-btn-primary"
            disabled={busy || !agreed}
            onClick={() => void onConfirm()}
          >
            {busy
              ? t("freelancerDashboard.activateAccount.activating")
              : t("freelancerDashboard.activateAccount.cta")}
          </button>
          <button
            type="button"
            className="oh-account-btn-ghost"
            disabled={busy}
            onClick={onClose}
          >
            {t("freelancerDashboard.common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FreelancerActivateAccountPage() {
  const { t, dir } = useTranslation();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [subscription, setSubscription] = useState(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [termsLoading, setTermsLoading] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [termsTitle, setTermsTitle] = useState("");
  const [termsBlocks, setTermsBlocks] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getMySubscriptionRequest();
      setSubscription(res?.data?.subscription ?? null);
    } catch (err) {
      setError(err?.response?.data?.message || t("freelancerDashboard.activateAccount.loadError"));
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const isActive =
    String(subscription?.activationStatus || "") === "company_approved" &&
    String(subscription?.status || "") === "active" &&
    Boolean(subscription?.actualStartDate || subscription?.actual_start_date);

  const openTermsModal = async () => {
    if (busy || isActive) return;
    setAgreed(false);
    setTermsOpen(true);
    setTermsLoading(true);
    setTermsError("");
    try {
      const res = await getPublicSitePageBySlugRequest("terms-conditions");
      const page = res?.data?.page || null;
      const content = String(page?.content || "").trim();
      setTermsTitle(String(page?.title || "").trim());
      setTermsBlocks(content ? content.split(/\n\n+/) : []);
    } catch (err) {
      setTermsTitle("");
      setTermsBlocks([]);
      setTermsError(
        err?.response?.data?.message || t("freelancerDashboard.activateAccount.termsLoadError"),
      );
    } finally {
      setTermsLoading(false);
    }
  };

  const closeTermsModal = () => {
    if (busy) return;
    setTermsOpen(false);
    setAgreed(false);
  };

  const handleActivate = async () => {
    if (busy || isActive || !agreed) return;
    setBusy(true);
    try {
      const res = await selfActivateFreelancerAccountRequest();
      const next = res?.data?.subscription ?? null;
      if (next) setSubscription(next);
      invalidateFreelancerSessionCache();
      const marketplace = res?.data?.marketplace;
      let successMsg = res?.data?.alreadyActive
        ? t("freelancerDashboard.activateAccount.alreadyActiveMessage")
        : t("freelancerDashboard.activateAccount.successMessage");
      if (marketplace?.grantedStarter) {
        successMsg = t("freelancerDashboard.activateAccount.successWithStarter");
      } else if (marketplace?.keptExisting) {
        successMsg = t("freelancerDashboard.activateAccount.successKeptMembership");
      }
      toast.success(successMsg);
      setTermsOpen(false);
      setAgreed(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || t("freelancerDashboard.activateAccount.errorTitle"));
    } finally {
      setBusy(false);
    }
  };

  // Users who activated before marketplace linking: sync STARTER once without changing paid plans.
  useEffect(() => {
    if (loading || !subscription || !isActive) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await selfActivateFreelancerAccountRequest();
        if (cancelled) return;
        invalidateFreelancerSessionCache();
        if (res?.data?.marketplace?.grantedStarter) {
          toast.success(t("freelancerDashboard.activateAccount.successWithStarter"));
        }
      } catch {
        /* keep page usable; activation already done */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally once when becoming active on this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isActive, subscription?.id]);

  const startDate = subscription?.actualStartDate || subscription?.actual_start_date;
  const expiryDate = subscription?.expiryDate || subscription?.expiry_date;

  if (loading) {
    return (
      <div className="oh-account-page" dir={dir}>
        <div className="oh-account-hero">
          <div className="oh-account-skel" style={{ height: 28, width: "50%" }} />
        </div>
        <div className="oh-account-card">
          <div className="oh-account-skel" style={{ height: 180 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="oh-account-page" dir={dir}>
      <DashboardPageHeader
        title={t("freelancerDashboard.activateAccount.title")}
        subtitle={t("freelancerDashboard.activateAccount.subtitle")}
        crumbs={[
          breadcrumbHomeCrumb(t),
          { label: t("freelancerDashboard.activateAccount.title") },
        ]}
      />

      <section className="oh-account-card" style={{ marginTop: 16 }}>
        {error ? (
          <>
            <p className="oh-account-error" style={{ margin: 0 }}>
              {error}
            </p>
            <button type="button" className="oh-account-btn-primary" style={{ marginTop: 12 }} onClick={() => void load()}>
              {t("freelancerDashboard.common.retry")}
            </button>
          </>
        ) : (
          <>
            <h2 className="oh-account-card__title">{t("freelancerDashboard.activateAccount.cardTitle")}</h2>
            <div className="oh-account-stats" style={{ marginBottom: 16 }}>
              <div>
                <span className="oh-account-label">{t("freelancerDashboard.activateAccount.fields.activation")}</span>
                <p className="oh-account-value">{activationLabel(subscription?.activationStatus, t)}</p>
              </div>
              <div>
                <span className="oh-account-label">{t("freelancerDashboard.activateAccount.fields.subscription")}</span>
                <p className="oh-account-value">{subscriptionStatusLabel(subscription?.status, t)}</p>
              </div>
              <div>
                <span className="oh-account-label">{t("freelancerDashboard.activateAccount.fields.startedAt")}</span>
                <p className="oh-account-value">
                  {startDate ? formatJoDateMedium(startDate) : t("freelancerDashboard.common.emDash")}
                </p>
              </div>
              <div>
                <span className="oh-account-label">{t("freelancerDashboard.activateAccount.fields.expiresAt")}</span>
                <p className="oh-account-value">
                  {expiryDate ? formatJoDateMedium(expiryDate) : t("freelancerDashboard.common.emDash")}
                </p>
              </div>
            </div>

            <p className="oh-account-value" style={{ marginBottom: 16, color: "#4b5563" }}>
              {isActive
                ? t("freelancerDashboard.activateAccount.alreadyActiveMessage")
                : t("freelancerDashboard.activateAccount.hint")}
            </p>

            <button
              type="button"
              className="oh-account-btn-primary"
              disabled={busy || isActive}
              onClick={() => void openTermsModal()}
            >
              {isActive
                ? t("freelancerDashboard.activateAccount.activated")
                : t("freelancerDashboard.activateAccount.cta")}
            </button>
          </>
        )}
      </section>

      <ActivateTermsModal
        open={termsOpen}
        busy={busy}
        dir={dir}
        t={t}
        agreed={agreed}
        onAgreedChange={setAgreed}
        onClose={closeTermsModal}
        onConfirm={handleActivate}
        termsTitle={termsTitle}
        termsBlocks={termsBlocks}
        termsLoading={termsLoading}
        termsError={termsError}
      />
    </div>
  );
}
