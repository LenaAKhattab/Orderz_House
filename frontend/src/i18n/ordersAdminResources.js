import arOrdersAdmin from "../locales/ar/ordersAdmin.json";
import enOrdersAdmin from "../locales/en/ordersAdmin.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { ordersAdmin: arOrdersAdmin },
  en: { ordersAdmin: enOrdersAdmin },
});
