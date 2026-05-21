import { Link } from "react-router-dom";

const linkClass =
  "text-[#202020] no-underline transition-colors hover:text-[#2f3b65]";

const Footer = ({ homeBlend = false }) => {
  return (
    <footer
      className={
        homeBlend
          ? "mt-auto border-0 bg-transparent pb-[env(safe-area-inset-bottom,0)] shadow-none"
          : "mt-auto border-t border-[rgba(47,59,101,0.2)] bg-page-bg pb-[env(safe-area-inset-bottom,0)]"
      }
    >
      <div className="mx-auto grid w-full max-w-[min(1160px,calc(100%-48px))] grid-cols-1 items-start gap-x-5 gap-y-6 px-0 py-[34px] pb-[42px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1fr_0.8fr_0.85fr_1fr_0.9fr_1.4fr]">
        <section className="min-w-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">استكشاف</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <Link to="/" className={linkClass}>
                الرئيسية
              </Link>
            </li>
            <li>
              <Link to="/about" className={linkClass}>
                من نحن
              </Link>
            </li>
            <li>
              <Link to="/orders" className={linkClass}>
                الطلبات
              </Link>
            </li>
            <li>
              <Link to="/plans" className={linkClass}>
                الباقات
              </Link>
            </li>
            <li>
              <Link to="/services" className={linkClass}>
                الخدمات
              </Link>
            </li>
          </ul>
        </section>

        <section className="min-w-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">للعملاء</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <Link to="/register" className={linkClass}>
                إضافة طلب
              </Link>
            </li>
            <li>
              <Link to="/login" className={linkClass}>
                تسجيل الدخول
              </Link>
            </li>
          </ul>
        </section>

        <section className="min-w-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">للمستقلين</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <Link to="/orders" className={linkClass}>
                المشاريع
              </Link>
            </li>
            <li>
              <Link to="/plans" className={linkClass}>
                الباقات
              </Link>
            </li>
            <li>
              <Link to="/register" className={linkClass}>
                انضم كمستقل
              </Link>
            </li>
          </ul>
        </section>

        <section className="min-w-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">الموارد</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <Link to="/privacy-policy" className={linkClass}>
                سياسة الخصوصية
              </Link>
            </li>
            <li>
              <Link to="/terms-conditions" className={linkClass}>
                الشروط والأحكام
              </Link>
            </li>
            <li>
              <Link to="/about" className={linkClass}>
                مركز المساعدة
              </Link>
            </li>
          </ul>
        </section>

        <section className="min-w-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">الشركة</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <Link to="/about" className={linkClass}>
                من نحن
              </Link>
            </li>
          </ul>
        </section>

        <section className="min-w-0 border-s border-dashed border-[rgba(47,59,101,0.2)] ps-[18px] max-lg:border-0 max-lg:ps-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">تواصل معنا</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <span className="font-semibold text-[#76cfdf]">رقم الهاتف:</span>{" "}
              <a href="tel:+971522857808" dir="ltr" className="inline-block text-[#202020] [unicode-bidi:plaintext] [direction:ltr]">
                +971 522857808
              </a>
            </li>
            <li>
              <span className="font-semibold text-[#76cfdf]">البريد الإلكتروني:</span>{" "}
              <a href="mailto:info@orderzhouse.com" dir="ltr" className="inline-block text-[#202020] [unicode-bidi:plaintext] [direction:ltr]">
                info@orderzhouse.com
              </a>
            </li>
            <li>
              <a
                className={linkClass}
                href="https://wa.me/971522857808"
                target="_blank"
                rel="noreferrer"
              >
                واتساب
              </a>
            </li>
            <li>
              <span>الموقع:</span> الامارات العربية المتحدة، دبي
            </li>
          </ul>
          <div className="mt-[18px] border-t border-dashed border-[rgba(47,59,101,0.2)] pt-3.5">
            <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">ساعات العمل</h3>
            <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
              <li>من السبت إلى الخميس</li>
              <li>نعمل 24 ساعة من أجلكم</li>
            </ul>
          </div>
        </section>
      </div>

      <div
        className={
          homeBlend
            ? "border-t border-[rgba(47,59,101,0.08)] bg-transparent py-[18px] pb-7"
            : "border-t border-[rgba(47,59,101,0.2)] bg-white py-[18px] pb-7"
        }
      >
        <div className="mx-auto flex w-full max-w-[min(1160px,calc(100%-48px))] flex-wrap items-center justify-between gap-4">
          <div className="flex gap-4">
            <Link to="/privacy-policy" className="text-[0.86rem] text-[#76cfdf] no-underline transition-colors hover:text-[#2f3b65]">
              سياسة الخصوصية
            </Link>
            <Link to="/terms-conditions" className="text-[0.86rem] text-[#76cfdf] no-underline transition-colors hover:text-[#2f3b65]">
              الشروط والأحكام
            </Link>
          </div>
          <p className="m-0 text-[0.86rem] text-[#76cfdf]">© 2026 أوردرز هاوس - جميع الحقوق محفوظة</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
