import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getPostAuthHomePath } from "../constants/dashboardPermissions";
import { useTranslation } from "../i18n/LanguageProvider";
import "../i18n/referralsResources";
import { captureReferralRequest } from "../services/referralsApi";

export default function ReferralLanding() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [state, setState] = useState("working");

  useEffect(() => {
    // Existing accounts are never re-attributed; skip tracking for signed-in visitors.
    if (loading || user) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await captureReferralRequest({
          code,
          utmSource: params.get("utm_source"),
          utmMedium: params.get("utm_medium"),
          utmCampaign: params.get("utm_campaign"),
        });
        if (cancelled) return;
        if (!res.data?.data?.programEnabled) {
          setState("disabled");
          return;
        }
        try {
          sessionStorage.setItem("oh_ref_prefill", String(code || "").toUpperCase());
        } catch {
          /* storage unavailable */
        }
        navigate("/register", { replace: true });
      } catch {
        if (!cancelled) setState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, navigate, params, loading, user]);

  if (!loading && user) return <Navigate to={getPostAuthHomePath(user)} replace />;

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <p>{t(`referrals.landing.${state}`)}</p>
      {state !== "working" ? (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link className="btn btn-primary" to="/register">
            {t("referrals.landing.continue")}
          </Link>
          <Link className="btn btn-secondary" to="/">
            {t("referrals.landing.home")}
          </Link>
        </div>
      ) : null}
    </main>
  );
}
