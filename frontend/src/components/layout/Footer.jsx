import { Link, useLocation } from "react-router-dom";

const linkClass =
  "text-[#202020] no-underline transition-colors hover:text-[#475569]";

function footerLinkClass(pathname, href) {
  const active = pathname === href;
  return [linkClass, active ? "site-footer__link--active" : ""].filter(Boolean).join(" ");
}

const Footer = ({ homeBlend = false }) => {
  const { pathname } = useLocation();

  return (
    <footer
      className={
        homeBlend
          ? "site-footer site-footer--public mt-auto border-0 bg-transparent pb-[env(safe-area-inset-bottom,0)] shadow-none"
          : "site-footer site-footer--public mt-auto border-t border-[rgba(100,116,139,0.22)] bg-[#f8f9fb] pb-[env(safe-area-inset-bottom,0)]"
      }
    >
      <div className="mx-auto grid w-full max-w-[min(1160px,calc(100%-48px))] grid-cols-1 items-start gap-x-5 gap-y-6 px-0 py-[34px] pb-[42px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1fr_0.8fr_0.85fr_1fr_0.9fr_1.4fr]">
        <section className="min-w-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#475569]">استكشف</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <Link to="/" className={footerLinkClass(pathname, "/")}>
                الرئيسية
              </Link>
            </li>
            <li>
              <Link to="/about" className={footerLinkClass(pathname, "/about")}>
                من نحن
              </Link>
            </li>
            <li>
              <Link to="/orders" className={footerLinkClass(pathname, "/orders")}>
                الطلبات
              </Link>
            </li>
            <li>
              <Link to="/plans" className={footerLinkClass(pathname, "/plans")}>
                الباقات
              </Link>
            </li>
            <li>
              <Link to="/services" className={footerLinkClass(pathname, "/services")}>
                الخدمات
              </Link>
            </li>
          </ul>
        </section>

        <section className="min-w-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#475569]">للعملاء</h3>
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
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#475569]">للمستقلين</h3>
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
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#475569]">الموارد</h3>
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
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#475569]">الشركة</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <Link to="/about" className={linkClass}>
                من نحن
              </Link>
            </li>
          </ul>
        </section>

        <section className="min-w-0 border-s border-dashed border-[rgba(100,116,139,0.28)] ps-[18px] max-lg:border-0 max-lg:ps-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#475569]">تواصل معنا</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <span className="font-semibold text-[#64748b]">رقم الهاتف:</span>{" "}
              <a href="tel:+971522857808" dir="ltr" className="inline-block text-[#202020] [unicode-bidi:plaintext] [direction:ltr]">
                +971 522857808
              </a>
            </li>
            <li>
              <span className="font-semibold text-[#64748b]">البريد الإلكتروني:</span>{" "}
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
          <div className="mt-[18px] border-t border-dashed border-[rgba(100,116,139,0.28)] pt-3.5">
            <h3 className="mb-3 text-[0.98rem] font-bold text-[#475569]">ساعات العمل</h3>
            <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
              <li>24/7</li>
            </ul>
          </div>
        </section>
      </div>

      <div
        className={
          homeBlend
            ? "site-footer__bottom-bar border-t border-[rgba(100,116,139,0.16)] bg-transparent py-[18px] pb-7"
            : "site-footer__bottom-bar border-t border-[rgba(100,116,139,0.22)] bg-white py-[18px] pb-7"
        }
      >
        <div className="site-footer__bottom-links">
          <Link to="/privacy-policy" className="text-[0.86rem] text-[#64748b] no-underline transition-colors hover:text-[#475569]">
            سياسة الخصوصية
          </Link>
          <Link to="/terms-conditions" className="text-[0.86rem] text-[#64748b] no-underline transition-colors hover:text-[#475569]">
            الشروط والأحكام
          </Link>
        </div>
        <p className="site-footer__copyright">
          © 2026 أوردر هاوس. جميع الحقوق محفوظة.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
