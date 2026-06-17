import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePublicSitePages } from "../../hooks/usePublicSitePages";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getFooterImportantLinkLabel } from "../../lib/i18n/footerImportantLinkLabel";

const linkClass =
  "site-footer__link text-[#202020] no-underline transition-colors hover:text-[#475569]";

const panelClass = "site-footer__panel min-w-0 text-start";
const linkListClass =
  "site-footer__link-list m-0 grid list-none gap-1.5 p-0 text-start text-[0.9rem] leading-snug text-[#202020]";

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

function FooterPhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path
        d="M5.5 4h13A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M8 7h8M8 11h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function FooterEmailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path d="M4 6.5 12 13l8-6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M5 19h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function FooterWhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.89-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function FooterLocationIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

const FOOTER_WHATSAPP_HREF = "https://wa.me/971522857808";

const Footer = ({ homeBlend = false }) => {
  const { pathname } = useLocation();
  const gridRef = useRef(null);
  const { footerPages, loading: sitePagesLoading, error: sitePagesError } = usePublicSitePages();
  const showImportantLinks = !sitePagesError && footerPages.length > 0;
  const { t, dir } = useTranslation();

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
      dir={dir}
    >
      <div
        ref={gridRef}
        className={[
          "site-footer__grid mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-x-4 gap-y-8 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:gap-x-6 xl:gap-x-4",
          showImportantLinks ? "xl:grid-cols-6" : "xl:grid-cols-5",
        ].join(" ")}
      >
        <details className={`site-footer__group ${panelClass}`} open>
          <summary className="site-footer__group-summary text-start">
            <span>{t("footer.explore")}</span>
            <FooterGroupChevron />
          </summary>
          <ul className={linkListClass}>
            <li>
              <Link to="/" className={footerLinkClass(pathname, "/")}>
                {t("footer.home")}
              </Link>
            </li>
            <li>
              <Link to="/about" className={footerLinkClass(pathname, "/about")}>
                {t("nav.about")}
              </Link>
            </li>
            <li>
              <Link to="/orders" className={footerLinkClass(pathname, "/orders")}>
                {t("nav.orders")}
              </Link>
            </li>
            <li>
              <Link to="/plans" className={footerLinkClass(pathname, "/plans")}>
                {t("nav.plans")}
              </Link>
            </li>
            <li>
              <Link to="/services" className={footerLinkClass(pathname, "/services")}>
                {t("nav.services")}
              </Link>
            </li>
          </ul>
        </details>

        <details className={`site-footer__group ${panelClass}`}>
          <summary className="site-footer__group-summary text-start">
            <span>{t("footer.forClients")}</span>
            <FooterGroupChevron />
          </summary>
          <ul className={linkListClass}>
            <li>
              <Link to="/register" className={linkClass}>
                {t("footer.addRequest")}
              </Link>
            </li>
            <li>
              <Link to="/login" className={linkClass}>
                {t("nav.login")}
              </Link>
            </li>
          </ul>
        </details>

        <details className={`site-footer__group ${panelClass}`}>
          <summary className="site-footer__group-summary text-start">
            <span>{t("footer.forFreelancers")}</span>
            <FooterGroupChevron />
          </summary>
          <ul className={linkListClass}>
            <li>
              <Link to="/orders" className={linkClass}>
                {t("footer.projects")}
              </Link>
            </li>
            <li>
              <Link to="/plans" className={linkClass}>
                {t("nav.plans")}
              </Link>
            </li>
            <li>
              <Link to="/register" className={linkClass}>
                {t("footer.joinFreelancer")}
              </Link>
            </li>
          </ul>
        </details>

        {showImportantLinks ? (
          <details className={`site-footer__group ${panelClass}`} open>
            <summary className="site-footer__group-summary text-start">
              <span>{t("footer.importantLinks.title")}</span>
              <FooterGroupChevron />
            </summary>
            <ul className={linkListClass}>
              {footerPages.map((page) => (
                <li key={page.id}>
                  <Link to={page.path} className={footerLinkClass(pathname, page.path)}>
                    {getFooterImportantLinkLabel(page, t)}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <details className={`site-footer__group ${panelClass}`}>
          <summary className="site-footer__group-summary text-start">
            <span>{t("footer.company")}</span>
            <FooterGroupChevron />
          </summary>
          <ul className={linkListClass}>
            <li>
              <Link to="/about" className={linkClass}>
                {t("nav.about")}
              </Link>
            </li>
          </ul>
        </details>

        <section className="site-footer__contact site-footer__panel min-w-0 border-s border-dashed border-[rgba(100,116,139,0.28)] ps-[18px] max-xl:border-0 max-xl:ps-0">
          <h3 className="site-footer__panel-title mb-3 text-[0.98rem] font-bold text-[#475569] text-start">
            {t("footer.contactUs")}
          </h3>
          <ul className="site-footer__contact-grid footer-contact-grid m-0 list-none p-0">
            <li className="site-footer__contact-item">
              <ContactIcon>
                <FooterPhoneIcon />
              </ContactIcon>
              <div className="site-footer__contact-copy">
                <span className="site-footer__contact-label">{t("footer.phone")}</span>
                <a
                  href="tel:+971522857808"
                  dir="ltr"
                  className="site-footer__contact-value site-footer__contact-value--phone text-[#202020] no-underline"
                >
                  {t("footer.phoneValue")}
                </a>
              </div>
            </li>
            <li className="site-footer__contact-item">
              <ContactIcon>
                <FooterEmailIcon />
              </ContactIcon>
              <div className="site-footer__contact-copy">
                <span className="site-footer__contact-label">{t("footer.email")}</span>
                <a
                  href={`mailto:${t("footer.emailValue")}`}
                  dir="ltr"
                  className="site-footer__contact-value site-footer__contact-value--email text-[#202020] no-underline [unicode-bidi:plaintext] [direction:ltr]"
                >
                  {t("footer.emailValue")}
                </a>
              </div>
            </li>
            <li className="site-footer__contact-item">
              <ContactIcon>
                <FooterWhatsAppIcon />
              </ContactIcon>
              <div className="site-footer__contact-copy">
                <span className="site-footer__contact-label">{t("footer.whatsapp")}</span>
                <a
                  href={FOOTER_WHATSAPP_HREF}
                  target="_blank"
                  rel="noreferrer"
                  dir="ltr"
                  className={`site-footer__contact-value site-footer__contact-value--phone ${linkClass}`}
                >
                  {t("footer.whatsappValue")}
                </a>
              </div>
            </li>
            <li className="site-footer__contact-item">
              <ContactIcon>
                <FooterLocationIcon />
              </ContactIcon>
              <div className="site-footer__contact-copy">
                <span className="site-footer__contact-label">{t("footer.location")}</span>
                <span className="site-footer__contact-value">{t("footer.locationValue")}</span>
              </div>
            </li>
          </ul>
          <div className="site-footer__hours mt-[14px] border-t border-dashed border-[rgba(100,116,139,0.22)] pt-3">
            <h4 className="site-footer__panel-subtitle m-0 mb-1.5 text-[0.9rem] font-bold text-[#475569] text-start">
              {t("footer.workingHours")}
            </h4>
            <p className="site-footer__hours-value m-0 text-[0.84rem] leading-snug text-[#202020] text-start">
              {t("footer.workingHoursValue")}
            </p>
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
          {t("common.copyright", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
};

export default Footer;
