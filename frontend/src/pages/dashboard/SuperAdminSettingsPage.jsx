import StaffAccountSettingsPage from "./StaffAccountSettingsPage";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/opsAdminResources";

export default function SuperAdminSettingsPage() {
  const { t } = useTranslation();
  return (
    <StaffAccountSettingsPage
      heroKicker={t("opsAdmin.superAdminSettings.heroKicker")}
      heroTitle={t("opsAdmin.superAdminSettings.heroTitle")}
      heroLead={t("opsAdmin.superAdminSettings.heroLead")}
    />
  );
}
