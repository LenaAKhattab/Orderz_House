import { useEffect, useState } from "react";
import { TRAINING_PACKAGES } from "../constants/trainingPlansCatalog";
import { listPublicTrainingPackagesRequest } from "../services/api";

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
  const [packages, setPackages] = useState(() => [...TRAINING_PACKAGES]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listPublicTrainingPackagesRequest();
        const next = normalizeList(res?.data?.packages);
        if (!cancelled) setPackages(next);
      } catch {
        if (!cancelled) setPackages([...TRAINING_PACKAGES]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return packages;
}
