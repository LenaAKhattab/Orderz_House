import { useCallback, useEffect, useMemo, useState } from "react";
import { TOKEN_KEY, loginRequest, logoutRequest, meRequest, registerRequest, verifyRegisterOtpRequest } from "../services/api";
import { getDashboardPath } from "../constants/authRoutes";
import { AuthContext } from "./authContext";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(async () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    try {
      await logoutRequest();
    } catch {
      /* ignore — cookie may already be absent */
    }
  }, []);

  /** Prefer HttpOnly cookie set by the API; do not persist JWT in localStorage. */
  const applySession = useCallback((nextUser) => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await meRequest();
        if (!cancelled && data?.data?.user) {
          localStorage.removeItem(TOKEN_KEY);
          setUser(data.data.user);
        }
      } catch {
        if (!cancelled) {
          await clearSession();
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
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    const data = await loginRequest(email, password);
    const nextUser = data?.data?.user;
    if (!nextUser) {
      throw new Error("استجابة غير صالحة من الخادم.");
    }
    applySession(nextUser);
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
    applySession(nextUser);
    return nextUser;
  }, [applySession]);

  const completeRegisterWithOtp = useCallback(async (email, otp) => {
    const data = await verifyRegisterOtpRequest(email, otp);
    const nextUser = data?.data?.user;
    if (!nextUser) {
      throw new Error("استجابة غير صالحة من الخادم.");
    }
    applySession(nextUser);
    return nextUser;
  }, [applySession]);

  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      completeRegisterWithOtp,
      logout,
      getDashboardPath: () => {
        const role = user?.primaryRole || user?.role;
        return user && role ? getDashboardPath(role) : "/login";
      },
    }),
    [user, loading, login, register, completeRegisterWithOtp, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
