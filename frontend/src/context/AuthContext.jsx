import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { TOKEN_KEY, loginRequest, meRequest, registerRequest } from "../services/api";
import { getDashboardPath } from "../constants/authRoutes";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const applySession = useCallback((token, nextUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await meRequest();
        if (!cancelled && data?.data?.user) {
          setUser(data.data.user);
        }
      } catch {
        if (!cancelled) {
          clearSession();
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
    const token = data?.data?.token;
    const nextUser = data?.data?.user;
    if (!token || !nextUser) {
      throw new Error("استجابة غير صالحة من الخادم.");
    }
    applySession(token, nextUser);
    return nextUser;
  }, [applySession]);

  const register = useCallback(async (body) => {
    const data = await registerRequest(body);
    const token = data?.data?.token;
    const nextUser = data?.data?.user;
    if (!token || !nextUser) {
      throw new Error("استجابة غير صالحة من الخادم.");
    }
    applySession(token, nextUser);
    return nextUser;
  }, [applySession]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      getDashboardPath: () => (user ? getDashboardPath(user.role) : "/login"),
    }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
