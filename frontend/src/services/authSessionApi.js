import api, { AUTH_REGISTER_TIMEOUT_MS, AUTH_SESSION_HINT_KEY, TOKEN_KEY } from "./httpClient";

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

/** Clears HttpOnly session cookie on the server (no body secrets). */
export const logoutRequest = async () => {
  const { data } = await api.post("/auth/logout");
  return data;
};
