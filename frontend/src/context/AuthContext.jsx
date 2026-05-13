import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TOKEN_KEY,
  AUTH_SESSION_HINT_KEY,
  fetchSessionBootstrap,
  resetSessionBootstrap,
  loginRequest,
  logoutRequest,
  meRequest,
  registerRequest,
  verifyRegisterOtpRequest,
} from "../services/api";
import { getDashboardPath } from "../constants/authRoutes";
import { AuthContext } from "./authContext";
import { clearAnalyticsUser, trackEvent } from "../services/analytics";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearLocalSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(AUTH_SESSION_HINT_KEY);
    setUser(null);
    clearAnalyticsUser();
  }, []);

  const clearSession = useCallback(async () => {
    clearLocalSession();
    resetSessionBootstrap();
    try {
      await logoutRequest();
    } catch {
      /* ignore — cookie may already be absent */
    }
  }, [clearLocalSession]);

  /** Prefer HttpOnly cookie set by the API; clear legacy JWT from localStorage and mark session hint for optional bootstrap skip. */
  const applySession = useCallback((nextUser) => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(AUTH_SESSION_HINT_KEY, "1");
    setUser(nextUser);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchSessionBootstrap();
        if (cancelled) return;
        if (data?.data?.user) {
          applySession(data.data.user);
        } else {
          clearLocalSession();
        }
      } catch (err) {
        if (!cancelled) {
          // Network / 5xx — keep this visible; user is treated as signed out for routing.
          console.error("[auth] session bootstrap failed:", err?.message || err);
          clearLocalSession();
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only session bootstrap
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await loginRequest(email, password);
    const nextUser = data?.data?.user;
    if (!nextUser) {
      throw new Error("استجابة غير صالحة من الخادم.");
    }
    resetSessionBootstrap();
    applySession(nextUser);
    trackEvent("user_logged_in", { method: "password", role: String(nextUser?.primaryRole || nextUser?.role || "unknown") });
    return nextUser;
  }, [applySession]);

  const register = useCallback(async (body) => {
    const data = await registerRequest(body);
    if (data?.data?.requiresEmailVerification) {
      return {
        requiresEmailVerification: true,
        email: data.data.email,
      };
    }
    const nextUser = data?.data?.user;
    if (!nextUser) {
      throw new Error("استجابة غير صالحة من الخادم.");
    }
    resetSessionBootstrap();
    applySession(nextUser);
    trackEvent("signup_completed", { method: "registration", role: String(nextUser?.primaryRole || nextUser?.role || "unknown") });
    return nextUser;
  }, [applySession]);

  const completeRegisterWithOtp = useCallback(async (email, otp) => {
    const data = await verifyRegisterOtpRequest(email, otp);
    const nextUser = data?.data?.user;
    if (!nextUser) {
      throw new Error("استجابة غير صالحة من الخادم.");
    }
    resetSessionBootstrap();
    applySession(nextUser);
    trackEvent("signup_completed", { method: "registration_otp", role: String(nextUser?.primaryRole || nextUser?.role || "unknown") });
    return nextUser;
  }, [applySession]);

  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const data = await meRequest();
    if (data?.data?.user) {
      applySession(data.data.user);
    } else {
      clearLocalSession();
      resetSessionBootstrap();
    }
  }, [applySession, clearLocalSession]);

  const isAuthenticated = Boolean(user);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      loading,
      login,
      register,
      completeRegisterWithOtp,
      logout,
      refreshUser,
      getDashboardPath: () => {
        const role = user?.primaryRole || user?.role;
        return user && role ? getDashboardPath(role) : "/login";
      },
    }),
    [user, isAuthenticated, loading, login, register, completeRegisterWithOtp, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
