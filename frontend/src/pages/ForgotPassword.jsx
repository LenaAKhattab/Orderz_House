import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthFormCard from "../components/auth/AuthFormCard";
import AuthLayout from "../components/auth/AuthLayout";
import * as tw from "../components/auth/authTw";
import Button from "../components/ui/Button";
import {
  forgotPasswordRequest,
  resetPasswordRequest,
  verifyForgotPasswordOtpRequest,
} from "../services/api";
import { useTranslation } from "../i18n/LanguageProvider";
import { getSafeApiErrorMessage } from "../utils/apiErrorMessage";
import { AUTH_TOAST_PASSWORD_RESET } from "../utils/guestPoolLoginToast";

const ForgotPassword = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const mapError = (err) => getSafeApiErrorMessage(err, t("auth.forgot.error"));

  const visualContent = {
    title: t("auth.forgot.visualTitle"),
    description: t("auth.forgot.visualDesc"),
    quote: t("auth.forgot.visualQuote"),
    personName: t("auth.forgot.visualPersonName"),
    personRole: t("auth.forgot.visualPersonRole"),
  };

  const passwordLocalError = () => {
    if (newPassword.length < 8) return t("auth.forgot.validation.passwordMin");
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return t("auth.forgot.validation.passwordComplexity");
    }
    if (newPassword !== confirmPassword) return t("auth.forgot.validation.passwordMismatch");
    return null;
  };

  useEffect(() => {
    if (step !== 3) return undefined;
    const timer = window.setTimeout(() => {
      const el = document.getElementById("forgot-new-password");
      el?.focus?.();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [step]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError("");
    const em = email.trim().toLowerCase();

    if (step === 1) {
      if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        setError(t("auth.forgot.validation.emailInvalid"));
        return;
      }
      setSubmitting(true);
      submittingRef.current = true;
      try {
        await forgotPasswordRequest(em);
        setStep(2);
        setOtp("");
      } catch (err) {
        setError(mapError(err));
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
      return;
    }

    if (step === 2) {
      const code = otp.trim();
      if (!/^\d{6}$/.test(code)) {
        setError(t("auth.forgot.validation.otpRequired"));
        return;
      }
      setSubmitting(true);
      submittingRef.current = true;
      try {
        const data = await verifyForgotPasswordOtpRequest(em, code);
        const token = data?.data?.resetToken;
        if (!token) {
          setError(t("auth.forgot.validation.invalidServerResponse"));
          return;
        }
        setResetToken(token);
        setStep(3);
        setNewPassword("");
        setConfirmPassword("");
      } catch (err) {
        setError(mapError(err));
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
      return;
    }

    const pwErr = passwordLocalError();
    if (pwErr) {
      setError(pwErr);
      return;
    }
    setSubmitting(true);
    submittingRef.current = true;
    try {
      await resetPasswordRequest(em, resetToken, newPassword);
      navigate("/login", { replace: true, state: { authToast: AUTH_TOAST_PASSWORD_RESET } });
    } catch (err) {
      setError(mapError(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const title =
    step === 1
      ? t("auth.forgot.emailStep.title")
      : step === 2
        ? t("auth.forgot.otpStep.title")
        : t("auth.forgot.passwordStep.title");
  const subtitle =
    step === 1
      ? t("auth.forgot.emailStep.subtitle")
      : step === 2
        ? t("auth.forgot.otpStep.subtitle")
        : t("auth.forgot.passwordStep.subtitle");

  return (
    <AuthLayout visualContent={visualContent}>
      <AuthFormCard
        title={title}
        subtitle={subtitle}
        footerText={t("auth.forgot.footerRemembered")}
        footerLinkText={t("auth.forgot.footerLogin")}
        footerLinkTo="/login"
      >
        <form className={tw.authFormGrid} onSubmit={handleSubmit} noValidate>
          {error ? <p className={tw.authFormError}>{error}</p> : null}

          {step === 1 ? (
            <>
              <label className={tw.authField}>
                <span className={tw.authFieldLabel}>{t("auth.forgot.fields.email")}</span>
                <div className={tw.authInputWrap}>
                  <i className={tw.authInputIcon} aria-hidden="true">
                    @
                  </i>
                  <input
                    className={tw.authInputCredentialWithIcon}
                    type="email"
                    dir="ltr"
                    inputMode="email"
                    placeholder="name@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={submitting}
                  />
                </div>
              </label>
              <Button unstyled type="submit" className={tw.authSubmitBtn} disabled={submitting}>
                {submitting ? t("auth.forgot.loading.sending") : t("auth.forgot.buttons.sendCode")}
              </Button>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className={tw.authHelperText} style={{ margin: 0 }}>
                {t("auth.forgot.otpStep.hint")}
              </p>
              <label className={tw.authField}>
                <span className={tw.authFieldLabel}>{t("auth.forgot.fields.otp")}</span>
                <div className={`${tw.authInputWrap} ${tw.authLtr}`}>
                  <input
                    className={tw.authInputNoIcon}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    disabled={submitting}
                  />
                </div>
              </label>
              <Button unstyled type="submit" className={tw.authSubmitBtn} disabled={submitting}>
                {submitting ? t("auth.forgot.loading.verifying") : t("auth.forgot.buttons.verifyContinue")}
              </Button>
              <button
                type="button"
                className={tw.authSubtleLink}
                style={{ background: "none", border: "none", cursor: "pointer", width: "100%" }}
                disabled={submitting}
                onClick={() => {
                  setStep(1);
                  setOtp("");
                  setError("");
                }}
              >
                {t("auth.forgot.buttons.changeEmail")}
              </button>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <label className={tw.authField}>
                <span className={tw.authFieldLabel}>{t("auth.forgot.fields.newPassword")}</span>
                <div className={tw.authInputWrap}>
                  <input
                    id="forgot-new-password"
                    className={tw.authInputCredential}
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </label>
              <label className={tw.authField}>
                <span className={tw.authFieldLabel}>{t("auth.forgot.fields.confirmPassword")}</span>
                <div className={tw.authInputWrap}>
                  <input
                    className={tw.authInputCredential}
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </label>
              <Button unstyled type="submit" className={tw.authSubmitBtn} disabled={submitting}>
                {submitting ? t("auth.forgot.loading.saving") : t("auth.forgot.buttons.resetPassword")}
              </Button>
            </>
          ) : null}

          <Link to="/register" className={tw.authSubtleLink}>
            {t("auth.forgot.footerCreateAccount")}
          </Link>
        </form>
      </AuthFormCard>
    </AuthLayout>
  );
};

export default ForgotPassword;
