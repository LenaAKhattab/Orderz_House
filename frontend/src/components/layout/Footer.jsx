import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePublicSitePages } from "../../hooks/usePublicSitePages";

const linkClass =
  "site-footer__link text-[#202020] no-underline transition-colors hover:text-[#475569]";

function footerLinkClass(pathname, href) {
  const active = pathname === href;
  return [linkClass, active ? "site-footer__link--active" : ""].filter(Boolean).join(" ");
}

function FooterGroupChevron() {
  return (
    <svg
      className="site-footer__group-chevron"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ContactIcon({ children }) {
  return (
    <span className="site-footer__contact-icon" aria-hidden>
      {children}
    </span>
  );
}

const Footer = ({ homeBlend = false }) => {
  const { pathname } = useLocation();
  const gridRef = useRef(null);
  const { footerPages, loading: sitePagesLoading, error: sitePagesError } = usePublicSitePages();
  const showImportantLinks = !sitePagesError && footerPages.length > 0;

  useEffect(() => {
    const root = gridRef.current;
    if (!root) return;

    const groups = root.querySelectorAll(".site-footer__group");
    const mq = window.matchMedia("(min-width: 769px)");

    const syncDesktopGroups = () => {
      groups.forEach((group) => {
        if (mq.matches) {
          group.setAttribute("open", "");
        }
      });
    };

    syncDesktopGroups();
    mq.addEventListener("change", syncDesktopGroups);
    return () => mq.removeEventListener("change", syncDesktopGroups);
  }, [showImportantLinks, sitePagesLoading]);

  return (
    <footer
      className={
        homeBlend
          ? "site-footer site-footer--public site-footer--home-blend mt-auto border-0 bg-transparent pb-[env(safe-area-inset-bottom,0)] shadow-none"
          : "site-footer site-footer--public mt-auto border-t border-[rgba(100,116,139,0.22)] bg-[#f8f9fb] pb-[env(safe-area-inset-bottom,0)]"
      }
    >
      <div
        ref={gridRef}
        className="site-footer__grid mx-auto grid w-full max-w-[min(1160px,calc(100%-48px))] grid-cols-1 items-start gap-x-5 gap-y-6 px-0 py-[34px] pb-[42px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1fr_0.8fr_0.85fr_1fr_0.9fr_1.4fr]"
      >
        <details className="site-footer__group site-footer__panel min-w-0" open>
          <summary className="site-footer__group-summary">
            <span>استكشف</span>
            <FooterGroupChevron />
          </summary>
          <ul className="site-footer__link-list m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
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
        </details>

        <details className="site-footer__group site-footer__panel min-w-0">
          <summary className="site-footer__group-summary">
            <span>للعملاء</span>
            <FooterGroupChevron />
          </summary>
          <ul className="site-footer__link-list m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
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
        </details>

        <details className="site-footer__group site-footer__panel min-w-0">
          <summary className="site-footer__group-summary">
            <span>للمستقلين</span>
            <FooterGroupChevron />
          </summary>
          <ul className="site-footer__link-list m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
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
        </details>

        {showImportantLinks ? (
          <details className="site-footer__group site-footer__panel min-w-0" open>
            <summary className="site-footer__group-summary">
              <span>روابط مهمة</span>
              <FooterGroupChevron />
            </summary>
            <ul className="site-footer__link-list m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
              {footerPages.map((page) => (
                <li key={page.id}>
                  <Link to={page.path} className={footerLinkClass(pathname, page.path)}>
                    {page.menuLabel || page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <details className="site-footer__group site-footer__panel min-w-0">
          <summary className="site-footer__group-summary">
            <span>الشركة</span>
            <FooterGroupChevron />
          </summary>
          <ul className="site-footer__link-list m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <Link to="/about" className={linkClass}>
                من نحن
              </Link>
            </li>
          </ul>
        </details>

        <section className="site-footer__contact site-footer__panel min-w-0 border-s border-dashed border-[rgba(100,116,139,0.28)] ps-[18px] max-lg:border-0 max-lg:ps-0">
          <h3 className="site-footer__panel-title mb-3 text-[0.98rem] font-bold text-[#475569]">تواصل معنا</h3>
          <ul className="site-footer__contact-list m-0 grid list-none gap-3 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li className="site-footer__contact-row">
              <ContactIcon>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                  <path
                    d="M5.5 4h13A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4Z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <path d="M8 7h8M8 11h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </ContactIcon>
              <div className="site-footer__contact-copy">
                <span className="site-footer__contact-label">رقم الهاتف</span>
                <a href="tel:+971522857808" dir="ltr" className="site-footer__contact-value text-[#202020] no-underline [unicode-bidi:plaintext] [direction:ltr]">
                  +971 522857808
                </a>
              </div>
            </li>
            <li className="site-footer__contact-row">
              <ContactIcon>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                  <path d="M4 6.5 12 13l8-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 19h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z" stroke="currentColor" strokeWidth="1.7" />
                </svg>
              </ContactIcon>
              <div className="site-footer__contact-copy">
                <span className="site-footer__contact-label">البريد الإلكتروني</span>
                <a href="mailto:info@orderzhouse.com" dir="ltr" className="site-footer__contact-value text-[#202020] no-underline [unicode-bidi:plaintext] [direction:ltr]">
                  info@orderzhouse.com
                </a>
              </div>
            </li>
            <li className="site-footer__contact-row site-footer__contact-row--link-only">
              <ContactIcon>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                  <path
                    d="M12 3c-4.5 2.2-7 5.8-7 10.2 0 2.2 1.8 4 4 4 .9 0 1.7-.3 2.4-.8L12 19l2.6 2.4c.7.5 1.5.8 2.4.8 2.2 0 4-1.8 4-4C21 8.8 18.5 5.2 14 3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                </svg>
              </ContactIcon>
              <div className="site-footer__contact-copy">
                <a
                  className={`site-footer__contact-value ${linkClass}`}
                  href="https://wa.me/971522857808"
                  target="_blank"
                  rel="noreferrer"
                >
                  واتساب
                </a>
              </div>
            </li>
            <li className="site-footer__contact-row">
              <ContactIcon>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                  <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" stroke="currentColor" strokeWidth="1.7" />
                  <circle cx="12" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.7" />
                </svg>
              </ContactIcon>
              <div className="site-footer__contact-copy">
                <span className="site-footer__contact-label">الموقع</span>
                <span className="site-footer__contact-value">الامارات العربية المتحدة، دبي</span>
              </div>
            </li>
          </ul>
          <div className="site-footer__hours mt-[18px] border-t border-dashed border-[rgba(100,116,139,0.28)] pt-3.5">
            <h4 className="site-footer__panel-subtitle m-0 mb-2 text-[0.98rem] font-bold text-[#475569]">ساعات العمل</h4>
            <p className="site-footer__hours-value m-0 text-[0.9rem] leading-[1.55] text-[#202020]">24/7</p>
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
        <p className="site-footer__copyright">
          © 2026 أوردر هاوس. جميع الحقوق محفوظة.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
