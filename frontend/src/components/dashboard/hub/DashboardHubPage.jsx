import { useTranslation } from "../../../i18n/LanguageProvider";

export default function DashboardHubPage({ children, className = "" }) {
  const { dir } = useTranslation();

  return (
    <div className={`fdash-page ${className}`.trim()} dir={dir}>
      <div className="fdash-page__inner">{children}</div>
    </div>
  );
}
