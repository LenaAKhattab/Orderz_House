import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePublicSitePages } from "../../hooks/usePublicSitePages";
import { usePublicFooterSettings } from "../../hooks/usePublicFooterSettings";
import { pickFooterAppDownloadTitle, shouldRenderFooterAppDownload } from "../../constants/footerAppDownloads";
import {
  buildFooterTelHref,
  buildFooterWhatsAppHref,
  getVisibleFooterContactItems,
  resolveFooterContactCenterDestination,
  shouldRenderFooterContactCenter,
  shouldRenderFooterContactPanel,
  shouldRenderFooterWorkingHours,
} from "../../constants/footerSettings";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getFooterImportantLinkLabel } from "../../lib/i18n/footerImportantLinkLabel";
import { useAuth } from "../../context/useAuth";

const linkClass =
  "site-footer__link text-[#202020] no-underline transition-colors hover:text-[#475569]";

const panelClass = "site-footer__panel min-w-0 text-start";
const linkListClass =
  "site-footer__link-list m-0 grid list-none gap-1.5 p-0 text-start text-[0.9rem] leading-snug text-[#202020]";

const XL_COLS_CLASS = {
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
  6: "xl:grid-cols-6",
  7: "xl:grid-cols-7",
};

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

/** Apple silhouette — local inline SVG (no CDN). */
function FooterAppStoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden focusable="false">
      <path d="M16.365 1.43c0 1.14-.493 2.2-1.29 2.98-.837.83-2.211 1.47-3.366 1.385-.15-1.086.42-2.23 1.23-3.01C13.81.97 15.22.4 16.365.43ZM20.7 17.48c-.55 1.2-.81 1.73-1.52 2.79-.99 1.48-2.38 3.32-4.1 3.34-1.53.02-1.93-.99-4.02-.98-2.09.01-2.53 1-4.07.98-1.72-.02-3.04-1.68-4.03-3.16C.91 17.34-.62 12.28 1.7 8.85c1.14-1.7 2.95-2.7 4.64-2.7 1.73 0 2.82 1 4.77 1 1.88 0 2.86-1.01 4.82-1.01 1.52 0 3.13.83 4.26 2.26-3.74 2.05-3.14 7.4-.5 9.08Z" />
    </svg>
  );
}

/** Google Play triangle — local multicolor SVG (no generic play-circle). */
function FooterGooglePlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
      <path fill="#32BBFF" d="M2.91 1.62A.75.75 0 0 0 2.5 2.3v19.4c0 .5.37.8.75.62L14.5 12 2.91 1.62Z" />
      <path fill="#FBBF24" d="m14.5 12 2.7 2.7 5.05-2.88a.8.8 0 0 0 0-1.4L17.2 7.54 14.5 10.24V12Z" />
      <path fill="#F04438" d="M14.5 12 2.91 22.38c.24.12.52.1.76-.04L16.4 15.5 14.5 12Z" />
      <path fill="#22C55E" d="M14.5 12 16.4 8.5 3.67 1.66A.8.8 0 0 0 2.91 1.62L14.5 12Z" />
    </svg>
  );
}

const Footer = ({ homeBlend = false }) => {
  const { pathname } = useLocation();
  const gridRef = useRef(null);
  const { user, loading: authLoading } = useAuth();
  const { footerPages, loading: sitePagesLoading, error: sitePagesError } = usePublicSitePages();
  const { contact, workingHours, contactCenter, appDownload } = usePublicFooterSettings();
  const showImportantLinks = !sitePagesError && footerPages.length > 0;
  const { t, dir, locale } = useTranslation();
  const isEn = String(locale || "").toLowerCase().startsWith("en");
  const footerAppTitle = isEn
    ? t("footer.downloadApp")
    : pickFooterAppDownloadTitle(appDownload, "ar");
  const footerAppStoreHref = appDownload.appStoreUrl;
  const footerGooglePlayHref = appDownload.googlePlayUrl;
  const contactPhone = contact.phone;
  const contactEmail = contact.email;
  const contactWhatsapp = contact.whatsapp;
  const contactLocation = contact.location;
  const hoursTitle = isEn ? t("footer.workingHours") : workingHours.title;
  const hoursText = isEn ? t("footer.workingHoursValue") : workingHours.text;
  const phoneHref = buildFooterTelHref(contactPhone);
  const whatsappHref = buildFooterWhatsAppHref(contactWhatsapp);

  const visibleContactItems = getVisibleFooterContactItems(contact);
  const showContactItems = visibleContactItems.length > 0;
  const showHoursBlock = shouldRenderFooterWorkingHours(workingHours);
  const showContactCenter = shouldRenderFooterContactCenter(contactCenter);
  const showContactPanel = shouldRenderFooterContactPanel(contact, workingHours, contactCenter);
  const showAppStore = Boolean(appDownload.appStoreVisible !== false);
  const showGooglePlay = Boolean(appDownload.googlePlayVisible !== false);
  const showAppsPanel = shouldRenderFooterAppDownload(appDownload);
  const showAppTitle = appDownload.titleVisible !== false;
  const contactCenterDest = resolveFooterContactCenterDestination(user, authLoading);
  const showContactCenterHelper = contactCenter.helperTextVisible !== false;
  const showContactCenterButton = contactCenter.buttonVisible !== false;

  // Always-on columns: explore, clients, freelancers, company (=4)
  const xlColCount = Math.min(
    7,
    Math.max(
      4,
      4 + (showImportantLinks ? 1 : 0) + (showContactPanel ? 1 : 0) + (showAppsPanel ? 1 : 0),
    ),
  );
  const xlColsClass = XL_COLS_CLASS[xlColCount] || XL_COLS_CLASS[6];

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
  }, [showImportantLinks, sitePagesLoading, showContactPanel, showAppsPanel]);

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
          "site-footer__grid mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-y-8 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-3",
          xlColsClass,
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
              <li>
                <Link to="/account-deletion" className={footerLinkClass(pathname, "/account-deletion")}>
                  {t("footer.importantLinks.accountDeletion")}
                </Link>
              </li>
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

        {showContactPanel ? (
          <section className="site-footer__contact site-footer__panel min-w-0">
            {showContactItems ? (
              <>
                <h3 className="site-footer__panel-title mb-2 text-[0.98rem] font-bold text-[#475569] text-start">
                  {t("footer.contactUs")}
                </h3>
                <ul className="site-footer__contact-grid footer-contact-grid m-0 list-none p-0">
                  {visibleContactItems.includes("phone") ? (
                    <li className="site-footer__contact-item">
                      <ContactIcon>
                        <FooterPhoneIcon />
                      </ContactIcon>
                      <div className="site-footer__contact-copy">
                        <span className="site-footer__contact-label">{t("footer.phone")}</span>
                        <a
                          href={phoneHref}
                          dir="ltr"
                          className="site-footer__contact-value site-footer__contact-value--phone text-[#202020] no-underline"
                        >
                          {contactPhone}
                        </a>
                      </div>
                    </li>
                  ) : null}
                  {visibleContactItems.includes("email") ? (
                    <li className="site-footer__contact-item">
                      <ContactIcon>
                        <FooterEmailIcon />
                      </ContactIcon>
                      <div className="site-footer__contact-copy">
                        <span className="site-footer__contact-label">{t("footer.email")}</span>
                        <a
                          href={`mailto:${contactEmail}`}
                          dir="ltr"
                          className="site-footer__contact-value site-footer__contact-value--email text-[#202020] no-underline [unicode-bidi:plaintext] [direction:ltr]"
                        >
                          {contactEmail}
                        </a>
                      </div>
                    </li>
                  ) : null}
                  {visibleContactItems.includes("whatsapp") ? (
                    <li className="site-footer__contact-item">
                      <ContactIcon>
                        <FooterWhatsAppIcon />
                      </ContactIcon>
                      <div className="site-footer__contact-copy">
                        <span className="site-footer__contact-label">{t("footer.whatsapp")}</span>
                        <a
                          href={whatsappHref}
                          target="_blank"
                          rel="noreferrer"
                          dir="ltr"
                          className={`site-footer__contact-value site-footer__contact-value--phone ${linkClass}`}
                        >
                          {contactWhatsapp}
                        </a>
                      </div>
                    </li>
                  ) : null}
                  {visibleContactItems.includes("location") ? (
                    <li className="site-footer__contact-item">
                      <ContactIcon>
                        <FooterLocationIcon />
                      </ContactIcon>
                      <div className="site-footer__contact-copy">
                        <span className="site-footer__contact-label">{t("footer.location")}</span>
                        <span className="site-footer__contact-value">{contactLocation}</span>
                      </div>
                    </li>
                  ) : null}
                </ul>
              </>
            ) : null}
            {showContactCenter ? (
              <div
                className={[
                  "site-footer__contact-center",
                  showContactItems ? "site-footer__contact-center--after-contact" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {showContactCenterHelper ? (
                  <p className="site-footer__contact-center-helper">{contactCenter.helperText}</p>
                ) : null}
                {showContactCenterButton ? (
                  contactCenterDest.kind === "pending" ? (
                    <span
                      className="site-footer__contact-center-btn btn btn-primary btn-sm"
                      aria-busy="true"
                      aria-disabled="true"
                    >
                      {contactCenter.buttonText}
                    </span>
                  ) : contactCenterDest.kind === "login" ? (
                    <Link
                      to={contactCenterDest.to}
                      state={contactCenterDest.state}
                      className="site-footer__contact-center-btn btn btn-primary btn-sm"
                    >
                      {contactCenter.buttonText}
                    </Link>
                  ) : (
                    <Link
                      to={contactCenterDest.to}
                      className="site-footer__contact-center-btn btn btn-primary btn-sm"
                    >
                      {contactCenter.buttonText}
                    </Link>
                  )
                ) : null}
              </div>
            ) : null}
            {showHoursBlock ? (
              <div
                className={[
                  "site-footer__hours",
                  showContactItems || showContactCenter ? "site-footer__hours--after-block" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {workingHours.titleVisible !== false ? (
                  <h4 className="site-footer__panel-subtitle m-0 mb-1 text-[0.9rem] font-bold text-[#475569] text-start">
                    {hoursTitle}
                  </h4>
                ) : null}
                {workingHours.textVisible !== false ? (
                  <p className="site-footer__hours-value m-0 text-[0.84rem] leading-snug text-[#202020] text-start">
                    {hoursText}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {showAppsPanel ? (
          <details
            className={`site-footer__group site-footer__group--apps ${panelClass} border-s border-dashed border-[rgba(100,116,139,0.28)] ps-[18px] max-xl:border-0 max-xl:ps-0`}
            open
          >
            <summary className="site-footer__group-summary text-start">
              <span className={showAppTitle ? undefined : "sr-only"}>{footerAppTitle}</span>
              <FooterGroupChevron />
            </summary>
            <div className="site-footer__apps-list">
              {showAppStore ? (
                <a
                  href={footerAppStoreHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("footer.appStoreAria")}
                  className="site-footer__app-link"
                >
                  <span className="site-footer__app-link-inner">
                    <span className="site-footer__app-link-icon" aria-hidden="true">
                      <FooterAppStoreIcon />
                    </span>
                    <span className="site-footer__app-link-text">{t("footer.appStore")}</span>
                  </span>
                </a>
              ) : null}
              {showGooglePlay ? (
                <a
                  href={footerGooglePlayHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("footer.googlePlayAria")}
                  className="site-footer__app-link"
                >
                  <span className="site-footer__app-link-inner">
                    <span className="site-footer__app-link-icon" aria-hidden="true">
                      <FooterGooglePlayIcon />
                    </span>
                    <span className="site-footer__app-link-text">{t("footer.googlePlay")}</span>
                  </span>
                </a>
              ) : null}
            </div>
          </details>
        ) : null}
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
