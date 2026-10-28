/**
 * Freelancer private Elite Direct Offer detail (dormant when engine OFF —
 * accept/decline APIs reject with ELITE_ENGINE_OFF). Not linked from navigation; a direct URL shows a
 * localized "unavailable" state instead of raw provider/server text.
 */

import { useEffect, useState, useTransition } from "react";
import { Link, useParams } from "react-router-dom";
import {
  acceptFreelancerEliteOffer,
  declineFreelancerEliteOffer,
  getFreelancerEliteOffer,
} from "../../services/eliteDirectOrdersApi";
import { useTranslation } from "../../i18n/LanguageProvider";
import { formatLocaleDateTime } from "../../i18n/formatLocale.js";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage.js";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import StatusBadge from "../../components/dashboard/StatusBadge";

const STATUS_TONES = { pending: "warning", accepted: "success", declined: "neutral", expired: "neutral", cancelled: "neutral" };

export default function FreelancerEliteOfferPage() {
  const { offerId } = useParams();
  const { t, locale } = useTranslation();
  const e = "freelancerDashboard.eliteOffer";
  const [offer, setOffer] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [actionError, setActionError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await getFreelancerEliteOffer(offerId);
        if (!cancelled) {
          if (row) setOffer(row);
          else setUnavailable(true);
        }
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  const back = (
    <Link className="btn btn-secondary" to="/dashboard/freelancer">
      {t(`${e}.back`)}
    </Link>
  );

  if (unavailable) {
    return (
      <main className="freelancer-elite-offer-page">
        <DashboardPageHeader title={t(`${e}.title`)} />
        <DashboardEmptyState title={t(`${e}.unavailableTitle`)} description={t(`${e}.unavailableText`)} actions={back} />
      </main>
    );
  }
  if (!offer) {
    return (
      <main className="freelancer-elite-offer-page">
        <DashboardPageHeader title={t(`${e}.title`)} />
        <DashboardLoadingState label={t(`${e}.loading`)} rows={2} />
      </main>
    );
  }

  const status = String(offer.status || "");
  const statusText = t(`${e}.status.${status}`) !== `${e}.status.${status}` ? t(`${e}.status.${status}`) : t(`${e}.status.unknown`);
  const act = (fn) =>
    startTransition(async () => {
      setActionError("");
      try {
        const out = await fn(offerId);
        setOffer(out.offer);
      } catch (err) {
        setActionError(getSafeApiErrorMessage(err, t(`${e}.actionFailed`)));
      }
    });

  return (
    <main className="freelancer-elite-offer-page">
      <DashboardPageHeader title={t(`${e}.title`)} actions={back} />
      <section className="dash-card" aria-labelledby="elite-offer-summary">
        <h2 id="elite-offer-summary" className="sr-only">
          {t(`${e}.title`)}
        </h2>
        <p>
          <StatusBadge tone={STATUS_TONES[status] || "neutral"}>{statusText}</StatusBadge>
        </p>
        <p>
          {t(`${e}.expires`)}: {offer.expiresAt ? formatLocaleDateTime(offer.expiresAt, locale) : "—"}
        </p>
        {actionError ? (
          <p className="oh-dialog-error" role="alert">
            {actionError}
          </p>
        ) : null}
        {status === "pending" ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => act(acceptFreelancerEliteOffer)}>
              {t(`${e}.accept`)}
            </button>
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => act(declineFreelancerEliteOffer)}>
              {t(`${e}.decline`)}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
