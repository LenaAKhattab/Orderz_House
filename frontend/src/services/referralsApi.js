import api from "./httpClient";
import { shareInFlight } from "./shareInFlight";

export function captureReferralRequest(payload) {
  return api.post("/referrals/capture", payload);
}

export function getMyReferralsRequest() {
  return api.get("/referrals/me");
}

export function requestReferralWithdrawal(amountJod) {
  return api.post("/referrals/withdrawals", { amountJod });
}

export function cancelReferralWithdrawalRequest(id) {
  return api.post(`/referrals/withdrawals/${id}/cancel`);
}

// Page header summary and the overview tab load the same range together: share the in-flight request.
export function getReferralOverviewRequest(params) {
  return shareInFlight(`referrals:overview:${JSON.stringify(params || {})}`, () =>
    api.get("/super-admin/referrals/overview", { params }),
  );
}

export function getReferralTopRequest(params) {
  return api.get("/super-admin/referrals/top", { params });
}

export function listReferralRelationshipsRequest(params) {
  return api.get("/super-admin/referrals/relationships", { params });
}

export function getReferralRelationshipRequest(id) {
  return api.get(`/super-admin/referrals/relationships/${id}`);
}

export function listReferralCommissionsRequest(params) {
  return api.get("/super-admin/referrals/commissions", { params });
}

export function listReferralWithdrawalsRequest(params) {
  return api.get("/super-admin/referrals/withdrawals", { params });
}

export function reviewReferralWithdrawalRequest(id, body) {
  return api.post(`/super-admin/referrals/withdrawals/${id}/review`, body);
}

export function listReferralRewardsRequest() {
  return api.get("/super-admin/referrals/rewards");
}

export function createReferralRewardRequest(body) {
  return api.post("/super-admin/referrals/rewards", body);
}

export function updateReferralRewardRequest(id, body) {
  return api.patch(`/super-admin/referrals/rewards/${id}`, body);
}

export function getReferralSettingsRequest() {
  return api.get("/super-admin/referrals/settings");
}

export function saveReferralSettingsRequest(body) {
  return api.post("/super-admin/referrals/settings", body);
}

export function getReferralPolicyHistoryRequest() {
  return api.get("/super-admin/referrals/policy-history");
}
