import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import AuthFormCard from "../components/auth/AuthFormCard";
import AuthLayout from "../components/auth/AuthLayout";
import Button from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import { canRoleAccessPath, getDashboardPath } from "../constants/authRoutes";

function loginErrorMessage(err) {
  const apiMsg = err?.response?.data?.message;
  if (apiMsg) {
    const map = {
      "Invalid email or password.": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      "Authentication token is required.": "يجب تسجيل الدخول.",
      "This account has been disabled.": "تم تعطيل هذا الحساب.",
      "Server configuration error.": "خطأ في إعدادات الخادم. تواصل مع الدعم.",
      "Database schema is missing the users table. Run backend/sql/init.sql against your database, then try again.":
        "يوجد مشكلة في قاعدة البيانات. تواصل مع الدعم أو أعد تهيئة قاعدة البيانات.",
      "Database schema does not match the application. Re-run backend/sql/init.sql or migrate your database.":
        "يوجد مشكلة في قاعدة البيانات. تواصل مع الدعم أو حدّث مخطط قاعدة البيانات.",
    };
    if (map[apiMsg]) return map[apiMsg];
    if (String(apiMsg).toLowerCase().includes("column") || String(apiMsg).toLowerCase().includes("schema")) {
      return "يوجد مشكلة في قاعدة البيانات. تواصل مع الدعم.";
    }
    return apiMsg;
  }
  if (err?.message?.includes("Network")) {
    return "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً.";
  }
  return "تعذر تسجيل الدخول. حاول مجدداً.";
}

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      const from = location.state?.from?.pathname;
      const target =
        from && canRoleAccessPath(from, user.role) ? from : getDashboardPath(user.role);
      navigate(target, { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
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
        <form className="auth-form-grid" onSubmit={handleSubmit} noValidate>
          {error ? <p className="auth-form-error">{error}</p> : null}

          <label className="auth-field">
            <span>البريد الإلكتروني</span>
            <div className="auth-input-wrap auth-input-wrap--noicon">
              <input
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

          <label className="auth-field">
            <div className="auth-field-head">
              <span>كلمة المرور</span>
              <Link to="/forgot-password" className="auth-subtle-link">
                هل نسيت كلمة المرور؟
              </Link>
            </div>
            <div className="auth-input-wrap">
              <i className="auth-input-icon" aria-hidden="true">
                *
              </i>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={submitting}
              />
            </div>
          </label>

          <Button type="submit" className="auth-submit-btn" disabled={submitting}>
            {submitting ? "جاري الدخول…" : "تسجيل الدخول"}
          </Button>
        </form>
      </AuthFormCard>
    </AuthLayout>
  );
};

export default Login;
