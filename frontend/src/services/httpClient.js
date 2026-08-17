import axios from "axios";
import { getApiBaseUrl } from "../config/apiBase";

export const TOKEN_KEY = "orderz_auth_token";

/** Non-secret flag: set after any successful server session in this tab (login/register); cleared on logout. Used to avoid GET /auth/me for cold visitors. HttpOnly cookies alone are not readable here—users who only clear localStorage may need to sign in again until the next successful session. */
export const AUTH_SESSION_HINT_KEY = "orderz_session_hint";

/** Register/resend wait for bcrypt + DB + email; allow more than the default 10s client timeout. */
export const AUTH_REGISTER_TIMEOUT_MS = 25000;

const api = axios.create({
  baseURL: getApiBaseUrl(),
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

export default api;
