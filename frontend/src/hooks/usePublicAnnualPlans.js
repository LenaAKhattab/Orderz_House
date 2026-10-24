import { useEffect, useState } from "react";
import { listPublicMarketplaceMembershipPlansRequest } from "../services/api";
import { fetchPublicCached, peekPublicCached, PUBLIC_CACHE_TTL_MS } from "../lib/publicRequestCache";
import { mapAnnualMembershipPlansForPublicPlans } from "../lib/marketplaceMembership/mapMarketplaceMembershipPlanForPublicPlans";

const ANNUAL_PLANS_KEY = "GET /marketplace-membership-plans#annual";

function plansFromResponse(res) {
  const items = Array.isArray(res?.data?.items) ? res.data.items : [];
  return mapAnnualMembershipPlansForPublicPlans(items);
}

/**
 * Annual Plans (الباقات السنوية) from the canonical marketplace membership catalog.
 * Server-authoritative values only; no static fallback (empty list → empty state).
 * @param {{ enabled?: boolean }} [options]
 */
export function usePublicAnnualPlans({ enabled = true } = {}) {
  const cached = peekPublicCached(ANNUAL_PLANS_KEY);
  const [state, setState] = useState(() => ({
    plans: cached !== undefined ? plansFromResponse(cached) : [],
    loading: cached === undefined,
    error: false,
  }));

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchPublicCached(
          ANNUAL_PLANS_KEY,
          () => listPublicMarketplaceMembershipPlansRequest(),
          { ttlMs: PUBLIC_CACHE_TTL_MS },
        );
        if (!cancelled) setState({ plans: plansFromResponse(res), loading: false, error: false });
      } catch {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
