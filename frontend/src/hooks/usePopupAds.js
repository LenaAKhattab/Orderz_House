import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getPublicPopupAdsRequest, postPublicPopupAdImpressionRequest } from "../services/api";
import { markPopupAdDismissed, pickPopupAdToShow } from "../utils/popupAdDismiss";
import { canShowPopupOnRoute } from "../utils/popupAdRouteSafety";

/**
 * Fetches eligible popup ads for the current route and user; picks first not dismissed.
 */
export default function usePopupAds() {
  const { pathname, search } = useLocation();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [fetchedAd, setFetchedAd] = useState(null);
  const trackedImpression = useRef(new Set());
  const mountedRef = useRef(true);

  const routeAllowed = useMemo(() => canShowPopupOnRoute(pathname, search), [pathname, search]);
  const activeAd = routeAllowed ? fetchedAd : null;
  const userId = user?.id ?? null;

  const dismiss = useCallback(() => {
    setFetchedAd((ad) => {
      if (ad) markPopupAdDismissed(ad, pathname, { userId });
      return null;
    });
  }, [pathname, userId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (authLoading || !routeAllowed) return undefined;

    let cancelled = false;

    const run = async () => {
      try {
        const res = await getPublicPopupAdsRequest({ pathname });
        if (cancelled || !mountedRef.current) return;
        if (!canShowPopupOnRoute(pathname, search)) return;
        const list = res?.data?.ads || [];
        setFetchedAd(
          pickPopupAdToShow(list, pathname, {
            userId,
            isAuthenticated,
          }),
        );
      } catch {
        if (!cancelled && mountedRef.current) setFetchedAd(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [pathname, search, authLoading, routeAllowed, userId, isAuthenticated, user?.primaryRole, user?.role]);

  useEffect(() => {
    if (!activeAd?.id) return;
    const id = Number(activeAd.id);
    if (!Number.isFinite(id) || id <= 0) return;
    const key = String(id);
    if (trackedImpression.current.has(key)) return;
    trackedImpression.current.add(key);
    postPublicPopupAdImpressionRequest(id).catch(() => {});
    if (activeAd.frequency === "first_login_only" && userId != null) {
      markPopupAdDismissed(activeAd, pathname, { userId });
    }
  }, [activeAd, pathname, userId]);

  return { activeAd, dismiss };
}
