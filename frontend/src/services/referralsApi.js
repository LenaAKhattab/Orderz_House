import api from "./httpClient";

export function captureReferralRequest(payload) {
  return api.post("/referrals/capture", payload);
}

export function getMyReferralsRequest() {
  return api.get("/referrals/me");
}

export function requestReferralWithdrawal(amountJod) {
  return api.post("/referrals/withdrawals", { amountJod });
}

export function getReferralOverviewRequest(params) {
  return api.get("/super-admin/referrals/overview", { params });
}

export function getReferralTopRequest() {
  return api.get("/super-admin/referrals/top");
}

export function listReferralRelationshipsRequest() {
  return api.get("/super-admin/referrals/relationships");
}

export function getReferralRelationshipRequest(id) {
  return api.get(`/super-admin/referrals/relationships/${id}`);
}

export function listReferralCommissionsRequest() {
  return api.get("/super-admin/referrals/commissions");
}

export function listReferralWithdrawalsRequest() {
  return api.get("/super-admin/referrals/withdrawals");
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

export function getReferralSettingsRequest() {
  return api.get("/super-admin/referrals/settings");
}

export function saveReferralSettingsRequest(body) {
  return api.post("/super-admin/referrals/settings", body);
}

export function getReferralPolicyHistoryRequest() {
  return api.get("/super-admin/referrals/policy-history");
}
