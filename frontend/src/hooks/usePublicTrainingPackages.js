import { useEffect, useState } from "react";
import { TRAINING_PACKAGES } from "../constants/trainingPlansCatalog";
import { listPublicTrainingPackagesRequest } from "../services/api";

const PUBLIC_TRAINING_TTL_MS = 5 * 60 * 1000;
let cachedPackages = [...TRAINING_PACKAGES];
let cachedAt = 0;
let inFlightRequest = null;

function normalizeList(items) {
  if (!Array.isArray(items) || items.length === 0) return [...TRAINING_PACKAGES];
  const visible = items
    .filter((pkg) => pkg && pkg.isVisible !== false)
    .map((pkg) => ({
      ...pkg,
      id: pkg.id || pkg.code,
      featuresAr: Array.isArray(pkg.featuresAr) ? pkg.featuresAr : [],
      featuresEn: Array.isArray(pkg.featuresEn) ? pkg.featuresEn : [],
    }));
  return visible.length > 0 ? visible : [...TRAINING_PACKAGES];
}

export function usePublicTrainingPackages() {
  const [packages, setPackages] = useState(() => [...cachedPackages]);

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const cacheFresh = now - cachedAt < PUBLIC_TRAINING_TTL_MS;
    if (cacheFresh) {
      setPackages([...cachedPackages]);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        if (!inFlightRequest) {
          inFlightRequest = listPublicTrainingPackagesRequest();
        }
        const res = await inFlightRequest;
        const next = normalizeList(res?.data?.packages);
        cachedPackages = next;
        cachedAt = Date.now();
        if (!cancelled) setPackages(next);
      } catch {
        if (!cancelled) setPackages([...cachedPackages]);
      } finally {
        inFlightRequest = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return packages;
}
