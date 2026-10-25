import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation, useNavigationType } from "react-router-dom";
import AuthFormCard from "../components/auth/AuthFormCard";
import AuthLayout from "../components/auth/AuthLayout";
import AuthPasswordInput from "../components/auth/AuthPasswordInput";
import * as tw from "../components/auth/authTw";
import Button from "../components/ui/Button";
import { useToast } from "../components/ui/toastContext";
import { useAuth } from "../context/useAuth";
import { canRoleAccessPath, getProblemsSuggestionsPathForRole, LOGIN_PROBLEMS_SUGGESTIONS_INTENT } from "../constants/authRoutes";
import { getPostAuthHomePath } from "../constants/dashboardPermissions";
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
  const { success } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
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
    // Client-side checks first: field-level errors, focus the first invalid field, no network call.
    const nextFieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) nextFieldErrors.email = t("auth.login.validation.emailRequired");
    else if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(trimmedEmail)) nextFieldErrors.email = t("auth.login.validation.emailInvalid");
    if (!password) nextFieldErrors.password = t("auth.login.validation.passwordRequired");
    setFieldErrors(nextFieldErrors);
    if (nextFieldErrors.email || nextFieldErrors.password) {
      (nextFieldErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      success({ title: t("auth.login.successTitle"), message: t("auth.login.successMessage") });
      const from = location.state?.from?.pathname;
      const role = user?.primaryRole || user?.role;
      const defaultDashboard = getPostAuthHomePath(user);
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
      setError(loginErrorMessage(err, t));
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
          {error ? (
            <p className={tw.authFormError} role="alert">
              {error}
            </p>
          ) : null}

          <label className={tw.authField}>
            <span className={tw.authFieldLabel}>{t("auth.login.email")}</span>
            <div className={tw.authInputWrap}>
              <input
                ref={emailRef}
                className={tw.authInputCredential}
                type="email"
                name="email"
                dir="ltr"
                inputMode="email"
                autoComplete="email"
                placeholder="name@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: "" }));
                }}
                required
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                disabled={submitting}
              />
            </div>
            {fieldErrors.email ? (
              <span id="login-email-error" className={tw.authFieldError}>
                {fieldErrors.email}
              </span>
            ) : null}
          </label>

          <label className={tw.authField}>
            <div className={tw.authFieldHead}>
              <span className={tw.authFieldLabel}>{t("auth.login.password")}</span>
              <Link to="/forgot-password" className={tw.authSubtleLink}>
                {t("auth.login.forgotPassword")}
              </Link>
            </div>
            <AuthPasswordInput
              inputRef={passwordRef}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: "" }));
              }}
              required
              invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              disabled={submitting}
            />
            {fieldErrors.password ? (
              <span id="login-password-error" className={tw.authFieldError}>
                {fieldErrors.password}
              </span>
            ) : null}
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
