import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import AuthFormCard from "../components/auth/AuthFormCard";
import AuthLayout from "../components/auth/AuthLayout";
import * as tw from "../components/auth/authTw";
import Button from "../components/ui/Button";
import { useToast } from "../components/ui/toastContext";
import { useAuth } from "../context/useAuth";
import { canRoleAccessPath, getDashboardPath } from "../constants/authRoutes";
import { getSafeApiErrorMessage } from "../utils/apiErrorMessage";

function loginErrorMessage(err) {
  return getSafeApiErrorMessage(err, "تعذر تسجيل الدخول. حاول مجدداً.");
}

const Login = () => {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const msg = location.state?.message;
    if (msg) {
      toast.success({ title: "تم", message: String(msg) });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate, toast]);

  const visualContent = {
    title: "إدارة طلباتك باحترافية من أي مكان",
    description:
      "تواصل بسهولة مع العملاء والمستقلين، ونظّم سير العمل بخطوات واضحة تضمن تسليم الطلبات في الوقت المناسب.",
    quote: "أوردرز هاوس ساعدني أنظم مشاريعي مع العملاء بشكل أدق وأنجز الطلبات بثقة أكبر.",
    personName: "أحمد علي",
    personRole: "مستقل - تطوير واجهات",
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      toast.success({ title: "تم تسجيل الدخول", message: "أهلاً بعودتك." });
      const from = location.state?.from?.pathname;
      const role = user?.primaryRole || user?.role;
      const target =
        from && canRoleAccessPath(from, role) ? from : getDashboardPath(role);
      navigate(target, { replace: true });
    } catch (err) {
      const msg = loginErrorMessage(err);
      setError(msg);
      toast.error({ title: "تعذر تسجيل الدخول", message: msg, autoClose: false });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout visualContent={visualContent}>
      <AuthFormCard
        title="مرحباً بعودتك"
        subtitle="سجّل الدخول للمتابعة إلى أوردرز هاوس"
        footerText="ليس لديك حساب؟"
        footerLinkText="إنشاء حساب"
        footerLinkTo="/register"
      >
        <form className={tw.authFormGrid} onSubmit={handleSubmit} noValidate>
          {error ? <p className={tw.authFormError}>{error}</p> : null}

          <label className={tw.authField}>
            <span className={tw.authFieldLabel}>البريد الإلكتروني</span>
            <div className={tw.authInputWrap}>
              <input
                className={tw.authInputNoIcon}
                type="email"
                name="email"
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
              <span className={tw.authFieldLabel}>كلمة المرور</span>
              <Link to="/forgot-password" className={tw.authSubtleLink}>
                هل نسيت كلمة المرور؟
              </Link>
            </div>
            <div className={`${tw.authInputWrap} auth-input-wrap--password-toggle`}>
              <input
                className={tw.authInputNoIcon}
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={submitting}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                disabled={submitting}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </label>

          <Button unstyled type="submit" className={tw.authSubmitBtn} disabled={submitting}>
            {submitting ? "جاري الدخول…" : "تسجيل الدخول"}
          </Button>
        </form>
      </AuthFormCard>
    </AuthLayout>
  );
};

export default Login;
