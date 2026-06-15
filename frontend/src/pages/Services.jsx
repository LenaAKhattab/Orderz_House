import ServicesExplorer from "../components/services/ServicesExplorer";
import { useTranslation } from "../i18n/LanguageProvider";
import "../styles/publicPageHeader.css";
import "../styles/servicesPage.css";

const Services = () => {
  const { dir } = useTranslation();

  return (
    <main className="container page-content services-page services-page--ref" lang={dir === "rtl" ? "ar" : "en"} dir={dir}>
      <ServicesExplorer />
    </main>
  );
};

export default Services;
