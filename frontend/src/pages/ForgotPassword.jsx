import { Link } from "react-router-dom";
import AuthFormCard from "../components/auth/AuthFormCard";
import AuthLayout from "../components/auth/AuthLayout";
import Button from "../components/ui/Button";

const ForgotPassword = () => {
  const visualContent = {
    title: "استعد الوصول لحسابك بسهولة",
    description:
      "لا تقلق، يمكنك استرجاع حسابك خلال دقائق ومتابعة إدارة طلباتك من نفس لوحة العمل.",
    quote: "إجراء الاستعادة كان سريع وواضح، وقدرت أرجع لحسابي بدون أي تعقيد.",
    personName: "سارة محمود",
    personRole: "عميلة - إدارة الطلبات",
  };

  return (
    <AuthLayout visualContent={visualContent}>
      <AuthFormCard
        title="استعادة كلمة المرور"
        subtitle="أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين"
        footerText="تذكرت كلمة المرور؟"
        footerLinkText="تسجيل الدخول"
        footerLinkTo="/login"
      >
        <form className="auth-form-grid">
          <label className="auth-field">
            <span>البريد الإلكتروني</span>
            <div className="auth-input-wrap">
              <i className="auth-input-icon" aria-hidden="true">
                @
              </i>
              <input type="email" placeholder="name@email.com" />
            </div>
          </label>
          <Button type="button" className="auth-submit-btn">
            إرسال رابط الاستعادة
          </Button>
          <Link to="/register" className="auth-subtle-link">
            إنشاء حساب جديد
          </Link>
        </form>
      </AuthFormCard>
    </AuthLayout>
  );
};

export default ForgotPassword;
