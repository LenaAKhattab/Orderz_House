import { useEffect, useState } from "react";
import { TRAINING_PACKAGES } from "../constants/trainingPlansCatalog";
import { listPublicTrainingPackagesRequest } from "../services/api";
import { fetchPublicCached, peekPublicCached, PUBLIC_CACHE_TTL_MS } from "../lib/publicRequestCache";

const TRAINING_PACKAGES_KEY = "GET /public/training-packages";

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

function packagesFromResponse(res) {
  return normalizeList(res?.data?.packages);
}

export function usePublicTrainingPackages() {
  const cached = peekPublicCached(TRAINING_PACKAGES_KEY);
  const [packages, setPackages] = useState(() =>
    cached !== undefined ? packagesFromResponse(cached) : [...TRAINING_PACKAGES],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetchPublicCached(
          TRAINING_PACKAGES_KEY,
          () => listPublicTrainingPackagesRequest(),
          { ttlMs: PUBLIC_CACHE_TTL_MS },
        );
        const next = packagesFromResponse(res);
        if (!cancelled) setPackages(next);
      } catch {
        if (!cancelled) setPackages((prev) => (prev.length ? prev : [...TRAINING_PACKAGES]));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return packages;
}
