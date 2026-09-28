import arBildazoAdmin from "../locales/ar/bildazoAdmin.json";
import enBildazoAdmin from "../locales/en/bildazoAdmin.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { bildazoAdmin: arBildazoAdmin },
  en: { bildazoAdmin: enBildazoAdmin },
});
