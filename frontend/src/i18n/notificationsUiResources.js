import arNotificationsUi from "../locales/ar/notificationsUi.json";
import enNotificationsUi from "../locales/en/notificationsUi.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { notificationsUi: arNotificationsUi },
  en: { notificationsUi: enNotificationsUi },
});
