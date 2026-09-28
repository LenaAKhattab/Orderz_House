import StaffAccountSettingsPage from "./StaffAccountSettingsPage";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/opsAdminResources";

export default function AdminSettingsPage() {
  const { t } = useTranslation();
  return (
    <StaffAccountSettingsPage
      heroKicker={t("opsAdmin.adminSettings.heroKicker")}
      heroTitle={t("opsAdmin.adminSettings.heroTitle")}
      heroLead={t("opsAdmin.adminSettings.heroLead")}
    />
  );
}
