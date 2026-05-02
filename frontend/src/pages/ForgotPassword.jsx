import { Link } from "react-router-dom";
import AuthFormCard from "../components/auth/AuthFormCard";
import AuthLayout from "../components/auth/AuthLayout";
import * as tw from "../components/auth/authTw";
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
        <form className={tw.authFormGrid}>
          <label className={tw.authField}>
            <span className={tw.authFieldLabel}>البريد الإلكتروني</span>
            <div className={tw.authInputWrap}>
              <i className={tw.authInputIcon} aria-hidden="true">
                @
              </i>
              <input className={tw.authInput} type="email" placeholder="name@email.com" />
            </div>
          </label>
          <Button unstyled type="button" className={tw.authSubmitBtn}>
            إرسال رابط الاستعادة
          </Button>
          <Link to="/register" className={tw.authSubtleLink}>
            إنشاء حساب جديد
          </Link>
        </form>
      </AuthFormCard>
    </AuthLayout>
  );
};

export default ForgotPassword;
