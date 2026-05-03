import { useEffect, useState } from "react";
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
import { getSafeApiErrorMessage } from "../utils/apiErrorMessage";

function mapError(err) {
  return getSafeApiErrorMessage(err, "حدث خطأ. حاول مجدداً.");
}

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const visualContent = {
    title: "استعد الوصول لحسابك بسهولة",
    description:
      "لا تقلق، يمكنك استرجاع حسابك خلال دقائق ومتابعة إدارة طلباتك من نفس لوحة العمل.",
    quote: "إجراء الاستعادة كان سريع وواضح، وقدرت أرجع لحسابي بدون أي تعقيد.",
    personName: "سارة محمود",
    personRole: "عميلة - إدارة الطلبات",
  };

  const passwordLocalError = () => {
    if (newPassword.length < 8) return "كلمة المرور يجب ألا تقل عن 8 أحرف.";
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return "كلمة المرور يجب أن تحتوي حرفاً ورقماً على الأقل.";
    }
    if (newPassword !== confirmPassword) return "تأكيد كلمة المرور غير مطابق.";
    return null;
  };

  useEffect(() => {
    if (step !== 3) return undefined;
    const t = window.setTimeout(() => {
      const el = document.getElementById("forgot-new-password");
      el?.focus?.();
    }, 100);
    return () => window.clearTimeout(t);
  }, [step]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const em = email.trim().toLowerCase();

    if (step === 1) {
      if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        setError("أدخل بريداً إلكترونياً صالحاً.");
        return;
      }
      setSubmitting(true);
      try {
        await forgotPasswordRequest(em);
        setStep(2);
        setOtp("");
      } catch (err) {
        setError(mapError(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (step === 2) {
      const code = otp.trim();
      if (!/^\d{6}$/.test(code)) {
        setError("أدخل رمز التحقق المكوّن من 6 أرقام.");
        return;
      }
      setSubmitting(true);
      try {
        const data = await verifyForgotPasswordOtpRequest(em, code);
        const token = data?.data?.resetToken;
        if (!token) {
          setError("استجابة غير صالحة من الخادم.");
          return;
        }
        setResetToken(token);
        setStep(3);
        setNewPassword("");
        setConfirmPassword("");
      } catch (err) {
        setError(mapError(err));
      } finally {
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
    try {
      await resetPasswordRequest(em, resetToken, newPassword);
      navigate("/login", { replace: true, state: { message: "تم تحديث كلمة المرور. يمكنك تسجيل الدخول." } });
    } catch (err) {
      setError(mapError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    step === 1 ? "استعادة كلمة المرور" : step === 2 ? "رمز التحقق" : "كلمة مرور جديدة";
  const subtitle =
    step === 1
      ? "أدخل بريدك الإلكتروني لإرسال رمز التحقق"
      : step === 2
        ? "أدخل الرمز المكوّن من 6 أرقام المرسل إلى بريدك"
        : "اختر كلمة مرور قوية لحسابك";

  return (
    <AuthLayout visualContent={visualContent}>
      <AuthFormCard
        title={title}
        subtitle={subtitle}
        footerText="تذكرت كلمة المرور؟"
        footerLinkText="تسجيل الدخول"
        footerLinkTo="/login"
      >
        <form className={tw.authFormGrid} onSubmit={handleSubmit} noValidate>
          {error ? <p className={tw.authFormError}>{error}</p> : null}

          {step === 1 ? (
            <>
              <label className={tw.authField}>
                <span className={tw.authFieldLabel}>البريد الإلكتروني</span>
                <div className={tw.authInputWrap}>
                  <i className={tw.authInputIcon} aria-hidden="true">
                    @
                  </i>
                  <input
                    className={tw.authInput}
                    type="email"
                    placeholder="name@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={submitting}
                  />
                </div>
              </label>
              <Button unstyled type="submit" className={tw.authSubmitBtn} disabled={submitting}>
                {submitting ? "جارٍ الإرسال..." : "إرسال رمز التحقق"}
              </Button>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className={tw.authHelperText} style={{ margin: 0 }}>
                إذا كان البريد مسجّلاً لدينا، ستصلك رسالة. الرمز صالح لمدة 10 دقائق.
              </p>
              <label className={tw.authField}>
                <span className={tw.authFieldLabel}>رمز التحقق</span>
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
                {submitting ? "جارٍ التحقق..." : "متابعة"}
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
                تغيير البريد الإلكتروني
              </button>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <label className={tw.authField}>
                <span className={tw.authFieldLabel}>كلمة المرور الجديدة</span>
                <div className={tw.authInputWrap}>
                  <input
                    id="forgot-new-password"
                    className={tw.authInputNoIcon}
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </label>
              <label className={tw.authField}>
                <span className={tw.authFieldLabel}>تأكيد كلمة المرور</span>
                <div className={tw.authInputWrap}>
                  <input
                    className={tw.authInputNoIcon}
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </label>
              <Button unstyled type="submit" className={tw.authSubmitBtn} disabled={submitting}>
                {submitting ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}
              </Button>
            </>
          ) : null}

          <Link to="/register" className={tw.authSubtleLink}>
            إنشاء حساب جديد
          </Link>
        </form>
      </AuthFormCard>
    </AuthLayout>
  );
};

export default ForgotPassword;
