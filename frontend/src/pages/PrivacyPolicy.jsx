import { Link } from "react-router-dom";
import PublicSitePage from "./PublicSitePage";
import { useTranslation } from "../i18n/LanguageProvider";
import "../styles/publicSitePage.css";

function PrivacyAccountDeletionAppendix() {
  const { t } = useTranslation();
  return (
    <section className="card legal-card public-site-page__card public-site-page__appendix" aria-labelledby="privacy-account-deletion-heading">
      <h2 id="privacy-account-deletion-heading" className="public-site-page__appendix-title">
        {t("accountDeletion.privacyAppendixTitle")}
      </h2>
      <div className="public-site-page__content">
        <p>{t("accountDeletion.privacyAppendixBody")}</p>
        <p>
          <Link to="/account-deletion">{t("accountDeletion.privacyAppendixLink")}</Link>
        </p>
      </div>
    </section>
  );
}

const PrivacyPolicy = () => (
  <>
    <PublicSitePage slug="privacy-policy" />
    <div className="container public-site-page public-site-page--appendix-wrap">
      <PrivacyAccountDeletionAppendix />
    </div>
  </>
);

export default PrivacyPolicy;
