import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import AuthFormCard from "../components/auth/AuthFormCard";
import AuthLayout from "../components/auth/AuthLayout";
import * as tw from "../components/auth/authTw";
import Button from "../components/ui/Button";
import { useToast } from "../components/ui/toastContext";
import { useAuth } from "../context/useAuth";
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
      "Database schema is missing required tables. New DB: run sql/init.sql (npm run db:init from backend). Then run npm run db:migrate for RBAC, plans, and subscriptions.":
        "قاعدة البيانات غير مكتملة. نفّذ تهيئة القاعدة ثم شغّل npm run db:migrate من مجلد backend.",
      "Database schema does not match the application. Re-run sql/init.sql if needed, then npm run db:migrate from the backend directory.":
        "مخطط قاعدة البيانات غير متطابق. حدّث القاعدة ثم شغّل npm run db:migrate من مجلد backend.",
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
  const { toast } = useToast();
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
            <div className={tw.authInputWrap}>
              <i className={tw.authInputIcon} aria-hidden="true">
                *
              </i>
              <input
                className={tw.authInput}
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

          <Button unstyled type="submit" className={tw.authSubmitBtn} disabled={submitting}>
            {submitting ? "جاري الدخول…" : "تسجيل الدخول"}
          </Button>
        </form>
      </AuthFormCard>
    </AuthLayout>
  );
};

export default Login;
