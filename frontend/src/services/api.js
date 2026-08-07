import axios from "axios";

export const TOKEN_KEY = "orderz_auth_token";

/** Non-secret flag: set after any successful server session in this tab (login/register); cleared on logout. Used to avoid GET /auth/me for cold visitors. HttpOnly cookies alone are not readable here—users who only clear localStorage may need to sign in again until the next successful session. */
export const AUTH_SESSION_HINT_KEY = "orderz_session_hint";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  timeout: 10000,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function hasSessionBootstrapCandidate() {
  if (typeof localStorage === "undefined") return false;
  const legacy = localStorage.getItem(TOKEN_KEY);
  return Boolean((legacy && legacy.trim()) || localStorage.getItem(AUTH_SESSION_HINT_KEY));
}

/** Shared in-flight promise so React Strict Mode’s double mount does not send two /auth/me requests. */
let sessionBootstrapPromise = null;

export function resetSessionBootstrap() {
  sessionBootstrapPromise = null;
}

/**
 * Initial session check: 401 is treated as guest (validateStatus), not an axios error.
 * Returns null when there is no legacy token and no session hint — skips the request entirely.
 */
export async function fetchSessionBootstrap() {
  if (!hasSessionBootstrapCandidate()) {
    return null;
  }
  if (!sessionBootstrapPromise) {
    sessionBootstrapPromise = api
      .get("/auth/me", {
        validateStatus: (status) => status === 200 || status === 401,
      })
      .then((response) => {
        if (response.status === 401) {
          return null;
        }
        return response.data;
      })
      .catch((err) => {
        resetSessionBootstrap();
        throw err;
      });
  }
  return sessionBootstrapPromise;
}

export const getHealthStatus = async () => {
  const response = await api.get("/health");
  return response.data;
};

/** Register/resend wait for bcrypt + DB + email; allow more than the default 10s client timeout. */
const AUTH_REGISTER_TIMEOUT_MS = 25000;

export const loginRequest = async (email, password) => {
  const { data } = await api.post("/auth/login", { email, password });
  return data;
};

export const registerRequest = async (body) => {
  const { data } = await api.post("/auth/register", body, { timeout: AUTH_REGISTER_TIMEOUT_MS });
  return data;
};

export const verifyRegisterOtpRequest = async (email, otp) => {
  const { data } = await api.post("/auth/verify-register-otp", { email, otp });
  return data;
};

export const resendRegisterOtpRequest = async (email) => {
  const { data } = await api.post("/auth/resend-register-otp", { email }, { timeout: AUTH_REGISTER_TIMEOUT_MS });
  return data;
};

export const forgotPasswordRequest = async (email) => {
  const { data } = await api.post("/auth/forgot-password", { email });
  return data;
};

export const verifyForgotPasswordOtpRequest = async (email, otp) => {
  const { data } = await api.post("/auth/verify-forgot-password-otp", { email, otp });
  return data;
};

export const resetPasswordRequest = async (email, resetToken, newPassword) => {
  const { data } = await api.post("/auth/reset-password", { email, resetToken, newPassword });
  return data;
};

/**
 * Refresh current user (e.g. after profile change). 401 → null without axios throw.
 * Prefer fetchSessionBootstrap() only for the one-time app shell init.
 */
export const meRequest = async () => {
  const response = await api.get("/auth/me", {
    validateStatus: (status) => status === 200 || status === 401,
  });
  if (response.status === 401) {
    return null;
  }
  return response.data;
};

/** Extended profile + dashboard stats + subscription (freelancer). */
export const getProfileMeRequest = async () => {
  const { data } = await api.get("/profile/me");
  return data;
};

export const patchProfileMeRequest = async (patch) => {
  const { data } = await api.patch("/profile/me", patch);
  return data;
};

export const patchProfileNotificationPreferencesRequest = async (prefs) => {
  const { data } = await api.patch("/profile/notification-preferences", prefs);
  return data;
};

export const patchBrowserNotificationsRequest = async ({ status }) => {
  const { data } = await api.patch("/profile/browser-notifications", { status });
  return data;
};

export const postBrowserNotificationTestRequest = async () => {
  const { data } = await api.post("/profile/browser-notifications/test");
  return data;
};

export const patchProfilePasswordRequest = async (payload) => {
  const { data } = await api.patch("/profile/password", payload);
  return data;
};

export const patchProfileAvatarRequest = async (file) => {
  const fd = new FormData();
  fd.append("avatar", file);
  const { data } = await api.patch("/profile/avatar", fd);
  return data;
};

export const deleteProfileAvatarRequest = async () => {
  const { data } = await api.delete("/profile/avatar");
  return data;
};

/** Clears HttpOnly session cookie on the server (no body secrets). */
export const logoutRequest = async () => {
  const { data } = await api.post("/auth/logout");
  return data;
};

export const getCategoriesRequest = async () => {
  const { data } = await api.get("/categories");
  return data;
};

/** Marketplace filter tree — one request instead of N+1 sub-subcategory fetches. */
export const getCategoriesTreeRequest = async () => {
  const { data } = await api.get("/categories/tree");
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
export const getPublicGeoRequest = async () => {
  const { data } = await api.get("/public/geo", { timeout: 8000 });
  return data;
};

export const listPublicPlansRequest = async () => {
  const { data } = await api.get("/plans");
  return data;
};

export const getPublicPlanPageBySlugRequest = async (slug) => {
  const { data } = await api.get(`/plan-pages/${encodeURIComponent(slug)}`);
  return data;
};

export const listAdminPlanPagesRequest = async () => {
  const { data } = await api.get("/admin/plan-pages");
  return data;
};

export const createPlanPageRequest = async (payload) => {
  const { data } = await api.post("/admin/plan-pages", payload);
  return data;
};

export const updatePlanPageRequest = async (id, patch) => {
  const { data } = await api.patch(`/admin/plan-pages/${id}`, patch);
  return data;
};

export const deletePlanPageRequest = async (id) => {
  const { data } = await api.delete(`/admin/plan-pages/${id}`);
  return data;
};

export const listAdminPlansRequest = async (includeDeleted = false, planPageId = null) => {
  const params = { includeDeleted };
  if (planPageId != null) params.planPageId = planPageId;
  const { data } = await api.get("/admin/plans", { params });
  return data;
};

export const replacePlanFeaturesRequest = async (planId, features) => {
  const { data } = await api.put(`/admin/plans/${planId}/features`, { features });
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

export const listAssignablePlansAdminRequest = async () => {
  const { data } = await api.get("/admin/subscriptions/assignable-plans");
  return data;
};

export const listSubscriptionsRequest = async (params = {}) => {
  const { data } = await api.get("/admin/subscriptions", { params });
  return data;
};

export const listActivationQueueRequest = async (params = {}, options = {}) => {
  const { signal, ...rest } = options;
  const query = { ...params };
  if (query.search != null) {
    const trimmed = String(query.search).trim();
    if (trimmed) query.search = trimmed;
    else delete query.search;
  }
  const { data } = await api.get("/admin/subscriptions/activation-queue", {
    params: query,
    signal,
    ...rest,
  });
  return data;
};

/** Fetches all subscription pages (for admin screens that need the full filtered set). */
export const listAllSubscriptionsRequest = async (filters = {}) => {
  const all = [];
  let page = 1;
  const limit = 100;
  let pagination = null;

  for (;;) {
    const res = await listSubscriptionsRequest({ ...filters, page, limit });
    const batch = res?.data?.subscriptions || [];
    all.push(...batch);
    pagination = res?.data?.pagination || null;
    if (!pagination?.hasNextPage || batch.length === 0) break;
    page += 1;
    if (page > 500) break;
  }

  return {
    success: true,
    data: {
      subscriptions: all,
      pagination: pagination
        ? { ...pagination, page: 1, limit: all.length, total: pagination.total, totalPages: 1 }
        : { page: 1, limit: all.length, total: all.length, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    },
  };
};

export const updateSubscriptionRequest = async (id, patch) => {
  const { data } = await api.patch(`/admin/subscriptions/${id}`, patch);
  return data;
};

/** Super-admin only: read the admin email that receives paid-subscription notifications. */
export const getSubscriptionNotificationEmailRequest = async () => {
  const { data } = await api.get("/admin/subscriptions/notification-email");
  return data;
};

/** Super-admin only: update (or clear) the paid-subscription notification email. */
export const updateSubscriptionNotificationEmailRequest = async (email) => {
  const { data } = await api.put("/admin/subscriptions/notification-email", { email });
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

/** Freelancer control-center dashboard: single aggregated summary (Phase 2). */
export const getFreelancerDashboardSummaryRequest = async () => {
  const { data } = await api.get("/freelancer/dashboard-summary", { timeout: 20000 });
  return data;
};

/** Lightweight courses sidebar badge — avoids full dashboard-summary on every page. */
export const getFreelancerCoursesFocusRequest = async () => {
  const { data } = await api.get("/freelancer/courses-focus", { timeout: 15000 });
  return data;
};

export const createFreelancerSubscriptionCheckoutRequest = async (planId) => {
  const id = Number(planId);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error("معرّف الباقة غير صالح.");
  }
  const { data } = await api.post("/freelancer/subscriptions/checkout", { planId: id });
  return data;
};

/** Server-side confirm after Stripe redirect (webhook is still source of truth; this picks up if webhook lags or local dev). */
export const confirmFreelancerSubscriptionCheckoutRequest = async (sessionId) => {
  const sid = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!sid || sid.length > 255) {
    throw new Error("معرّف جلسة الدفع غير صالح.");
  }
  const { data } = await api.post("/freelancer/subscriptions/confirm-checkout", { sessionId: sid });
  return data;
};

/** Server verifies Stripe session is unpaid freelancer checkout before creating a persistent notification. */
export const notifyFreelancerSubscriptionCheckoutCancelledRequest = async (sessionId) => {
  const sid = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!sid || sid.length > 255) {
    throw new Error("معرّف جلسة الدفع غير صالح.");
  }
  const { data } = await api.post("/freelancer/subscriptions/checkout-cancel-notify", { sessionId: sid });
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
export const listPoolOrdersRequest = async (params = {}, options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/orders/pool", {
    params,
    timeout: 30000,
    signal,
    ...axiosOptions,
  });
  return data;
};

export const getPoolOrderByIdRequest = async (orderId, options = {}) => {
  const { data } = await api.get(`/orders/pool/${orderId}`, { timeout: 30000, ...options });
  return data;
};

export const takePoolOrderRequest = async (orderId) => {
  const { data } = await api.post(`/orders/pool/${orderId}/take`);
  return data;
};

export const listClientMyOrdersRequest = async (params = {}) => {
  const { data } = await api.get("/client/orders", { params, timeout: 45000 });
  return data;
};

/** Client-owned order + submission timeline (GET). */
export const getClientOrderByIdRequest = async (orderId) => {
  const { data } = await api.get(`/client/orders/${orderId}`, { timeout: 45000 });
  return data;
};

export const getClientOrderReviewStatusRequest = async (orderId) => {
  const { data } = await api.get(`/client/orders/${orderId}/review`);
  return data;
};

export const submitClientOrderReviewRequest = async (orderId, payload) => {
  const { data } = await api.post(`/client/orders/${orderId}/review`, payload);
  return data;
};

export const updateClientOrderReviewRequest = async (orderId, payload) => {
  const { data } = await api.patch(`/client/orders/${orderId}/review`, payload);
  return data;
};

export const listFreelancerReviewsRequest = async (params = {}) => {
  const { data } = await api.get("/freelancer/reviews", { params });
  return data;
};

export const getFreelancerReviewsSummaryRequest = async () => {
  const { data } = await api.get("/freelancer/reviews/summary");
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

// Admin — الطلبات التجريبية (Training / fake orders)
const TRAINING_ORDERS_API_TIMEOUT_MS = 30000;

export const adminGetTrainingOrdersAutomationHealthRequest = async () => {
  const { data } = await api.get("/admin/training-orders/automation/health", {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminGetTrainingOrdersReadinessRequest = async () => {
  const { data } = await api.get("/admin/training-orders/health/readiness", {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminListTrainingVisibleOrdersRequest = async (params = {}) => {
  const { data } = await api.get("/admin/training-orders/visible-orders", {
    params,
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminRunTrainingOrdersAutomationTickRequest = async () => {
  const { data } = await api.post("/admin/training-orders/automation/tick", {}, {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminGetTrainingOrdersSettingsRequest = async () => {
  const { data } = await api.get("/admin/training-orders/settings", {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminPatchTrainingOrdersSettingsRequest = async (payload) => {
  const { data } = await api.patch("/admin/training-orders/settings", payload, {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminListTrainingTemplatesRequest = async (params = {}) => {
  const { data } = await api.get("/admin/training-orders/templates", {
    params,
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminGetTrainingFakeOrdersCountRequest = async () => {
  const { data } = await api.get("/admin/training-orders/fake-orders/count", {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminListTrainingFakeOrdersRequest = async (params = {}) => {
  const { data } = await api.get("/admin/training-orders/fake-orders", {
    params,
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminGetTrainingFakeOrderRequest = async (id) => {
  const { data } = await api.get(`/admin/training-orders/fake-orders/${id}`, {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminCreateTrainingFakeOrderRequest = async (payload) => {
  const { data } = await api.post("/admin/training-orders/fake-orders", payload, {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminPatchTrainingFakeOrderRequest = async (id, payload) => {
  const { data } = await api.patch(`/admin/training-orders/fake-orders/${id}`, payload, {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminHideTrainingFakeOrderFromRoundRequest = async (id) => {
  const { data } = await api.patch(`/admin/training-orders/fake-orders/${id}/hide-current-round`, {}, {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminDeleteTrainingFakeOrderRequest = async (id) => {
  const { data } = await api.delete(`/admin/training-orders/fake-orders/${id}`, {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

/** @deprecated Legacy template read — admin pool UI uses fake-orders, not templates. */
export const adminGetTrainingTemplateRequest = async (id) => {
  const { data } = await api.get(`/admin/training-orders/templates/${id}`, {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

/** Blocked — admin manual orders must use adminCreateTrainingFakeOrderRequest (fake_orders). */
export const adminCreateTrainingTemplateRequest = async () => {
  throw new Error(
    "Template creation from the admin UI is disabled. Use adminCreateTrainingFakeOrderRequest (POST /admin/training-orders/fake-orders).",
  );
};

/** Blocked — admin pool edits use adminPatchTrainingFakeOrderRequest. */
export const adminPatchTrainingTemplateRequest = async () => {
  throw new Error(
    "Template updates from the admin UI are disabled. Use adminPatchTrainingFakeOrderRequest.",
  );
};

/** Blocked — admin pool deletes use adminDeleteTrainingFakeOrderRequest. */
export const adminDeleteTrainingTemplateRequest = async () => {
  throw new Error(
    "Template deletion from the admin UI is disabled. Use adminDeleteTrainingFakeOrderRequest.",
  );
};

export const adminListTrainingRoundsRequest = async (params = {}) => {
  const { data } = await api.get("/admin/training-orders/rounds", {
    params,
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminStartTrainingRoundRequest = async () => {
  const { data } = await api.post("/admin/training-orders/rounds/start", {}, {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminCancelTrainingRoundRequest = async (id) => {
  const { data } = await api.post(`/admin/training-orders/rounds/${id}/cancel`, {}, {
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminListTrainingApplicationsRequest = async (params = {}) => {
  const { data } = await api.get("/admin/training-orders/applications", {
    params,
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminListTrainingApplicationsSummaryRequest = async (params = {}) => {
  const { data } = await api.get("/admin/training-orders/applications/summary", {
    params,
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

export const adminListTrainingApplicationsByFakeOrderRequest = async (fakeOrderId, { page = 1, limit = 5 } = {}) => {
  const { data } = await api.get(`/admin/training-orders/fake-orders/${fakeOrderId}/applications`, {
    params: { page, limit },
    timeout: TRAINING_ORDERS_API_TIMEOUT_MS,
  });
  return data;
};

// Institutions + Institutional Order Storage
/** Institutions admin reads — remote DB latency; keep above default 10s after query fixes. */
const INSTITUTIONS_ADMIN_READ_TIMEOUT_MS = 20000;

export const adminListInstitutionsRequest = async (params = {}, options = {}) => {
  const { signal, ...rest } = options;
  const { data } = await api.get("/admin/institutions", {
    params,
    signal,
    timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
    ...rest,
  });
  return data;
};

export const adminCreateInstitutionRequest = async (payload) => {
  const { data } = await api.post("/admin/institutions", payload, {
    timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
  });
  return data;
};

/** In-flight dedupe for institution detail bundle (Strict Mode remount / rapid remount). */
const institutionBundleInflight = new Map();

export const adminGetInstitutionRequest = async (id, options = {}) => {
  const { signal, bundle, membersPage, storagesPage, membersLimit, storagesLimit, ...rest } = options;
  const params = bundle
    ? {
        bundle: 1,
        membersPage,
        storagesPage,
        membersLimit,
        storagesLimit,
      }
    : undefined;

  if (bundle) {
    const key = `${id}:${membersPage || 1}:${storagesPage || 1}:${membersLimit || 20}:${storagesLimit || 20}`;
    const existing = institutionBundleInflight.get(key);
    if (existing) {
      // Share the same network call; still honor abort for this consumer's state updates.
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          const err = new Error("canceled");
          err.code = "ERR_CANCELED";
          err.name = "CanceledError";
          reject(err);
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
        existing.then(
          (data) => {
            signal?.removeEventListener("abort", onAbort);
            if (signal?.aborted) onAbort();
            else resolve(data);
          },
          (err) => {
            signal?.removeEventListener("abort", onAbort);
            if (signal?.aborted) onAbort();
            else reject(err);
          },
        );
      });
    }
    const promise = api
      .get(`/admin/institutions/${id}`, {
        params,
        timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
        ...rest,
      })
      .then((res) => res.data)
      .finally(() => {
        if (institutionBundleInflight.get(key) === promise) institutionBundleInflight.delete(key);
      });
    institutionBundleInflight.set(key, promise);
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const err = new Error("canceled");
        err.code = "ERR_CANCELED";
        err.name = "CanceledError";
        reject(err);
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (data) => {
          signal?.removeEventListener("abort", onAbort);
          if (signal?.aborted) onAbort();
          else resolve(data);
        },
        (err) => {
          signal?.removeEventListener("abort", onAbort);
          if (signal?.aborted) onAbort();
          else reject(err);
        },
      );
    });
  }

  const { data } = await api.get(`/admin/institutions/${id}`, {
    params,
    signal,
    timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
    ...rest,
  });
  return data;
};

export const adminPatchInstitutionRequest = async (id, payload) => {
  const { data } = await api.patch(`/admin/institutions/${id}`, payload, {
    timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
  });
  return data;
};

export const adminGetInstitutionStatisticsRequest = async (id, options = {}) => {
  const { signal, ...rest } = options;
  const { data } = await api.get(`/admin/institutions/${id}/statistics`, {
    signal,
    timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
    ...rest,
  });
  return data;
};

export const adminFreezeInstitutionRequest = async (id, payload = {}) => {
  const { data } = await api.post(`/admin/institutions/${id}/freeze`, payload, {
    timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
  });
  return data;
};

export const adminUnfreezeInstitutionRequest = async (id, payload = {}) => {
  const { data } = await api.post(`/admin/institutions/${id}/unfreeze`, payload, {
    timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
  });
  return data;
};

export const adminGetInstitutionDeactivationImpactRequest = async (id, options = {}) => {
  const { signal, ...rest } = options;
  const { data } = await api.get(`/admin/institutions/${id}/deactivation-impact`, {
    signal,
    timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
    ...rest,
  });
  return data;
};

export const adminListInstitutionStoragesRequest = async (id, params = {}, options = {}) => {
  const { signal, ...rest } = options;
  const { data } = await api.get(`/admin/institutions/${id}/storages`, {
    params,
    signal,
    timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
    ...rest,
  });
  return data;
};

export const adminListInstitutionMembersRequest = async (id, params = {}, options = {}) => {
  const { signal, ...rest } = options;
  const { data } = await api.get(`/admin/institutions/${id}/members`, {
    params,
    signal,
    timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
    ...rest,
  });
  return data;
};

export const adminAddInstitutionMemberRequest = async (id, payload) => {
  const { data } = await api.post(`/admin/institutions/${id}/members`, payload, {
    timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
  });
  return data;
};

export const adminRemoveInstitutionMemberRequest = async (id, userId) => {
  const { data } = await api.delete(`/admin/institutions/${id}/members/${userId}`, {
    timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
  });
  return data;
};

export const adminSearchUsersForInstitutionRequest = async (params = {}, options = {}) => {
  const { signal, ...rest } = options;
  const { data } = await api.get("/admin/institutions/users/search", {
    params,
    signal,
    timeout: INSTITUTIONS_ADMIN_READ_TIMEOUT_MS,
    ...rest,
  });
  return data;
};

/** Institutional storage list/detail can hit remote DB latency; keep above default 10s but rely on query fixes. */
const INSTITUTIONAL_STORAGE_API_TIMEOUT_MS = 20000;

export const adminListInstitutionalStoragesRequest = async (params = {}, options = {}) => {
  const { signal, ...rest } = options;
  const { data } = await api.get("/admin/institutional-order-storage", {
    params,
    signal,
    timeout: INSTITUTIONAL_STORAGE_API_TIMEOUT_MS,
    ...rest,
  });
  return data;
};

export const adminCreateInstitutionalStorageRequest = async (payload) => {
  const { data } = await api.post("/admin/institutional-order-storage", payload, {
    timeout: INSTITUTIONAL_STORAGE_API_TIMEOUT_MS,
  });
  return data;
};

export const adminGetInstitutionalStorageRequest = async (storageId, options = {}) => {
  const { signal, ...rest } = options;
  const { data } = await api.get(`/admin/institutional-order-storage/${storageId}`, {
    signal,
    timeout: INSTITUTIONAL_STORAGE_API_TIMEOUT_MS,
    ...rest,
  });
  return data;
};

export const adminPatchInstitutionalStorageRequest = async (storageId, payload) => {
  const { data } = await api.patch(`/admin/institutional-order-storage/${storageId}`, payload, {
    timeout: INSTITUTIONAL_STORAGE_API_TIMEOUT_MS,
  });
  return data;
};

export const adminListInstitutionalStorageOrdersRequest = async (storageId, params = {}, options = {}) => {
  const { signal, ...rest } = options;
  const { data } = await api.get(`/admin/institutional-order-storage/${storageId}/orders`, {
    params,
    signal,
    timeout: INSTITUTIONAL_STORAGE_API_TIMEOUT_MS,
    ...rest,
  });
  return data;
};

export const adminCreateInstitutionalStorageOrderRequest = async (storageId, formData) => {
  const { data } = await api.post(`/admin/institutional-order-storage/${storageId}/orders`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });
  return data;
};

export const adminSubmitInstitutionalOrderRequest = async (orderId) => {
  const { data } = await api.post(`/admin/institutional-order-storage/orders/${orderId}/submit`, {}, {
    timeout: INSTITUTIONAL_STORAGE_API_TIMEOUT_MS,
  });
  return data;
};

export const adminApproveInstitutionalOrderRequest = async (orderId, payload = {}) => {
  const { data } = await api.post(`/admin/institutional-order-storage/orders/${orderId}/approve`, payload, {
    timeout: INSTITUTIONAL_STORAGE_API_TIMEOUT_MS,
  });
  return data;
};

export const adminTransferInstitutionalOrderRequest = async (orderId, payload = {}) => {
  const { data } = await api.post(
    `/admin/institutional-order-storage/orders/${orderId}/transfer-to-training`,
    payload,
    { timeout: INSTITUTIONAL_STORAGE_API_TIMEOUT_MS },
  );
  return data;
};

export const adminArchiveInstitutionalOrderRequest = async (orderId, payload = {}) => {
  const { data } = await api.post(`/admin/institutional-order-storage/orders/${orderId}/archive`, payload, {
    timeout: INSTITUTIONAL_STORAGE_API_TIMEOUT_MS,
  });
  return data;
};

export const adminDeleteInstitutionalOrderRequest = async (orderId) => {
  const { data } = await api.delete(`/admin/institutional-order-storage/orders/${orderId}`, {
    timeout: INSTITUTIONAL_STORAGE_API_TIMEOUT_MS,
  });
  return data;
};

export const adminListInstitutionalPendingApprovalsRequest = async (params = {}, options = {}) => {
  const { signal, ...rest } = options;
  const { data } = await api.get("/admin/institutional-order-storage/pending-approvals", {
    params,
    signal,
    timeout: INSTITUTIONAL_STORAGE_API_TIMEOUT_MS,
    ...rest,
  });
  return data;
};

export const adminGetInstitutionalScheduleRequest = async (storageId) => {
  const { data } = await api.get(`/admin/institutional-order-storage/${storageId}/schedule`);
  return data;
};

export const adminGenerateInstitutionalScheduleRequest = async (storageId, payload = {}) => {
  const { data } = await api.post(
    `/admin/institutional-order-storage/${storageId}/schedule/generate`,
    payload,
  );
  return data;
};

export const adminRetryInstitutionalBatchRequest = async (batchId) => {
  const { data } = await api.post(`/admin/institutional-order-storage/batches/${batchId}/retry`, {});
  return data;
};

export const adminTransitionInstitutionalStorageStatusRequest = async (storageId, payload) => {
  const { data } = await api.post(`/admin/institutional-order-storage/${storageId}/status`, payload);
  return data;
};

export const adminListInstitutionalBatchOrdersRequest = async (batchId) => {
  const { data } = await api.get(`/admin/institutional-order-storage/batches/${batchId}/orders`);
  return data;
};

export const adminUpdateInstitutionalBatchRequest = async (batchId, payload) => {
  const { data } = await api.patch(`/admin/institutional-order-storage/batches/${batchId}`, payload);
  return data;
};

export const adminCancelInstitutionalBatchRequest = async (batchId) => {
  const { data } = await api.post(`/admin/institutional-order-storage/batches/${batchId}/cancel`, {});
  return data;
};

export const adminRemoveInstitutionalOrderFromBatchRequest = async (batchId, orderId) => {
  const { data } = await api.delete(`/admin/institutional-order-storage/batches/${batchId}/orders/${orderId}`);
  return data;
};

export const adminMoveInstitutionalOrderToBatchRequest = async (orderId, payload) => {
  const { data } = await api.post(`/admin/institutional-order-storage/orders/${orderId}/move-to-batch`, payload);
  return data;
};

export const adminListInstitutionalReleaseLogsRequest = async (storageId, params = {}) => {
  const { data } = await api.get(`/admin/institutional-order-storage/${storageId}/release-logs`, { params });
  return data;
};

export const adminGetInstitutionalSchedulerHealthRequest = async () => {
  const { data } = await api.get("/admin/institutional-order-storage/scheduler/health");
  return data;
};

export const getInstitutionMembershipRequest = async () => {
  const { data } = await api.get("/institution/membership");
  return data;
};

export const getInstitutionPoolOrdersRequest = async (params = {}) => {
  const { data } = await api.get("/institution/orders/pool", { params });
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

/** Admin/super_admin only: freelancers for internal order assignment (`GET /api/admin/freelancers`). */
export const getAdminFreelancersForAssignment = async ({
  search = "",
  limit = 50,
  status = "all",
  eligibleOnly = false,
} = {}) => {
  const { data } = await api.get("/admin/freelancers", {
    params: {
      search: String(search || "").trim() || undefined,
      limit,
      status,
      eligibleOnly: eligibleOnly ? true : undefined,
    },
  });
  return data;
};

export const adminListOrderClaimsRequest = async (orderId) => {
  const { data } = await api.get(`/admin/orders/${orderId}/claims`, { timeout: 30000 });
  return data;
};

/** Internal priced-bidding orders: list bids (admin/super_admin only). */
export const adminListInternalOrderBidsRequest = async (orderId) => {
  const { data } = await api.get(`/admin/orders/${orderId}/bids`, { timeout: 30000 });
  return data;
};

/** Award winning bid on internal priced-bidding pool job without Stripe. */
export const adminApproveInternalPricedBidRequest = async (orderId, bidId) => {
  const { data } = await api.post(`/admin/orders/${orderId}/bids/${bidId}/approve`);
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

function scheduleBlobUrlRevoke(url, ms = 120000) {
  window.setTimeout(() => {
    try {
      window.URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }, ms);
}

/** Open a tab synchronously on user click (before await) to avoid popup blockers. */
export function openPdfPreviewTab() {
  try {
    const w = window.open("about:blank", "_blank");
    if (w) {
      try {
        w.document.title = "جاري فتح الملف…";
        w.document.body.innerHTML =
          '<p style="font-family:system-ui,sans-serif;padding:2rem;text-align:center">جاري تحميل الملف…</p>';
      } catch {
        /* ignore */
      }
    }
    return w;
  } catch {
    return null;
  }
}

function toPdfBlob(data) {
  if (data instanceof Blob) {
    return data.type === "application/pdf" ? data : new Blob([data], { type: "application/pdf" });
  }
  return new Blob([data], { type: "application/pdf" });
}

/** Show PDF in previewWindow; if unavailable, download instead (no popup error). */
function showPdfBlobInTab(previewWindow, blob, fileName) {
  const pdfBlob = toPdfBlob(blob);
  const url = window.URL.createObjectURL(pdfBlob);
  if (previewWindow && !previewWindow.closed) {
    previewWindow.location.href = url;
    scheduleBlobUrlRevoke(url);
    return;
  }
  window.URL.revokeObjectURL(url);
  triggerBlobDownload(pdfBlob, fileName);
}

function orderFileDownloadPath(orderId, fileId, scope) {
  const oid = encodeURIComponent(String(orderId));
  const fid = encodeURIComponent(String(fileId));
  if (scope === "client") return `/client/orders/${oid}/files/${fid}/download`;
  if (scope === "freelancer") return `/freelancer/my-orders/${oid}/files/${fid}/download`;
  if (scope === "admin") return `/admin/orders/${oid}/files/${fid}/download`;
  throw new Error("Invalid order file scope.");
}

async function attachBlobErrorMessage(err) {
  const data = err?.response?.data;
  const st = err?.response?.status;
  if (data instanceof Blob && st && st >= 400) {
    try {
      const text = await data.text();
      const j = JSON.parse(text);
      if (j?.message) err.message = j.message;
    } catch {
      /* ignore */
    }
  }
  return err;
}

export async function fetchOrderFileBlob(orderId, fileId, scope, disposition = "attachment") {
  const base = orderFileDownloadPath(orderId, fileId, scope);
  const qs = disposition === "inline" ? "?disposition=inline" : "";
  try {
    return await api.get(`${base}${qs}`, { responseType: "blob", timeout: 120000 });
  } catch (e) {
    await attachBlobErrorMessage(e);
    throw e;
  }
}

/** Authenticated blob download for order_files by role (client | freelancer | admin). */
export async function downloadOrderFileForRole(orderId, fileId, fileName, scope) {
  const response = await fetchOrderFileBlob(orderId, fileId, scope, "attachment");
  triggerBlobDownload(response.data, fileName);
}

/** Open file in a new tab using an authenticated inline fetch (Bearer-friendly). */
export async function viewOrderFileForRole(orderId, fileId, fileName, scope, previewWindow = null) {
  const response = await fetchOrderFileBlob(orderId, fileId, scope, "inline");
  showPdfBlobInTab(previewWindow, response.data, fileName);
}

export const downloadClientOrderFile = (orderId, fileId, fileName) =>
  downloadOrderFileForRole(orderId, fileId, fileName, "client");

export const downloadFreelancerOrderFile = (orderId, fileId, fileName) =>
  downloadOrderFileForRole(orderId, fileId, fileName, "freelancer");

export const downloadAdminInternalOrderFile = (orderId, fileId, fileName) =>
  downloadOrderFileForRole(orderId, fileId, fileName, "admin");

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

// Super Admin — admin account management
export const listSuperAdminAdminsRequest = async () => {
  const { data } = await api.get("/super-admin/admins");
  return data;
};

export const listSuperAdminAdminPermissionsRequest = async () => {
  const { data } = await api.get("/super-admin/admin-permissions");
  return data;
};

export const createSuperAdminAdminRequest = async (payload) => {
  const { data } = await api.post("/super-admin/admins", payload);
  return data;
};

export const updateSuperAdminAdminRequest = async (id, payload) => {
  const { data } = await api.patch(`/super-admin/admins/${id}`, payload);
  return data;
};

// Super Admin — rate limit exemptions (scoped trusted users)
export const listRateLimitExemptionsRequest = async (params = {}) => {
  const { data } = await api.get("/super-admin/rate-limit-exemptions", {
    params: {
      includeInactive: params.includeInactive ? "1" : undefined,
      userId: params.userId || undefined,
    },
  });
  return data;
};

export const searchRateLimitExemptionUsersRequest = async (q) => {
  const { data } = await api.get("/super-admin/rate-limit-exemptions/users", {
    params: { q },
  });
  return data;
};

export const createRateLimitExemptionRequest = async (payload) => {
  const { data } = await api.post("/super-admin/rate-limit-exemptions", payload);
  return data;
};

export const updateRateLimitExemptionRequest = async (id, payload) => {
  const { data } = await api.patch(`/super-admin/rate-limit-exemptions/${id}`, payload);
  return data;
};

export const revokeRateLimitExemptionRequest = async (id) => {
  const { data } = await api.post(`/super-admin/rate-limit-exemptions/${id}/revoke`);
  return data;
};

export const getSuperadminVisitorsAnalyticsRequest = async (params = {}, options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/analytics/visitors", {
    params: {
      range: params.range || "7d",
      topLimit: params.topLimit || 10,
    },
    timeout: 12000,
    signal,
    ...axiosOptions,
  });
  return data;
};

export const getSuperadminDashboardSummaryRequest = async (options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/summary", {
    timeout: 10000,
    signal,
    ...axiosOptions,
  });
  return data;
};

/** Fast DB-only business KPIs (no PostHog) for Super Admin home. */
export const getSuperadminDashboardBusinessKpisRequest = async (options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/business-kpis", {
    timeout: 8000,
    signal,
    ...axiosOptions,
  });
  return data;
};

/** Super Admin home — single bundle (summary + KPIs + PostHog 7d + intelligence). Legacy / fallback. */
export const getSuperadminDashboardHomeBundleRequest = async (options = {}) => {
  const { signal, params, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/home-bundle", {
    timeout: 30000,
    signal,
    params,
    ...axiosOptions,
  });
  return data;
};

/** Super Admin home — fast first paint (summary, business KPIs, attention only). */
export const getSuperadminDashboardHomeFastRequest = async (options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/home-fast", {
    timeout: 10000,
    signal,
    ...axiosOptions,
  });
  return data;
};

/** Super Admin home — executive month comparison (non-blocking for hero KPIs). */
export const getSuperadminDashboardExecutiveKpisRequest = async (options = {}) => {
  const { signal, params, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/executive-kpis", {
    timeout: 12000,
    signal,
    params,
    ...axiosOptions,
  });
  return data;
};

/** Super Admin home — heavy SQL intelligence sections (no PostHog). */
export const getSuperadminDashboardHomeIntelligenceRequest = async (options = {}) => {
  const { signal, params, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/home-intelligence", {
    timeout: 30000,
    signal,
    params,
    ...axiosOptions,
  });
  return data;
};

export const getSuperadminDashboardIntelligenceSummaryRequest = async (options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/intelligence/summary", {
    timeout: 12000,
    signal,
    ...axiosOptions,
  });
  return data;
};

export const getSuperadminDashboardIntelligenceOrdersRequest = async (options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/intelligence/orders", {
    timeout: 15000,
    signal,
    ...axiosOptions,
  });
  return data;
};

export const getSuperadminDashboardIntelligenceClientsRequest = async (options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/intelligence/clients", {
    timeout: 12000,
    signal,
    ...axiosOptions,
  });
  return data;
};

export const getSuperadminDashboardIntelligenceFreelancersRequest = async (options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/intelligence/freelancers", {
    timeout: 12000,
    signal,
    ...axiosOptions,
  });
  return data;
};

export const getSuperadminDashboardIntelligenceSubscriptionsRequest = async (options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/intelligence/subscriptions", {
    timeout: 15000,
    signal,
    ...axiosOptions,
  });
  return data;
};

export const getSuperadminDashboardIntelligenceCoursesRequest = async (options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/intelligence/courses", {
    timeout: 12000,
    signal,
    ...axiosOptions,
  });
  return data;
};

export const getSuperadminDashboardIntelligenceCategoriesRequest = async (options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/intelligence/categories", {
    timeout: 12000,
    signal,
    ...axiosOptions,
  });
  return data;
};

export const getSuperadminDashboardIntelligenceFinancialRequest = async (options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/intelligence/financial", {
    timeout: 12000,
    signal,
    ...axiosOptions,
  });
  return data;
};

export const getSuperadminDashboardIntelligenceAttentionRequest = async (options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/intelligence/attention", {
    timeout: 12000,
    signal,
    ...axiosOptions,
  });
  return data;
};

export const getSuperadminDashboardIntelligenceActivityRequest = async (options = {}) => {
  const { signal, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/intelligence/activity", {
    timeout: 12000,
    signal,
    ...axiosOptions,
  });
  return data;
};

export const getSuperadminDashboardAnalysisRequest = async (options = {}) => {
  const { signal, params, ...axiosOptions } = options;
  const { data } = await api.get("/superadmin/dashboard/analysis", {
    params,
    timeout: 20000,
    signal,
    ...axiosOptions,
  });
  return data;
};

/** Super Admin — Financial Center */
const fc = "/superadmin/financial-center";

export const getFinancialCenterSummaryRequest = async (params = {}) => {
  const { data } = await api.get(`${fc}/summary`, { params });
  return data;
};

export const listFinancialCenterPeopleRequest = async (params = {}) => {
  const { data } = await api.get(`${fc}/people`, { params });
  return data;
};

export const getFinancialCenterPersonRequest = async (id) => {
  const { data } = await api.get(`${fc}/people/${id}`);
  return data;
};

export const getFinancialCenterPersonBonusDetailsRequest = async (id, params = {}) => {
  const { data } = await api.get(`${fc}/people/${id}/bonus-details`, { params });
  return data;
};

export const createFinancialCenterPersonRequest = async (payload) => {
  const { data } = await api.post(`${fc}/people`, payload);
  return data;
};

export const updateFinancialCenterPersonRequest = async (id, payload) => {
  const { data } = await api.patch(`${fc}/people/${id}`, payload);
  return data;
};

export const deactivateFinancialCenterPersonRequest = async (id) => {
  const { data } = await api.post(`${fc}/people/${id}/deactivate`);
  return data;
};

export const listFinancialCenterBonusRowsRequest = async (params = {}) => {
  const { data } = await api.get(`${fc}/bonus-rows`, { params });
  return data;
};

export const getFinancialCenterBonusRowRequest = async (id) => {
  const { data } = await api.get(`${fc}/bonus-rows/${id}`);
  return data;
};

export const createFinancialCenterBonusRowRequest = async (payload) => {
  const { data } = await api.post(`${fc}/bonus-rows`, payload);
  return data;
};

export const updateFinancialCenterBonusRowRequest = async (id, payload) => {
  const { data } = await api.patch(`${fc}/bonus-rows/${id}`, payload);
  return data;
};

export const approveFinancialCenterBonusRowRequest = async (id) => {
  const { data } = await api.post(`${fc}/bonus-rows/${id}/approve`);
  return data;
};

export const markFinancialCenterBonusRowReceivedRequest = async (id, payload = {}) => {
  const { data } = await api.post(`${fc}/bonus-rows/${id}/mark-received`, payload);
  return data;
};

export const markFinancialCenterBonusRowPaidRequest = async (id) => {
  const { data } = await api.post(`${fc}/bonus-rows/${id}/mark-paid`);
  return data;
};

export const cancelFinancialCenterBonusRowRequest = async (id) => {
  const { data } = await api.post(`${fc}/bonus-rows/${id}/cancel`);
  return data;
};

export const markFinancialCenterAllocationPaidRequest = async (allocationId, payload = {}) => {
  const { data } = await api.post(`${fc}/allocations/${allocationId}/mark-paid`, payload);
  return data;
};

export const markFinancialCenterAllocationUnpaidRequest = async (allocationId, payload = {}) => {
  const { data } = await api.post(`${fc}/allocations/${allocationId}/mark-unpaid`, payload);
  return data;
};

export const markFinancialCenterAllocationHeldRequest = async (allocationId, payload = {}) => {
  const { data } = await api.post(`${fc}/allocations/${allocationId}/mark-held`, payload);
  return data;
};

export const listFinancialCenterSubscriptionPaymentsRequest = async (params = {}) => {
  const { data } = await api.get(`${fc}/source-payments/subscriptions`, { params });
  return data;
};

export const listFinancialCenterOrderPaymentsRequest = async (params = {}) => {
  const { data } = await api.get(`${fc}/source-payments/orders`, { params });
  return data;
};

export const listFinancialCenterDepartmentsRequest = async (params = {}) => {
  const { data } = await api.get(`${fc}/departments`, { params });
  return data;
};

export const createFinancialCenterDepartmentRequest = async (payload) => {
  const { data } = await api.post(`${fc}/departments`, payload);
  return data;
};

export const createFinancialCenterPersonAccountRequest = async (id, payload) => {
  const { data } = await api.post(`${fc}/people/${id}/create-account`, payload);
  return data;
};

export const suspendFinancialCenterPersonAccountRequest = async (id) => {
  const { data } = await api.post(`${fc}/people/${id}/suspend-account`);
  return data;
};

export const activateFinancialCenterPersonAccountRequest = async (id) => {
  const { data } = await api.post(`${fc}/people/${id}/activate-account`);
  return data;
};

/** Financial user — own bonuses only (backend-filtered by user_id) */
const fu = "/financial-user";

export const getFinancialUserSummaryRequest = async () => {
  const { data } = await api.get(`${fu}/summary`);
  return data;
};

export const getFinancialUserMyBonusesRequest = async (params = {}) => {
  const { data } = await api.get(`${fu}/my-bonuses`, { params });
  return data;
};

export const getPublicHomeStatsRequest = async ({ signal } = {}) => {
  const { data } = await api.get("/public/home-stats", { signal, timeout: 8000 });
  return data;
};

export const getPublicSubSubcategoriesRequest = async ({ page = 1, limit = 16 } = {}, { signal } = {}) => {
  const { data } = await api.get("/public/sub-subcategories", {
    params: { page, limit },
    signal,
    timeout: 8000,
  });
  return data;
};

export const getPublicFaqRequest = async ({ signal } = {}) => {
  const { data } = await api.get("/public/faq", { signal, timeout: 8000 });
  return data;
};

export const getPublicSitePagesRequest = async ({ signal } = {}) => {
  const { data } = await api.get("/public/site-pages", { signal, timeout: 8000 });
  return data;
};

export const getPublicSitePageBySlugRequest = async (slug, { signal } = {}) => {
  const { data } = await api.get(`/public/site-pages/${encodeURIComponent(slug)}`, {
    signal,
    timeout: 8000,
  });
  return data;
};

export const listSuperAdminSitePagesRequest = async () => {
  const { data } = await api.get("/super-admin/site-pages");
  return data;
};

export const getSuperAdminSitePageRequest = async (id) => {
  const { data } = await api.get(`/super-admin/site-pages/${id}`);
  return data;
};

export const updateSuperAdminSitePageRequest = async (id, payload) => {
  const { data } = await api.patch(`/super-admin/site-pages/${id}`, payload);
  return data;
};

export const listSuperAdminWebsiteFaqRequest = async () => {
  const { data } = await api.get("/super-admin/website/faq");
  return data;
};

export const createSuperAdminWebsiteFaqRequest = async (payload) => {
  const { data } = await api.post("/super-admin/website/faq", payload);
  return data;
};

export const updateSuperAdminWebsiteFaqRequest = async (id, payload) => {
  const { data } = await api.patch(`/super-admin/website/faq/${id}`, payload);
  return data;
};

export const deleteSuperAdminWebsiteFaqRequest = async (id) => {
  const { data } = await api.delete(`/super-admin/website/faq/${id}`);
  return data;
};

export const reorderSuperAdminWebsiteFaqRequest = async (orderedIds) => {
  const { data } = await api.patch("/super-admin/website/faq/reorder", { orderedIds });
  return data;
};

export const getPublicWebsitePageRequest = async (slug, { signal } = {}) => {
  const { data } = await api.get(`/public/pages/${encodeURIComponent(slug)}`, { signal, timeout: 8000 });
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

export const listSuperAdminWebsitePagesRequest = async () => {
  const { data } = await api.get("/super-admin/website/pages");
  return data;
};

export const getSuperAdminWebsitePageRequest = async (slug) => {
  const { data } = await api.get(`/super-admin/website/pages/${encodeURIComponent(slug)}`);
  return data;
};

export const updateSuperAdminWebsitePageRequest = async (slug, payload) => {
  const { data } = await api.patch(`/super-admin/website/pages/${encodeURIComponent(slug)}`, payload);
  return data;
};

export const createSuperAdminWebsitePageBlockRequest = async (slug, payload) => {
  const { data } = await api.post(`/super-admin/website/pages/${encodeURIComponent(slug)}/blocks`, payload);
  return data;
};

export const updateSuperAdminWebsitePageBlockRequest = async (slug, blockId, payload) => {
  const { data } = await api.patch(
    `/super-admin/website/pages/${encodeURIComponent(slug)}/blocks/${blockId}`,
    payload,
  );
  return data;
};

export const deleteSuperAdminWebsitePageBlockRequest = async (slug, blockId) => {
  const { data } = await api.delete(
    `/super-admin/website/pages/${encodeURIComponent(slug)}/blocks/${blockId}`,
  );
  return data;
};

export const reorderSuperAdminWebsitePageBlocksRequest = async (slug, orderedIds) => {
  const { data } = await api.patch(
    `/super-admin/website/pages/${encodeURIComponent(slug)}/blocks/reorder`,
    { orderedIds },
  );
  return data;
};

export const uploadSuperAdminWebsiteImageRequest = async (file) => {
  const fd = new FormData();
  fd.append("image", file);
  const { data } = await api.post("/super-admin/website/upload-image", fd, { timeout: 120000 });
  return data;
};

/** Record a public pageview in the local DB counter (idempotent per idempotencyKey). */
export const postPublicPageViewRequest = async (payload) => {
  const { data } = await api.post("/public/analytics/pageview", payload, { timeout: 8000 });
  return data;
};

/** Public homepage / placement ads (active + scheduled window only). */
export const getPublicAdsRequest = async (params = {}) => {
  const { data } = await api.get("/public/ads", { params });
  return data;
};

/** إعلان منتهٍ أو غير ظاهر يعيد 404 — لا نعتبره خطأ Axios. */
export const postPublicAdImpressionRequest = async (adId, params = {}) => {
  await api.post(`/public/ads/${adId}/impression`, {}, {
    params,
    validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
  });
};

export const postPublicAdClickRequest = async (adId, params = {}) => {
  await api.post(`/public/ads/${adId}/click`, {}, {
    params,
    validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
  });
};

/** Active popup ads for current pathname (optional auth for audience targeting). */
export const getPublicPopupAdsRequest = async ({ pathname = "/" } = {}) => {
  const { data } = await api.get("/public/popup-ads", { params: { pathname }, timeout: 12000 });
  return data;
};

export const postPublicPopupAdImpressionRequest = async (adId) => {
  await api.post(`/public/popup-ads/${adId}/impression`, {}, {
    validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
  });
};

export const postPublicPopupAdClickRequest = async (adId) => {
  await api.post(`/public/popup-ads/${adId}/click`, {}, {
    validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
  });
};

// Ads (admin / super_admin)
export const adminListAdsRequest = async () => {
  const { data } = await api.get("/admin/ads");
  return data;
};

export const adminGetAdRequest = async (adId) => {
  const { data } = await api.get(`/admin/ads/${adId}`);
  return data;
};

export const adminCreateAdRequest = async (payload) => {
  const { data } = await api.post("/admin/ads", payload);
  return data;
};

export const adminUpdateAdRequest = async (adId, payload) => {
  const { data } = await api.patch(`/admin/ads/${adId}`, payload);
  return data;
};

export const adminDeleteAdRequest = async (adId, { adminNote } = {}) => {
  const { data } = await api.delete(`/admin/ads/${adId}`, { data: { adminNote } });
  return data;
};

export const adminDuplicateAdRequest = async (adId, { adminNote } = {}) => {
  const { data } = await api.post(`/admin/ads/${adId}/duplicate`, { adminNote });
  return data;
};

export const adminReorderAdsRequest = async ({ placement, items, adminNote }) => {
  const { data } = await api.patch("/admin/ads/reorder", { placement, items, adminNote });
  return data;
};

/** @param {File} file @param {"background"|"main"} [purpose] */
export const adminUploadAdImageRequest = async (file, purpose = "background") => {
  const fd = new FormData();
  fd.append("image", file);
  fd.append("purpose", purpose === "main" ? "main" : "background");
  const { data } = await api.post("/admin/ads/upload-image", fd, { timeout: 120000 });
  return data;
};

// Popup ads (admin / super_admin)
export const adminListPopupAdsRequest = async () => {
  const { data } = await api.get("/admin/popup-ads");
  return data;
};

export const adminCreatePopupAdRequest = async (payload) => {
  const { data } = await api.post("/admin/popup-ads", payload);
  return data;
};

export const adminUpdatePopupAdRequest = async (id, payload) => {
  const { data } = await api.patch(`/admin/popup-ads/${id}`, payload);
  return data;
};

export const adminDeletePopupAdRequest = async (id) => {
  const { data } = await api.delete(`/admin/popup-ads/${id}`);
  return data;
};

export const getSuperadminHeroHomeStatsSettingRequest = async () => {
  const { data } = await api.get("/superadmin/platform/home-hero-stats");
  return data;
};

export const patchSuperadminHeroHomeStatsSettingRequest = async (payload) => {
  const { data } = await api.patch("/superadmin/platform/home-hero-stats", payload);
  return data;
};

export const getSuperadminAnalyticsHealthRequest = async (options = {}) => {
  const { data } = await api.get("/superadmin/analytics/health", {
    timeout: 20000,
    ...options,
  });
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

export const adminUploadCourseTestFileRequest = async (courseId, file) => {
  const fd = new FormData();
  fd.append("testFile", file);
  const { data } = await api.post(`/admin/courses/${courseId}/test-file`, fd, { timeout: 120000 });
  return data;
};

export const adminUploadCoursePromptFileRequest = async (courseId, file) => {
  const fd = new FormData();
  fd.append("promptFile", file);
  const { data } = await api.post(`/admin/courses/${courseId}/prompt-file`, fd, { timeout: 120000 });
  return data;
};

export const adminUploadCourseModelAnswerFileRequest = async (courseId, file) => {
  const fd = new FormData();
  fd.append("modelAnswerFile", file);
  const { data } = await api.post(`/admin/courses/${courseId}/model-answer-file`, fd, { timeout: 120000 });
  return data;
};

export const adminPublishCourseRequest = async (courseId) => {
  const { data } = await api.post(`/admin/courses/${courseId}/publish`);
  return data;
};

export const adminArchiveCourseRequest = async (courseId) => {
  const { data } = await api.post(`/admin/courses/${courseId}/archive`);
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

/** Add one freelancer to a course without replacing other assignments (send modal). */
export const adminAddCourseFreelancerRequest = async (courseId, freelancerUserId) => {
  const { data } = await api.post(`/admin/courses/${courseId}/assign-one`, {
    freelancerUserId: Number(freelancerUserId),
  });
  return data;
};

/** Remove one freelancer from a course (admin "unsend"). */
export const adminRemoveCourseFreelancerRequest = async (courseId, freelancerUserId) => {
  const { data } = await api.post(`/admin/courses/${courseId}/unassign-one`, {
    freelancerUserId: Number(freelancerUserId),
  });
  return data;
};

export const adminListCourseFreelancersRequest = async (params = {}) => {
  const { data } = await api.get("/admin/courses/freelancers", { params, timeout: 30000 });
  return data;
};

// Courses (freelancer)
export const freelancerListMyCoursesRequest = async () => {
  const { data } = await api.get("/freelancer/courses");
  return data;
};

export const freelancerGetCourseSideTextAdRequest = async ({ context, courseId } = {}) => {
  const params = { context };
  if (courseId != null) params.courseId = courseId;
  const { data } = await api.get("/freelancer/course-side-text-ad", { params, timeout: 12000 });
  return data;
};

export const adminListCourseTextAdsRequest = async () => {
  const { data } = await api.get("/admin/course-text-ads");
  return data;
};

export const adminCreateCourseTextAdRequest = async (payload) => {
  const { data } = await api.post("/admin/course-text-ads", payload);
  return data;
};

export const adminUpdateCourseTextAdRequest = async (id, payload) => {
  const { data } = await api.patch(`/admin/course-text-ads/${id}`, payload);
  return data;
};

export const adminDeleteCourseTextAdRequest = async (id) => {
  const { data } = await api.delete(`/admin/course-text-ads/${id}`);
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

export const freelancerUploadCompletedExamFileRequest = async (courseId, file) => {
  const fd = new FormData();
  fd.append("completedExamFile", file);
  const { data } = await api.post(`/freelancer/courses/${courseId}/completed-exam-file`, fd, { timeout: 120000 });
  return data;
};

export const freelancerSubmitCourseCompletionRequest = async (courseId, payload = {}) => {
  const file = payload?.auditResponseFile;
  const marks = payload?.questionMarks;
  const hasMarks = Array.isArray(marks) && marks.length > 0;
  if (file instanceof File || hasMarks) {
    const fd = new FormData();
    if (payload.auditResponseText != null && String(payload.auditResponseText).trim()) {
      fd.append("auditResponseText", String(payload.auditResponseText).trim());
    }
    if (payload.auditNotes) fd.append("auditNotes", String(payload.auditNotes).trim());
    if (file instanceof File) fd.append("auditResponseFile", file);
    if (hasMarks) fd.append("questionMarks", JSON.stringify(marks));
    const { data } = await api.post(`/freelancer/courses/${courseId}/complete`, fd, { timeout: 120000 });
    return data;
  }
  const body = { ...payload };
  delete body.auditResponseFile;
  const { data } = await api.post(`/freelancer/courses/${courseId}/complete`, body);
  return data;
};

function filenameFromContentDisposition(header) {
  if (!header) return null;
  const m = /filename="([^"]+)"/i.exec(String(header));
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

async function fetchCourseFileBlob(scope, courseId, fileKind, download = false) {
  const cid = encodeURIComponent(String(courseId));
  const kind = encodeURIComponent(String(fileKind));
  const base =
    scope === "admin" ? `/admin/courses/${cid}/files/${kind}` : `/freelancer/courses/${cid}/files/${kind}`;
  const qs = download ? "?download=1" : "";
  try {
    return await api.get(`${base}${qs}`, { responseType: "blob", timeout: 120000 });
  } catch (e) {
    await attachBlobErrorMessage(e);
    throw e;
  }
}

export async function viewFreelancerCourseFile(courseId, fileKind, fallbackName, previewWindow = null) {
  const response = await fetchCourseFileBlob("freelancer", courseId, fileKind, false);
  const name =
    filenameFromContentDisposition(response.headers?.["content-disposition"]) || fallbackName || "course-file.pdf";
  showPdfBlobInTab(previewWindow, response.data, name);
  return name;
}

export async function downloadFreelancerCourseFile(courseId, fileKind, fallbackName) {
  const response = await fetchCourseFileBlob("freelancer", courseId, fileKind, true);
  const name =
    filenameFromContentDisposition(response.headers?.["content-disposition"]) || fallbackName || "course-file.pdf";
  const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: "application/pdf" });
  triggerBlobDownload(blob, name);
}

export async function viewFreelancerCompletedExamFile(courseId, fallbackName, previewWindow = null) {
  return viewFreelancerCourseFile(courseId, "completed-exam", fallbackName, previewWindow);
}

export async function downloadFreelancerCompletedExamFile(courseId, fallbackName) {
  return downloadFreelancerCourseFile(courseId, "completed-exam", fallbackName);
}

export async function viewAdminCourseFile(courseId, fileKind, fallbackName, previewWindow = null) {
  const response = await fetchCourseFileBlob("admin", courseId, fileKind, false);
  const name =
    filenameFromContentDisposition(response.headers?.["content-disposition"]) || fallbackName || "course-file.pdf";
  showPdfBlobInTab(previewWindow, response.data, name);
  return name;
}

export async function downloadAdminCourseFile(courseId, fileKind, fallbackName) {
  const response = await fetchCourseFileBlob("admin", courseId, fileKind, true);
  const name =
    filenameFromContentDisposition(response.headers?.["content-disposition"]) || fallbackName || "course-file.pdf";
  const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: "application/pdf" });
  triggerBlobDownload(blob, name);
}

/** Dispatched on `window` after notification-worthy events (e.g. subscription payment) so the bell refetches. */
export const NOTIFICATIONS_REFRESH_EVENT = "orderz-notifications-refresh";

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
