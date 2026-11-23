import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, PackageCheck } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useTranslation } from "../i18n/LanguageProvider";
import "../i18n/smartOrdersResources";
import "../styles/smartOrders.css";
import { claimOrderRequest, previewOrderClaimRequest } from "../services/api";
import { getSafeApiErrorMessage } from "../utils/apiErrorMessage";
import {
  clearPendingOrderClaim,
  readPendingOrderClaim,
  storePendingOrderClaim,
} from "../lib/orders/pendingOrderClaim";

const CLIENT_ORDERS_PATH = "/dashboard/client/my-orders";

/**
 * Smart Orders S1 — customer redeems the one-time link the Admin sent (WhatsApp). The token travels in
 * the URL fragment (never sent to servers by the browser), is kept in sessionStorage across sign-in /
 * registration, and is redeemed only by an authenticated, verified customer account.
 */
export default function ClaimOrderPage() {
  const { t, dir, locale } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(null);
  const [preview, setPreview] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | invalid | claiming | done
  const [error, setError] = useState("");
  const [claimed, setClaimed] = useState(null);

  useEffect(() => {
    const m = /(?:^#|&)t=([A-Za-z0-9_-]{43})(?:&|$)/.exec(location.hash || "");
    if (m) {
      storePendingOrderClaim(m[1]);
      // Drop the token from the address bar / history.
      window.history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
    const tk = m ? m[1] : readPendingOrderClaim();
    setToken(tk);
    if (!tk) {
      setState("invalid");
      return undefined;
    }
    let cancelled = false;
    previewOrderClaimRequest(tk)
      .then((res) => {
        if (cancelled) return;
        setPreview(res?.data?.claim || null);
        setState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        clearPendingOrderClaim();
        setState("invalid");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read the fragment once on entry
  }, []);

  const role = user?.primaryRole || user?.role;
  const isClient = role === "client";

  const claim = async () => {
    if (!token) return;
    setState("claiming");
    setError("");
    try {
      const res = await claimOrderRequest(token);
      clearPendingOrderClaim();
      setClaimed(res?.data || null);
      setState("done");
    } catch (e) {
      setError(getSafeApiErrorMessage(e));
      setState("ready");
    }
  };

  const service = preview ? (locale === "ar" ? preview.serviceName : preview.serviceNameEn || preview.serviceName) : null;
  const fromState = { from: { pathname: "/claim-order" } };

  return (
    <main className="claim-order-page" dir={dir} data-testid="claim-order-page">
      <section className="claim-order-card">
        <div className="claim-order-card__icon" aria-hidden="true">
          {state === "done" ? <CheckCircle2 size={36} /> : <PackageCheck size={36} />}
        </div>
        <h1>{state === "done" ? t("smartOrders.claim.successTitle") : t("smartOrders.claim.title")}</h1>

        {state === "loading" ? <p className="help">{t("smartOrders.claim.loading")}</p> : null}
        {state === "invalid" ? (
          <p className="oh-inline-alert" role="alert" data-testid="claim-order-invalid">
            {t("smartOrders.claim.invalid")}
          </p>
        ) : null}

        {(state === "ready" || state === "claiming") && preview ? (
          <>
            <dl className="claim-order-card__facts">
              <div>
                <dt>{t("smartOrders.claim.orderLabel")}</dt>
                <dd dir="ltr" data-testid="claim-order-code">
                  {preview.orderCode}
                </dd>
              </div>
              {service ? (
                <div>
                  <dt>{t("smartOrders.claim.serviceLabel")}</dt>
                  <dd>{service}</dd>
                </div>
              ) : null}
            </dl>
            {authLoading ? null : !user ? (
              <>
                <p>{t("smartOrders.claim.intro")}</p>
                <div className="claim-order-card__actions">
                  <button type="button" className="btn btn-primary" onClick={() => navigate("/login", { state: fromState })}>
                    {t("smartOrders.claim.loginCta")}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => navigate("/register", { state: fromState })}>
                    {t("smartOrders.claim.registerCta")}
                  </button>
                </div>
              </>
            ) : isClient ? (
              <>
                <p>{t("smartOrders.claim.signedInAs")}</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={claim}
                  disabled={state === "claiming"}
                  data-testid="claim-order-submit"
                >
                  {state === "claiming" ? t("smartOrders.claim.claiming") : t("smartOrders.claim.claimCta")}
                </button>
              </>
            ) : (
              <p className="oh-inline-alert" role="alert">
                {t("smartOrders.claim.wrongRole")}
              </p>
            )}
            {error ? (
              <p className="oh-inline-alert" role="alert">
                {error}
              </p>
            ) : null}
          </>
        ) : null}

        {state === "done" ? (
          <>
            <p data-testid="claim-order-success">{t("smartOrders.claim.successBody", { orderCode: claimed?.orderCode || "" })}</p>
            <Link className="btn btn-primary" to={CLIENT_ORDERS_PATH}>
              {t("smartOrders.claim.viewOrder")}
            </Link>
          </>
        ) : null}
      </section>
    </main>
  );
}
