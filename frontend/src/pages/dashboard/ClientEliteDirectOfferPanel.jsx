/**
 * Dormant Elite Direct Offer panel for client order detail.
 * When elite_engine_enabled=false: no operational CTA (status note only).
 */

import { useEffect, useState, useTransition } from "react";
import {
  cancelClientEliteDirectOffer,
  createClientEliteDirectOffer,
  getClientEliteEngineStatus,
  listClientEliteOffersForOrder,
} from "../../services/eliteDirectOrdersApi";

export default function ClientEliteDirectOfferPanel({ orderId }) {
  const [engineOn, setEngineOn] = useState(false);
  const [offers, setOffers] = useState([]);
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getClientEliteEngineStatus();
        if (cancelled) return;
        setEngineOn(Boolean(status?.eliteEngineEnabled));
        if (status?.eliteEngineEnabled && orderId) {
          const list = await listClientEliteOffersForOrder(orderId);
          if (!cancelled) setOffers(list);
        }
      } catch {
        if (!cancelled) setEngineOn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!engineOn) {
    return null;
  }

  return (
    <section className="elite-direct-offer-panel" aria-label="Elite Direct Offer">
      <h3>Elite Direct Offer</h3>
      <p>Send a private timed offer to one Elite Freelancer.</p>
      {error ? <p role="alert">{error}</p> : null}
      <div>
        <label htmlFor="elite-target-id">Elite Freelancer user id</label>
        <input
          id="elite-target-id"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          disabled={pending}
        />
        <button
          type="button"
          disabled={pending || !targetId}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await createClientEliteDirectOffer(orderId, {
                  targetFreelancerUserId: Number(targetId),
                });
                const list = await listClientEliteOffersForOrder(orderId);
                setOffers(list);
                setTargetId("");
              } catch (err) {
                setError(err?.response?.data?.message || err?.message || "Failed");
              }
            });
          }}
        >
          Send offer
        </button>
      </div>
      <ul>
        {offers.map((o) => (
          <li key={o.id}>
            #{o.id} → Freelancer {o.targetFreelancerUserId} — {o.status}
            {o.status === "pending" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    try {
                      await cancelClientEliteDirectOffer(o.id);
                      const list = await listClientEliteOffersForOrder(orderId);
                      setOffers(list);
                    } catch (err) {
                      setError(err?.response?.data?.message || err?.message || "Failed");
                    }
                  });
                }}
              >
                Cancel
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
