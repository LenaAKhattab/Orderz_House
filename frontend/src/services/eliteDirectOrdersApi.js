/**
 * Minimal Elite Direct Order API helpers (Phase 8).
 * Operational CTAs must stay gated by eliteEngineEnabled on the caller.
 */

import api from "./api";

export async function getClientEliteEngineStatus(options = {}) {
  const { data } = await api.get("/api/client/elite-direct-orders/status", options);
  return data?.data || data;
}

export async function listClientEliteOffersForOrder(orderId, options = {}) {
  const { data } = await api.get(`/api/client/orders/${orderId}/elite-direct-offers`, options);
  return data?.data?.offers || [];
}

export async function createClientEliteDirectOffer(orderId, { targetFreelancerUserId, idempotencyKey }, options = {}) {
  const { data } = await api.post(
    `/api/client/orders/${orderId}/elite-direct-offers`,
    { targetFreelancerUserId, idempotencyKey },
    options,
  );
  return data?.data;
}

export async function cancelClientEliteDirectOffer(offerId, options = {}) {
  const { data } = await api.post(`/api/client/elite-direct-offers/${offerId}/cancel`, {}, options);
  return data?.data;
}

export async function listFreelancerEliteOffers(params = {}, options = {}) {
  const { data } = await api.get("/api/freelancer/elite-direct-offers", {
    ...options,
    params,
  });
  return data?.data?.offers || [];
}

export async function getFreelancerEliteOffer(offerId, options = {}) {
  const { data } = await api.get(`/api/freelancer/elite-direct-offers/${offerId}`, options);
  return data?.data?.offer;
}

export async function acceptFreelancerEliteOffer(offerId, options = {}) {
  const { data } = await api.post(`/api/freelancer/elite-direct-offers/${offerId}/accept`, {}, options);
  return data?.data;
}

export async function declineFreelancerEliteOffer(offerId, options = {}) {
  const { data } = await api.post(`/api/freelancer/elite-direct-offers/${offerId}/decline`, {}, options);
  return data?.data;
}

export async function getSuperAdminEliteOffer(offerId, options = {}) {
  const { data } = await api.get(`/api/super-admin/elite-direct-offers/${offerId}`, options);
  return data?.data?.offer;
}
