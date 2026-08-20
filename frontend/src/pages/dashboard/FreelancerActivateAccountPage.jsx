import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { breadcrumbHomeCrumb } from "../../components/dashboard/dashboardBreadcrumbs";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import FreelancerActivationPolicyPanel from "../../components/dashboard/FreelancerActivationPolicyPanel";
import {
  getFreelancerAccountActivationRequest,
  submitFreelancerAccountActivationRequest,
} from "../../services/api";
import { invalidateFreelancerSessionCache } from "../../services/freelancerSessionCache";
import "./shared/account-pages.css";

function FileField({ id, label, file, onChange, disabled, accept }) {
  return (
    <label className="oh-account-label" htmlFor={id} style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", marginBottom: 6 }}>{label}</span>
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
      {file ? (
        <span className="oh-account-value" style={{ display: "block", marginTop: 4, fontSize: 13 }}>
          {file.name}
        </span>
      ) : null}
    </label>
  );
}

export default function FreelancerActivateAccountPage() {
  const { t, dir } = useTranslation();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [idFront, setIdFront] = useState(null);
  const [idBack, setIdBack] = useState(null);
  const [agreed, setAgreed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getFreelancerAccountActivationRequest();
      setStatus(res?.data ?? null);
    } catch (err) {
      setError(err?.response?.data?.message || t("freelancerDashboard.activateAccount.loadError"));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const isApproved = Boolean(status?.isCompanyApproved);
  const requestStatus = String(status?.request?.status || "");
  const isPending = requestStatus === "pending_review";
  const isRejected = requestStatus === "rejected" || status?.activationStatus === "company_rejected";
  const canSubmit = Boolean(status?.canSubmit || status?.canResubmit) && !isApproved && !isPending;

  const handleSubmit = async () => {
    if (busy || !canSubmit) return;
    if (!idFront || !idBack) {
      toast.error(t("freelancerDashboard.activateAccount.kyc.filesRequired"));
      return;
    }
    if (!agreed) {
      toast.error(t("freelancerDashboard.activateAccount.kyc.termsRequired"));
      return;
    }
    setBusy(true);
    try {
      await submitFreelancerAccountActivationRequest({
        idFront,
        idBack,
        termsAccepted: true,
        termsVersion: status?.termsVersion,
      });
      invalidateFreelancerSessionCache();
      toast.success(t("freelancerDashboard.activateAccount.kyc.submitSuccess"));
      setIdFront(null);
      setIdBack(null);
      setAgreed(false);
      await load();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || t("freelancerDashboard.activateAccount.errorTitle"),
      );
    } finally {
      setBusy(false);
    }
  };

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
        title={t("freelancerDashboard.activateAccount.kyc.pageTitle")}
        subtitle={t("freelancerDashboard.activateAccount.kyc.pageSubtitle")}
        crumbs={[
          breadcrumbHomeCrumb(t),
          { label: t("freelancerDashboard.activateAccount.kyc.pageTitle") },
        ]}
      />

      <section className="oh-account-card" style={{ marginTop: 16 }}>
        {error ? (
          <>
            <p className="oh-account-error" style={{ margin: 0 }}>
              {error}
            </p>
            <button
              type="button"
              className="oh-account-btn-primary"
              style={{ marginTop: 12 }}
              onClick={() => void load()}
            >
              {t("freelancerDashboard.common.retry")}
            </button>
          </>
        ) : isApproved ? (
          <>
            <h2 className="oh-account-card__title">
              {t("freelancerDashboard.activateAccount.kyc.approvedTitle")}
            </h2>
            <p className="oh-account-value" style={{ marginBottom: 16, color: "#4b5563" }}>
              {t("freelancerDashboard.activateAccount.alreadyActiveMessage")}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Link className="oh-account-btn-primary" to="/dashboard/freelancer">
                {t("freelancerDashboard.activateAccount.kyc.goDashboard")}
              </Link>
              <Link className="oh-account-btn-ghost" to="/dashboard/freelancer/articles">
                {t("freelancerDashboard.activateAccount.kyc.goArticles")}
              </Link>
            </div>
          </>
        ) : isPending ? (
          <>
            <h2 className="oh-account-card__title">
              {t("freelancerDashboard.activateAccount.kyc.pendingTitle")}
            </h2>
            <p className="oh-account-value" style={{ marginBottom: 8, color: "#4b5563" }}>
              {t("freelancerDashboard.activateAccount.kyc.pendingBody")}
            </p>
            <p className="oh-account-value" style={{ color: "#6b7280", fontSize: 14 }}>
              {status?.messageAr || ""}
            </p>
          </>
        ) : (
          <>
            <h2 className="oh-account-card__title">
              {isRejected
                ? t("freelancerDashboard.activateAccount.kyc.rejectedTitle")
                : t("freelancerDashboard.activateAccount.kyc.pageTitle")}
            </h2>
            <p className="oh-account-value" style={{ marginBottom: 8, color: "#4b5563" }}>
              {t("freelancerDashboard.activateAccount.kyc.uploadHint")}
            </p>
            <p className="oh-account-value" style={{ marginBottom: 16, color: "#6b7280", fontSize: 14 }}>
              {t("freelancerDashboard.activateAccount.kyc.notImmediate")}
            </p>

            {isRejected && status?.request?.rejectionReason ? (
              <div
                className="oh-account-error"
                style={{ marginBottom: 16, padding: 12, borderRadius: 8 }}
                role="status"
              >
                <strong>{t("freelancerDashboard.activateAccount.kyc.rejectionReasonLabel")}</strong>
                <p style={{ margin: "8px 0 0" }}>{status.request.rejectionReason}</p>
              </div>
            ) : null}

            <FileField
              id="kyc-id-front"
              label={t("freelancerDashboard.activateAccount.kyc.idFront")}
              file={idFront}
              onChange={setIdFront}
              disabled={busy}
              accept="image/jpeg,image/png,image/webp"
            />
            <FileField
              id="kyc-id-back"
              label={t("freelancerDashboard.activateAccount.kyc.idBack")}
              file={idBack}
              onChange={setIdBack}
              disabled={busy}
              accept="image/jpeg,image/png,image/webp"
            />

            <FreelancerActivationPolicyPanel />

            <label className="oh-activate-terms-check" style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <input
                type="checkbox"
                checked={agreed}
                disabled={busy}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>{t("freelancerDashboard.activateAccount.kyc.termsCheckbox")}</span>
            </label>

            <button
              type="button"
              className="oh-account-btn-primary"
              style={{ marginTop: 16 }}
              disabled={busy || !canSubmit || !idFront || !idBack || !agreed}
              onClick={() => void handleSubmit()}
            >
              {busy
                ? t("freelancerDashboard.activateAccount.activating")
                : isRejected
                  ? t("freelancerDashboard.activateAccount.kyc.resubmitCta")
                  : t("freelancerDashboard.activateAccount.kyc.submitCta")}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
