/**
 * Freelancer private Elite Direct Offer detail (dormant when engine OFF —
 * accept/decline APIs reject with ELITE_ENGINE_OFF).
 */

import { useEffect, useState, useTransition } from "react";
import { useParams } from "react-router-dom";
import {
  acceptFreelancerEliteOffer,
  declineFreelancerEliteOffer,
  getFreelancerEliteOffer,
} from "../../services/eliteDirectOrdersApi";

export default function FreelancerEliteOfferPage() {
  const { offerId } = useParams();
  const [offer, setOffer] = useState(null);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await getFreelancerEliteOffer(offerId);
        if (!cancelled) setOffer(row);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || "Not found");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  if (error) return <p role="alert">{error}</p>;
  if (!offer) return <p>Loading…</p>;

  return (
    <main className="freelancer-elite-offer-page">
      <h1>Elite Direct Offer</h1>
      <p>Status: {offer.status}</p>
      <p>Expires: {offer.expiresAt ? String(offer.expiresAt) : "—"}</p>
      {offer.status === "pending" ? (
        <div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                try {
                  const out = await acceptFreelancerEliteOffer(offerId);
                  setOffer(out.offer);
                } catch (err) {
                  setError(err?.response?.data?.message || err?.message || "Failed");
                }
              });
            }}
          >
            Accept
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                try {
                  const out = await declineFreelancerEliteOffer(offerId);
                  setOffer(out.offer);
                } catch (err) {
                  setError(err?.response?.data?.message || err?.message || "Failed");
                }
              });
            }}
          >
            Decline
          </button>
        </div>
      ) : null}
    </main>
  );
}
