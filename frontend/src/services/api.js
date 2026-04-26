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
  const { data } = await api.get("/orders/pool", { params });
  return data;
};

export const getPoolOrderByIdRequest = async (orderId) => {
  const { data } = await api.get(`/orders/pool/${orderId}`);
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

export const approveClientOrderDeliveryRequest = async (orderId) => {
  const { data } = await api.post(`/client/orders/${orderId}/delivery/approve`);
  return data;
};

export const requestClientOrderRevisionRequest = async (orderId, note) => {
  const { data } = await api.post(`/client/orders/${orderId}/delivery/revision`, { note: note || "" });
  return data;
};

export const submitFreelancerOrderDeliveryRequest = async (orderId, formData) => {
  const { data } = await api.post(`/freelancer/my-orders/${orderId}/delivery`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });
  return data;
};

/** تنزيل مرفق طلب (عميل) مع اسم ملف صحيح من الخادم. */
export async function downloadClientOrderFile(orderId, fileId, fallbackDisplayName) {
  const token = localStorage.getItem(TOKEN_KEY);
  const base = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
  const url = `${base}/client/orders/${orderId}/files/${fileId}/download`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let msg = "تعذّر تنزيل الملف.";
    try {
      const j = await res.json();
      if (j?.message) msg = j.message;
    } catch {
      /* ignore */
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  let filename =
    fallbackDisplayName && String(fallbackDisplayName).trim() ? String(fallbackDisplayName).trim() : "download";
  const cd = res.headers.get("Content-Disposition");
  if (cd) {
    const m = /filename\*=UTF-8''([^;\s]+)/i.exec(cd);
    if (m) {
      try {
        filename = decodeURIComponent(m[1]);
      } catch {
        /* keep fallback */
      }
    }
  }
  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export const createClientOrderRequest = async (payload) => {
  const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
  const { data } = await api.post("/client/orders", payload, {
    timeout: isFormData ? 120000 : 10000,
  });
  return data;
};

export const submitPoolOrderBidRequest = async (orderId, payload) => {
  const { data } = await api.post(`/orders/pool/${orderId}/bids`, payload);
  return data;
};

// Admin/Super Admin internal order creation
export const adminListInternalOrdersRequest = async (params = {}) => {
  const { data } = await api.get("/admin/orders", { params });
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
  const { data } = await api.get(`/admin/orders/${orderId}/claims`);
  return data;
};

export const adminAcceptTakenOrderRequest = async (orderId, payload = {}) => {
  // Pool approval flow: backend requires { claimId }
  const { data } = await api.patch(`/admin/orders/${orderId}/accept`, payload);
  return data;
};

export default api;
