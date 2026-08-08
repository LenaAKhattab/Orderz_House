import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation, useNavigationType } from "react-router-dom";
import AuthFormCard from "../components/auth/AuthFormCard";
import AuthLayout from "../components/auth/AuthLayout";
import * as tw from "../components/auth/authTw";
import Button from "../components/ui/Button";
import { useToast } from "../components/ui/toastContext";
import { useAuth } from "../context/useAuth";
import { canRoleAccessPath, getDashboardPath, getProblemsSuggestionsPathForRole, LOGIN_PROBLEMS_SUGGESTIONS_INTENT, ROLE } from "../constants/authRoutes";
import { getFirstAccessibleDashboardPath } from "../constants/dashboardPermissions";
import { useTranslation } from "../i18n/LanguageProvider";
import { getAuthApiErrorMessage } from "../utils/apiErrorMessage";
import {
  AUTH_TOAST_PASSWORD_RESET,
  getPasswordResetLoginToast,
  isGuestPoolLoginMessage,
  pushLoginRouteMessageToast,
} from "../utils/guestPoolLoginToast";

function loginErrorMessage(err, t) {
  return getAuthApiErrorMessage(err, t, "auth.login.error");
}

const Login = () => {
  const { login } = useAuth();
  const { t } = useTranslation();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handledRouteMessageKeyRef = useRef(null);

  useEffect(() => {
    const authToast = location.state?.authToast;
    const msg = location.state?.message;
    if (!authToast && !msg) {
      handledRouteMessageKeyRef.current = null;
      return;
    }

    const text = authToast === AUTH_TOAST_PASSWORD_RESET ? AUTH_TOAST_PASSWORD_RESET : String(msg || "");
    const entryKey = `${location.key}:${text}`;
    if (handledRouteMessageKeyRef.current === entryKey) return;
    handledRouteMessageKeyRef.current = entryKey;

    const stripState = () => {
      navigate(location.pathname, {
        replace: true,
        state: {
          ...(location.state?.from ? { from: location.state.from } : {}),
          ...(location.state?.[LOGIN_PROBLEMS_SUGGESTIONS_INTENT] === true
            ? { [LOGIN_PROBLEMS_SUGGESTIONS_INTENT]: true }
            : {}),
        },
      });
    };

    // Legacy/history entries: guest pool redirect message is owned by OpenOrdersMarketplace click handler.
    if (msg && isGuestPoolLoginMessage(msg)) {
      stripState();
      return;
    }

    // Back/forward must not replay route-carried messages (stale history entries).
    if (navigationType === "POP") {
      stripState();
      return;
    }

    if (authToast === AUTH_TOAST_PASSWORD_RESET) {
      success(getPasswordResetLoginToast(t));
      stripState();
      return;
    }

    if (pushLoginRouteMessageToast(success, text, t)) {
      stripState();
    }
  }, [location.key, location.pathname, location.state?.authToast, location.state?.message, location.state?.from, location.state?.[LOGIN_PROBLEMS_SUGGESTIONS_INTENT], navigationType, navigate, success, t]);
  const visualContent = {
    title: t("auth.login.visualTitle"),
    description: t("auth.login.visualDesc"),
    quote: t("auth.login.visualQuote"),
    personName: t("auth.login.visualPersonName"),
    personRole: t("auth.login.visualPersonRole"),
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError("");
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      success({ title: t("auth.login.successTitle"), message: t("auth.login.successMessage") });
      const from = location.state?.from?.pathname;
      const role = user?.primaryRole || user?.role;
      const defaultDashboard =
        role === ROLE.ADMIN ? getFirstAccessibleDashboardPath(user) : getDashboardPath(role);
      let target = defaultDashboard;
      if (from && canRoleAccessPath(from, role)) {
        target = from;
      } else if (location.state?.[LOGIN_PROBLEMS_SUGGESTIONS_INTENT] === true) {
        const feedbackPath = getProblemsSuggestionsPathForRole(role);
        if (feedbackPath && canRoleAccessPath(feedbackPath, role)) {
          target = feedbackPath;
        }
      }
      navigate(target, { replace: true });
    } catch (err) {
      const msg = loginErrorMessage(err, t);
      setError(msg);
      showError({ title: t("auth.login.errorTitle"), message: msg, autoClose: false });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout visualContent={visualContent}>
      <AuthFormCard
        title={t("auth.login.title")}
        subtitle={t("auth.login.subtitle")}
        footerText={t("auth.login.noAccount")}
        footerLinkText={t("auth.login.createAccount")}
        footerLinkTo="/register"
      >
        <form className={tw.authFormGrid} onSubmit={handleSubmit} noValidate>
          {error ? <p className={tw.authFormError}>{error}</p> : null}

          <label className={tw.authField}>
            <span className={tw.authFieldLabel}>{t("auth.login.email")}</span>
            <div className={tw.authInputWrap}>
              <input
                className={tw.authInputCredential}
                type="email"
                name="email"
                dir="ltr"
                inputMode="email"
                autoComplete="email"
                placeholder="name@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
              />
            </div>
          </label>

          <label className={tw.authField}>
            <div className={tw.authFieldHead}>
              <span className={tw.authFieldLabel}>{t("auth.login.password")}</span>
              <Link to="/forgot-password" className={tw.authSubtleLink}>
                {t("auth.login.forgotPassword")}
              </Link>
            </div>
            <div className={tw.authPasswordFieldShell} dir="ltr">
              <input
                className={tw.authInputCredentialPassword}
                type={showPassword ? "text" : "password"}
                name="password"
                dir="ltr"
                autoComplete="current-password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={submitting}
              />
              <button
                type="button"
                className={tw.authPasswordToggleBtn}
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? t("auth.login.hidePassword") : t("auth.login.showPassword")}
                disabled={submitting}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-[22px] w-[22px] shrink-0" aria-hidden="true">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                    />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-[22px] w-[22px] shrink-0" aria-hidden="true">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          <Button unstyled type="submit" className={tw.authSubmitBtn} disabled={submitting}>
            {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>
        </form>
      </AuthFormCard>
    </AuthLayout>
  );
};

export default Login;
