import arSmartOrders from "../locales/ar/smartOrders.json";
import enSmartOrders from "../locales/en/smartOrders.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { smartOrders: arSmartOrders },
  en: { smartOrders: enSmartOrders },
});
