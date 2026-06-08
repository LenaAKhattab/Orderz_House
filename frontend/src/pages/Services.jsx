import ServicesExplorer from "../components/services/ServicesExplorer";
import "../styles/publicPageHeader.css";
import "../styles/servicesPage.css";

const Services = () => {
  return (
    <main className="container page-content services-page services-page--ref" lang="ar" dir="rtl">
      <ServicesExplorer />
    </main>
  );
};

export default Services;
