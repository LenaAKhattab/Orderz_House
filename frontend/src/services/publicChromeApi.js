import api from "./httpClient";

/** Display-only FX settings. Does not change stored JOD amounts or checkout. */
export const getCurrencyDisplayRequest = async ({ preferred } = {}) => {
  const { data } = await api.get("/public/currency-display", {
    timeout: 8000,
    params: preferred ? { preferred } : undefined,
  });
  return data;
};

export const getPublicFooterSettingsRequest = async ({ signal } = {}) => {
  const { data } = await api.get("/public/footer-settings", { signal, timeout: 8000 });
  return data;
};

export const getPublicSitePagesRequest = async ({ signal } = {}) => {
  const { data } = await api.get("/public/site-pages", { signal, timeout: 8000 });
  return data;
};

/** Nav-only probe: treats inactive/missing pages as null without throwing on 404. */
export const probePublicWebsitePageForNav = async (slug, { signal } = {}) => {
  const { data, status } = await api.get(`/public/pages/${encodeURIComponent(slug)}`, {
    signal,
    timeout: 8000,
    validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
  });
  if (status === 404 || !data?.success || !data?.data?.page) {
    return null;
  }
  return data;
};

/** Record a public pageview in the local DB counter (idempotent per idempotencyKey). */
export const postPublicPageViewRequest = async (payload) => {
  const { data } = await api.post("/public/analytics/pageview", payload, { timeout: 8000 });
  return data;
};
