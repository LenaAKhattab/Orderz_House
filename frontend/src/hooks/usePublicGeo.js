import { useEffect, useState } from "react";
import { getPublicGeoRequest } from "../services/api";

const GEO_CACHE_KEY = "orderzhouse_public_geo";
const GEO_CACHE_TTL_MS = 30 * 60 * 1000;

/** One in-flight / resolved payload per tab — avoids N requests when many cards mount useDisplayCurrency. */
let inflightGeoRequest = null;
let resolvedGeoPayload = null;

function readGeoCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (Number(parsed.expiresAt) < Date.now()) return null;
    const code = parsed.countryCode;
    return code ? String(code).trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

function writeGeoCache(countryCode, source) {
  if (typeof window === "undefined" || !countryCode) return;
  try {
    window.sessionStorage.setItem(
      GEO_CACHE_KEY,
      JSON.stringify({
        countryCode: String(countryCode).trim().toUpperCase(),
        source: source || "unknown",
        expiresAt: Date.now() + GEO_CACHE_TTL_MS,
      }),
    );
  } catch {
    // ignore quota / private mode
  }
}

function fetchPublicGeoDeduped() {
  if (resolvedGeoPayload) {
    return Promise.resolve(resolvedGeoPayload);
  }
  if (!inflightGeoRequest) {
    inflightGeoRequest = getPublicGeoRequest()
      .then((res) => {
        resolvedGeoPayload = res;
        return res;
      })
      .catch((err) => {
        resolvedGeoPayload = null;
        throw err;
      })
      .finally(() => {
        inflightGeoRequest = null;
      });
  }
  return inflightGeoRequest;
}

/**
 * Best-effort visitor country from GET /public/geo (proxy headers on the server).
 * Returns cached value immediately when available; failures are silent (null).
 */
export function usePublicGeo() {
  const [geoCountryCode, setGeoCountryCode] = useState(() => readGeoCache());

  useEffect(() => {
    let cancelled = false;

    void fetchPublicGeoDeduped()
      .then((res) => {
        if (cancelled) return;
        const code = res?.data?.countryCode ?? null;
        const source = res?.data?.source ?? "unknown";
        if (code) {
          writeGeoCache(code, source);
          setGeoCountryCode(String(code).trim().toUpperCase());
          return;
        }
        if (!readGeoCache()) {
          setGeoCountryCode(null);
        }
      })
      .catch(() => {
        // Keep cached value; otherwise null → default JOD display.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return geoCountryCode;
}
