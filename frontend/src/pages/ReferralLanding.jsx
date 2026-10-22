import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "../i18n/LanguageProvider";
import "../i18n/referralsResources";
import { captureReferralRequest } from "../services/referralsApi";

export default function ReferralLanding() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await captureReferralRequest({
          code,
          utmSource: params.get("utm_source"),
          utmMedium: params.get("utm_medium"),
          utmCampaign: params.get("utm_campaign"),
        });
        sessionStorage.setItem("oh_ref_prefill", String(code || "").toUpperCase());
        if (!cancelled) navigate("/register", { replace: true });
      } catch {
        if (!cancelled) setInvalid(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, navigate, params]);

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <p>{invalid ? t("referrals.landing.invalid") : t("referrals.landing.working")}</p>
    </main>
  );
}
