import axios from "axios";

export const TOKEN_KEY = "orderz_auth_token";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const getHealthStatus = async () => {
  const response = await api.get("/health");
  return response.data;
};

export const loginRequest = async (email, password) => {
  const { data } = await api.post("/auth/login", { email, password });
  return data;
};

export const registerRequest = async (body) => {
  const { data } = await api.post("/auth/register", body);
  return data;
};

export const meRequest = async () => {
  const { data } = await api.get("/auth/me");
  return data;
};

export const getCategoriesRequest = async () => {
  const { data } = await api.get("/categories");
  return data;
};

export const getSubcategoriesRequest = async (categoryId) => {
  const { data } = await api.get(`/categories/${categoryId}/subcategories`);
  return data;
};

export const getSubSubcategoriesRequest = async (subcategoryId) => {
  const { data } = await api.get(`/subcategories/${subcategoryId}/sub-subcategories`);
  return data;
};

export const getCategorySubSubcategoriesRequest = async (categoryId) => {
  const { data } = await api.get(`/categories/${categoryId}/sub-subcategories`);
  return data;
};

// Plans / Subscriptions (RBAC-protected on backend)
export const listPublicPlansRequest = async () => {
  const { data } = await api.get("/plans");
  return data;
};

export const listAdminPlansRequest = async (includeDeleted = false) => {
  const { data } = await api.get("/admin/plans", { params: { includeDeleted } });
  return data;
};

export const createPlanRequest = async (payload) => {
  const { data } = await api.post("/admin/plans", payload);
  return data;
};

export const updatePlanRequest = async (id, patch) => {
  const { data } = await api.patch(`/admin/plans/${id}`, patch);
  return data;
};

export const deletePlanRequest = async (id) => {
  const { data } = await api.delete(`/admin/plans/${id}`);
  return data;
};

export const assignPlanToFreelancerRequest = async (payload) => {
  const { data } = await api.post("/admin/subscriptions/assign", payload);
  return data;
};

export const listSubscriptionsRequest = async (params = {}) => {
  const { data } = await api.get("/admin/subscriptions", { params });
  return data;
};

export const updateSubscriptionRequest = async (id, patch) => {
  const { data } = await api.patch(`/admin/subscriptions/${id}`, patch);
  return data;
};

export const activateSubscriptionCompanyRequest = async (id) => {
  const { data } = await api.patch(`/admin/subscriptions/${id}/company-activate`);
  return data;
};

export const getFreelancerEligibilityAdminRequest = async (freelancerUserId) => {
  const { data } = await api.get(`/admin/freelancers/${freelancerUserId}/eligibility`);
  return data;
};

export const getFreelancerCurrentSubscriptionAdminRequest = async (freelancerUserId) => {
  const { data } = await api.get(`/admin/freelancers/${freelancerUserId}/subscription`);
  return data;
};

export const getMyEligibilityRequest = async () => {
  const { data } = await api.get("/freelancer/eligibility");
  return data;
};

export const getMySubscriptionRequest = async () => {
  const { data } = await api.get("/freelancer/subscription");
  return data;
};

export const createFreelancerSubscriptionCheckoutRequest = async (planId) => {
  const { data } = await api.post("/freelancer/subscriptions/checkout", { planId });
  return data;
};

export const listMyAssignedOrdersRequest = async (params = {}) => {
  const { data } = await api.get("/freelancer/my-orders", { params });
  return data;
};

export const getMyAssignedOrderByIdRequest = async (orderId) => {
  const { data } = await api.get(`/freelancer/my-orders/${orderId}`);
  return data;
};

// Orders (internal admin-created pool)
export const listPoolOrdersRequest = async (params = {}) => {
  const { data } = await api.get("/orders/pool", { params, timeout: 30000 });
  return data;
};

export const getPoolOrderByIdRequest = async (orderId) => {
  const { data } = await api.get(`/orders/pool/${orderId}`, { timeout: 30000 });
  return data;
};

export const takePoolOrderRequest = async (orderId) => {
  const { data } = await api.post(`/orders/${orderId}/take`);
  return data;
};

export const listClientMyOrdersRequest = async (params = {}) => {
  const { data } = await api.get("/client/orders", { params, timeout: 45000 });
  return data;
};

export const listClientOrderClaimsRequest = async (orderId) => {
  const { data } = await api.get(`/client/orders/${orderId}/claims`);
  return data;
};

export const approveClientOrderClaimRequest = async (orderId, claimId) => {
  const { data } = await api.post(`/client/orders/${orderId}/claims/approve`, { claimId });
  return data;
};

export const rejectClientOrderClaimRequest = async (orderId, claimId) => {
  const { data } = await api.post(`/client/orders/${orderId}/claims/reject`, { claimId });
  return data;
};

export const listClientOrderBidsRequest = async (orderId) => {
  const { data } = await api.get(`/client/orders/${orderId}/bids`);
  return data;
};

export const acceptClientOrderBidRequest = async (orderId, bidId) => {
  const { data } = await api.post(`/client/orders/${orderId}/bids/accept`, { bidId });
  return data;
};

export const selectClientOrderBidRequest = async (orderId, bidId) => {
  const { data } = await api.post(`/client/orders/${orderId}/bids/${bidId}/select`);
  return data;
};

export const confirmClientOrderBidPaidRequest = async (orderId, bidId) => {
  const { data } = await api.post(`/client/orders/${orderId}/bids/${bidId}/confirm-paid`);
  return data;
};

export const rejectClientOrderBidRequest = async (orderId, bidId) => {
  const { data } = await api.post(`/client/orders/${orderId}/bids/reject`, { bidId });
  return data;
};

export const createClientOrderRequest = async (payload) => {
  const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
  const { data } = await api.post("/client/orders", payload, {
    timeout: isFormData ? 120000 : 10000,
  });
  return data;
};

export const confirmClientFixedOrderPaidRequest = async (orderId) => {
  const { data } = await api.post(`/client/orders/${orderId}/pay-confirm`);
  return data;
};

export const cancelClientFixedOrderPaymentRequest = async (orderId) => {
  const { data } = await api.post(`/client/orders/${orderId}/pay-cancel`);
  return data;
};

export const submitPoolOrderBidRequest = async (orderId, payload) => {
  const { data } = await api.post(`/orders/pool/${orderId}/bids`, payload);
  return data;
};

// Admin/Super Admin internal order creation
export const adminListInternalOrdersRequest = async (params = {}) => {
  // Avoid 304 with empty body in browsers (would clear the list on the client).
  const { data } = await api.get("/admin/orders", {
    params: { ...params, _ts: Date.now() },
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    timeout: 60000,
  });
  return data;
};

export const adminGetInternalOrderRequest = async (orderId) => {
  const { data } = await api.get(`/admin/orders/${orderId}`, {
    params: { _ts: Date.now() },
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  return data;
};

export const adminCreateInternalOrderRequest = async (formData) => {
  const { data } = await api.post("/admin/orders", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
};

export const adminSearchFreelancersRequest = async (params = {}) => {
  const { data } = await api.get("/admin/freelancers", { params });
  return data;
};

export const adminListOrderClaimsRequest = async (orderId) => {
  const { data } = await api.get(`/admin/orders/${orderId}/claims`, { timeout: 30000 });
  return data;
};

export const adminGetFreelancerRegistrationRequest = async (userId) => {
  const { data } = await api.get(`/admin/freelancers/${userId}/registration`);
  return data;
};

export const adminAcceptTakenOrderRequest = async (orderId, payload = {}) => {
  // Pool approval flow: backend requires { claimId }
  const { data } = await api.patch(`/admin/orders/${orderId}/accept`, payload);
  return data;
};

export const approveAdminInternalOrderDeliveryRequest = async (orderId) => {
  const { data } = await api.post(`/admin/orders/${orderId}/delivery/approve`);
  return data;
};

export const requestAdminInternalOrderRevisionRequest = async (orderId, note, files = []) => {
  const hasFiles = Array.isArray(files) && files.length > 0;
  const payload = hasFiles ? new FormData() : { note };
  if (hasFiles) {
    payload.append("note", note || "");
    for (const f of files) payload.append("files", f);
  }
  const { data } = await api.post(`/admin/orders/${orderId}/delivery/revision`, payload, {
    headers: hasFiles ? { "Content-Type": "multipart/form-data" } : undefined,
    timeout: hasFiles ? 120000 : 10000,
  });
  return data;
};

export const approveClientOrderDeliveryRequest = async (orderId) => {
  const { data } = await api.post(`/client/orders/${orderId}/delivery/approve`);
  return data;
};

export const requestClientOrderRevisionRequest = async (orderId, note, files = []) => {
  const hasFiles = Array.isArray(files) && files.length > 0;
  const payload = hasFiles ? new FormData() : { note };
  if (hasFiles) {
    payload.append("note", note || "");
    for (const f of files) payload.append("files", f);
  }
  const { data } = await api.post(`/client/orders/${orderId}/delivery/revision`, payload, {
    headers: hasFiles ? { "Content-Type": "multipart/form-data" } : undefined,
    timeout: hasFiles ? 120000 : 10000,
  });
  return data;
};

export const submitFreelancerOrderDeliveryRequest = async (orderId, formData) => {
  const { data } = await api.post(`/freelancer/my-orders/${orderId}/delivery`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });
  return data;
};

function triggerBlobDownload(blob, fileName) {
  const name = String(fileName || "file").trim() || "file";
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export const downloadClientOrderFile = async (orderId, fileId, fileName) => {
  const response = await api.get(`/client/orders/${orderId}/files/${fileId}/download`, {
    responseType: "blob",
    timeout: 120000,
  });
  triggerBlobDownload(response.data, fileName);
};

export const downloadAdminInternalOrderFile = async (orderId, fileId, fileName) => {
  const response = await api.get(`/admin/orders/${orderId}/files/${fileId}/download`, {
    responseType: "blob",
    timeout: 120000,
  });
  triggerBlobDownload(response.data, fileName);
};

// Freelancer financial claims (portal)
export const listPortalFinancialClaimsRequest = async (params = {}) => {
  const { data } = await api.get("/portal/financial-claims", { params });
  return data;
};

export const listPortalDoneProjectsRequest = async (params = {}) => {
  const { data } = await api.get("/portal/financial-claims/done-projects", {
    params: { ...params, _ts: Date.now() },
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  return data;
};

export const createPortalFinancialClaimRequest = async (payload) => {
  const { data } = await api.post("/portal/financial-claims", payload);
  return data;
};

// Super Admin financial claims management
export const listSuperAdminFinancialClaimsRequest = async (params = {}) => {
  const { data } = await api.get("/super-admin/financial-claims", { params });
  return data;
};

export const getSuperAdminFinancialClaimByIdRequest = async (id) => {
  const { data } = await api.get(`/super-admin/financial-claims/${id}`);
  return data;
};

export const updateSuperAdminFinancialClaimStatusRequest = async (id, payload) => {
  const { data } = await api.patch(`/super-admin/financial-claims/${id}/status`, payload);
  return data;
};

export const updateSuperAdminFinancialClaimPricingRequest = async (id, payload) => {
  const { data } = await api.patch(`/super-admin/financial-claims/${id}/pricing`, payload);
  return data;
};

export const createSuperAdminFreelancerPaymentRequest = async (payload) => {
  const { data } = await api.post("/super-admin/freelancer-payments", payload);
  return data;
};

// Courses (admin/super_admin)
export const adminListCoursesRequest = async (params = {}) => {
  const { data } = await api.get("/admin/courses", { params });
  return data;
};

export const adminCreateCourseRequest = async (payload) => {
  const { data } = await api.post("/admin/courses", payload);
  return data;
};

export const adminGetCourseByIdRequest = async (courseId) => {
  const { data } = await api.get(`/admin/courses/${courseId}`);
  return data;
};

export const adminUpdateCourseRequest = async (courseId, payload) => {
  const { data } = await api.patch(`/admin/courses/${courseId}`, payload);
  return data;
};

export const adminDeleteCourseRequest = async (courseId) => {
  const { data } = await api.delete(`/admin/courses/${courseId}`);
  return data;
};

export const adminImportCourseLessonsRequest = async (courseId, payload) => {
  const { data } = await api.post(`/admin/courses/${courseId}/import-lessons`, payload);
  return data;
};

export const adminUpdateCourseLessonsRequest = async (courseId, payload) => {
  const { data } = await api.patch(`/admin/courses/${courseId}/lessons`, payload);
  return data;
};

export const adminAssignCourseFreelancersRequest = async (courseId, payload) => {
  const { data } = await api.post(`/admin/courses/${courseId}/assign`, payload);
  return data;
};

export const adminListCourseFreelancersRequest = async (params = {}) => {
  const { data } = await api.get("/admin/courses/freelancers", { params });
  return data;
};

// Fake / Training bidding orders (admin/super_admin)
export const adminCreateFakeOrderTemplateRequest = async (payload) => {
  const { data } = await api.post("/admin/fake-orders/templates", payload);
  return data;
};

export const adminListFakeOrderTemplatesRequest = async (params = {}) => {
  const { data } = await api.get("/admin/fake-orders/templates", { params });
  return data;
};

export const adminUpdateFakeOrderTemplateRequest = async (id, payload) => {
  const { data } = await api.patch(`/admin/fake-orders/templates/${id}`, payload);
  return data;
};

export const adminDeactivateFakeOrderTemplateRequest = async (id) => {
  const { data } = await api.delete(`/admin/fake-orders/templates/${id}`);
  return data;
};

export const adminCreateFakeOrderRoundRequest = async (payload) => {
  const { data } = await api.post("/admin/fake-orders/rounds", payload);
  return data;
};

export const adminListFakeOrderRoundsRequest = async (params = {}) => {
  const { data } = await api.get("/admin/fake-orders/rounds", { params });
  return data;
};

export const adminGetFakeOrderRoundRequest = async (id) => {
  const { data } = await api.get(`/admin/fake-orders/rounds/${id}`);
  return data;
};

export const adminStopFakeOrderRoundRequest = async (id) => {
  const { data } = await api.post(`/admin/fake-orders/rounds/${id}/stop`);
  return data;
};

export const adminGetFakeOrderRoundAnalyticsRequest = async (id) => {
  const { data } = await api.get(`/admin/fake-orders/rounds/${id}/analytics`);
  return data;
};

export const adminGetFakeOrderSettingsRequest = async () => {
  const { data } = await api.get("/admin/fake-orders/settings");
  return data;
};

export const adminUpdateFakeOrderSettingsRequest = async (payload) => {
  const { data } = await api.patch("/admin/fake-orders/settings", payload);
  return data;
};

// Courses (freelancer)
export const freelancerListMyCoursesRequest = async () => {
  const { data } = await api.get("/freelancer/courses");
  return data;
};

export const freelancerGetCourseDetailsRequest = async (courseId) => {
  const { data } = await api.get(`/freelancer/courses/${courseId}`);
  return data;
};

export const freelancerMarkLessonCompleteRequest = async (courseId, lessonId) => {
  const { data } = await api.post(`/freelancer/courses/${courseId}/lessons/${lessonId}/complete`);
  return data;
};

// Notifications
export const listMyNotificationsRequest = async (params = {}) => {
  const { data } = await api.get("/notifications", { params });
  return data;
};

export const getUnreadNotificationsCountRequest = async () => {
  const { data } = await api.get("/notifications/unread-count");
  return data;
};

export const markNotificationReadRequest = async (notificationId) => {
  const { data } = await api.post(`/notifications/${notificationId}/read`);
  return data;
};

export const markAllNotificationsReadRequest = async () => {
  const { data } = await api.post("/notifications/read-all");
  return data;
};

export default api;
