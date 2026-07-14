import { Link } from "react-router-dom";
import { useTranslation } from "../i18n/LanguageProvider";
import "../styles/publicSitePage.css";

const SUPPORT_EMAIL = "support@orderzhouse.com";
const MAILTO_HREF = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("طلب حذف حساب أوردرز هاوس")}`;

/**
 * Public Google Play / App Store account-deletion disclosure page.
 * No auth required — hosted under PublicLayout.
 */
export default function AccountDeletion() {
  const { t, locale } = useTranslation();
  const mailtoHref =
    locale === "en"
      ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Orderz House account deletion request")}`
      : MAILTO_HREF;

  return (
    <main className="container page-content public-site-page">
      <section className="card legal-card public-site-page__card">
        <h1 className="public-site-page__title">{t("accountDeletion.title")}</h1>
        <div className="public-site-page__content">
          <p>{t("accountDeletion.intro")}</p>
          <p>
            <strong>{t("accountDeletion.inAppPath")}</strong>
          </p>
          <p>{t("accountDeletion.fallbackIntro")}</p>

          <h2>{t("accountDeletion.whatHappensTitle")}</h2>
          <ul className="public-site-page__list">
            <li>{t("accountDeletion.bullets.deactivate")}</li>
            <li>{t("accountDeletion.bullets.personalData")}</li>
            <li>{t("accountDeletion.bullets.retention")}</li>
            <li>{t("accountDeletion.bullets.ordersPayments")}</li>
          </ul>

          <h2>{t("accountDeletion.howToTitle")}</h2>
          <p>{t("accountDeletion.howToBody")}</p>
          <p>
            <strong>{t("accountDeletion.requestPhrase")}</strong>
          </p>
          <p>
            <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className="public-site-page__email">
              {t("accountDeletion.supportEmail")}
            </a>
          </p>

          <div className="public-site-page__actions">
            <a className="btn btn-primary" href={mailtoHref}>
              {t("accountDeletion.ctaMailto")}
            </a>
            <Link to="/privacy-policy" className="btn btn-secondary">
              {t("accountDeletion.privacyLink")}
            </Link>
            <Link to="/" className="btn btn-secondary">
              {t("accountDeletion.homeLink")}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
