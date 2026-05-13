import { useCallback, useEffect, useRef, useState } from "react";
import { getPublicAdsRequest } from "../services/adsService";
import { isAdCurrentlyVisible, msUntilSoonestEnd } from "../utils/adVisibility";

const POLL_MS = 30_000;
const TICK_MS = 1000;
/** أقصى ما يدعمه `setTimeout` في المتصفح (~24.8 يوم). */
const MAX_TIMER_MS = 2147483647;

/**
 * @param {unknown} apiBody — جسم الاستجابة `{ success, data: { ads } }`
 */
function extractAdsArray(apiBody) {
  const raw = apiBody?.data?.ads;
  return Array.isArray(raw) ? raw : [];
}

/**
 * @param {"home_right_panel"|"home_after_hero"|"services_page"|"global_sidebar"} placement
 */
export default function usePublicAds(placement = "home_right_panel") {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchAds = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const res = await getPublicAdsRequest({ placement });
        const list = extractAdsArray(res).filter((a) => isAdCurrentlyVisible(a));
        if (!mountedRef.current) return;
        setAds(list);
      } catch (e) {
        console.error("[usePublicAds]", e);
        if (!mountedRef.current) return;
        if (!silent) {
          setAds([]);
        }
        /* Silent refetch: keep previous ads — لا يُعتبر فراغ أو انتهاء خطأ */
      }
    },
    [placement],
  );

  /* تحميل أولي + استطلاع كل 30 ثانية (صامت) */
  useEffect(() => {
    mountedRef.current = true;

    let pollId = null;

    const runInitial = async () => {
      setLoading(true);
      await fetchAds({ silent: false });
      if (mountedRef.current) setLoading(false);
    };
    void runInitial();

    pollId = window.setInterval(() => {
      void fetchAds({ silent: true });
    }, POLL_MS);

    return () => {
      mountedRef.current = false;
      if (pollId != null) window.clearInterval(pollId);
    };
  }, [placement, fetchAds]);

  /* إزالة المنتهية محليًا كل ثانية دون انتظار الشبكة */
  useEffect(() => {
    const id = window.setInterval(() => {
      setAds((prev) => {
        const next = prev.filter((a) => isAdCurrentlyVisible(a));
        if (next.length === prev.length) return prev;
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  /* إعادة جلب صامت عند أقرب وقت انتهاء (بالإضافة إلى الاستطلاع الدوري) */
  useEffect(() => {
    const ms = msUntilSoonestEnd(ads);
    if (ms == null || ms <= 0) return undefined;

    const delay = Math.min(ms + 750, MAX_TIMER_MS);
    const timerId = window.setTimeout(() => {
      void fetchAds({ silent: true });
    }, delay);

    return () => window.clearTimeout(timerId);
  }, [ads, fetchAds]);

  return { ads, loading };
}
